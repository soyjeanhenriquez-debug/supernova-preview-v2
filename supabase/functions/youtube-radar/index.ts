// SUPERNOVA — Radar de nichos de YouTube (03-oct-2026) con la API OFICIAL de YouTube (YOUTUBE_API_KEY).
// Videos de los últimos 30 días con más vistas por nicho, idioma y formato (largo o Short), con
// suscriptores del canal, "veces sus suscriptores" (señal de que el nicho empuja) y un ingreso
// ESTIMADO con rangos aproximados de RPM por idioma (siempre como rango y con la palabra estimado).
// Gratis para el usuario (mirar no cuesta): solo tope de uso. Cada búsqueda se guarda 6 h.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const FN = "youtube-radar";
const YT = "https://www.googleapis.com/youtube/v3";
const TTL_MS = 6 * 3600_000;

// US$ por cada 1.000 vistas monetizadas: rangos aproximados y conservadores por idioma del público.
const RPM: Record<string, { long: [number, number]; short: [number, number] }> = {
  es: { long: [0.5, 2.5], short: [0.02, 0.08] },
  en: { long: [2, 8], short: [0.03, 0.1] },
  pt: { long: [0.5, 2], short: [0.02, 0.06] },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** "PT14M3S" → segundos. */
function seconds(iso: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso ?? "");
  return m ? (Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) : 0;
}

async function yt(path: string, params: Record<string, string>) {
  const key = Deno.env.get("YOUTUBE_API_KEY")!;
  const r = await fetch(`${YT}/${path}?${new URLSearchParams({ ...params, key })}`);
  if (!r.ok) throw new Error(`youtube ${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const db = admin();
    const { data: u } = token ? await db.auth.getUser(token) : { data: null };
    const uid = u?.user?.id;
    if (!uid) return json({ error: "Inicia sesión para usar esta función." }, 401);
    if (!Deno.env.get("YOUTUBE_API_KEY")) return json({ error: "El radar de YouTube llega pronto." }, 503);

    const raw = await req.text();
    if (raw.length > 2000) return json({ error: "La solicitud es demasiado grande." }, 413);
    const body = raw ? JSON.parse(raw) : {};
    const q = String(body.q ?? "").trim().slice(0, 80);
    if (q.length < 2) return json({ error: "Escribe un nicho." }, 400);
    const lang = body.lang === "en" || body.lang === "pt" ? body.lang : "es";
    const kind: "long" | "short" = body.kind === "short" ? "short" : "long";
    const key = `${kind}:${lang}:${q.toLowerCase()}`;

    // Caché: si alguien buscó lo mismo hace menos de 6 h, no se gasta cuota.
    const { data: cached } = await db.from("youtube_radar_cache").select("payload,fetched_at").eq("key", key).maybeSingle();
    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS) return json({ ...cached.payload, cached: true });

    // Tope de uso (gratis: sin cobro). Solo cuenta cuando de verdad se consulta a YouTube.
    const { data: g, error: gErr } = await db.rpc("edge_guard_charge", {
      p_user_id: uid, p_fn: FN, p_max_hour: 30, p_max_day: 120, p_action: null, p_label: null, p_kind: null, p_receipt: null,
    });
    if (gErr) return json({ error: "No se pudo verificar el acceso. Intenta de nuevo." }, 503);
    if (g?.ok !== true) return json({ error: g?.reason === "rate_limited" ? "Hiciste muchas búsquedas seguidas. Intenta en un rato." : "Tu cuenta no tiene acceso activo." }, g?.reason === "rate_limited" ? 429 : 403);

    const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    const search = await yt("search", {
      part: "snippet", type: "video", order: "viewCount", maxResults: "30", q,
      publishedAfter: since, relevanceLanguage: lang, safeSearch: "strict",
      videoDuration: kind === "short" ? "short" : "medium",
    });
    const ids: string[] = (search.items ?? []).map((i: { id?: { videoId?: string } }) => i.id?.videoId).filter(Boolean);
    if (!ids.length) {
      const payload = { items: [], q, lang, kind, fetched_at: new Date().toISOString() };
      await db.from("youtube_radar_cache").upsert({ key, payload, fetched_at: new Date().toISOString() });
      return json(payload);
    }
    const videos = await yt("videos", { part: "snippet,statistics,contentDetails", id: ids.join(",") });
    const channelIds = [...new Set((videos.items ?? []).map((v: { snippet: { channelId: string } }) => v.snippet.channelId))];
    const channels = await yt("channels", { part: "statistics", id: channelIds.join(",") });
    const subs = new Map<string, number>((channels.items ?? []).map((c: { id: string; statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } }) =>
      [c.id, c.statistics?.hiddenSubscriberCount ? 0 : Number(c.statistics?.subscriberCount ?? 0)]));

    const rpm = RPM[lang][kind];
    // deno-lint-ignore no-explicit-any
    const items = (videos.items ?? []).map((v: any) => {
      const views = Number(v.statistics?.viewCount ?? 0);
      const s = subs.get(v.snippet.channelId) ?? 0;
      const secs = seconds(v.contentDetails?.duration);
      return {
        id: v.id,
        title: String(v.snippet.title ?? "").slice(0, 200),
        channel: String(v.snippet.channelTitle ?? "").slice(0, 100),
        channel_id: v.snippet.channelId,
        published_at: v.snippet.publishedAt,
        thumb: v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.default?.url ?? null,
        views, subs: s, seconds: secs,
        x_subs: s > 0 ? Math.round((views / s) * 10) / 10 : null,
        income_est: [Math.round((views / 1000) * rpm[0]), Math.round((views / 1000) * rpm[1])],
      };
    })
      // Largos: de 6 min en adelante. Shorts: hasta 3 min.
      .filter((i: { seconds: number }) => (kind === "short" ? i.seconds > 0 && i.seconds <= 180 : i.seconds >= 360))
      .sort((a: { views: number }, b: { views: number }) => b.views - a.views)
      .slice(0, 24);

    const payload = { items, q, lang, kind, rpm, fetched_at: new Date().toISOString() };
    await db.from("youtube_radar_cache").upsert({ key, payload, fetched_at: new Date().toISOString() });
    return json(payload);
  } catch (e) {
    console.error("youtube-radar:", e instanceof Error ? e.message : e);
    return json({ error: "No se pudo consultar YouTube ahora. Intenta en un momento." }, 502);
  }
});
