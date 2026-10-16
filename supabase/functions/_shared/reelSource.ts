// SUPERNOVA — De dónde sale un Reel (Analizador de Reels v2, bloque 1, 16-oct-2026).
//
// Regla de costo: el Reel se lee UNA vez para todos. Primero se busca en la caché global
// (reel_extractions, por shortcode, 7 días); solo si no está o está vieja se llama a Apify.
// Toda corrida de Apify (de cualquier función) pasa por runApify: revisa el tope del mes
// (provider_caps) y anota su costo en apify_runs. Si se llegó al tope, no se llama: "budget".
// "slow" = la corrida no terminó a tiempo (TIMED-OUT de Apify o nuestro límite): suele ser ese Reel,
// no el servicio (16-oct-2026: un Reel de 2022 dio TIMED-OUT dos veces y el siguiente salió en 10 s).
// La llave de Apify va en la cabecera (nunca en la URL). El video nunca se guarda: solo su enlace.
import { admin } from "./media.ts";

/** Apify cobra por resultado (instagram-scraper, plan FREE; BRONZE = 0,0023). Sin costo por corrida. */
export const APIFY_USD_PER_RESULT = 0.0027;
export const CACHE_DAYS = 7;
const ACTOR = "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?timeout=50";

export const REEL_RE = /^https?:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9._]+\/)?(?:reel|reels|p)\/([A-Za-z0-9_-]{5,40})\/?(?:\?.*)?$/;
const MEDIA_HOST_RE = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;
export const reelUrl = (shortcode: string) => `https://www.instagram.com/reel/${shortcode}/`;

export interface ReelExtraction {
  shortcode: string; url: string; owner: string | null; caption: string | null; duration_s: number | null;
  views: number | null; likes: number | null; comments: number | null; is_video: boolean;
  video_url: string | null; cover_url: string | null; apify_usd: number; extracted_at: string;
  base: Record<string, unknown> | null; base_model: string | null; llm_a_usd: number | null; analyzed_at: string | null;
}

export type ApifyFail = "down" | "budget" | "slow";
export type Got =
  | { ok: true; row: ReelExtraction; cacheHit: boolean; apifyUsd: number }
  | { ok: false; reason: ApifyFail | "not_found" };

const txt = (s: unknown, n: number) => (typeof s === "string" ? s : "").replace(/\s+/g, " ").trim().slice(0, n) || null;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const mediaUrl = (v: unknown) => {
  if (typeof v !== "string" || !v.startsWith("https://") || v.length > 2000) return null;
  try { return MEDIA_HOST_RE.test(new URL(v).hostname) ? v : null; } catch { return null; }
};

/**
 * Una corrida de Apify para una o varias publicaciones (un resultado por URL). Revisa el tope del mes
 * antes de llamar y anota el costo después. Devuelve los resultados sin error, o por qué no se pudo.
 */
// deno-lint-ignore no-explicit-any
export async function runApify(fn: string, urls: string[], token: string): Promise<any[] | ApifyFail> {
  const db = admin();
  const { data: b, error } = await db.rpc("apify_budget");
  // Sin poder leer el tope no se gasta: es preferible pausar a pasarse.
  if (error || !b) { console.error(`${fn}: apify_budget`, error?.message); return "down"; }
  if (Number(b.spent) + urls.length * APIFY_USD_PER_RESULT > Number(b.cap)) {
    console.error(`${fn}: tope de Apify del mes (${b.spent} de ${b.cap} USD)`);
    return "budget";
  }
  let items: unknown[] = [];
  let ok = false;
  let slow = false;
  try {
    const r = await fetch(ACTOR, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      // Solo lo que se usa: la publicación misma, un resultado por URL, sin datos extra.
      body: JSON.stringify({ directUrls: urls, resultsType: "posts", resultsLimit: 1, addParentData: false }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) {
      const t = await r.text();
      slow = t.includes("TIMED-OUT");
      console.error(`${fn}: apify`, r.status, t.slice(0, 200));
    } else { const j = await r.json(); items = Array.isArray(j) ? j : []; ok = true; }
  } catch (e) {
    slow = e instanceof Error && e.name === "TimeoutError";
    console.error(`${fn}: apify`, e instanceof Error ? e.message : e);
  }
  // Apify cobra cada resultado escrito, también los que vienen con error.
  const { error: logErr } = await db.from("apify_runs").insert({
    fn, urls: urls.length, items: items.length, cost_usd: items.length * APIFY_USD_PER_RESULT, ok,
  });
  if (logErr) console.error(`${fn}: apify_runs`, logErr.message);
  // deno-lint-ignore no-explicit-any
  return ok ? items.filter((x: any) => x && typeof x === "object" && !x.error) : slow ? "slow" : "down";
}

// deno-lint-ignore no-explicit-any
function rowFrom(shortcode: string, it: any): Omit<ReelExtraction, "base" | "base_model" | "llm_a_usd" | "analyzed_at"> {
  const video = mediaUrl(it.videoUrl);
  return {
    shortcode, url: reelUrl(shortcode),
    owner: txt(it.ownerUsername, 40), caption: txt(it.caption, 1500),
    duration_s: num(it.videoDuration),
    views: num(it.videoPlayCount) ?? num(it.videoViewCount),
    likes: num(it.likesCount), comments: num(it.commentsCount),
    is_video: !!video, video_url: video, cover_url: mediaUrl(it.displayUrl),
    apify_usd: APIFY_USD_PER_RESULT, extracted_at: new Date().toISOString(),
  };
}

const fresh = (r: ReelExtraction) => Date.now() - new Date(r.extracted_at).getTime() < CACHE_DAYS * 86_400_000;

/**
 * El Reel desde la caché, o desde Apify si no está, está viejo o `force` (p. ej. el enlace del video ya
 * venció). Al volver a leerlo se conserva el análisis base (capa A): el Reel es el mismo.
 */
export async function getReel(fn: string, shortcode: string, token: string, force = false): Promise<Got> {
  const db = admin();
  const { data: cached } = await db.from("reel_extractions").select("*").eq("shortcode", shortcode).maybeSingle();
  if (cached && !force && fresh(cached as ReelExtraction)) return { ok: true, row: cached as ReelExtraction, cacheHit: true, apifyUsd: 0 };

  const items = await runApify(fn, [reelUrl(shortcode)], token);
  if (typeof items === "string") return { ok: false, reason: items };
  const it = items.find(x => x.shortCode === shortcode) ?? items[0];
  if (!it) return { ok: false, reason: "not_found" };
  const row = rowFrom(shortcode, it);
  const { data: saved, error } = await db.from("reel_extractions").upsert(row, { onConflict: "shortcode" }).select("*").single();
  if (error) console.error(`${fn}: reel_extractions`, error.message);
  return { ok: true, row: (saved as ReelExtraction) ?? { ...row, base: null, base_model: null, llm_a_usd: null, analyzed_at: null }, cacheHit: false, apifyUsd: APIFY_USD_PER_RESULT };
}

/**
 * Varios Reels en UNA corrida de Apify (para el barrido): solo pide los que no están en caché o están
 * viejos. Devuelve cuántos leyó y cuántos ya estaban.
 */
export async function extractMany(fn: string, shortcodes: string[], token: string): Promise<{ read: number; cached: number } | ApifyFail> {
  const db = admin();
  const codes = [...new Set(shortcodes)].slice(0, 50);
  const { data } = await db.from("reel_extractions").select("shortcode, extracted_at").in("shortcode", codes);
  const ok = new Set((data ?? []).filter(r => fresh(r as ReelExtraction)).map(r => r.shortcode as string));
  const todo = codes.filter(c => !ok.has(c));
  if (!todo.length) return { read: 0, cached: codes.length };
  const items = await runApify(fn, todo.map(reelUrl), token);
  if (typeof items === "string") return items;
  const rows = todo.flatMap(c => { const it = items.find(x => x.shortCode === c); return it ? [rowFrom(c, it)] : []; });
  if (rows.length) {
    const { error } = await db.from("reel_extractions").upsert(rows, { onConflict: "shortcode" });
    if (error) console.error(`${fn}: reel_extractions`, error.message);
  }
  return { read: rows.length, cached: ok.size };
}
