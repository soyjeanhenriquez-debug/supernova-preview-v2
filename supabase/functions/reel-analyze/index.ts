// SUPERNOVA — "Analiza un Reel" (13-oct-2026, Jean: 15 créditos, sección "Con tu cara").
//
// { url, brief?, handle? } → usuario real + cobro ANTES de gastar (reel_analyze en credit_prices) →
// Apify trae el Reel público de Instagram (video, texto, vistas) → Gemini MIRA y ESCUCHA el video y
// devuelve: transcripción, el gancho de los primeros 3 s, la estructura por segundos, por qué
// funciona (o qué le falló), y TU VERSIÓN modelada para grabarla con tu cara.
// Si algo falla después de cobrar, se devuelve el crédito.
//
// "Roba como un artista" (manual): se toma estructura, ritmo, gancho y mecanismo; nunca se copia y
// pega en el mismo idioma, ni su cara, su nombre, su marca o sus números. El video solo se usa para
// el análisis: no se guarda. La llave de Apify va en la cabecera (nunca en la URL).
//
// v2, bloque 1 (16-oct-2026): el Reel sale de la caché global (reel_extractions, 7 días) y solo se
// llama a Apify si no está; cada análisis queda en reel_analyses con su costo real y si fue caché.
import { corsHeaders } from "npm:@supabase/supabase-js@2.117.1/cors";
import { HONESTY_RULES } from "../_shared/honesty.ts";
import { admin, billingHeaders, caller, charge, json, refund } from "../_shared/media.ts";
import { b64, geminiMedia, logMediaCost } from "../_shared/geminiMedia.ts";
import { getReel, REEL_RE, reelUrl } from "../_shared/reelSource.ts";

const FN = "reel-analyze";
const MAX_VIDEO_BYTES = 18 * 1024 * 1024; // cabe en una sola solicitud a Gemini

const clean = (s: unknown, n: number) => (typeof s === "string" ? s : "").replace(/\s+/g, " ").trim().slice(0, n);

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

function prompt(o: { brief: Record<string, string>; handle: string; caption: string; owner: string; views: number | null; likes: number | null; comments: number | null; seconds: number | null }): string {
  return [
    `Te paso un Reel de Instagram${o.owner ? ` de @${o.owner}` : ""}${o.seconds ? ` (${Math.round(o.seconds)} s)` : ""}${o.views != null ? ` con ${o.views} reproducciones` : ""}${o.likes != null ? `, ${o.likes} me gusta y ${o.comments ?? 0} comentarios` : ""}. Míralo y escúchalo completo.`,
    o.caption ? `Texto de la publicación (solo para entender; no lo copies): """${o.caption}"""` : "",
    "",
    "Eres editor de contenido de marca personal en Latinoamérica. Analiza como si lo fueras a grabar mañana.",
    "1) TRANSCRIPCIÓN: lo que se dice, tal cual, en su idioma original, en bloques con su segundo de inicio.",
    "2) GANCHO (0–3 s): qué se ve, qué se dice y qué texto hay en pantalla; por qué detiene el dedo (o por qué no).",
    "3) ESTRUCTURA: el Reel en tramos por segundos (gancho, problema, giro, prueba, cierre…), qué pasa en cada uno y para qué sirve.",
    "4) POR QUÉ FUNCIONA: 3 razones concretas (ritmo, cortes, texto en pantalla, emoción, promesa, formato). Si las cifras son bajas, di con honestidad qué le falló.",
    "5) QUÉ MEJORAR: 3 cambios concretos que harían tu versión mejor.",
    "6) TU VERSIÓN (para grabar con tu cara): modela la MISMA estructura, el mismo ritmo y el mismo mecanismo, en español latino natural, de tú. Si el original está en otro idioma, transcréalo fiel (misma idea y mismo remate). Si ya está en español, NO copies sus frases: misma receta con palabras tuyas. 3 ganchos para elegir (máximo 12 palabras cada uno). Guion por tramos con segundos, lo que dices, lo que se ve (plano, gesto, lugar) y el texto en pantalla. Cierre con UNA sola llamada a la acción. Texto para la publicación (2–4 líneas, sin hashtags de relleno) y 5 hashtags del tema.",
    "Nunca uses su nombre, su cara, su marca ni sus números como si fueran tuyos. No inventes resultados ni testimonios.",
    o.brief.product ? `Si encaja de forma natural, el cierre puede llevar a este producto (si no encaja, deja el tema del original): ${clean(o.brief.product, 200)}${o.brief.who ? `, para ${clean(o.brief.who, 160)}` : ""}.` : "Sin producto: el cierre invita a seguir, guardar o comentar una palabra.",
    o.handle ? `Tu cuenta: @${o.handle}.` : "",
    "",
    "RESPONDE SOLO con JSON válido con esta forma:",
    `{"idioma":"es","duracion_s":0,"resumen":"","transcripcion":[{"s":0,"texto":""}],"gancho":{"se_ve":"","se_dice":"","texto_pantalla":"","por_que":""},"estructura":[{"desde":0,"hasta":3,"tramo":"gancho","que_pasa":"","para_que":""}],"por_que_funciona":["","",""],"mejorar":["","",""],"tu_version":{"ganchos":["","",""],"guion":[{"desde":0,"hasta":3,"dices":"","se_ve":"","texto_pantalla":""}],"cierre":"","pie":"","hashtags":["","","","",""]}}`,
  ].filter(Boolean).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let txId: string | null = null;
  try {
    const who = await caller(req);
    if (!who) return json({ error: "Inicia sesión para usar esta función." }, 401);
    const raw = await req.text();
    if (raw.length > 4000) return json({ error: "La solicitud es demasiado grande." }, 413);
    const body = raw ? JSON.parse(raw) : {};
    const m = REEL_RE.exec(String(body.url ?? "").trim());
    if (!m) return json({ error: "Pega el enlace de un Reel de Instagram (instagram.com/reel/…)." }, 400);
    const url = reelUrl(m[1]);
    const b = body.brief && typeof body.brief === "object" ? body.brief : {};
    const brief = { product: clean(b.product, 200), who: clean(b.who, 160) };
    const handle = clean(body.handle, 30).replace(/[^A-Za-z0-9._]/g, "");
    const apify = Deno.env.get("APIFY_TOKEN");
    if (!apify || !Deno.env.get("GEMINI_API_KEY")) return json({ error: "Esta función llega pronto.", pronto: true }, 503);

    const g = await charge(FN, who.id, "reel_analyze", `Analizar Reel · ${m[1]}`, 10, 40);
    if (g instanceof Response) return g;
    txId = g.txId;

    // 1) Traer el Reel: de la caché global o, si no está, de Apify.
    let got = await getReel(FN, m[1], apify);
    if (!got.ok && got.reason === "budget") {
      await refund(txId, "tope de apify del mes");
      return json({ error: "El lector de Instagram llegó a su límite de este mes. Los Reels que ya se analizaron siguen disponibles. No se te cobró." }, 503);
    }
    if (!got.ok && got.reason === "down") {
      await refund(txId, "apify no disponible");
      return json({ error: "El lector de Instagram no está disponible en este momento. No es tu Reel: inténtalo más tarde. No se te cobró." }, 503);
    }
    if (!got.ok) {
      await refund(txId, "apify sin resultado");
      return json({ error: "No pudimos abrir ese Reel. Revisa que la cuenta sea pública. No se te cobró." }, 502);
    }
    if (!got.row.is_video || !got.row.video_url) {
      await refund(txId, "no es video");
      return json({ error: "Esa publicación no es un video. Para carruseles usa \"Modelar uno que ya funciona\" en Carrusel. No se te cobró." }, 422);
    }

    // 2) Bajar el video. Si venía de la caché y el enlace de Instagram ya venció, se lee de nuevo una vez.
    let bytes = await download(got.row.video_url);
    if (!bytes && got.cacheHit) {
      const again = await getReel(FN, m[1], apify, true);
      if (again.ok && again.row.video_url) { got = again; bytes = await download(again.row.video_url); }
    }
    if (!bytes) {
      await refund(txId, "video no bajó o es muy largo");
      return json({ error: "No pudimos leer ese video (puede ser muy largo). Prueba con un Reel de menos de 90 segundos. No se te cobró." }, 502);
    }
    const reel = got.row;

    // 3) Mirar y escuchar el video.
    const { out, cost, usage } = await geminiMedia([
      { inline_data: { mime_type: "video/mp4", data: b64(bytes) } },
      { text: prompt({ brief, handle, caption: reel.caption ?? "", owner: reel.owner ?? "", views: reel.views, likes: reel.likes, comments: reel.comments, seconds: reel.duration_s }) + "\n\n" + HONESTY_RULES },
    ], 12_000);
    await logMediaCost(who.id, FN, cost, usage, got.apifyUsd); // + lector de Instagram (Apify), 0 si fue caché
    if (!out || typeof out.tu_version !== "object") {
      await refund(txId, "json inválido");
      return json({ error: "La IA no pudo leer bien ese Reel. No se te cobró: inténtalo de nuevo." }, 502);
    }

    // 4) Anotar el análisis con su costo real (panel de costos). Si falla, el usuario igual recibe lo suyo.
    const { error: saveErr } = await admin().from("reel_analyses").insert({
      user_id: who.id, shortcode: reel.shortcode, nivel: "adaptacion", source: "app", result: out,
      cache_hit: got.cacheHit, apify_usd: got.apifyUsd, llm_a_usd: cost, llm_b_usd: 0, credits: g.charged,
    });
    if (saveErr) console.error(`${FN}: reel_analyses`, saveErr.message);

    return json({
      ...out,
      source: { url, owner: reel.owner ?? "", views: reel.views, likes: reel.likes, comments: reel.comments, cover: reel.cover_url },
      billing: { charged: g.charged, balance: g.balance },
    }, 200, billingHeaders(g));
  } catch (e) {
    await refund(txId, "excepción");
    console.error(`${FN}:`, e instanceof Error ? e.message : e);
    return json({ error: "No se pudo analizar el Reel. No se te cobró." }, 500);
  }
});
