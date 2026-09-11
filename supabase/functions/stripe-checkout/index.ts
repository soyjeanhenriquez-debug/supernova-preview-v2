// Checkout de Stripe — cobro principal de SUPERNOVA.
//
// Acciones (POST, JWT requerido):
//  - {action:"subscribe", plan:"pro"|"proMax"}  → Checkout de suscripción (7 días de trial)
//  - {action:"pack", pack_id:"boost"|...}        → Checkout one-time de pack de créditos
//
// Los PRECIOS viven aquí (allowlist server-side) — el cliente solo manda ids.
// La acreditación la hace stripe-webhook al recibir checkout.session.completed
// con la metadata que esta función escribe (user_id / pool / credits).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_RETURN_ORIGINS = [
  "https://supernova-six-eta.vercel.app",
  "http://localhost:8080",
];
const DEFAULT_ORIGIN = "https://supernova-six-eta.vercel.app";

// Mismos números que muestra la UI (plans.ts / CreditsPage) — en centavos USD.
const SUB_PLANS: Record<string, { name: string; amount: number }> = {
  pro:    { name: "SUPERNOVA PRO",     amount: 2900 },
  proMax: { name: "SUPERNOVA PRO MAX", amount: 3900 },
};
const TRIAL_DAYS = 7;

const PACKS: Record<string, { name: string; amount: number; credits: number; pool: "text" | "media" }> = {
  "boost":         { name: "Pack Boost — 500 créditos",          amount: 1000, credits: 500,  pool: "text" },
  "power":         { name: "Pack Power — 2,000 créditos",        amount: 2000, credits: 2000, pool: "text" },
  "nuclear":       { name: "Pack Nuclear — 4,500 créditos",      amount: 3900, credits: 4500, pool: "text" },
  "media-starter": { name: "Media Starter — 50 media credits",   amount: 1200, credits: 50,   pool: "media" },
  "media-pro":     { name: "Media Pro — 150 media credits",      amount: 2900, credits: 150,  pool: "media" },
  "media-scale":   { name: "Media Scale — 400 media credits",    amount: 6900, credits: 400,  pool: "media" },
};

interface Body {
  action?: "subscribe" | "pack";
  plan?: string;
  pack_id?: string;
  return_url?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    // Usuario real desde el JWT — email y user_id jamás vienen del body
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user?.email) return json({ error: "No autenticado" }, 401);
    const email = user.email.toLowerCase().trim();

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Stripe no configurado (falta STRIPE_SECRET_KEY)" }, 503);

    const stripePost = async (path: string, form: URLSearchParams) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      try {
        return await fetch(`https://api.stripe.com${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${stripeKey.trim()}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form,
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(t);
      }
    };
    const stripeGet = async (path: string) => {
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

    const body = (await req.json().catch(() => ({}))) as Body;

    // Origen de retorno validado por comparación exacta
    let origin = DEFAULT_ORIGIN;
    try {
      const o = new URL((body.return_url ?? "").trim()).origin;
      if (ALLOWED_RETURN_ORIGINS.includes(o)) origin = o;
    } catch { /* default */ }

    // Reusar el customer existente del email (mismo criterio que stripe-portal)
    // para que portal y suscripciones apunten a la misma persona.
    let customerId = "";
    const custRes = await stripeGet(`/v1/customers?email=${encodeURIComponent(email)}&limit=1`);
    if (custRes.ok) {
      const c = await custRes.json();
      customerId = c?.data?.[0]?.id ?? "";
    }

    const form = new URLSearchParams();
    form.set("success_url", `${origin}/?checkout=success`);
    form.set("cancel_url", `${origin}/?checkout=cancel`);
    if (customerId) form.set("customer", customerId);
    else form.set("customer_email", email);

    if (body.action === "subscribe") {
      const plan = SUB_PLANS[body.plan ?? ""];
      if (!plan) return json({ error: "Plan inválido" }, 400);

      form.set("mode", "subscription");
      form.set("line_items[0][quantity]", "1");
      form.set("line_items[0][price_data][currency]", "usd");
      form.set("line_items[0][price_data][unit_amount]", String(plan.amount));
      form.set("line_items[0][price_data][recurring][interval]", "month");
      form.set("line_items[0][price_data][product_data][name]", plan.name);
      form.set("subscription_data[trial_period_days]", String(TRIAL_DAYS));
      form.set("subscription_data[metadata][user_id]", user.id);
      form.set("subscription_data[metadata][plan]", body.plan!);
      form.set("metadata[user_id]", user.id);
      form.set("metadata[plan]", body.plan!);
    } else if (body.action === "pack") {
      const pack = PACKS[body.pack_id ?? ""];
      if (!pack) return json({ error: "Pack inválido" }, 400);

      form.set("mode", "payment");
      form.set("line_items[0][quantity]", "1");
      form.set("line_items[0][price_data][currency]", "usd");
      form.set("line_items[0][price_data][unit_amount]", String(pack.amount));
      form.set("line_items[0][price_data][product_data][name]", pack.name);
      form.set("metadata[user_id]", user.id);
      form.set("metadata[pack_id]", body.pack_id!);
      form.set("metadata[pool]", pack.pool);
      form.set("metadata[credits]", String(pack.credits));
    } else {
      return json({ error: "Acción inválida" }, 400);
    }

    const res = await stripePost("/v1/checkout/sessions", form);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) {
      console.error("Checkout error:", JSON.stringify(data).slice(0, 400));
      return json({ error: "No se pudo crear el checkout", detail: data?.error?.message ?? null }, 502);
    }
    return json({ url: data.url });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "AbortError";
    return json({ error: timedOut ? "Stripe no respondió a tiempo" : (e instanceof Error ? e.message : "Unknown") }, timedOut ? 504 : 500);
  }
});
