// SUPERNOVA — Producir video de YouTube faceless (04-oct-2026): voz e imagen de cada escena.
//
// El montaje (Ken Burns, subtítulos, audio) se hace GRATIS en el navegador. Aquí solo se paga lo
// que gasta IA, una pieza por llamada, para que la producción en vivo muestre cada escena al
// terminar y una falla no cueste el video entero:
//   voice        { text ≤ 600, voice, lang, scene?, speed? (1–1,25) } → cobra yt_voice_scene ANTES → APIMart
//                gpt-4o-mini-tts → audio en base64 (no se guarda en el servidor).
//   scene_image  { visual ≤ 600, style, aspect, scene?, ref_path? } → cobra yt_scene_image ANTES → APIMart
//                gpt-image-2 → imagen en base64 (el navegador la guarda comprimida en WebP).
//                ref_path (Mi historia animada, 20-oct-2026): el personaje de la persona, en SU carpeta de
//                "creativos" ({uid}/historia/…); el servidor firma la URL y la pasa como referencia.
//   character    { photo_path } → mismo precio (yt_scene_image) → la persona de su foto como personaje de
//                animación 3D, vertical. La foto también debe estar en {uid}/historia/….
// Compuerta: usuario real (auth.getUser con su token; verify_jwt no protege) + edge_guard_charge
// con su propio tope (120/h, 300/día: un video de 16 escenas son 32 piezas y el tope de
// generate-ad-creative, 20/h, no alcanza). Si APIMart falla → refund_charge. Costo real en ai_usage.
// Las animaciones de escena van por video-studio (kind "yt_scene", vid_mini_5), no por aquí.
//
// Modelos y costo (lista de APIMart, 03-oct-2026):
//   voz     gpt-4o-mini-tts ≈ US$0,015/min (se cobra por audio generado: más lento = más caro).
//           Escena de ≤600 caracteres a speed ≥ 1 (~41 s a 14,5 car/s) ≤ US$0,0104 → 5 créditos
//           (US$0,04 al crédito más barato: ~3,9× en el peor caso; ~3,5× si la voz va a 13 car/s;
//           ~5× en una escena normal de 30 s). Por eso speed < 1 no se acepta.
//   imagen  gpt-image-2 1k ≈ US$0,0081 → 6 créditos (5,9×).
import { corsHeaders } from "npm:@supabase/supabase-js@2.117.1/cors";
import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import { apimartImage, apimartSpeech, encodeBase64, hasApimart, APIMART_IMAGE_MODEL as IMAGE_MODEL, TTS_MODEL } from "../_shared/apimart.ts";
import { safeRefund } from "../_shared/refund.ts";

const FN = "yt-produce";
const MAX_TEXT = 600; // contraparte: MAX_NARRATION en src/lib/ytScenes.ts
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
  "Animación 3D": "3D animated feature film style, stylized expressive characters with big eyes, soft cinematic lighting, warm colors, detailed environments",
};

/** Fotos y personajes de Mi historia animada: solo de la carpeta del propio usuario. */
const historiaPath = (uid: string, v: unknown) =>
  typeof v === "string" && v.startsWith(`${uid}/historia/`) && !v.includes("..") && /^[\w/.-]{10,200}$/.test(v) && /\.(webp|png|jpe?g)$/i.test(v) ? v : null;

async function signed(path: string): Promise<string | null> {
  const { data } = await admin().storage.from("creativos").createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

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
      case "recharge_required": return json({ error: "Ya usaste tus pruebas gratis de esta herramienta. Recarga al menos US$20 para seguir usándola; mientras, puedes probar todo lo demás.", code: "recharge_required", min_usd: 20 }, 402);
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
  await safeRefund(admin(), txId, reason, "yt-produce");
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
      // Solo 1–1,25: más lento alarga el audio y bajaría el margen de yt_voice_scene del piso 3×.
      const speed = typeof body.speed === "number" && body.speed >= 1 && body.speed <= 1.25 ? body.speed : 1;
      const scene = sceneOf(body.scene);
      if (!hasApimart()) return json({ error: "La voz llega pronto.", pronto: true }, 503);

      const g = await charge(uid, "yt_voice_scene", `Voz de escena${scene ? ` ${scene}` : ""} · ${text.slice(0, 50)}`);
      if (g instanceof Response) return g;
      txId = g.txId;

      const audio = await apimartSpeech({ input: text, voice, format: "mp3", speed, instructions: LANG_TONE[lang] });
      if (!audio) {
        await refund(txId, "voz falló");
        return json({ error: "No se pudo crear la voz. Te devolvimos los créditos.", code: "provider_failed", refunded: true }, 502);
      }
      await logCost(uid, `apimart:${TTS_MODEL}`, ((text.length / 14.5 / speed) / 60) * COST.voicePerMin, 0);
      return json({ audio: encodeBase64(audio.bytes), mime: audio.mime, billing: { charged: g.charged, balance: g.balance } }, 200, billingHeaders(g));
    }

    if (body.action === "scene_image") {
      const visual = typeof body.visual === "string" ? body.visual.replace(/\s+/g, " ").trim() : "";
      if (visual.length < 3) return json({ error: "La escena no tiene descripción visual." }, 400);
      if (visual.length > MAX_VISUAL) return json({ error: `La descripción visual puede tener hasta ${MAX_VISUAL} caracteres.` }, 400);
      const style = typeof body.style === "string" && STYLE_HINT[body.style] ? body.style : "Cinematográfico";
      const aspect = typeof body.aspect === "string" && ASPECTS.has(body.aspect) ? body.aspect : "16:9";
      const scene = sceneOf(body.scene);
      const refPath = body.ref_path === undefined ? null : historiaPath(uid, body.ref_path);
      if (body.ref_path !== undefined && !refPath) return json({ error: "Esa imagen del personaje no es válida." }, 400);
      if (!hasApimart()) return json({ error: "Las imágenes de escena llegan pronto.", pronto: true }, 503);
      const refUrl = refPath ? await signed(refPath) : null;
      if (refPath && !refUrl) return json({ error: "No encontramos la imagen de tu personaje. Vuelve a crearla." }, 400);

      const g = await charge(uid, "yt_scene_image", `Imagen de escena${scene ? ` ${scene}` : ""} · ${visual.slice(0, 50)}`);
      if (g instanceof Response) return g;
      txId = g.txId;

      const prompt = refUrl
        ? `Escena de una historia de vida animada, vertical para Reels: ${visual}\n\nEl protagonista es EXACTAMENTE el personaje de la imagen de referencia: misma cara, pelo, color de piel, rasgos y estilo; cambia solo la ropa, la edad o la expresión si la escena lo pide. Otras personas de la escena son personajes nuevos del mismo estilo. Estilo: ${style} — ${STYLE_HINT[style]}. Encuadre de cine con el protagonista bien visible en el centro y aire alrededor (la imagen tendrá un zoom suave). Formato ${aspect}.\n\n${RULES}`
        : `Escena para un video de YouTube narrado (canal sin rostro): ${visual}\n\nEstilo: ${style} — ${STYLE_HINT[style]}. Composición clara que se entienda en pantalla de celular, sujeto principal centrado con aire alrededor (la imagen tendrá un zoom suave). Formato ${aspect}.\n\n${RULES}`;
      // Un reintento en el servidor (mismo cobro) solo si la falla fue rápida: apimartImage espera
      // hasta 90 s y la función tiene ~150 s de tope; si ya se agotó la espera, reintenta el navegador
      // (un 502 a los 92,8 s del 11-oct fue justo eso: la imagen tardó más de 90 s).
      const t0 = Date.now();
      const refs = refUrl ? [refUrl] : undefined;
      let img = await apimartImage(prompt, aspect, refs);
      if (!img && Date.now() - t0 < 30_000) img = await apimartImage(prompt, aspect, refs);
      if (!img) {
        await refund(txId, "imagen falló");
        return json({ error: "La imagen tardó demasiado. Te devolvimos los créditos.", code: "provider_failed", refunded: true }, 502);
      }
      // Con referencia se anota el costo que reporta APIMart (para medir si sube y cuidar el margen 5×).
      await logCost(uid, `apimart:${IMAGE_MODEL}${refUrl ? ":ref" : ""}`, refUrl && img.cost !== null ? img.cost : COST.image, 1);
      return json({ image: `data:${img.mime};base64,${img.b64}`, billing: { charged: g.charged, balance: g.balance } }, 200, billingHeaders(g));
    }

    if (body.action === "character") {
      const photo = historiaPath(uid, body.photo_path);
      if (!photo) return json({ error: "Sube una foto tuya para crear tu personaje." }, 400);
      if (!hasApimart()) return json({ error: "Los personajes llegan pronto.", pronto: true }, 503);
      const url = await signed(photo);
      if (!url) return json({ error: "No encontramos tu foto. Súbela de nuevo." }, 400);

      const g = await charge(uid, "yt_scene_image", "Tu personaje animado");
      if (g instanceof Response) return g;
      txId = g.txId;

      const prompt = `Convierte a la persona de la foto en el protagonista de una película de animación 3D: misma cara, forma de la cabeza, pelo, color de piel, barba o lentes si los tiene, y la misma edad aproximada. Estilo: ${STYLE_HINT["Animación 3D"]}. Retrato de medio cuerpo, de frente, expresión amable y natural, ropa sencilla de diario, fondo de casa desenfocado con luz cálida. Formato 9:16.\n\n${RULES}`;
      const t0 = Date.now();
      let img = await apimartImage(prompt, "9:16", [url]);
      if (!img && Date.now() - t0 < 30_000) img = await apimartImage(prompt, "9:16", [url]);
      if (!img) {
        await refund(txId, "personaje falló");
        return json({ error: "No se pudo crear tu personaje. Te devolvimos los créditos.", code: "provider_failed", refunded: true }, 502);
      }
      await logCost(uid, `apimart:${IMAGE_MODEL}:personaje`, img.cost ?? COST.image, 1);
      return json({ image: `data:${img.mime};base64,${img.b64}`, billing: { charged: g.charged, balance: g.balance } }, 200, billingHeaders(g));
    }

    return json({ error: "Acción no válida." }, 400);
  } catch (e) {
    console.error("yt-produce:", e instanceof Error ? e.message : e);
    await refund(txId, "excepción");
    return json({ error: "No se pudo completar. Si se cobró, te devolvimos los créditos.", code: "provider_failed", refunded: !!txId }, 500);
  }
});
