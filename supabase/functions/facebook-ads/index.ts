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

// La búsqueda en vivo depende de Meta. Cuando Meta falla (token vencido, caída)
// el usuario no tiene nada que arreglar: se le dice claro y se le da una salida.
function unavailable(code: string): Response {
  return new Response(JSON.stringify({
    error: "La búsqueda en vivo de Meta está en mantenimiento. Mientras vuelve, usa Ofertas: ahí están los ganadores ya analizados.",
    code,
  }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const gate = await requireUser(req, "facebook-ads", 120, 800);
  if (gate instanceof Response) return gate;

  try {
    const token = Deno.env.get("FACEBOOK_ACCESS_TOKEN");
    if (!token) {
      console.error("facebook-ads: falta el token de Meta en los secretos");
      return unavailable("fb_not_configured");
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
      // El detalle de Meta se queda en el log: al usuario le llega un mensaje
      // que entiende y un código para que el panel admin sepa qué arreglar.
      const fb = data?.error ?? {};
      console.error("FB error:", JSON.stringify({ code: fb.code, subcode: fb.error_subcode, type: fb.type, message: fb.message }));
      if (fb.code === 190 || fb.type === "OAuthException") return unavailable("fb_token_expired");
      if ([4, 17, 32, 613].includes(Number(fb.code))) {
        return new Response(JSON.stringify({ error: "Meta está limitando las búsquedas en este momento. Intenta de nuevo en unos minutos.", code: "fb_rate_limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return unavailable("fb_error");
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("facebook-ads:", e instanceof Error ? e.message : e);
    return unavailable("fb_error");
  }
});
