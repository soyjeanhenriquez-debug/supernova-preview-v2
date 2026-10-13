// SUPERNOVA — "Sube tu video" (13-oct-2026, Jean: 20 créditos, sección "Con tu cara").
//
// { audio (WAV 16 kHz mono en base64, lo saca el navegador de tu video), seconds, brief? } →
// usuario real + cobro ANTES de gastar (video_subtitles en credit_prices) → Gemini ESCUCHA el audio y
// devuelve: subtítulos cortos con sus tiempos (para quemarlos en el video en el navegador y para el
// .srt), 3 ganchos más fuertes para los primeros 3 segundos y el texto de la publicación.
// Si algo falla después de cobrar, se devuelve el crédito. El audio no se guarda.
//
// El video nunca sube al servidor: pesa mucho para el celular. El navegador separa el audio (≈3 MB
// para 90 s) y después quema los subtítulos sobre el video con canvas, como "Armar video final".
import { corsHeaders } from "npm:@supabase/supabase-js@2.117.1/cors";
import { HONESTY_RULES } from "../_shared/honesty.ts";
import { billingHeaders, caller, charge, json, refund } from "../_shared/media.ts";
import { geminiMedia, logMediaCost } from "../_shared/geminiMedia.ts";

const FN = "video-subtitles";
const MAX_SECONDS = 90;
const MAX_B64 = 4_200_000; // ≈ 90 s de WAV 16 kHz mono en base64

const clean = (s: unknown, n: number) => (typeof s === "string" ? s : "").replace(/\s+/g, " ").trim().slice(0, n);

function prompt(o: { seconds: number; product: string; who: string }): string {
  return [
    `Te paso el audio de un video vertical de ${Math.round(o.seconds)} segundos que una persona grabó con su celular para Reels o TikTok. Escúchalo completo.`,
    "",
    "1) SUBTÍTULOS: transcribe EXACTAMENTE lo que dice, en su idioma, con buena ortografía y puntuación (en español: tildes, ¿ y ¡). Divide en bloques cortos para leer en el celular: de 2 a 6 palabras cada uno, sin cortar una idea a la mitad. Cada bloque con su segundo de inicio y de fin (con un decimal), en orden y sin solaparse. En cada bloque marca 'clave' con UNA palabra importante para resaltarla (o vacío).",
    "2) GANCHO: di si los primeros 3 segundos detienen el dedo y por qué. Propón 3 ganchos más fuertes (máximo 12 palabras cada uno) que la persona pueda decir al inicio o poner como texto en pantalla, fieles a lo que dice en el video. Sin promesas de resultados ni plazos.",
    "3) PUBLICACIÓN: un texto de 2–4 líneas, de tú, en español latino, con UNA sola llamada a la acción, y 5 hashtags del tema.",
    o.product ? `Si encaja de forma natural, la llamada a la acción puede llevar a: ${o.product}${o.who ? `, para ${o.who}` : ""}.` : "",
    "Si el audio no tiene voz, devuelve 'subtitulos' vacío y dilo en 'nota'.",
    "",
    "RESPONDE SOLO con JSON válido con esta forma:",
    `{"idioma":"es","subtitulos":[{"desde":0.0,"hasta":1.4,"texto":"","clave":""}],"gancho":{"detiene":true,"por_que":"","propuestas":["","",""]},"pie":"","hashtags":["","","","",""],"nota":""}`,
  ].filter(Boolean).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let txId: string | null = null;
  try {
    const who = await caller(req);
    if (!who) return json({ error: "Inicia sesión para usar esta función." }, 401);
    const raw = await req.text();
    if (raw.length > MAX_B64 + 4000) return json({ error: `El video es muy largo. Máximo ${MAX_SECONDS} segundos.` }, 413);
    const body = raw ? JSON.parse(raw) : {};
    const audio = typeof body.audio === "string" ? body.audio : "";
    const seconds = Number(body.seconds);
    if (!/^[A-Za-z0-9+/=]+$/.test(audio.slice(0, 200)) || audio.length < 2000) return json({ error: "No llegó el audio del video. Vuelve a elegirlo." }, 400);
    if (!Number.isFinite(seconds) || seconds < 1) return json({ error: "No pudimos medir el video. Vuelve a elegirlo." }, 400);
    if (seconds > MAX_SECONDS + 1) return json({ error: `El video es muy largo. Máximo ${MAX_SECONDS} segundos.` }, 413);
    const b = body.brief && typeof body.brief === "object" ? body.brief : {};
    const product = clean(b.product, 200), whoFor = clean(b.who, 160);
    if (!Deno.env.get("GEMINI_API_KEY")) return json({ error: "Esta función llega pronto.", pronto: true }, 503);

    const g = await charge(FN, who.id, "video_subtitles", `Subtítulos y gancho · ${Math.round(seconds)} s`, 15, 60);
    if (g instanceof Response) return g;
    txId = g.txId;

    const { out, cost, usage } = await geminiMedia([
      { inline_data: { mime_type: "audio/wav", data: audio } },
      { text: prompt({ seconds, product, who: whoFor }) + "\n\n" + HONESTY_RULES },
    ], 10_000, 100_000);
    await logMediaCost(who.id, FN, cost, usage);
    if (!out || !Array.isArray(out.subtitulos)) {
      await refund(txId, "json inválido");
      return json({ error: "La IA no pudo escuchar bien el audio. No se te cobró: inténtalo de nuevo." }, 502);
    }

    // Limpiar y ordenar los bloques: en orden, sin solaparse y dentro del video.
    let prev = 0;
    const subs = (out.subtitulos as unknown[]).flatMap((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const texto = clean(o.texto, 80);
      let desde = Number(o.desde), hasta = Number(o.hasta);
      if (!texto || !Number.isFinite(desde) || !Number.isFinite(hasta)) return [];
      desde = Math.max(prev, Math.min(seconds, desde));
      hasta = Math.max(desde + 0.3, Math.min(seconds, hasta));
      prev = hasta;
      return [{ desde: Math.round(desde * 10) / 10, hasta: Math.round(hasta * 10) / 10, texto, clave: clean(o.clave, 30) }];
    }).slice(0, 400);

    return json({ ...out, subtitulos: subs, billing: { charged: g.charged, balance: g.balance } }, 200, billingHeaders(g));
  } catch (e) {
    await refund(txId, "excepción");
    console.error(`${FN}:`, e instanceof Error ? e.message : e);
    return json({ error: "No se pudieron hacer los subtítulos. No se te cobró." }, 500);
  }
});
