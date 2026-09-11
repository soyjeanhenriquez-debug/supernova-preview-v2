// Webhook de Stripe → suscripciones (cobro principal) + acreditar packs.
//
// Seguridad SIN webhook secret: del payload solo tomamos event.id y
// re-consultamos GET /v1/events/{id} a la API de Stripe con la secret key.
// Solo se confía en lo que Stripe devuelve — un POST falsificado apunta a un
// evento que no existe (404) o al evento real. Idempotencia vía tabla
// stripe_events (Stripe reintenta entregas).
//
// Configurar en dashboard.stripe.com → Developers → Webhooks → Add endpoint:
//   URL: https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/stripe-webhook
//   Eventos: checkout.session.completed, customer.subscription.updated,
//            customer.subscription.deleted, invoice.paid, invoice.payment_failed
import { createClient } from "npm:@supabase/supabase-js@2";

type SubStatus = "active" | "trialing" | "past_due" | "canceled" | "inactive";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

function mapStripeStatus(s: string): SubStatus | null {
  switch (s) {
    case "active": return "active";
    case "trialing": return "trialing";
    case "past_due": return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
    case "paused": return "canceled";
    default: return null; // incomplete: aún no pagó, no tocar nada
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    console.error("STRIPE_SECRET_KEY no configurado");
    return json({ error: "Webhook not configured" }, 503);
  }

  const stripeFetch = async (path: string) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      return await fetch(`https://api.stripe.com${path}`, {
        headers: { Authorization: `Bearer ${stripeKey.trim()}` },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
  };

  // 1) Del body SOLO el event id — todo lo demás se descarta
  let eventId = "";
  try {
    const payload = await req.json();
    eventId = String(payload?.id ?? "");
  } catch { /* body inválido */ }
  if (!/^evt_[A-Za-z0-9]+$/.test(eventId)) return json({ error: "Bad event id" }, 400);

  // 2) La verdad viene de Stripe, no del POST
  const evtRes = await stripeFetch(`/v1/events/${eventId}`);
  if (evtRes.status === 404) return json({ error: "Unknown event" }, 400);
  if (!evtRes.ok) return json({ error: `Stripe ${evtRes.status}` }, 502);
  const event = await evtRes.json();
  const type: string = event.type ?? "";
  // Objeto del evento tal como lo devuelve Stripe (forma variable por tipo)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj: any = event.data?.object ?? {};

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 3) Idempotencia: si ya procesamos este evento, cortesía y afuera
  const { error: dupErr } = await supabaseAdmin.from("stripe_events").insert({ id: eventId, type });
  if (dupErr) return json({ ok: true, duplicate: true });

  const customerEmail = async (customerId: string): Promise<string> => {
    if (!customerId) return "";
    const r = await stripeFetch(`/v1/customers/${customerId}`);
    if (!r.ok) return "";
    const c = await r.json();
    return String(c?.email ?? "").toLowerCase().trim();
  };

  const upsertMembership = async (opts: {
    email: string; customerId: string; status: SubStatus; planId?: string | null; periodEnd?: number | null;
  }) => {
    const { email, customerId, status, planId, periodEnd } = opts;
    if (!email) { console.error(`${type}: sin email (customer ${customerId})`); return json({ error: "No email" }, 422); }

    const { data: userId } = await supabaseAdmin.rpc("get_user_id_by_email", { p_email: email });

    const { error } = await supabaseAdmin.from("subscriptions").upsert({
      email,
      user_id: userId,
      stripe_customer_id: customerId || null,
      provider: "stripe",
      plan_id: planId ?? null,
      status,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      raw: { type, id: eventId },
    }, { onConflict: "email" });
    if (error) { console.error("Upsert error:", error); return json({ error: "DB error" }, 500); }

    // Suscriptor pagando = acceso garantizado (mismo contrato que whop-webhook)
    await supabaseAdmin.from("approved_emails").upsert(
      { email, notes: `Stripe ${status} (${type})`, is_active: status === "active" || status === "trialing" },
      { onConflict: "email" },
    );

    console.log(`OK ${type} → ${email} → ${status}`);
    return json({ ok: true, email, status });
  };

  // Si el resultado es un 5xx (fallo transitorio), liberar el registro de
  // idempotencia para que el reintento de Stripe sí se procese.
  const releaseOn5xx = async (res: Response) => {
    if (res.status >= 500) {
      await supabaseAdmin.from("stripe_events").delete().eq("id", eventId);
    }
    return res;
  };

  try {
    // ---- Checkout completado: membresía nueva o pack de créditos ----
    if (type === "checkout.session.completed") {
      const meta = obj.metadata ?? {};
      const email = String(obj.customer_details?.email ?? obj.customer_email ?? "").toLowerCase().trim()
        || await customerEmail(String(obj.customer ?? ""));

      if (obj.mode === "payment" && meta.pool && meta.credits && meta.user_id) {
        // Pack de créditos: metadata puesta por stripe-checkout (server-side)
        const amount = parseInt(String(meta.credits), 10);
        const userId = String(meta.user_id);
        const label = `Pack ${String(meta.pack_id ?? "").replace(/-/g, " ")} (+${amount})`;
        if (!Number.isFinite(amount) || amount <= 0 || !userId) return json({ error: "Bad pack metadata" }, 422);

        const rpc = meta.pool === "media" ? "grant_media_credits" : "grant_purchased_credits";
        const args = meta.pool === "media"
          ? { p_user_id: userId, p_amount: amount, p_reason: `stripe:${eventId}` }
          : { p_user_id: userId, p_amount: amount, p_label: label };
        const { data, error } = await supabaseAdmin.rpc(rpc, args);
        if (error || !(data as { success?: boolean })?.success) {
          console.error("Grant error:", error, data);
          return await releaseOn5xx(json({ error: "Grant failed" }, 500));
        }
        console.log(`OK pack → ${userId} → +${amount} (${meta.pool})`);
        return json({ ok: true, granted: amount, pool: meta.pool });
      }

      if (obj.mode === "subscription") {
        // Traer la suscripción real para estado + fin de período
        let status: SubStatus = "active";
        let periodEnd: number | null = null;
        let planId: string | null = null;
        const subId = String(obj.subscription ?? "");
        if (subId) {
          const r = await stripeFetch(`/v1/subscriptions/${subId}`);
          if (r.ok) {
            const sub = await r.json();
            status = mapStripeStatus(String(sub.status)) ?? "active";
            periodEnd = sub.current_period_end ?? null;
            planId = sub.items?.data?.[0]?.price?.id ?? null;
          }
        }
        return await releaseOn5xx(await upsertMembership({ email, customerId: String(obj.customer ?? ""), status, planId, periodEnd }));
      }

      return json({ ok: true, skipped: "checkout sin metadata conocida" });
    }

    // ---- Ciclo de vida de la suscripción ----
    if (type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
      const status = type.endsWith("deleted") ? "canceled" : mapStripeStatus(String(obj.status));
      if (!status) return json({ ok: true, skipped: obj.status });
      const email = await customerEmail(String(obj.customer ?? ""));
      return await releaseOn5xx(await upsertMembership({
        email,
        customerId: String(obj.customer ?? ""),
        status,
        planId: obj.items?.data?.[0]?.price?.id ?? null,
        periodEnd: obj.current_period_end ?? null,
      }));
    }

    // ---- Facturas: renovaciones y fallos de cobro ----
    if (type === "invoice.paid" || type === "invoice.payment_failed") {
      if (!obj.subscription) return json({ ok: true, skipped: "invoice sin suscripción" });
      const status: SubStatus = type === "invoice.paid" ? "active" : "past_due";
      const email = String(obj.customer_email ?? "").toLowerCase().trim()
        || await customerEmail(String(obj.customer ?? ""));
      return await releaseOn5xx(await upsertMembership({
        email,
        customerId: String(obj.customer ?? ""),
        status,
        periodEnd: obj.lines?.data?.[0]?.period?.end ?? null,
      }));
    }

    return json({ ok: true, skipped: type });
  } catch (e) {
    console.error("Handler error:", e instanceof Error ? e.message : e);
    return await releaseOn5xx(json({ error: "Internal" }, 500));
  }
});
