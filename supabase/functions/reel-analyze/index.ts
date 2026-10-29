// SUPERNOVA — "Analiza un Reel" v2 (16-oct-2026, Fase 1 de la organización; decisiones de Jean).
//
// Dos pasos, para que cada llamada quepa en el tiempo de una función (150 s) y para pagar el video una
// sola vez:
//  1) { step: "base", url } → usuario real + cobro ANTES de gastar (reel_analyze = 25 créditos) →
//     si el Reel ya tiene análisis base (lo hizo cualquier cuenta), se reusa sin Apify ni IA; si no,
//     se lee (caché global o Apify), Gemini MIRA y ESCUCHA el video y se guarda el análisis base (capa A).
//     Devuelve "Por qué funciona" y deja una fila en reel_analyses con stage = 'base'.
//  2) { step: "version", analysis_id, nivel, objetivo?, offer_id?, waitlist_ok?, conceptos?, toque?,
//     intensidad?, palabra_clave? } → escribe tu versión sin video (capa B) según el modo: Espejo / Recrear /
//     Reinventar (inspiracion) / Vender (adaptacion). El ADN, las preferencias y la oferta se leen de la
//     base con el usuario real (nunca del navegador) y solo entra lo que el modo necesita (brandDna.ts).
//     La versión pasa por la revisión de calidad (contentQa.ts) antes de entregarse. La primera versión
//     de cada análisis va incluida (se reclama con un UPDATE atómico); cada versión siguiente cobra
//     reel_level = 5 créditos y queda en su propia fila (historial).
//  3) { step: "carrusel", analysis_id | url, mode, goal?, brief?, handle?, world?, line? } (Reel → Carrusel,
//     17-oct-2026): convierte el análisis base en un carrusel con la forma de carousel-clone, sin volver
//     a mirar el video. Si el análisis todavía no usó su versión incluida, el carrusel va incluido (mismo
//     UPDATE atómico); si no, cobra reel_carousel = 10 créditos. Con url y sin análisis propio de ese
//     Reel responde { need_base: true } sin cobrar: la app primero paga el análisis (25) y el carrusel
//     va incluido.
// Si algo falla después de cobrar, se devuelve el crédito. El video solo se usa para el análisis: no
// se guarda. "Roba como un artista": se modela estructura, ritmo, gancho y mecanismo; nunca su cara,
// su nombre, su marca ni sus números.
import { corsHeaders } from "npm:@supabase/supabase-js@2.117.1/cors";
import { HONESTY_RULES } from "../_shared/honesty.ts";
import { conMision } from "../_shared/misionAgente.ts";
import { admin, billingHeaders, caller, charge, type Caller, type Gate, json, refund } from "../_shared/media.ts";
import { b64, geminiMedia, logMediaCost, MEDIA_MODEL } from "../_shared/geminiMedia.ts";
import { getReel, REEL_RE, type ReelExtraction } from "../_shared/reelSource.ts";
import { asNivel, cleanBase, cleanTipo, needsExtra, palabraClave, porQue, promptA, promptTipo } from "../_shared/reelLayers.ts";
import { writeReelVersion } from "../_shared/reelVersion.ts";
import { loadCreator } from "../_shared/creatorContext.ts";
import { carouselPieza, cleanReelCarousel, nivelFromBody, promptC, storedMode } from "../_shared/reelCarousel.ts";
import { reviewPieza } from "../_shared/reelVersion.ts";
import { correctionNote, criticas, failMessage, revision } from "../_shared/contentQa.ts";

const FN = "reel-analyze";
const MAX_VIDEO_BYTES = 18 * 1024 * 1024; // cabe en una sola solicitud a Gemini
const WALL_MS = 140_000; // la función tiene 150 s: margen para responder y devolver el crédito
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const clean = (s: unknown, n: number) => (typeof s === "string" ? s : "").replace(/\s+/g, " ").trim().slice(0, n);
const isTimeout = (e: unknown) => e instanceof Error && e.name === "TimeoutError";
const left = (t0: number) => Math.max(30_000, WALL_MS - (Date.now() - t0));
const SLOW_AI = "La IA tardó demasiado con ese video. Inténtalo de nuevo; si vuelve a pasar, prueba con un Reel más corto. No se te cobró.";

/** Baja el video (solo para el análisis; no se guarda). null si no bajó o es muy largo. */
async function download(videoUrl: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(videoUrl, { signal: AbortSignal.timeout(30_000) });
    const len = Number(r.headers.get("content-length") ?? 0);
    if (!r.ok || (len && len > MAX_VIDEO_BYTES)) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    return buf.byteLength <= MAX_VIDEO_BYTES ? buf : null;
  } catch { return null; }
}

const sourceOf = (r: ReelExtraction) => ({
  url: r.url, shortcode: r.shortcode, owner: r.owner ?? "", views: r.views, likes: r.likes,
  comments: r.comments, cover: r.cover_url, duracion_s: r.duration_s,
});

// ---------------- Paso 1: análisis base ----------------
async function stepBase(who: Caller, body: Record<string, unknown>, apify: string, t0: number): Promise<Response> {
  const m = REEL_RE.exec(String(body.url ?? "").trim());
  if (!m) return json({ error: "Pega el enlace de un Reel de Instagram (instagram.com/reel/…)." }, 400);
  const shortcode = m[1];
  const db = admin();

  const g = await charge(FN, who.id, "reel_analyze", `Analizar Reel · ${shortcode}`, 20, 80);
  if (g instanceof Response) return g;
  try {
    // ¿Ya hay análisis base de este Reel? Lo hizo cualquier cuenta: no se vuelve a leer ni a mirar.
    const { data: cached } = await db.from("reel_extractions").select("*").eq("shortcode", shortcode).maybeSingle();
    let row = cached as ReelExtraction | null;
    let base = row?.base ? cleanBase(row.base) : null;
    let apifyUsd = 0, llmA = 0, cacheHit = !!base;

    if (!base) {
      let got = await getReel(FN, shortcode, apify);
      if (!got.ok) {
        const r = got.reason;
        await refund(g.txId, r === "budget" ? "tope de apify del mes" : r === "slow" ? "apify tardó demasiado" : r === "down" ? "apify no disponible" : "apify sin resultado");
        return r === "budget" ? json({ error: "El lector de Instagram llegó a su límite de este mes. Los Reels que ya se analizaron siguen disponibles. No se te cobró." }, 503)
          : r === "slow" ? json({ error: "Instagram tardó demasiado en entregarnos ese Reel. Vuelve a intentarlo en unos minutos o prueba con otro. No se te cobró." }, 504)
          : r === "down" ? json({ error: "El lector de Instagram no está disponible en este momento. No es tu Reel: inténtalo más tarde. No se te cobró." }, 503)
          : json({ error: "No pudimos abrir ese Reel. Revisa que la cuenta sea pública. No se te cobró." }, 502);
      }
      if (!got.row.is_video || !got.row.video_url) {
        await refund(g.txId, "no es video");
        return json({ error: "Esa publicación no es un video. Para carruseles usa \"Modelar uno que ya funciona\" en Carrusel. No se te cobró." }, 422);
      }
      // Si venía de la caché y el enlace de Instagram ya venció, se lee de nuevo una vez.
      let bytes = await download(got.row.video_url);
      if (!bytes && got.cacheHit) {
        const again = await getReel(FN, shortcode, apify, true);
        if (again.ok && again.row.video_url) { got = again; bytes = await download(again.row.video_url); }
      }
      if (!bytes) {
        await refund(g.txId, "video no bajó o es muy largo");
        return json({ error: "No pudimos leer ese video (puede ser muy largo). Prueba con un Reel de menos de 90 segundos. No se te cobró." }, 502);
      }
      row = got.row;
      apifyUsd = got.apifyUsd;
      cacheHit = got.cacheHit;

      // Capa A: la IA mira y escucha el video. Sin datos del usuario: sirve para todas las cuentas.
      const { out, cost, usage } = await geminiMedia([
        { inline_data: { mime_type: "video/mp4", data: b64(bytes) } },
        { text: promptA({ caption: row.caption ?? "", owner: row.owner ?? "", views: row.views, likes: row.likes, comments: row.comments, seconds: row.duration_s }) },
      ], 12_000, left(t0));
      await logMediaCost(who.id, FN, cost, usage, apifyUsd); // + lector de Instagram (Apify), 0 si fue caché
      llmA = cost;
      base = cleanBase(out);
      if (!base) {
        await refund(g.txId, "json inválido");
        return json({ error: "La IA no pudo leer bien ese Reel. No se te cobró: inténtalo de nuevo." }, 502);
      }
      const { error: baseErr } = await db.from("reel_extractions").update({
        base, base_model: MEDIA_MODEL, llm_a_usd: cost, analyzed_at: new Date().toISOString(),
      }).eq("shortcode", shortcode);
      if (baseErr) console.error(`${FN}: guardar base`, baseErr.message);
    }

    // Análisis viejo de la caché sin "Descubrimiento o Nicho" (17-oct-2026) o sin el análisis de la
    // referencia (19-oct-2026): se completa solo con el texto, una vez, y queda guardado para todas las
    // cuentas. Si falla, se sigue con lo que hay.
    if (needsExtra(base)) {
      try {
        const { out, cost, usage } = await geminiMedia([{ text: promptTipo(base) }], 4_000, Math.min(25_000, left(t0)), 0.2);
        await logMediaCost(who.id, FN, cost, usage);
        const extra = cleanTipo(out);
        if (extra.tipo || extra.referencia.tema) {
          base = { ...base, ...extra, tipo: extra.tipo || base.tipo, tipo_por_que: extra.tipo_por_que || base.tipo_por_que };
          const { error: tipoErr } = await db.from("reel_extractions").update({ base }).eq("shortcode", shortcode);
          if (tipoErr) console.error(`${FN}: guardar tipo`, tipoErr.message);
        }
      } catch (e) { console.error(`${FN}: tipo`, e instanceof Error ? e.message : e); }
    }

    const view = { source: sourceOf(row!), por_que_funciona: porQue(base) };
    const { data: ins, error } = await db.from("reel_analyses").insert({
      user_id: who.id, shortcode, nivel: asNivel(body.nivel), source: "app", result: view, stage: "base",
      cache_hit: cacheHit, apify_usd: apifyUsd, llm_a_usd: llmA, llm_b_usd: 0, credits: g.charged,
    }).select("id").single();
    if (error || !ins) {
      console.error(`${FN}: reel_analyses`, error?.message);
      await refund(g.txId, "no se pudo guardar");
      return json({ error: "No se pudo guardar el análisis. No se te cobró: inténtalo de nuevo." }, 500);
    }
    return json({ analysis_id: ins.id, ...view, billing: { charged: g.charged, balance: g.balance } }, 200, billingHeaders(g));
  } catch (e) {
    await refund(g.txId, isTimeout(e) ? "la ia tardó demasiado" : "excepción");
    console.error(`${FN}: base`, e instanceof Error ? e.message : e);
    return isTimeout(e) ? json({ error: SLOW_AI }, 504) : json({ error: "No se pudo analizar el Reel. No se te cobró." }, 500);
  }
}

// ---------------- Paso 2: tu versión ----------------
async function stepVersion(who: Caller, body: Record<string, unknown>, t0: number): Promise<Response> {
  const id = String(body.analysis_id ?? "");
  if (!UUID.test(id)) return json({ error: "Falta el análisis del Reel." }, 400);
  const nivel = asNivel(body.nivel);
  const db = admin();

  const { data: a } = await db.from("reel_analyses").select("id, shortcode, result").eq("id", id).eq("user_id", who.id).maybeSingle();
  if (!a) return json({ error: "No encontramos ese análisis. Vuelve a analizar el Reel." }, 404);
  const { data: ex } = await db.from("reel_extractions").select("base").eq("shortcode", a.shortcode).maybeSingle();
  let base = cleanBase(ex?.base);
  if (!base) return json({ error: "Ese Reel hay que analizarlo de nuevo. No se te cobró." }, 409);
  // Análisis viejo sin el análisis estructurado de la referencia (A6): se completa una vez, solo con el
  // texto, y queda en la caché para todas las cuentas. Si falla, se sigue con lo que hay.
  if (needsExtra(base)) {
    try {
      const { out, cost, usage } = await geminiMedia([{ text: promptTipo(base) }], 4_000, 25_000, 0.2);
      await logMediaCost(who.id, FN, cost, usage);
      const extra = cleanTipo(out);
      if (extra.referencia.tema) {
        base = { ...base, ...extra, tipo: extra.tipo || base.tipo, tipo_por_que: extra.tipo_por_que || base.tipo_por_que };
        const { error } = await db.from("reel_extractions").update({ base }).eq("shortcode", a.shortcode);
        if (error) console.error(`${FN}: completar referencia`, error.message);
      }
    } catch (e) { console.error(`${FN}: completar referencia`, e instanceof Error ? e.message : e); }
  }
  if (!base.transcripcion.length && !base.estructura.length) {
    // Sin texto ni tramos no hay de dónde modelar: se pide el material, nunca se inventa (A6).
    return json({ error: "No tenemos suficiente del original para modelarlo. Pega otro Reel o vuelve a analizarlo. No se cobró esta versión." }, 422);
  }
  // ADN, preferencias y oferta: de la base, con el usuario real. Lo que mande el navegador no se confía.
  const creator = await loadCreator(db, who.id, nivel, body);
  if (creator instanceof Response) return creator;
  const opciones = { ...creator.opciones, palabra_clave: palabraClave(body.palabra_clave) };
  const handle = clean(body.handle, 30).replace(/[^A-Za-z0-9._]/g, "");

  // La primera versión de un análisis va incluida. Se reclama con un solo UPDATE (atómico): si dos
  // pedidos llegan juntos, solo uno la gana. Si quedó a medias hace más de 3 min, se puede volver a reclamar.
  const now = new Date().toISOString();
  const stale = new Date(Date.now() - 3 * 60_000).toISOString();
  const since = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const { data: claimed } = await db.from("reel_analyses").update({ stage: "escribiendo", updated_at: now })
    .eq("id", id).eq("user_id", who.id).gte("created_at", since)
    .or(`stage.eq.base,and(stage.eq.escribiendo,updated_at.lt.${stale})`).select("id");
  const free = !!claimed?.length;
  let g: Gate | null = null;
  if (!free) {
    const c = await charge(FN, who.id, "reel_level", `Otra versión del Reel · ${a.shortcode}`, 20, 80);
    if (c instanceof Response) return c;
    g = c;
  }
  const undo = async (reason: string) => {
    if (free) await db.from("reel_analyses").update({ stage: "base", updated_at: new Date().toISOString() }).eq("id", id);
    else await refund(g!.txId, reason);
  };

  try {
    const brief = { palabra: opciones.palabra_clave, handle };
    let cost = 0;
    // Reserva 8 s para guardar o devolver el cobro. Nunca repetir el video ni Apify para corregir.
    const remainingMs = () => WALL_MS - (Date.now() - t0) - 8_000;
    const generate = async (prompt: string, temperature: number) => {
      const ms = remainingMs();
      if (ms <= 0) throw new DOMException("Tiempo agotado", "TimeoutError");
      // La revisión (temperatura 0,1) es corta: 30 s como máximo para no comerse el tiempo de la versión.
      // Misión de Sherlock Holmes (29-oct-2026) solo en lo que se escribe para la persona; la revisión (0,1) es un juez.
      const text = temperature <= 0.1 ? prompt : conMision(prompt, "json");
      const result = await geminiMedia([{ text }], 8_000, Math.min(temperature <= 0.1 ? 30_000 : 60_000, ms), temperature);
      cost += result.cost;
      await logMediaCost(who.id, FN, result.cost, result.usage);
      return result.out;
    };
    const { version, reason } = await writeReelVersion(base, nivel, brief, creator.ctx, creator.qa, { generate, remainingMs });
    if (!version) {
      await undo("no pasó la revisión de calidad");
      return json({ error: reason }, 422);
    }
    const prev = (a.result && typeof a.result === "object" ? a.result : {}) as Record<string, unknown>;
    const view = { source: prev.source, por_que_funciona: porQue(base), version, opciones };
    let outId = id;
    if (free) {
      const { error } = await db.from("reel_analyses").update({
        stage: "listo", nivel, palabra_clave: version.publicar.palabra_clave, result: view, llm_b_usd: cost, updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) console.error(`${FN}: guardar versión`, error.message);
    } else {
      const { data: ins, error } = await db.from("reel_analyses").insert({
        user_id: who.id, shortcode: a.shortcode, nivel, palabra_clave: version.publicar.palabra_clave, source: "app",
        result: view, stage: "listo", cache_hit: true, apify_usd: 0, llm_a_usd: 0, llm_b_usd: cost, credits: g!.charged,
      }).select("id").single();
      if (error || !ins) console.error(`${FN}: guardar versión`, error?.message);
      else outId = ins.id;
    }
    const billing = { charged: g?.charged ?? 0, balance: g?.balance ?? null };
    return json({ analysis_id: outId, ...view, billing }, 200, g ? billingHeaders(g) : {});
  } catch (e) {
    await undo(isTimeout(e) ? "la ia tardó demasiado" : "excepción");
    console.error(`${FN}: version`, e instanceof Error ? e.message : e);
    return isTimeout(e)
      ? json({ error: "La IA tardó demasiado en escribir tu versión. Inténtalo de nuevo. No se te cobró." }, 504)
      : json({ error: "No se pudo escribir tu versión. No se te cobró." }, 500);
  }
}

// ---------------- Paso 3: Reel → Carrusel ----------------
async function stepCarrusel(who: Caller, body: Record<string, unknown>, t0: number): Promise<Response> {
  const db = admin();
  const id = String(body.analysis_id ?? "");
  let a: { id: string; shortcode: string; result: unknown } | null = null;
  if (UUID.test(id)) {
    const { data } = await db.from("reel_analyses").select("id, shortcode, result").eq("id", id).eq("user_id", who.id).maybeSingle();
    a = data;
  } else {
    const m = REEL_RE.exec(String(body.url ?? "").trim());
    if (!m) return json({ error: "Pega el enlace de un Reel de Instagram (instagram.com/reel/…)." }, 400);
    // El análisis más reciente de este Reel hecho por esta cuenta (si ya lo pagó, no paga 25 otra vez).
    const { data } = await db.from("reel_analyses").select("id, shortcode, result").eq("user_id", who.id).eq("shortcode", m[1])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    a = data;
    if (!a) return json({ need_base: true }, 200); // sin cobro: la app primero pide el análisis
  }
  if (!a) return json({ error: "No encontramos ese análisis. Vuelve a analizar el Reel." }, 404);
  const { data: ex } = await db.from("reel_extractions").select("base, url, owner, likes, comments").eq("shortcode", a.shortcode).maybeSingle();
  const base = cleanBase(ex?.base);
  if (!base) return json({ need_base: true }, 200);

  const nivel = nivelFromBody(body);
  const mode = storedMode(nivel);
  const creator = await loadCreator(db, who.id, nivel, body);
  if (creator instanceof Response) return creator;
  const brief = {
    handle: clean(body.handle, 30).replace(/[^A-Za-z0-9._]/g, ""), world: clean(body.world, 160), line: clean(body.line, 80),
  };

  // Va incluido si el análisis todavía no usó su versión (mismo UPDATE atómico que el paso 2).
  const now = new Date().toISOString();
  const stale = new Date(Date.now() - 3 * 60_000).toISOString();
  const since = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const { data: claimed } = await db.from("reel_analyses").update({ stage: "escribiendo", updated_at: now })
    .eq("id", a.id).eq("user_id", who.id).gte("created_at", since)
    .or(`stage.eq.base,and(stage.eq.escribiendo,updated_at.lt.${stale})`).select("id");
  const free = !!claimed?.length;
  let g: Gate | null = null;
  if (!free) {
    const c = await charge(FN, who.id, "reel_carousel", `Reel → Carrusel · ${a.shortcode}`, 20, 80);
    if (c instanceof Response) return c;
    g = c;
  }
  const undo = async (reason: string) => {
    if (free) await db.from("reel_analyses").update({ stage: "base", updated_at: new Date().toISOString() }).eq("id", a!.id);
    else await refund(g!.txId, reason);
  };

  try {
    let cost = 0;
    const remainingMs = () => WALL_MS - (Date.now() - t0) - 8_000;
    const generate = async (prompt: string, temperature: number, maxTokens = 10_000) => {
      const ms = remainingMs();
      if (ms <= 0) throw new DOMException("Tiempo agotado", "TimeoutError");
      const r = await geminiMedia([{ text: prompt }], maxTokens, Math.min(90_000, ms), temperature);
      cost += r.cost;
      await logMediaCost(who.id, FN, r.cost, r.usage);
      return r.out;
    };
    // Misión de Merlín (29-oct-2026): la respuesta es JSON, la pregunta de avance la pone la app.
    const prompt = conMision(promptC(base, nivel, brief, creator.ctx) + "\n\n" + HONESTY_RULES, "json");
    const temp = nivel === "espejo" ? 0.4 : nivel === "inspiracion" ? 0.8 : 0.6;
    let car = cleanReelCarousel(await generate(prompt, temp), base);
    if (!car) {
      await undo("json inválido");
      return json({ error: "La IA no pudo armar el carrusel. No se te cobró: inténtalo de nuevo." }, 502);
    }
    // Revisión de calidad (la misma del Reel) y, si falla en lo crítico, UNA corrección.
    const judge = (p: string, t: number) => generate(p, t, 2_000);
    let rev = await reviewPieza(base, nivel, carouselPieza(car), creator.qa, judge, remainingMs);
    let corregida = false;
    if (criticas(rev.checks).length) {
      const fixed = remainingMs() > 50_000
        ? cleanReelCarousel(await generate([prompt, correctionNote(rev.checks), `Intento anterior: ${JSON.stringify(car.carrusel)}`].join("\n\n"), Math.min(temp, 0.4)), base)
        : null;
      const rev2 = fixed ? await reviewPieza(base, nivel, carouselPieza(fixed), creator.qa, judge, remainingMs) : null;
      if (!fixed || !rev2 || criticas(rev2.checks).length) {
        await undo("no pasó la revisión de calidad");
        return json({ error: failMessage((rev2 ?? rev).checks).replace("versión", "versión del carrusel") }, 422);
      }
      car = fixed; rev = rev2; corregida = true;
    }
    const prev = (a.result && typeof a.result === "object" ? a.result : {}) as Record<string, unknown>;
    const src = (prev.source && typeof prev.source === "object" ? prev.source : {}) as Record<string, unknown>;
    const source = {
      url: String(src.url ?? ex?.url ?? `https://www.instagram.com/reel/${a.shortcode}/`), images: [] as string[],
      owner: clean(src.owner ?? ex?.owner, 40),
      likes: typeof src.likes === "number" ? src.likes : null, comments: typeof src.comments === "number" ? src.comments : null,
    };
    const view = { source: prev.source ?? null, por_que_funciona: porQue(base), carrusel: car, mode, opciones: creator.opciones, revision: revision(rev.checks, corregida, rev.semantica) };
    let outId = a.id;
    if (free) {
      const { error } = await db.from("reel_analyses").update({ stage: "listo", kind: "carrusel", nivel, result: view, llm_b_usd: cost, updated_at: new Date().toISOString() }).eq("id", a.id);
      if (error) console.error(`${FN}: guardar carrusel`, error.message);
    } else {
      const { data: ins, error } = await db.from("reel_analyses").insert({
        user_id: who.id, shortcode: a.shortcode, nivel, kind: "carrusel", source: "app", result: view, stage: "listo",
        cache_hit: true, apify_usd: 0, llm_a_usd: 0, llm_b_usd: cost, credits: g!.charged,
      }).select("id").single();
      if (error || !ins) console.error(`${FN}: guardar carrusel`, error?.message);
      else outId = ins.id;
    }
    // Para aprender (Admin → Aprendizaje y "¿Te sirvió?"): solo texto, nunca el video.
    let cloneId: string | null = null;
    try {
      const { data: row } = await db.from("carousel_clones").insert({
        user_id: who.id, url: `https://www.instagram.com/reel/${a.shortcode}/`, mode, owner: source.owner || null, likes: source.likes, comments: source.comments,
        hook: clean(car.analisis.gancho_original, 200) || null, summary: clean(car.analisis.resumen, 300) || null, why: clean(car.analisis.por_que_funciona, 600) || null,
        analysis: { laminas: car.analisis.laminas, adn: car.adn, mantener: car.mantener, necesitas: car.necesitas, reel: true, convertible: car.convertible, nivel, objetivo: creator.opciones.objetivo },
        result: {
          portadas: (car.carrusel.portadas as Record<string, unknown>[]).map(c => clean(c.titulo, 120)),
          tipos: car.carrusel.laminas.map(l => clean(l.tipo, 20)), originales: car.carrusel.laminas.map(l => Number(l.original) || 0),
          palabra: clean(car.carrusel.laminas.at(-1)?.palabra, 20),
        },
      }).select("id").single();
      cloneId = row?.id ?? null;
    } catch (e) { console.error(`${FN}: guardar clon`, e); }

    const billing = { charged: g?.charged ?? 0, balance: g?.balance ?? null };
    return json({ ...car, analysis_id: outId, clone_id: cloneId, source, reel: { shortcode: a.shortcode, convertible: car.convertible }, nivel, opciones: creator.opciones, revision: view.revision, billing }, 200, g ? billingHeaders(g) : {});
  } catch (e) {
    await undo(isTimeout(e) ? "la ia tardó demasiado" : "excepción");
    console.error(`${FN}: carrusel`, e instanceof Error ? e.message : e);
    return isTimeout(e)
      ? json({ error: "La IA tardó demasiado en armar el carrusel. Inténtalo de nuevo. No se te cobró." }, 504)
      : json({ error: "No se pudo armar el carrusel. No se te cobró." }, 500);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const who = await caller(req);
    if (!who) return json({ error: "Inicia sesión para usar esta función." }, 401);
    const raw = await req.text();
    if (raw.length > 6000) return json({ error: "La solicitud es demasiado grande." }, 413);
    const body = raw ? JSON.parse(raw) : {};
    const apify = Deno.env.get("APIFY_TOKEN");
    if (!Deno.env.get("GEMINI_API_KEY") || (body.step === "base" && !apify)) return json({ error: "Esta función llega pronto.", pronto: true }, 503);
    if (body.step === "base") return await stepBase(who, body, apify!, t0);
    if (body.step === "version") return await stepVersion(who, body, t0);
    if (body.step === "carrusel") return await stepCarrusel(who, body, t0);
    // Una pestaña abierta con la versión anterior de la app: se avisa antes de cobrar nada.
    return json({ error: "Recarga la página para usar el nuevo Analiza un Reel. No se te cobró." }, 400);
  } catch (e) {
    console.error(`${FN}:`, e instanceof Error ? e.message : e);
    return json({ error: "No se pudo analizar el Reel. No se te cobró." }, 500);
  }
});
