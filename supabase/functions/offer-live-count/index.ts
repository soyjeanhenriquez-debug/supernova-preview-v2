// SUPERNOVA — offer-live-count: cuántos anuncios tiene ACTIVOS HOY cada oferta en la Biblioteca de Meta
// (29-oct-2026, Jean: «los que salen tienen pocos anuncios activos»).
//
// offers.active_ads cuenta solo los anuncios de ese anunciante que guardamos (una muestra): casi todas salen con
// 4 a 6. La competencia muestra el total en vivo ("480 anuncios"). Esta función lo pide a la API oficial de Meta
// (gratis, la misma que usa la vigilancia de ofertas), en el país principal del anunciante, y lo guarda en
// offers.live_active_ads. Primero las de WhatsApp
// y las 300 ganadoras, después las demás por puntaje; cada una se relee a los 3 días. No toca winning_ads ni borra
// ni esconde nada del catálogo. Sin IA ni proveedores pagados.
//
// Compuertas: el cron (x-cron-secret, comparado dentro de la base) o Jean con sesión.
//   { limit?: 1..150 } → { contadas, fallas, con_mas_de_100, ejemplo }
import { corsHeaders } from "npm:@supabase/supabase-js@2.117.1/cors";
import { admin, json } from "../_shared/media.ts";
import { owner } from "../_shared/genjutsu.ts";

const POR_PAGINA = 500;
const MAX_PAGINAS = 2; // tope de lectura: 1.000 anuncios ("1.000+")

async function porCron(req: Request): Promise<boolean> {
  const secret = req.headers.get("x-cron-secret");
  if (!secret) return false;
  const { data } = await admin().rpc("verify_cron_secret", { p_secret: secret });
  return data === true;
}

async function contar(token: string, pageId: string, market: string): Promise<{ n: number; capped: boolean } | null> {
  const url = new URL("https://graph.facebook.com/v21.0/ads_archive");
  url.searchParams.set("access_token", token);
  url.searchParams.set("search_page_ids", JSON.stringify([pageId]));
  // En su país principal (Meta no acepta "todos los países" en estos anuncios: daba 0 en todas, 29-oct).
  url.searchParams.set("ad_reached_countries", JSON.stringify([market]));
  url.searchParams.set("ad_type", "ALL");
  url.searchParams.set("ad_active_status", "ACTIVE");
  url.searchParams.set("fields", "id");
  url.searchParams.set("limit", String(POR_PAGINA));
  let next: string | null = url.toString();
  let n = 0;
  for (let p = 0; next && p < MAX_PAGINAS; p++) {
    try {
      const r: Response = await fetch(next, { signal: AbortSignal.timeout(20_000) });
      const d: { data?: unknown[]; paging?: { next?: unknown } } | null = await r.json().catch(() => null);
      // El error de Meta puede traer la URL con el token: nunca se registra.
      if (!r.ok || !d) return null;
      n += Array.isArray(d.data) ? d.data.length : 0;
      const nx = typeof d.paging?.next === "string" ? d.paging.next : null;
      next = nx && /^https:\/\/graph\.facebook\.com\//.test(nx) ? nx : null;
    } catch { return null; }
  }
  return { n, capped: !!next };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await porCron(req)) && !(await owner(req))) return json({ error: "No autorizado." }, 401);
  const body = await req.json().catch(() => ({})) as { limit?: number };
  const limit = Math.max(1, Math.min(150, Math.round(Number(body.limit) || 150)));
  const db = admin();

  const { data: tok } = await db.rpc("get_fb_token");
  const token = (typeof tok === "string" && tok.length > 20 ? tok : null) ?? Deno.env.get("FACEBOOK_ACCESS_TOKEN");
  if (!token) return json({ error: "Falta el token de Meta." }, 503);

  const { data: rows, error } = await db.rpc("offers_pending_live_count", { p_limit: limit });
  if (error) return json({ error: "No se pudieron leer las ofertas." }, 500);
  // Un anunciante puede tener varias ofertas (una por país): se cuenta una vez por página y se guarda en todas.
  const lista = (rows ?? []) as { page_id: string; market: string }[];

  const t0 = Date.now();
  let contadas = 0, fallas = 0, grandes = 0;
  let ejemplo: { n: number; capped: boolean } | null = null;
  for (let i = 0; i < lista.length && Date.now() - t0 < 120_000; i += 3) {
    const tanda = lista.slice(i, i + 3);
    const res = await Promise.all(tanda.map(o => contar(token, o.page_id, o.market)));
    for (let k = 0; k < tanda.length; k++) {
      const r = res[k];
      // Si Meta falla se marca la fecha igual (no se reintenta en cada vuelta) y el número queda como estaba.
      const patch = r ? { live_active_ads: r.n, live_capped: r.capped, live_checked_at: new Date().toISOString() } : { live_checked_at: new Date().toISOString() };
      await db.from("offers").update(patch).eq("page_id", tanda[k].page_id);
      if (r) { contadas++; if (r.n >= 100) grandes++; if (!ejemplo || r.n > ejemplo.n) ejemplo = r; } else fallas++;
    }
  }
  const out = { contadas, fallas, con_mas_de_100: grandes, ejemplo, pendientes_en_esta_vuelta: lista.length };
  console.log("offer-live-count", JSON.stringify(out));
  return json(out);
});
