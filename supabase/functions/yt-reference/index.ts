// SUPERNOVA — Creador de YouTube: video de referencia y traducción (03-oct-2026).
//
// analyze  → URL de YouTube → datos oficiales (API de YouTube: título, canal, duración, idioma,
//            miniatura) → Gemini VE el video público (función oficial de Google, sin descargar nada)
//            y devuelve: de qué trata, su estructura, cómo empieza (un fragmento corto, solo como
//            referencia) y TU VERSIÓN: guion ORIGINAL con el mismo tema y tipo de estructura, nunca su
//            texto (YouTube no paga lo copiado). Cobra yt_reference ANTES y devuelve si falla.
// translate→ traduce el guion conservando el formato de escenas. Cobra yt_translate.
import { corsHeaders } from "npm:@supabase/supabase-js@2.117.1/cors";
import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import { safeRefund } from "../_shared/refund.ts";
import { redact } from "../_shared/redact.ts";

const FN = "yt-reference";
const MODEL = "gemini-3.8-flash"; // gemini-2.5-flash ya no está disponible para cuentas nuevas
const MAX_SECONDS = 30 * 60;
const LANGS: Record<string, string> = { es: "español neutro latinoamericano", en: "inglés", pt: "portugués de Brasil", fr: "francés" };

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, ...extra, "Content-Type": "application/json" } });

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type Gate = { txId: string | null; charged: number; balance: number | null };

async function charge(uid: string, action: string, label: string): Promise<Gate | Response> {
  const { data: g, error } = await admin().rpc("edge_guard_charge", {
    p_user_id: uid, p_fn: FN, p_max_hour: 20, p_max_day: 60, p_action: action, p_label: label.slice(0, 120), p_kind: null, p_receipt: null,
  });
  if (error) return json({ error: "No se pudo verificar el acceso. Intenta de nuevo." }, 503);
  if (g?.ok !== true) {
    switch (g?.reason) {
      case "rate_limited": return json({ error: "Alcanzaste el límite por ahora. Intenta más tarde." }, 429);
      case "insufficient_credits": return json({ error: "No tienes créditos suficientes.", code: "insufficient_credits", balance: g.balance, cost: g.cost }, 402);
      case "unknown_action": return json({ error: "Acción sin precio configurado." }, 500);
      default: return json({ error: "Tu cuenta no tiene acceso activo." }, 403);
    }
  }
  return { txId: g.tx_id ?? null, charged: Number(g.charged) || 0, balance: typeof g.balance === "number" ? g.balance : null };
}

async function refund(txId: string | null, reason: string) {
  if (!txId) return;
  await safeRefund(admin(), txId, reason, "yt-reference");
}

const billingHeaders = (g: Gate): Record<string, string> => ({
  "Access-Control-Expose-Headers": "x-credits-charged, x-credits-balance",
  "x-credits-charged": String(g.charged),
  ...(g.balance !== null ? { "x-credits-balance": String(g.balance) } : {}),
});

function videoId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

const secondsOf = (iso: string) => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso ?? "");
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
};

const SCENE_FORMAT = `Divide el guion en escenas de 8 a 12 segundos con este formato exacto:
ESCENA n — [descripción visual breve para generar la imagen: quién, dónde, qué pasa, plano]
Narración: (lo que dice la voz en esa escena)`;

async function gemini(parts: unknown[], maxTokens: number) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("sin GEMINI_API_KEY");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: maxTokens, temperature: 0.8, mediaResolution: "MEDIA_RESOLUTION_LOW" },
    }),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  const text = d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  const u = d?.usageMetadata ?? {};
  // gemini-3.8-flash: US$0,75/M entrada (video y audio, se cuenta a US$1 por prudencia) y US$3,75/M salida.
  const cost = (Number(u.promptTokenCount ?? 0) * 1 + Number(u.candidatesTokenCount ?? 0) * 3.75 + Number(u.thoughtsTokenCount ?? 0) * 3.75) / 1e6;
  return { out: JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")), cost, usage: u };
}

async function logCost(uid: string, cost: number, usage: Record<string, number>) {
  const { error } = await admin().from("ai_usage").insert({
    user_id: uid, fn: FN, model: `${MODEL}:youtube`, input_tokens: Number(usage.promptTokenCount ?? 0),
    output_tokens: Number(usage.candidatesTokenCount ?? 0), images: 0, cost_usd: cost,
  });
  if (error) console.error("ai_usage:", error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let txId: string | null = null;
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const { data: u } = token ? await admin().auth.getUser(token) : { data: null };
    const uid = u?.user?.id;
    if (!uid) return json({ error: "Inicia sesión para usar esta función." }, 401);

    const raw = await req.text();
    if (raw.length > 30000) return json({ error: "La solicitud es demasiado grande." }, 413);
    const body = raw ? JSON.parse(raw) : {};
    const lang = LANGS[body.lang] ? body.lang : "es";
    const minutes = Math.min(30, Math.max(1, Number(body.minutes) || 12));

    // ---------- traducir ----------
    if (body.action === "translate") {
      const script = String(body.script ?? "").trim().slice(0, 25000);
      if (script.length < 50) return json({ error: "No hay guion para traducir." }, 400);
      const g = await charge(uid, "yt_translate", `Traducir guion a ${LANGS[lang]}`);
      if (g instanceof Response) return g;
      txId = g.txId;
      const { out, cost, usage } = await gemini([{ text:
        `Traduce este guion de YouTube a ${LANGS[lang]}, natural y para voz en off (no literal). Conserva EXACTAMENTE el formato: las líneas "ESCENA n — [...]" (traduce también la descripción entre corchetes) y "Narración:". Devuelve JSON {"script": "..."}.\n\n${script}` }], 16000);
      await logCost(uid, cost, usage);
      if (typeof out?.script !== "string" || out.script.length < 50) { await refund(txId, "sin traducción"); return json({ error: "No se pudo traducir. Te devolvimos los créditos." }, 502); }
      return json({ script: out.script, billing: { charged: g.charged, balance: g.balance } }, 200, billingHeaders(g));
    }

    // ---------- analizar video de referencia ----------
    const id = videoId(String(body.url ?? ""));
    if (!id) return json({ error: "Pega un enlace de YouTube válido (video o Short)." }, 400);
    if (body.action === "meta") {
      // Vista previa gratis, con tope para no gastar la cuota de YouTube.
      const { data: lim } = await admin().rpc("edge_guard_charge", { p_user_id: uid, p_fn: `${FN}-meta`, p_max_hour: 60, p_max_day: 300, p_action: null, p_label: null, p_kind: null, p_receipt: null });
      if (lim?.ok !== true) return json({ error: "Demasiadas consultas seguidas. Intenta en un rato." }, 429);
    }
    const ytKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!ytKey) return json({ error: "El análisis de videos llega pronto." }, 503);
    const meta = await fetch(`https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({ part: "snippet,contentDetails,statistics,status", id, key: ytKey })}`).then(r => r.json());
    const v = meta?.items?.[0];
    if (!v) return json({ error: "No encontramos ese video. ¿Es público?" }, 404);
    if (v.status?.privacyStatus !== "public") return json({ error: "Ese video no es público: solo se pueden analizar videos públicos." }, 400);
    const secs = secondsOf(v.contentDetails?.duration);
    if (secs > MAX_SECONDS) return json({ error: "Por ahora analizamos videos de hasta 30 minutos." }, 400);
    const video = {
      id, title: String(v.snippet?.title ?? ""), channel: String(v.snippet?.channelTitle ?? ""), seconds: secs,
      views: Number(v.statistics?.viewCount ?? 0), lang: v.snippet?.defaultAudioLanguage ?? v.snippet?.defaultLanguage ?? null,
      thumb: v.snippet?.thumbnails?.medium?.url ?? null,
    };

    // Gratis: solo los datos del video y lo que costará analizarlo (para mostrar el precio exacto).
    const tier = secs <= 180 ? { action: "yt_reference_short", cost: 20 } : secs <= 900 ? { action: "yt_reference", cost: 50 } : { action: "yt_reference_long", cost: 100 };
    if (body.action === "meta") return json({ video, price: tier.cost });

    const g = await charge(uid, tier.action, `Analizar video: ${video.title.slice(0, 60)}`);
    if (g instanceof Response) return g;
    txId = g.txId;
    const words = Math.round(minutes * 145);
    const { out, cost, usage } = await gemini([
      { file_data: { file_uri: `https://www.youtube.com/watch?v=${id}` } },
      { text: `Mira este video de YouTube ("${video.title}", canal ${video.channel}) y ayúdame a crear MI PROPIO video sobre el mismo tema para un canal sin rostro.
Devuelve SOLO JSON con estas claves:
- "topic": de qué trata, en una frase.
- "why_it_works": 3 razones concretas por las que retiene (gancho, ritmo, promesa, emociones), en una lista de textos cortos.
- "structure": la estructura del video en 5 a 8 pasos ("Gancho: ...", "Promesa: ...", "Bloque 1: ...", "Cierre: ..."), lista de textos.
- "opening": cómo empieza el narrador, máximo 40 palabras (solo como referencia).
- "script": MI VERSIÓN en ${LANGS[lang]}: guion 100 % ORIGINAL con el mismo tema y el mismo TIPO de estructura, pero con otro gancho, otros ejemplos, otro orden de ideas y frases propias. Prohibido copiar o parafrasear frases del video. Unas ${words} palabras de narración (≈ ${minutes} min), frases cortas para voz en off, sin promesas de dinero ni curas, sin datos inventados. ${SCENE_FORMAT}
- "title": un título nuevo que dé curiosidad (máx. 70 caracteres), distinto del original.
- "thumbnail": idea de miniatura nueva, con máximo 5 palabras de texto.` },
    ], 24000);
    await logCost(uid, cost, usage);
    if (typeof out?.script !== "string" || out.script.length < 200) { await refund(txId, "sin guion"); return json({ error: "No se pudo analizar el video. Te devolvimos los créditos." }, 502); }
    return json({
      video, topic: out.topic ?? "", why_it_works: Array.isArray(out.why_it_works) ? out.why_it_works.slice(0, 5) : [],
      structure: Array.isArray(out.structure) ? out.structure.slice(0, 10) : [], opening: String(out.opening ?? "").slice(0, 400),
      script: out.script, title: String(out.title ?? "").slice(0, 120), thumbnail: String(out.thumbnail ?? "").slice(0, 200),
      billing: { charged: g.charged, balance: g.balance },
    }, 200, billingHeaders(g));
  } catch (e) {
    console.error("yt-reference:", redact(e));
    await refund(txId, "excepción");
    return json({ error: "No se pudo completar. Si se cobró, te devolvimos los créditos." }, 500);
  }
});
