// SUPERNOVA — cazador-import: trae a nuestro catálogo los anunciantes de Cazador Swipe (de Jean) por page_id.
// (29-oct-2026, Jean: Cazador Swipe es suyo y su catálogo alimenta el de SUPERNOVA.)
//
// QUÉ HACE: por cada page_id pide a la API OFICIAL de Meta (`search_page_ids`, la misma que ya usa
// offer-live-count) los anuncios ACTIVOS de ese anunciante y los guarda en winning_ads, igual que
// bulk-seed-ads (mismas columnas, mismo upsert por keyword+ad_url, mismo tope de texto). Después, el
// refresh_offers() de las 11:30 UTC los agrupa en `offers` y refresh_offer_canal() (11:50) calcula el canal.
// NO escribe en `offers` ni toca anuncios existentes distintos a los suyos; NO borra ni oculta nada.
//
// CANAL WHATSAPP: si Cazador marca la oferta con checkout WhatsApp (item.whatsapp = true), los anuncios
// importados de esa página se guardan con dest_channel = 'whatsapp'. Así refresh_offer_canal() (que mira
// winning_ads.dest_channel) deja offers.canal = 'whatsapp' sin cambiarlo. Si el dominio visible del anuncio
// dice otra cosa (página o mensajes), gana el dominio visible y se informa como "conflictos_canal".
//
// ENTRADA (POST JSON):
//   { items: [{ page_id, country?, whatsapp?, cazador_id? }], dry_run?, min_days?, max_ads_por_pagina?, limit? }
//   o, sin `items`, si existen los secretos CAZADOR_SUPABASE_URL y CAZADOR_SUPABASE_KEY (llave que Jean guarda;
//   la función no la escribe en ningún lado), lee las ofertas de la base de Cazador y arma los items sola
//   (modo diario). Los que ya están en `offers` se saltan.
// SALIDA: { paginas_leidas, paginas_sin_anuncios, anuncios_guardados, saltadas_ya_en_offers, conflictos_canal,
//           errores, pendientes, dry_run }
//
// COMPUERTAS (verify_jwt no protege): secreto de cron (x-cron-secret, verificado dentro de la base) o Jean con
// sesión. Sin IA y sin proveedores de pago: solo la API de Meta (gratis).
// ESPACIO: tope por página (max_ads_por_pagina, 20) y texto de 5.000 caracteres; la base está en plan Free.
import { corsHeaders } from "npm:@supabase/supabase-js@2.117.1/cors";
import { admin, json } from "../_shared/media.ts";
import { owner } from "../_shared/genjutsu.ts";
import { redact } from "../_shared/redact.ts";
import { channelFromCaption } from "../_shared/adChannel.ts";

const FB_FIELDS = [
  "id", "ad_delivery_start_time", "ad_delivery_stop_time", "ad_creative_bodies", "ad_creative_link_titles",
  "ad_creative_link_captions", "page_id", "page_name", "publisher_platforms", "languages",
].join(",");

const MIN_DAYS_DEFAULT = 15; // igual que bulk-seed-ads (decisión de Jean, 05-oct-2026)
const MAX_PAGINAS_META = 3; // 3 × 100 anuncios por anunciante como máximo
const TIEMPO_MAX_MS = 110_000;
const LATAM = ["MX", "CO", "AR", "CL", "PE"]; // Cazador marca "LATAM" cuando no hay un solo país

interface Item { page_id: string; country?: string; whatsapp?: boolean; cazador_id?: string }

async function porCron(req: Request): Promise<boolean> {
  const secret = req.headers.get("x-cron-secret");
  if (!secret) return false;
  const { data } = await admin().rpc("verify_cron_secret", { p_secret: secret });
  return data === true;
}

function domainFromCaption(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const host = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[\/\s?#]/)[0];
  if (!host || host.length > 100 || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|messenger\.com|whatsapp\.com|wa\.me)$/.test(host)) return null;
  return host;
}

// deno-lint-ignore no-explicit-any
type Ad = Record<string, any>;

/** Anuncios activos de una página en un país. null = Meta falló (no se inventa nada). */
async function leerPagina(token: string, pageId: string, country: string): Promise<Ad[] | null> {
  const url = new URL("https://graph.facebook.com/v21.0/ads_archive");
  url.searchParams.set("access_token", token);
  url.searchParams.set("search_page_ids", JSON.stringify([pageId]));
  // Meta no acepta "todos los países" con search_page_ids (devuelve 0): se pide el país principal.
  url.searchParams.set("ad_reached_countries", JSON.stringify([country]));
  url.searchParams.set("ad_type", "ALL");
  url.searchParams.set("ad_active_status", "ACTIVE");
  url.searchParams.set("fields", FB_FIELDS);
  url.searchParams.set("limit", "100");
  let next: string | null = url.toString();
  const out: Ad[] = [];
  for (let p = 0; next && p < MAX_PAGINAS_META; p++) {
    try {
      const r: Response = await fetch(next, { signal: AbortSignal.timeout(20_000) });
      const d: { data?: Ad[]; paging?: { next?: unknown } } | null = await r.json().catch(() => null);
      if (!r.ok || !d) return null; // el error de Meta puede traer la URL con el token: no se registra
      if (Array.isArray(d.data)) out.push(...d.data);
      const nx = typeof d.paging?.next === "string" ? d.paging.next : null;
      next = nx && /^https:\/\/graph\.facebook\.com\//.test(nx) ? nx : null;
    } catch { return null; }
  }
  return out;
}

/** Contenido adulto: por nicho o por el texto de la oferta. Se salta siempre, con cualquier origen. */
const ADULTO = /adult|onlyfans|fansly|fanvue|privacy\.com\.br|\+18|sensual|t[aâá]ntric|er[oó]tic|sexo|\bsex\b|org[aá]sm/i;
export function esAdulto(x: Record<string, unknown>): boolean {
  return ["niche", "nicho", "category", "categoria", "name", "nombre", "title", "description", "descripcion", "tags"]
    .some(k => typeof x[k] === "string" ? ADULTO.test(x[k] as string) : Array.isArray(x[k]) && ADULTO.test((x[k] as unknown[]).join(" ")));
}

/** Modo diario: arma los items desde la base de Cazador (solo lectura). Llave en secretos de Jean. */
async function itemsDesdeCazador(): Promise<Item[] | null> {
  const base = Deno.env.get("CAZADOR_SUPABASE_URL");
  const key = Deno.env.get("CAZADOR_SUPABASE_KEY");
  if (!base || !key) return null;
  const out: Item[] = [];
  for (let o = 0; o < 5000; o += 1000) {
    const r = await fetch(`${base}/rest/v1/offers?select=*&order=active_ads.desc&offset=${o}&limit=1000`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return null;
    const rows = await r.json() as { id: string; meta_url: string | null; checkout: string | null; ad_type: string | null; country_code: string | null }[];
    for (const x of rows) {
      // Nicho adulto: nunca se importa (manual §2 y Jean, 29-oct-2026: «omitamos esto de inmediato»).
      if (esAdulto(x as unknown as Record<string, unknown>)) continue;
      const m = (x.meta_url ?? "").match(/view_all_page_id=(\d+)/);
      if (!m) continue; // las 101 que Cazador busca por palabra no tienen page_id
      out.push({
        page_id: m[1], country: x.country_code ?? undefined, cazador_id: x.id,
        whatsapp: x.checkout === "WhatsApp" || x.ad_type === "WhatsApp",
      });
    }
    if (rows.length < 1000) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await porCron(req)) && !(await owner(req))) return json({ error: "No autorizado." }, 401);

  const body = await req.json().catch(() => ({})) as {
    items?: Item[]; dry_run?: boolean; min_days?: number; max_ads_por_pagina?: number; limit?: number;
  };
  const dryRun = body.dry_run === true;
  const minDays = Math.max(1, Math.min(60, Math.round(Number(body.min_days) || MIN_DAYS_DEFAULT)));
  const maxAds = Math.max(3, Math.min(100, Math.round(Number(body.max_ads_por_pagina) || 20)));
  const limit = Math.max(1, Math.min(150, Math.round(Number(body.limit) || 40)));
  const db = admin();

  let items: Item[] | null = Array.isArray(body.items) ? body.items : await itemsDesdeCazador();
  if (!items) return json({ error: "Faltan items o los secretos CAZADOR_SUPABASE_URL / CAZADOR_SUPABASE_KEY." }, 400);

  // Limpieza: page_id solo dígitos, una vez por página (la marca WhatsApp se une si se repite).
  const porPagina = new Map<string, Item>();
  for (const it of items) {
    const pid = String(it?.page_id ?? "").trim();
    if (!/^\d{5,20}$/.test(pid)) continue;
    const prev = porPagina.get(pid);
    porPagina.set(pid, { ...(prev ?? it), page_id: pid, whatsapp: !!(prev?.whatsapp || it.whatsapp) });
  }

  // Las que ya son oferta nuestra se saltan (consulta por lotes, page_id tiene índice).
  const ids = [...porPagina.keys()];
  const yaEstan = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("offers").select("page_id").in("page_id", ids.slice(i, i + 200));
    for (const r of data ?? []) yaEstan.add((r as { page_id: string }).page_id);
  }
  // Primero las de WhatsApp, después el orden de entrada (Cazador las manda por anuncios, de más a menos).
  const pendientes = [...porPagina.values()].filter(x => !yaEstan.has(x.page_id))
    .sort((a, b) => Number(!!b.whatsapp) - Number(!!a.whatsapp));
  const lote = pendientes.slice(0, limit);

  const { data: tok } = await db.rpc("get_fb_token");
  const token = (typeof tok === "string" && tok.length > 20 ? tok : null) ?? Deno.env.get("FACEBOOK_ACCESS_TOKEN");
  if (!token) return json({ error: "Falta el token de Meta." }, 503);

  const t0 = Date.now();
  let leidas = 0, sinAnuncios = 0, guardados = 0, errores = 0, conflictos = 0, jovenes = 0;
  for (let i = 0; i < lote.length && Date.now() - t0 < TIEMPO_MAX_MS; i += 3) {
    const tanda = lote.slice(i, i + 3);
    const res = await Promise.all(tanda.map(async (it) => {
      const paises = !it.country || it.country === "LATAM" ? LATAM : [it.country.toUpperCase()];
      for (const c of paises) {
        const ads = await leerPagina(token, it.page_id, c);
        if (ads === null) return { it, market: c, ads: null };
        if (ads.length) return { it, market: c, ads };
      }
      return { it, market: paises[0], ads: [] as Ad[] };
    }));

    const rows: Record<string, unknown>[] = [];
    for (const r of res) {
      if (r.ads === null) { errores++; continue; }
      leidas++;
      if (!r.ads.length) { sinAnuncios++; continue; }
      const nuevos: Record<string, unknown>[] = [];
      for (const it of r.ads) {
        const start = it.ad_delivery_start_time ? new Date(it.ad_delivery_start_time) : null;
        const days = start ? Math.max(1, Math.floor((Date.now() - start.getTime()) / 86400000)) : 1;
        if (!start || days < minDays) { jovenes++; continue; }
        const caption = it.ad_creative_link_captions?.[0];
        const visible = channelFromCaption(caption);
        let canal = visible;
        if (r.it.whatsapp && (visible === null || visible === "whatsapp")) canal = "whatsapp";
        else if (r.it.whatsapp && visible !== "whatsapp") conflictos++;
        const body = (it.ad_creative_bodies?.[0] ?? "").toString().slice(0, 5000);
        const title = (it.ad_creative_link_titles?.[0] ?? it.page_name ?? "Anuncio").toString();
        const score = Math.min(100, 40 + Math.floor(days / 2));
        const langs = Array.isArray(it.languages)
          ? it.languages.filter((l: unknown) => typeof l === "string" && /^[a-z]{2,3}$/i.test(l)).slice(0, 5) : null;
        nuevos.push({
          keyword: `cazador:${r.it.page_id}`, // marca de origen; el upsert evita duplicar
          advertiser: it.page_name ?? "Desconocido", page_id: String(it.page_id ?? r.it.page_id), page_name: it.page_name ?? null,
          ad_title: title, ad_description: null, ad_body: body,
          ad_url: `https://www.facebook.com/ads/archive/render_ad/?id=${it.id}`, // nunca ad_snapshot_url (trae el token)
          platform: "Meta", publisher_platforms: it.publisher_platforms ?? ["facebook"],
          delivery_start_time: start.toISOString(), delivery_stop_time: it.ad_delivery_stop_time ?? null,
          market: r.market, link_domain: domainFromCaption(caption), dest_channel: canal,
          languages: langs?.length ? langs : null, days_active: days,
          tier: days >= 60 ? "mega" : days >= 14 ? "rising" : "solid", winner_score: score,
          scraped_at: new Date().toISOString(),
        });
      }
      // Los que más días llevan pagándose primero: son la prueba de que venden.
      nuevos.sort((a, b) => Number(b.days_active) - Number(a.days_active));
      rows.push(...nuevos.slice(0, maxAds));
    }
    if (rows.length && !dryRun) {
      for (let j = 0; j < rows.length; j += 200) {
        const { error } = await db.from("winning_ads").upsert(rows.slice(j, j + 200), { onConflict: "keyword,ad_url" });
        if (error) { errores++; console.error("cazador-import insert:", redact(error.message, 200)); } else guardados += Math.min(200, rows.length - j);
      }
    } else guardados += rows.length; // dry_run: cuántos se guardarían
  }

  const out = {
    paginas_en_cazador: porPagina.size, saltadas_ya_en_offers: yaEstan.size, pendientes_total: pendientes.length,
    paginas_leidas: leidas, paginas_sin_anuncios: sinAnuncios, anuncios_guardados: guardados,
    anuncios_descartados_por_pocos_dias: jovenes, conflictos_canal: conflictos, errores,
    pendientes_tras_esta_vuelta: Math.max(0, pendientes.length - lote.length), dry_run: dryRun,
  };
  console.log("cazador-import", JSON.stringify(out));
  return json(out);
});
