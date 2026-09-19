// SUPERNOVA — Facebook Ad Library proxy
// Usa FACEBOOK_ACCESS_TOKEN (server-side) para consultar la Ad Library API.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient as createGuardClient } from "npm:@supabase/supabase-js@2";

// ── Compuerta de usuario ────────────────────────────────────────────────
// verify_jwt del gateway NO basta: la llave pública (anon) que viaja en el
// bundle de la web también es un JWT válido, y con ella cualquiera llamaba a
// esta función sin cuenta y sin gastar créditos. Aquí se exige un USUARIO real
// con acceso vigente y se aplica un tope de uso por usuario (RPC edge_guard).
async function requireUser(req: Request, fn: string, maxHour: number, maxDay: number): Promise<{ userId: string } | Response> {
  const deny = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return deny(401, "Inicia sesión para usar esta función.");
  const guard = createGuardClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await guard.auth.getUser(token);
  const userId = data?.user?.id;
  if (!userId) return deny(401, "Sesión inválida o expirada. Vuelve a iniciar sesión.");
  const { data: g, error } = await guard.rpc("edge_guard", { p_user_id: userId, p_fn: fn, p_max_hour: maxHour, p_max_day: maxDay });
  if (error) return deny(503, "No se pudo verificar el acceso. Intenta de nuevo.");
  if (g?.ok !== true) {
    return g?.reason === "rate_limited"
      ? deny(429, "Alcanzaste el límite de uso de esta función. Intenta más tarde.")
      : deny(403, "Tu cuenta no tiene acceso activo.");
  }
  return { userId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const gate = await requireUser(req, "facebook-ads", 120, 800);
  if (gate instanceof Response) return gate;

  try {
    const token = Deno.env.get("FACEBOOK_ACCESS_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing FACEBOOK_ACCESS_TOKEN" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);
    // Todo esto viaja a la API de Meta con NUESTRO token: valores acotados.
    const q = (body.search_terms ?? url.searchParams.get("search_terms") ?? "").toString().trim().slice(0, 200);
    const countryRaw = (body.country ?? url.searchParams.get("country") ?? "US").toString().toUpperCase();
    const country = /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : "US";
    const limit = Number(body.limit ?? url.searchParams.get("limit") ?? 25) || 25;
    const adTypeRaw = (body.ad_type ?? url.searchParams.get("ad_type") ?? "ALL").toString().toUpperCase();
    const adType = ["ALL", "POLITICAL_AND_ISSUE_ADS", "EMPLOYMENT_ADS", "HOUSING_ADS", "FINANCIAL_PRODUCTS_AND_SERVICES_ADS"].includes(adTypeRaw) ? adTypeRaw : "ALL";
    const statusRaw = (body.ad_active_status ?? url.searchParams.get("ad_active_status") ?? "ACTIVE").toString().toUpperCase();
    const adActiveStatus = ["ACTIVE", "INACTIVE", "ALL"].includes(statusRaw) ? statusRaw : "ACTIVE";

    if (!q) {
      return new Response(JSON.stringify({ error: "search_terms is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseFields = [
      "id", "ad_creation_time", "ad_delivery_start_time", "ad_delivery_stop_time",
      "ad_creative_bodies", "ad_creative_link_titles", "ad_creative_link_descriptions",
      "ad_creative_link_captions", "ad_snapshot_url", "page_id", "page_name",
      "publisher_platforms", "impressions", "spend", "currency", "languages",
    ];
    // Pedimos también total_count (algunos endpoints lo soportan); si la API
    // rechaza el campo, reintentamos sin él.
    const fieldsWithTotal = [...baseFields, "total_count"].join(",");
    const fieldsBase = baseFields.join(",");

    const buildUrl = (fields: string) => {
      const u = new URL("https://graph.facebook.com/v21.0/ads_archive");
      u.searchParams.set("access_token", token);
      u.searchParams.set("search_terms", q);
      u.searchParams.set("ad_reached_countries", JSON.stringify([country]));
      u.searchParams.set("ad_type", adType);
      u.searchParams.set("ad_active_status", adActiveStatus);
      u.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 100)));
      u.searchParams.set("fields", fields);
      return u;
    };

    let r = await fetch(buildUrl(fieldsWithTotal).toString());
    let data = await r.json();
    if (!r.ok) {
      // Fallback: reintentar sin total_count si la API lo rechaza
      r = await fetch(buildUrl(fieldsBase).toString());
      data = await r.json();
    }

    if (!r.ok) {
      console.error("FB error:", data);
      return new Response(JSON.stringify({ error: "Facebook API error", detail: data }), {
        status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
