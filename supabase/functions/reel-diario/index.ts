// SUPERNOVA — Productor diario de reels (25-oct-2026, Reel Studio; pedido de Jean: "analiza este estilo de reel y
// produce dos videos diarios similares sobre mis temas").
//
// Cada día (pg_cron 11:00 UTC, con el secreto de cron de Vault) toma cada configuración activa de reel_diario, usa la
// PLANTILLA guardada (el análisis audiovisual ya hecho: no se vuelve a mirar el video) y escribe 1 o 2 reels nuevos
// sobre los temas de la persona, con el modo elegido (Espejo, Recrear, Reinventar, Vender). Cada reel queda en
// reel_borradores como BORRADOR para aprobar: guion + storyboard completos (planos, looks, clips de su biblioteca).
// Al abrirlo en Reel Studio, "Generar mi reel" produce voz, looks, imágenes, animaciones y tomas hablando, y el MP4 se
// arma en el navegador (Remotion en el navegador; el render en la nube espera AWS).
//
// Compuertas: el cron (x-cron-secret, comparado DENTRO de la base) o Jean con sesión ({ action: "run" } solo para él).
// Hoy la herramienta es solo de Jean: se ignoran configuraciones de otras cuentas. Costo: una llamada de texto a
// Gemini por borrador (~US$0,01), anotada en ai_usage. Sin configuración activa no gasta nada.
import { corsHeaders } from "npm:@supabase/supabase-js@2.117.1/cors";
import { admin, json } from "../_shared/media.ts";
import { OWNER_ID, owner } from "../_shared/genjutsu.ts";
import { geminiMedia, logMediaCost } from "../_shared/geminiMedia.ts";
import { descDeNombre, idsDeBiblioteca, parseReel, pedidoIA, SYSTEM, type Analisis, type ModoReel, type Oferta } from "../_shared/reelPlan.ts";

const FN = "reel-diario";
const MODOS = new Set<ModoReel>(["espejo", "recrear", "inspiracion", "adaptacion"]);

async function porCron(req: Request): Promise<boolean> {
  const secret = req.headers.get("x-cron-secret");
  if (!secret) return false;
  const { data } = await admin().rpc("verify_cron_secret", { p_secret: secret });
  return data === true;
}

type Config = { user_id: string; plantilla_id: string | null; plantilla_ids: string[] | null; temas: string[]; por_dia: number; modo: string; palabra: string };

/** Los borradores que le faltan hoy a una cuenta. Devuelve cuántos creó y los errores. */
async function producir(cfg: Config): Promise<{ creados: number; errores: string[] }> {
  const db = admin();
  const errores: string[] = [];
  const temas = (cfg.temas ?? []).map(t => t.trim()).filter(Boolean);
  // Varias plantillas (25-oct-2026, Jean: Márquez y Diego Vetencourt): se alternan entre los borradores.
  const idsPl = (cfg.plantilla_ids?.length ? cfg.plantilla_ids : cfg.plantilla_id ? [cfg.plantilla_id] : []).slice(0, 10);
  if (!idsPl.length || !temas.length) return { creados: 0, errores: ["Falta la plantilla o los temas."] };
  const hoy = new Date(); hoy.setUTCHours(0, 0, 0, 0);
  const { count: deHoy } = await db.from("reel_borradores").select("id", { count: "exact", head: true })
    .eq("user_id", cfg.user_id).eq("origen", "diario").gte("created_at", hoy.toISOString());
  const faltan = Math.max(0, Math.min(2, cfg.por_dia) - (deHoy ?? 0));
  if (!faltan) return { creados: 0, errores: [] };

  const { data: pls } = await db.from("reel_plantillas").select("id, analisis").in("id", idsPl).eq("user_id", cfg.user_id);
  const plantillas = idsPl.map(id => (pls ?? []).find(p => p.id === id)).filter((p): p is { id: string; analisis: Analisis } => !!p?.analisis);
  if (!plantillas.length) return { creados: 0, errores: ["La plantilla ya no existe."] };
  const { data: idn } = await db.from("reel_identidad").select("paleta, ropa, palabra, clips_desc").eq("user_id", cfg.user_id).maybeSingle();
  // Biblioteca de la persona (para que use sus clips donde corresponden).
  const { data: files } = await db.storage.from("biblioteca").list(`${cfg.user_id}/app`, { limit: 60, sortBy: { column: "created_at", order: "desc" } });
  const lista = (files ?? []).filter(f => f.name && !f.name.startsWith("."));
  const names = lista.map(f => f.name.replace(/^\d+-/, ""));
  const ids = idsDeBiblioteca(names);
  const descs = (idn?.clips_desc ?? {}) as Record<string, string>;
  const clips = lista.map((f, i) => ({ id: ids[i], desc: (descs[`${cfg.user_id}/app/${f.name}`] ?? "").trim() || descDeNombre(f.name) }));
  const modo = (MODOS.has(cfg.modo as ModoReel) ? cfg.modo : "inspiracion") as ModoReel;
  let oferta: Oferta | null = null;
  if (modo === "adaptacion") {
    const { data: p } = await db.from("products").select("name, product, who, promise, price_amount, price_currency, offer_status")
      .eq("user_id", cfg.user_id).eq("offer_status", "disponible").order("created_at").limit(1).maybeSingle();
    if (p) oferta = { nombre: p.name ?? "", que: p.product ?? "", para: p.who ?? "", promesa: p.promise ?? "", precio: p.price_amount ? `${p.price_amount} ${p.price_currency ?? ""}`.trim() : "", disponible: true };
  }
  const { count: total } = await db.from("reel_borradores").select("id", { count: "exact", head: true }).eq("user_id", cfg.user_id);

  // Los borradores del día se escriben a la vez (cada uno tarda ~50 s y la función tiene 150 s). 20.000 tokens: este
  // modelo cuenta su razonamiento dentro del tope y con 8.000 el JSON llegaba cortado (24-oct-2026).
  const uno = async (k: number): Promise<boolean> => {
    const tema = temas[((total ?? 0) + k) % temas.length];
    const pl = plantillas[((total ?? 0) + k) % plantillas.length];
    const analisis = pl.analisis;
    try {
      const { out, cost, usage } = await geminiMedia([{ text: `${SYSTEM}\n\n${pedidoIA({
        texto: tema, literal: false, palabra: cfg.palabra || idn?.palabra || "", paleta: idn?.paleta ?? "cian", ropa: idn?.ropa ?? "",
        clips, actual: null, plantilla: analisis, modo, oferta,
      })}` }], 20_000, 130_000, 0.7);
      await logMediaCost(cfg.user_id, FN, cost, usage);
      const reel = out ? parseReel(JSON.stringify(out), clips, undefined, analisis.planos.length) : null;
      if (!reel) { console.error(`${FN}: sin reel`, JSON.stringify(usage)); errores.push(`«${tema}»: la IA no devolvió un reel que sirva.`); return false; }
      const { error } = await db.from("reel_borradores").insert({ user_id: cfg.user_id, plantilla_id: pl.id, tema: tema.slice(0, 300), modo, reel, origen: "diario" });
      if (error) { errores.push(`«${tema}»: ${error.message}`); return false; }
      return true;
    } catch (e) {
      console.error(`${FN}:`, e);
      errores.push(`«${tema}»: la IA no respondió.`);
      return false;
    }
  };
  const creados = (await Promise.all(Array.from({ length: faltan }, (_, k) => uno(k)))).filter(Boolean).length;
  return { creados, errores };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const cron = await porCron(req);
    const uid = cron ? null : await owner(req);
    if (!cron && !uid) return json({ error: "No autorizado." }, 401);
    const db = admin();
    let q = db.from("reel_diario").select("user_id, plantilla_id, plantilla_ids, temas, por_dia, modo, palabra").eq("activo", true);
    // Hoy solo la cuenta de Jean (la herramienta todavía es solo suya).
    q = q.eq("user_id", uid ?? OWNER_ID);
    const { data: cfgs, error } = await q;
    if (error) return json({ error: "No se pudo leer la configuración." }, 500);
    if (!cfgs?.length) return json({ creados: 0, errores: uid ? ["Activa la producción diaria y guarda la plantilla y tus temas."] : [] });
    let creados = 0;
    const errores: string[] = [];
    for (const c of cfgs as Config[]) {
      const r = await producir(c);
      creados += r.creados; errores.push(...r.errores);
    }
    return json({ creados, errores });
  } catch (e) {
    console.error(`${FN}:`, e);
    return json({ error: "No se pudo completar." }, 500);
  }
});
