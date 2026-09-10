// SUPERNOVA — Portal de suscripción Stripe sin fricción.
//
// El link "no-code" de Stripe (billing.stripe.com/p/login/...) siempre pide
// el correo y manda un magic link. Esta función lo reemplaza: el usuario ya
// está autenticado en la app, así que tomamos su email del JWT VERIFICADO
// (nunca del body — aquí se administra dinero), buscamos su customer en
// Stripe y creamos una billing portal session ya autenticada → entra directo
// a administrar su suscripción, estilo Apple.
//
// Acciones (POST body.action):
//  - "info"   → resumen de la suscripción (plan, estado, renovación)
//  - "portal" → URL de sesión del portal, lista para redirigir
//
// Requiere STRIPE_SECRET_KEY en Supabase → Edge Functions → Secrets.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_RETURN_ORIGINS = [
  "https://supernova-six-eta.vercel.app",
  "http://localhost:8080",
];
const DEFAULT_RETURN_URL = "https://supernova-six-eta.vercel.app/";

interface Body {
  action?: "info" | "portal";
  return_url?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    // 1) Usuario real desde el JWT — el email jamás viene del cliente
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
    if (!stripeKey) {
      return json({ error: "Stripe no configurado (falta STRIPE_SECRET_KEY en los secrets)" }, 503);
    }

    // Timeout duro en todas las llamadas externas (lección aprendida con HeyGen)
    const stripeFetch = async (path: string, init: { method?: string; body?: URLSearchParams } = {}) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      try {
        return await fetch(`https://api.stripe.com${path}`, {
          method: init.method ?? "GET",
          headers: {
            Authorization: `Bearer ${stripeKey}`,
            ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
          },
          body: init.body,
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(t);
      }
    };

    // 2) Buscar el customer de Stripe por el email verificado
    const custRes = await stripeFetch(`/v1/customers?email=${encodeURIComponent(email)}&limit=3`);
    if (!custRes.ok) {
      const detail = (await custRes.text()).slice(0, 300);
      return json({ error: `Error consultando Stripe (${custRes.status})`, detail }, 502);
    }
    const custData = await custRes.json();
    const customers = (custData?.data ?? []) as Array<{ id: string }>;
    if (customers.length === 0) {
      return json({ found: false, note: "Sin customer de Stripe para este correo" });
    }

    // Puede haber más de un customer con el mismo email: preferir el que
    // tenga una suscripción viva; si ninguno, el primero.
    type Sub = {
      id: string; status: string; cancel_at_period_end: boolean; current_period_end: number;
      items?: { data?: Array<{ price?: { nickname?: string | null; unit_amount?: number | null; currency?: string; recurring?: { interval?: string } } }> };
    };
    const LIVE = new Set(["active", "trialing", "past_due"]);
    let chosenCustomer = customers[0].id;
    let chosenSub: Sub | null = null;

    for (const c of customers) {
      const subsRes = await stripeFetch(`/v1/subscriptions?customer=${c.id}&status=all&limit=5`);
      if (!subsRes.ok) continue;
      const subs = ((await subsRes.json())?.data ?? []) as Sub[];
      const live = subs.find((s) => LIVE.has(s.status));
      if (live) { chosenCustomer = c.id; chosenSub = live; break; }
      if (!chosenSub && subs[0]) { chosenCustomer = c.id; chosenSub = subs[0]; }
    }

    const body = (await req.json().catch(() => ({}))) as Body;

    if (body.action === "portal") {
      // 3) Sesión del portal ya autenticada — sin pedir correo
      // Comparación EXACTA de origen (startsWith dejaría pasar
      // "https://supernova-six-eta.vercel.app.evil.com" → open redirect)
      const requested = (body.return_url ?? "").trim();
      let returnUrl = DEFAULT_RETURN_URL;
      try {
        if (ALLOWED_RETURN_ORIGINS.includes(new URL(requested).origin)) returnUrl = requested;
      } catch { /* URL inválida → default */ }

      const form = new URLSearchParams({ customer: chosenCustomer, return_url: returnUrl });
      const portalRes = await stripeFetch("/v1/billing_portal/sessions", { method: "POST", body: form });
      const portalData = await portalRes.json().catch(() => ({}));
      if (!portalRes.ok || !portalData?.url) {
        return json({ error: "No se pudo crear la sesión del portal", detail: JSON.stringify(portalData).slice(0, 300) }, 502);
      }
      return json({ url: portalData.url });
    }

    // action "info" (default): resumen para el menú in-app
    if (!chosenSub) return json({ found: true, has_subscription: false });

    const price = chosenSub.items?.data?.[0]?.price;
    return json({
      found: true,
      has_subscription: true,
      status: chosenSub.status,
      plan: price?.nickname ?? null,
      amount: price?.unit_amount ?? null,          // en centavos
      currency: price?.currency ?? null,
      interval: price?.recurring?.interval ?? null,
      renews_at: chosenSub.current_period_end ? new Date(chosenSub.current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: chosenSub.cancel_at_period_end,
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "AbortError";
    return json({ error: timedOut ? "Stripe no respondió a tiempo" : (e instanceof Error ? e.message : "Unknown") }, timedOut ? 504 : 500);
  }
});
