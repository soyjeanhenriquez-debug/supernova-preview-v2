import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Webhook de Whop → sincroniza public.subscriptions.
 *
 * Configuración:
 *  - Secret: WHOP_WEBHOOK_SECRET (Supabase → Edge Functions → Secrets),
 *    con el valor del webhook secret que te da Whop al crear el webhook.
 *  - En Whop (dashboard → Developer → Webhooks) apunta a:
 *    https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/whop-webhook
 *    con los eventos: membership.went_valid, membership.went_invalid,
 *    payment.succeeded, payment.failed.
 *
 * Valida la firma HMAC-SHA256 del body (header X-Whop-Signature).
 */

const enc = new TextEncoder();

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

type SubStatus = "active" | "trialing" | "past_due" | "canceled" | "inactive";

function mapEvent(action: string, data: Record<string, unknown>): SubStatus | null {
  const status = String((data?.status as string) ?? "");
  switch (action) {
    case "membership.went_valid":
      return status === "trialing" ? "trialing" : "active";
    case "membership.went_invalid":
      return "canceled";
    case "payment.succeeded":
      return "active";
    case "payment.failed":
      return "past_due";
    default:
      return null; // evento que no nos interesa
  }
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const secret = Deno.env.get("WHOP_WEBHOOK_SECRET");
  if (!secret) {
    console.error("WHOP_WEBHOOK_SECRET no configurado");
    return new Response(JSON.stringify({ error: "Webhook not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.text();

  // Whop firma el body: X-Whop-Signature (hex hmac-sha256, a veces prefijado "sha256=")
  const header = req.headers.get("x-whop-signature") ?? "";
  const received = header.replace(/^sha256=/, "").trim().toLowerCase();
  const expected = await hmacHex(secret, body);
  if (!received || !timingSafeEqual(received, expected)) {
    console.error("Firma inválida");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: { action?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const action = payload.action ?? "";
  const data = payload.data ?? {};
  const newStatus = mapEvent(action, data);
  if (!newStatus) {
    return new Response(JSON.stringify({ ok: true, skipped: action }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // El email puede venir en distintos niveles según el evento
  const user = (data.user ?? {}) as Record<string, unknown>;
  const email = String(
    (user.email as string) ?? (data.email as string) ?? "",
  ).toLowerCase().trim();

  if (!email) {
    console.error(`Evento ${action} sin email`, JSON.stringify(data).slice(0, 500));
    return new Response(JSON.stringify({ error: "No email in payload" }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Vincular con el usuario de la app si ya existe
  const { data: userId } = await supabaseAdmin.rpc("get_user_id_by_email", {
    p_email: email,
  });

  const membershipId = String(data.id ?? data.membership_id ?? "") || null;
  const planId = String(data.plan_id ?? (data.plan as Record<string, unknown>)?.id ?? "") || null;
  const periodEnd = data.renewal_period_end ?? data.expires_at ?? null;

  const { error } = await supabaseAdmin.from("subscriptions").upsert(
    {
      email,
      user_id: userId,
      whop_membership_id: membershipId,
      plan_id: planId,
      status: newStatus,
      current_period_end: periodEnd ? new Date(periodEnd as string).toISOString() : null,
      raw: { action, data },
    },
    { onConflict: "email" },
  );

  if (error) {
    console.error("Upsert error:", error);
    return new Response(JSON.stringify({ error: "DB error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Suscriptor pagando = acceso garantizado aunque venga de fuera del funnel
  await supabaseAdmin.from("approved_emails").upsert(
    { email, notes: `Whop ${newStatus} (${action})`, is_active: newStatus === "active" || newStatus === "trialing" },
    { onConflict: "email" },
  );

  console.log(`OK ${action} → ${email} → ${newStatus}`);
  return new Response(JSON.stringify({ ok: true, email, status: newStatus }), {
    headers: { "Content-Type": "application/json" },
  });
});
