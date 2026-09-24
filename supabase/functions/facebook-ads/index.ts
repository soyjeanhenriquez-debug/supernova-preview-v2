// SUPERNOVA — Facebook Ad Library proxy
// Usa FACEBOOK_ACCESS_TOKEN (server-side) para consultar la Ad Library API.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient as createGuardClient } from "npm:@supabase/supabase-js@2";

// ── Compuerta de usuario + cobro en el servidor ─────────────────────────
// verify_jwt del gateway NO basta: la llave pública (anon) que viaja en el
// bundle de la web también es un JWT válido. Aquí se exige un USUARIO real con
// acceso vigente, se aplica el tope de uso y la búsqueda en vivo se COBRA aquí
// (search_ads, precio en credit_prices). Antes la cobraba el navegador después
// de la respuesta, así que llamando a la función directo salía gratis.
interface Gate { userId: string; txId: string | null; charged: number; balance: number | null; receipt: string | null }

function guardClient() {
  return createGuardClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireUser(req: Request, fn: string, maxHour: number, maxDay: number, action: string | null, label: string | null): Promise<Gate | Response> {
  const deny = (status: number, error: string, extra: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({ error, ...extra }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return deny(401, "Inicia sesión para usar esta función.");
  const guard = guardClient();
  const { data } = await guard.auth.getUser(token);
  const userId = data?.user?.id;
  if (!userId) return deny(401, "Sesión inválida o expirada. Vuelve a iniciar sesión.");
  const { data: g, error } = await guard.rpc("edge_guard_charge", {
    p_user_id: userId, p_fn: fn, p_max_hour: maxHour, p_max_day: maxDay,
    p_action: action, p_label: label, p_kind: null, p_receipt: null,
  });
  if (error) return deny(503, "No se pudo verificar el acceso. Intenta de nuevo.");
  if (g?.ok !== true) {
    switch (g?.reason) {
      case "rate_limited": return deny(429, "Alcanzaste el límite de uso de esta función. Intenta más tarde.");
      case "insufficient_credits":
        return deny(402, "No te alcanzan los créditos para buscar en vivo. Mirar el radar es gratis.", { code: "insufficient_credits", balance: g.balance, cost: g.cost });
      case "disabled": return deny(503, "Esta función no está disponible por ahora.");
      case "unknown_action": return deny(500, "Acción sin precio configurado.");
      default: return deny(403, "Tu cuenta no tiene acceso activo.");
    }
  }
  return {
    userId, txId: g.tx_id ?? null, charged: Number(g.charged) || 0,
    balance: typeof g.balance === "number" ? g.balance : null, receipt: g.receipt ?? null,
  };
}

// Meta falló después de cobrar: se devuelve el crédito (idempotente en la base).
async function refundCharge(gate: Gate, reason: string): Promise<void> {
  if (!gate.txId) return;
  try { await guardClient().rpc("refund_charge", { p_tx_id: gate.txId, p_reason: reason.slice(0, 200) }); }
  catch (e) { console.error("refund_charge falló:", e); }
}

// El token vigente vive en Vault: lo renueva fb-token-keeper antes de que venza.
// El secreto FACEBOOK_ACCESS_TOKEN es solo la semilla (y el respaldo).
async function currentFbToken(): Promise<string | null> {
  try {
    const c = createGuardClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await c.rpc("get_fb_token");
    if (typeof data === "string" && data.length > 20) return data;
  } catch { /* cae a la semilla */ }
  return Deno.env.get("FACEBOOK_ACCESS_TOKEN") ?? null;
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
  const raw = req.method === "POST" ? await req.text().catch(() => "") : "";
  if (raw.length > 4000) {
    return new Response(JSON.stringify({ error: "La solicitud es demasiado grande." }), {
      status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  if (!body || typeof body !== "object" || Array.isArray(body)) body = {};

  // Dos usos, con topes bajos porque cada llamada gasta la cuota de Meta que comparte toda la app:
  //  · Búsqueda en vivo del Radar: se cobra search_ads aquí (5 créditos) y se devuelve si Meta falla.
  //  · Anuncios del Oráculo (purpose "oraculo"): van incluidos en el Oráculo, que se cobra en
  //    analyze-landing. Sin cobro pero con un tope propio y bajo (cada análisis hace hasta 12).
  const oraculo = body.purpose === "oraculo";
  const term = String(body.search_terms ?? "").slice(0, 60);
  const gate = oraculo
    ? await requireUser(req, "facebook-ads-oraculo", 36, 120, null, null)
    : await requireUser(req, "facebook-ads", 30, 150, "search_ads", `Búsqueda en vivo · ${term || "anuncios"}`);
  if (gate instanceof Response) return gate;

  try {
    const token = await currentFbToken();
    if (!token) {
      console.error("facebook-ads: falta el token de Meta en los secretos");
      await refundCharge(gate, "Meta sin token");
      return unavailable("fb_not_configured");
    }

    const url = new URL(req.url);
    // Todo esto viaja a la API de Meta con NUESTRO token: valores acotados.
    const q = (body.search_terms ?? url.searchParams.get("search_terms") ?? "").toString().trim().slice(0, 200);
    const countryRaw = (body.country ?? url.searchParams.get("country") ?? "US").toString().toUpperCase();
    const country = /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : "US";
    // En modo Oráculo (gratis) se piden pocos anuncios: así no sirve de búsqueda del Radar sin pagar.
    const limit = Math.min(oraculo ? 15 : 100, Number(body.limit ?? url.searchParams.get("limit") ?? 25) || 25);
    const adTypeRaw = (body.ad_type ?? url.searchParams.get("ad_type") ?? "ALL").toString().toUpperCase();
    const adType = ["ALL", "POLITICAL_AND_ISSUE_ADS", "EMPLOYMENT_ADS", "HOUSING_ADS", "FINANCIAL_PRODUCTS_AND_SERVICES_ADS"].includes(adTypeRaw) ? adTypeRaw : "ALL";
    const statusRaw = (body.ad_active_status ?? url.searchParams.get("ad_active_status") ?? "ACTIVE").toString().toUpperCase();
    const adActiveStatus = ["ACTIVE", "INACTIVE", "ALL"].includes(statusRaw) ? statusRaw : "ACTIVE";

    if (!q) {
      await refundCharge(gate, "sin término de búsqueda");
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
      await refundCharge(gate, `Meta ${fb.code ?? r.status}`);
      if (fb.code === 190 || fb.type === "OAuthException") return unavailable("fb_token_expired");
      if ([4, 17, 32, 613].includes(Number(fb.code))) {
        return new Response(JSON.stringify({ error: "Meta está limitando las búsquedas en este momento. Intenta de nuevo en unos minutos.", code: "fb_rate_limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return unavailable("fb_error");
    }

    // Meta devuelve `ad_snapshot_url` con NUESTRO access_token pegado. Esto viaja
    // al navegador del usuario: se reemplaza por la URL pública del anuncio.
    if (Array.isArray(data?.data)) {
      for (const it of data.data) {
        if (it && typeof it === "object" && "ad_snapshot_url" in it) {
          it.ad_snapshot_url = it.id ? `https://www.facebook.com/ads/library/?id=${encodeURIComponent(String(it.id))}` : null;
        }
      }
    }
    // La paginación de Meta también trae el token dentro de las URLs "next/previous".
    if (data?.paging) { delete data.paging.next; delete data.paging.previous; }

    // El cobro va en el cuerpo: la app actualiza el saldo con applyServerCharge.
    return new Response(JSON.stringify({
      ...data,
      billing: { charged: gate.charged, balance: gate.balance, receipt: gate.receipt },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("facebook-ads:", e instanceof Error ? e.message : e);
    await refundCharge(gate, "excepción");
    return unavailable("fb_error");
  }
});
