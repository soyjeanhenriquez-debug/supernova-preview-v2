// SUPERNOVA — Reel "Esta IA hace X" (24-oct-2026, ingeniería inversa de un reel que pasó Jean).
// SOLO la cuenta de Jean (compuerta owner() de Genjutsu: id y correo), sin créditos, como Genjutsu. Las imágenes y las
// animaciones van por yt-produce, avatar-studio y video-studio (que cobran como siempre); aquí solo lo nuevo:
//
//   config            → qué llaves hay (ElevenLabs, fal).
//   voice    { text } → ElevenLabs text-to-speech/with-timestamps con la voz de Jean (ELEVENLABS_VOICE_ID):
//                       { audio (base64 mp3), alignment (tiempo de cada letra) } para cortar escenas y subtítulos.
//   capture  { url, mobile? } → captura real de la web de la herramienta con Microlink (gratis, 50 al día; la URL
//                       solo puede ser http(s) pública). Devuelve la imagen en base64.
//   presenter { image: { bucket, path }, audio (base64 wav ≤ 12 s) } → Kling AI Avatar v2 en fal (imagen + audio:
//                       los labios siguen la voz de Jean). Devuelve request_id.
//   status   { request_id } → estado en la cola de fal.
//   file     { request_id } → el MP4 terminado, en streaming con CORS (solo hosts de fal).
//   fetch_link { url } (Reel Studio, 25-oct-2026) → un Reel de Instagram: lo lee con Apify (caché global de
//                       reelSource), baja el video y lo guarda en biblioteca/{uid}/ref/ para analizarlo y sacar
//                       miniaturas. TikTok y YouTube: no se pueden leer por enlace → se pide subir el video.
//   analyze  { path, cortes, duracion } → Gemini MIRA y ESCUCHA el video de referencia (biblioteca/{uid}/ref/…,
//                       hasta 18 MB) y devuelve su ingeniería inversa audiovisual (reelPlan.ts: cleanAnalisis).
// Costos al proveedor en ai_usage: ElevenLabs va por la suscripción de Jean (0 aquí), Kling Avatar US$0,0562/s.
// Ninguna llave sale al cliente. Docs leídas el 24-oct-2026: elevenlabs.io/docs (with-timestamps), microlink.io/docs.
import { corsHeaders } from "npm:@supabase/supabase-js@2.117.1/cors";
import { owner } from "../_shared/genjutsu.ts";
import { admin, fal, FAL_KEY, json } from "../_shared/media.ts";
import { ownStoragePath } from "../_shared/paths.ts";
import { cleanAnalisis, PROMPT_ANALISIS } from "../_shared/reelPlan.ts";
import { b64 as b64m, geminiMedia, logMediaCost } from "../_shared/geminiMedia.ts";
import { getReel, REEL_RE } from "../_shared/reelSource.ts";

const FN = "reel-ia";
const AVATAR = "fal-ai/kling-video/ai-avatar/v2/standard";
const AVATAR_USD_PER_SEC = 0.0562;
const MAX_TEXT = 3000;
const MAX_AUDIO_B64 = 1_400_000; // ~12 s de WAV mono 24 kHz
const FILE_MAX = 60 * 1024 * 1024;
const FAL_HOSTS = ["fal.media", "fal.run", "fal.ai"];
const REQ_ID = /^[0-9a-f-]{36}$/i;

const elevenKey = () => Deno.env.get("ELEVENLABS_API_KEY") ?? null;
const voiceId = () => Deno.env.get("ELEVENLABS_VOICE_ID") ?? null;
const VOICE_RE = /^[A-Za-z0-9]{10,40}$/;
const REF_MAX = 18 * 1024 * 1024; // cabe en una sola solicitud a Gemini
const IG_HOST_RE = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;

function b64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** URL pública http(s): nada de localhost, IP privadas ni puertos raros (Microlink la abre, no nosotros). */
export function publicUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 500) return null;
  let u: URL;
  try { u = new URL(v.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password || (u.port && u.port !== "80" && u.port !== "443")) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":")) return null; // sin IP literales
  return u.toString();
}

const hostOk = (h: string, list: string[]) => list.some(d => h === d || h.endsWith(`.${d}`));

async function logCost(uid: string, model: string, usd: number) {
  const { error } = await admin().from("ai_usage").insert({ user_id: uid, fn: FN, model, images: 0, cost_usd: usd });
  if (error) console.error("ai_usage:", error.message);
}

async function falResult(id: string): Promise<{ status: string; url?: string }> {
  const base = `https://queue.fal.run/fal-ai/kling-video/requests/${id}`;
  const st = await fal(`${base}/status`);
  if (!st.ok) return { status: "IN_PROGRESS" };
  const s = await st.json();
  if (s?.status !== "COMPLETED") return { status: String(s?.status ?? "IN_PROGRESS") };
  const r = await fal(base);
  const out = r.ok ? await r.json() : null;
  const url = typeof out?.video?.url === "string" ? out.video.url : undefined;
  return url ? { status: "COMPLETED", url } : { status: "FAILED" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const uid = await owner(req);
    if (!uid) return json({ error: "Esta herramienta todavía es solo de Jean." }, 403);
    const raw = await req.text();
    if (raw.length > MAX_AUDIO_B64 + 4000) return json({ error: "La solicitud es demasiado grande." }, 413);
    let body: Record<string, unknown> = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return json({ error: "Solicitud inválida." }, 400); }

    if (body.action === "config") return json({ eleven: !!elevenKey() && !!voiceId(), fal: !!FAL_KEY });

    // ---------- voz (ElevenLabs, con tiempos) ----------
    if (body.action === "voice") {
      // Otra voz de tu cuenta de ElevenLabs (Mi identidad); si no, tu voz clonada de los secretos.
      const key = elevenKey(), vid = typeof body.voice_id === "string" && VOICE_RE.test(body.voice_id) ? body.voice_id : voiceId();
      if (!key || !vid) return json({ error: "Faltan ELEVENLABS_API_KEY o ELEVENLABS_VOICE_ID en los secretos de Supabase." }, 503);
      const text = String(body.text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
      if (text.split(" ").length < 5) return json({ error: "Escribe el guion completo (al menos una frase)." }, 400);
      const speed = Math.max(0.9, Math.min(1.2, Number(body.speed) || 1));
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(vid)}/with-timestamps?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        // speed (24-oct-2026, Jean: "la voz es muy lenta"): ElevenLabs acepta de 0,7 a 1,2.
        body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true, speed } }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!r.ok) {
        const t = (await r.text()).slice(0, 300);
        console.error("elevenlabs:", r.status, t);
        return json({ error: r.status === 401 ? "ElevenLabs rechazó la llave. Revisa ELEVENLABS_API_KEY." : r.status === 404 ? "ElevenLabs no encuentra esa voz. Revisa ELEVENLABS_VOICE_ID." : "ElevenLabs no respondió. Intenta de nuevo." }, 502);
      }
      const d = await r.json();
      if (typeof d?.audio_base64 !== "string" || !d?.alignment) return json({ error: "ElevenLabs no devolvió el audio." }, 502);
      await logCost(uid, "elevenlabs:eleven_multilingual_v2", 0);
      return json({ audio: d.audio_base64, alignment: d.alignment, chars: text.length });
    }

    // ---------- captura real de la web (Microlink) ----------
    if (body.action === "capture") {
      const url = publicUrl(body.url);
      if (!url) return json({ error: "Pon la dirección completa de la web (https://…)." }, 400);
      const mobile = body.mobile === true;
      const q = new URLSearchParams({
        url, screenshot: "true", meta: "false", waitForTimeout: "1500",
        "viewport.width": mobile ? "390" : "1280", "viewport.height": mobile ? "844" : "800",
        "viewport.isMobile": mobile ? "true" : "false", "viewport.deviceScaleFactor": mobile ? "2" : "1",
      });
      const r = await fetch(`https://api.microlink.io/?${q}`, { signal: AbortSignal.timeout(45_000) });
      const d = r.ok ? await r.json() : null;
      const shot = d?.data?.screenshot?.url;
      if (typeof shot !== "string") {
        console.error("microlink:", r.status, JSON.stringify(d ?? {}).slice(0, 300));
        return json({ error: r.status === 429 ? "Se acabaron las capturas gratis de hoy. Sube tú las capturas." : "No se pudo sacar la captura de esa web." }, 502);
      }
      let su: URL;
      try { su = new URL(shot); } catch { return json({ error: "Captura inválida." }, 502); }
      if (su.protocol !== "https:" || !hostOk(su.hostname, ["microlink.io"])) return json({ error: "Captura de un sitio no permitido." }, 502);
      const img = await fetch(su, { signal: AbortSignal.timeout(30_000) });
      if (!img.ok) return json({ error: "No se pudo bajar la captura." }, 502);
      const bytes = new Uint8Array(await img.arrayBuffer());
      if (bytes.length > 8 * 1024 * 1024) return json({ error: "La captura es demasiado grande." }, 413);
      return json({ image: b64(bytes), mime: img.headers.get("content-type")?.split(";")[0] || "image/png" });
    }

    // ---------- presentador que habla con la voz de Jean (Kling AI Avatar) ----------
    if (body.action === "presenter") {
      if (!FAL_KEY) return json({ error: "Falta FAL_KEY en los secretos de Supabase." }, 503);
      const ref = (body.image ?? {}) as { bucket?: unknown; path?: unknown };
      const bucket = ref.bucket === "estudio-avatar" ? "estudio-avatar" : ref.bucket === "personajes" ? "personajes" : ref.bucket === "creativos" ? "creativos" : null;
      const path = bucket ? ownStoragePath(uid, ref.path) : null;
      if (!bucket || !path) return json({ error: "Elige la imagen del presentador." }, 400);
      const audio = typeof body.audio === "string" && body.audio.length <= MAX_AUDIO_B64 ? body.audio : null;
      if (!audio) return json({ error: "Falta el audio del presentador (máximo 12 s)." }, 400);
      const seconds = Math.max(1, Math.min(12, Number(body.seconds) || 5));
      const db = admin();
      const { data: img } = await db.storage.from(bucket).createSignedUrl(path, 60 * 60);
      if (!img?.signedUrl) return json({ error: "No se encontró la imagen del presentador." }, 400);
      const bytes = Uint8Array.from(atob(audio), c => c.charCodeAt(0));
      const audioPath = `${uid}/reel-ia-${crypto.randomUUID()}.wav`;
      const up = await db.storage.from("avatar-audio").upload(audioPath, bytes, { contentType: "audio/wav" });
      if (up.error) return json({ error: "No se pudo guardar el audio." }, 500);
      const { data: au } = await db.storage.from("avatar-audio").createSignedUrl(audioPath, 60 * 60);
      if (!au?.signedUrl) return json({ error: "No se pudo preparar el audio." }, 500);
      const q = await fal(`https://queue.fal.run/${AVATAR}`, {
        method: "POST",
        body: JSON.stringify({ image_url: img.signedUrl, audio_url: au.signedUrl, prompt: "Person talking directly to the camera with natural expressions and subtle hand gestures, social media video." }),
      });
      if (!q.ok) {
        console.error("fal avatar:", q.status, (await q.text()).slice(0, 300));
        return json({ error: q.status === 422 ? "El generador rechazó la imagen o el audio." : "El generador del presentador no está disponible ahora." }, 503);
      }
      const queued = await q.json();
      if (typeof queued?.request_id !== "string") return json({ error: "El generador no devolvió el trabajo." }, 502);
      await logCost(uid, `fal:${AVATAR}`, Math.round(seconds * AVATAR_USD_PER_SEC * 1000) / 1000);
      return json({ request_id: queued.request_id });
    }

    // ---------- Reel de referencia por enlace (solo Instagram) ----------
    if (body.action === "fetch_link") {
      const url = typeof body.url === "string" ? body.url.trim() : "";
      const m = url.match(REEL_RE);
      if (!m) {
        const plataforma = /tiktok\.com/i.test(url) ? "TikTok" : /youtu\.?be/i.test(url) ? "YouTube" : null;
        return json({ error: plataforma ? `Los videos de ${plataforma} no se pueden leer por enlace. Descárgalo y súbelo aquí.` : "Pega el enlace de un Reel de Instagram, o sube el video.", subir: true }, 422);
      }
      const apify = Deno.env.get("APIFY_TOKEN");
      if (!apify) return json({ error: "No se puede leer Instagram ahora. Sube el video.", subir: true }, 503);
      const got = await getReel(FN, m[1], apify);
      if (!got.ok) {
        const why = got.reason === "budget" ? "Se acabó el saldo del lector de Instagram este mes." : got.reason === "not_found" ? "Ese Reel no existe o es privado." : "Instagram no respondió a tiempo.";
        return json({ error: `${why} Sube el video y lo analizo igual.`, subir: true }, 502);
      }
      const v = got.row.video_url;
      let vu: URL | null = null;
      try { vu = v ? new URL(v) : null; } catch { vu = null; }
      if (!vu || vu.protocol !== "https:" || !IG_HOST_RE.test(vu.hostname)) return json({ error: "Ese enlace no trae video. Sube el video.", subir: true }, 422);
      const r = await fetch(vu, { signal: AbortSignal.timeout(40_000) });
      const bytes = r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
      if (!bytes || bytes.length > 40 * 1024 * 1024) return json({ error: "No se pudo bajar ese video. Súbelo tú.", subir: true }, 502);
      const path = `${uid}/ref/ig-${m[1]}.mp4`;
      const up = await admin().storage.from("biblioteca").upload(path, bytes, { contentType: "video/mp4", upsert: true });
      if (up.error) return json({ error: "No se pudo guardar el video." }, 500);
      if (got.apifyUsd) await logCost(uid, "apify:instagram-scraper", got.apifyUsd);
      return json({ path, duracion: got.row.duration_s, autor: got.row.owner ?? "", fuente: got.row.url });
    }

    // ---------- Ingeniería inversa audiovisual (Gemini mira y escucha el video) ----------
    if (body.action === "analyze") {
      const path = typeof body.path === "string" && body.path.startsWith(`${uid}/ref/`) && !body.path.includes("..") && body.path.length < 300 ? body.path : null;
      if (!path) return json({ error: "Falta el video de referencia." }, 400);
      if (!Deno.env.get("GEMINI_API_KEY")) return json({ error: "El análisis no está disponible ahora." }, 503);
      const duracion = Math.max(1, Math.min(600, Number(body.duracion) || 0));
      const cortes = (Array.isArray(body.cortes) ? body.cortes : []).map(Number).filter(x => Number.isFinite(x) && x > 0 && x < duracion).slice(0, 80);
      const { data: file, error } = await admin().storage.from("biblioteca").download(path);
      if (error || !file) return json({ error: "No se encontró el video." }, 404);
      if (file.size > REF_MAX) return json({ error: "El video pesa más de 18 MB. Recórtalo o bájale la calidad y súbelo de nuevo." }, 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      try {
        const { out, cost, usage } = await geminiMedia([
          { inline_data: { mime_type: file.type || "video/mp4", data: b64m(bytes) } },
          { text: PROMPT_ANALISIS(cortes, duracion) },
        ], 12_000, 130_000, 0.2);
        await logMediaCost(uid, FN, cost, usage);
        const analisis = cleanAnalisis(out, duracion);
        if (!analisis) return json({ error: "La IA no pudo leer ese video. Prueba con otro." }, 502);
        return json({ analisis });
      } catch (e) {
        console.error(`${FN} analyze:`, e);
        return json({ error: e instanceof Error && e.name === "TimeoutError" ? "El análisis tardó demasiado. Prueba con un reel más corto." : "No se pudo analizar el video." }, 502);
      }
    }

    if (body.action === "status" || body.action === "file") {
      const id = typeof body.request_id === "string" && REQ_ID.test(body.request_id) ? body.request_id : null;
      if (!id) return json({ error: "request_id inválido" }, 400);
      const r = await falResult(id);
      if (body.action === "status") return json({ status: r.status === "COMPLETED" ? "done" : r.status === "FAILED" ? "failed" : "running" });
      if (!r.url) return json({ error: "El video todavía no está listo." }, 409);
      let u: URL;
      try { u = new URL(r.url); } catch { return json({ error: "Enlace inválido." }, 502); }
      if (u.protocol !== "https:" || !hostOk(u.hostname, FAL_HOSTS)) return json({ error: "Video de un sitio no permitido." }, 502);
      const v = await fetch(u);
      if (!v.ok || !v.body) return json({ error: "No se pudo bajar el video." }, 502);
      const len = Number(v.headers.get("content-length") ?? "");
      if (Number.isFinite(len) && len > FILE_MAX) { await v.body.cancel(); return json({ error: "El video es demasiado grande." }, 413); }
      return new Response(v.body, { status: 200, headers: { ...corsHeaders, "Content-Type": "video/mp4", "Cache-Control": "private, max-age=3600" } });
    }

    return json({ error: "Acción desconocida." }, 400);
  } catch (e) {
    console.error(`${FN}:`, e);
    return json({ error: "No se pudo completar." }, 500);
  }
});
