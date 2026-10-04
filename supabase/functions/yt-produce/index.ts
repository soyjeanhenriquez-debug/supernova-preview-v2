// SUPERNOVA — Producir video de YouTube faceless (04-oct-2026): voz e imagen de cada escena.
//
// El montaje (Ken Burns, subtítulos, audio) se hace GRATIS en el navegador. Aquí solo se paga lo
// que gasta IA, una pieza por llamada, para que la producción en vivo muestre cada escena al
// terminar y una falla no cueste el video entero:
//   voice        { text ≤ 700, voice, lang, scene? } → cobra yt_voice_scene ANTES → APIMart
//                gpt-4o-mini-tts → audio en base64 (no se guarda en el servidor).
//   scene_image  { visual ≤ 600, style, aspect, scene? } → cobra yt_scene_image ANTES → APIMart
//                gpt-image-2 → imagen en base64 (el navegador la guarda comprimida en WebP).
// Compuerta: usuario real (auth.getUser con su token; verify_jwt no protege) + edge_guard_charge
// con su propio tope (120/h, 300/día: un video de 16 escenas son 32 piezas y el tope de
// generate-ad-creative, 20/h, no alcanza). Si APIMart falla → refund_charge. Costo real en ai_usage.
// Las animaciones de escena van por video-studio (kind "yt_scene", vid_mini_5), no por aquí.
//
// Modelos y costo (lista de APIMart, 03-oct-2026):
//   voz     gpt-4o-mini-tts ≈ US$0,015/min → escena de ≤700 caracteres (~45 s) ≤ US$0,011 → 5 créditos
//           (US$0,04 al crédito más barato: 3,6× en el peor caso, ~5× en una escena normal de 30 s).
//   imagen  gpt-image-2 1k ≈ US$0,0081 → 6 créditos (5,9×).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { apimartImage, apimartSpeech, encodeBase64, hasApimart, APIMART_IMAGE_MODEL as IMAGE_MODEL, TTS_MODEL } from "../_shared/apimart.ts";

const FN = "yt-produce";
const MAX_TEXT = 700;
const MAX_VISUAL = 600;
const MAX_SCENE = 40;
const VOICES = new Set(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]);
const ASPECTS = new Set(["16:9", "9:16", "3:4"]);
const COST = { voicePerMin: 0.015, image: 0.0081 };

const LANG_TONE: Record<string, string> = {
  es: "Habla en español neutro latinoamericano, con voz natural y cercana, ritmo de narrador de YouTube, sin acento de España.",
  en: "Speak natural American English, warm documentary narrator, steady pace.",
  pt: "Fale em português do Brasil, natural e próximo, ritmo de narrador do YouTube.",
  fr: "Parle en français naturel, ton chaleureux de narrateur, rythme posé.",
};

const STYLE_HINT: Record<string, string> = {
  "Cinematográfico": "cinematic film still, dramatic natural lighting, shallow depth of field, rich color grading",
  "Animación 2D": "2D animated illustration, clean lines, soft flat colors, friendly characters",
  "Anime": "anime style illustration, expressive, vibrant colors, detailed background",
  "Pintura": "classical oil painting, visible brush strokes, warm soft light",
  "Minimalista": "minimalist illustration, simple shapes, lots of negative space, limited palette",
  "Documental": "documentary photograph, realistic, natural light, authentic setting",
};

const RULES = "Sin texto, letras, subtítulos ni marcas de agua en la imagen. Sin logotipos, marcas, personajes con derechos ni personas famosas reales. Sin contenido sexual, violencia explícita ni sangre. Sin dinero, billetes ni cifras de ingresos.";

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
    p_user_id: uid, p_fn: FN, p_max_hour: 120, p_max_day: 300,
    p_action: action, p_label: label.slice(0, 120), p_kind: null, p_receipt: null,
  });
  if (error) return json({ error: "No se pudo verificar el acceso. Intenta de nuevo." }, 503);
  if (g?.ok !== true) {
    switch (g?.reason) {
      case "rate_limited": return json({ error: "Alcanzaste el límite de escenas por ahora. Intenta más tarde; lo hecho queda guardado.", code: "rate_limited" }, 429);
      case "insufficient_credits": return json({ error: "No tienes créditos suficientes.", code: "insufficient_credits", balance: g.balance, cost: g.cost }, 402);
      case "disabled": return json({ error: "Producir video no está disponible por ahora." }, 503);
      case "unknown_action": return json({ error: "Acción sin precio configurado." }, 500);
      default: return json({ error: "Tu cuenta no tiene acceso activo." }, 403);
    }
  }
  return { txId: g.tx_id ?? null, charged: Number(g.charged) || 0, balance: typeof g.balance === "number" ? g.balance : null };
}

async function refund(txId: string | null, reason: string) {
  if (!txId) return;
  try { await admin().rpc("refund_charge", { p_tx_id: txId, p_reason: reason.slice(0, 200) }); }
  catch (e) { console.error("refund_charge:", e); }
}

async function logCost(uid: string, model: string, cost: number, images: number) {
  const { error } = await admin().from("ai_usage").insert({ user_id: uid, fn: FN, model, images, cost_usd: cost });
  if (error) console.error("ai_usage:", error.message);
}

const billingHeaders = (g: Gate): Record<string, string> => ({
  "Access-Control-Expose-Headers": "x-credits-charged, x-credits-balance",
  "x-credits-charged": String(g.charged),
  ...(g.balance !== null ? { "x-credits-balance": String(g.balance) } : {}),
});

const sceneOf = (v: unknown) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MAX_SCENE ? v as number : null);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  let txId: string | null = null;
  try {
    // 1) Usuario real. La llave pública del bundle también es un JWT válido: no basta verify_jwt.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const { data: u } = token ? await admin().auth.getUser(token) : { data: null };
    const uid = u?.user?.id;
    if (!uid) return json({ error: "Inicia sesión para usar esta función." }, 401);

    const raw = await req.text();
    if (raw.length > 4000) return json({ error: "La solicitud es demasiado grande." }, 413);
    let body: Record<string, unknown>;
    try { body = raw ? JSON.parse(raw) : {}; } catch { return json({ error: "Solicitud inválida." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Solicitud inválida." }, 400);

    // 2) Validación ANTES de cobrar (nada del cliente decide precio ni modelo).
    if (body.action === "voice") {
      const text = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim() : "";
      if (text.length < 2) return json({ error: "La escena no tiene narración." }, 400);
      if (text.length > MAX_TEXT) return json({ error: `La narración de una escena puede tener hasta ${MAX_TEXT} caracteres.` }, 400);
      const voice = typeof body.voice === "string" ? body.voice : "";
      if (!VOICES.has(voice)) return json({ error: "Esa voz no existe. Elige otra." }, 400);
      const lang = typeof body.lang === "string" && LANG_TONE[body.lang] ? body.lang : "es";
      const speed = typeof body.speed === "number" && body.speed >= 0.8 && body.speed <= 1.25 ? body.speed : 1;
      const scene = sceneOf(body.scene);
      if (!hasApimart()) return json({ error: "La voz llega pronto.", pronto: true }, 503);

      const g = await charge(uid, "yt_voice_scene", `Voz de escena${scene ? ` ${scene}` : ""} · ${text.slice(0, 50)}`);
      if (g instanceof Response) return g;
      txId = g.txId;

      const audio = await apimartSpeech({ input: text, voice, format: "mp3", speed, instructions: LANG_TONE[lang] });
      if (!audio) {
        await refund(txId, "voz falló");
        return json({ error: "No se pudo crear la voz. Te devolvimos los créditos." }, 502);
      }
      await logCost(uid, `apimart:${TTS_MODEL}`, ((text.length / 14.5) / 60) * COST.voicePerMin, 0);
      return json({ audio: encodeBase64(audio.bytes), mime: audio.mime, billing: { charged: g.charged, balance: g.balance } }, 200, billingHeaders(g));
    }

    if (body.action === "scene_image") {
      const visual = typeof body.visual === "string" ? body.visual.replace(/\s+/g, " ").trim() : "";
      if (visual.length < 3) return json({ error: "La escena no tiene descripción visual." }, 400);
      if (visual.length > MAX_VISUAL) return json({ error: `La descripción visual puede tener hasta ${MAX_VISUAL} caracteres.` }, 400);
      const style = typeof body.style === "string" && STYLE_HINT[body.style] ? body.style : "Cinematográfico";
      const aspect = typeof body.aspect === "string" && ASPECTS.has(body.aspect) ? body.aspect : "16:9";
      const scene = sceneOf(body.scene);
      if (!hasApimart()) return json({ error: "Las imágenes de escena llegan pronto.", pronto: true }, 503);

      const g = await charge(uid, "yt_scene_image", `Imagen de escena${scene ? ` ${scene}` : ""} · ${visual.slice(0, 50)}`);
      if (g instanceof Response) return g;
      txId = g.txId;

      const prompt = `Escena para un video de YouTube narrado (canal sin rostro): ${visual}\n\nEstilo: ${style} — ${STYLE_HINT[style]}. Composición clara que se entienda en pantalla de celular, sujeto principal centrado con aire alrededor (la imagen tendrá un zoom suave). Formato ${aspect}.\n\n${RULES}`;
      const img = await apimartImage(prompt, aspect);
      if (!img) {
        await refund(txId, "imagen falló");
        return json({ error: "No se pudo crear la imagen. Te devolvimos los créditos." }, 502);
      }
      await logCost(uid, `apimart:${IMAGE_MODEL}`, COST.image, 1);
      return json({ image: `data:${img.mime};base64,${img.b64}`, billing: { charged: g.charged, balance: g.balance } }, 200, billingHeaders(g));
    }

    return json({ error: "Acción no válida." }, 400);
  } catch (e) {
    console.error("yt-produce:", e instanceof Error ? e.message : e);
    await refund(txId, "excepción");
    return json({ error: "No se pudo completar. Si se cobró, te devolvimos los créditos." }, 500);
  }
});
