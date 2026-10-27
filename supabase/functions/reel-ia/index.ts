// SUPERNOVA — Reel "Esta IA hace X" (24-oct-2026, ingeniería inversa de un reel que pasó Jean).
// Abierto a clientes el 26-oct-2026 (antes solo Jean, sin créditos). Usuario real + cobro en el servidor ANTES de gastar
// (edge_guard_charge, precios en credit_prices) y devolución si falla. Las imágenes y las animaciones van por yt-produce,
// avatar-studio y video-studio (que cobran como siempre); aquí solo lo nuevo:
//
//   config            → qué llaves hay (ElevenLabs, fal).
//   voice    { text, voice_id? } → ElevenLabs text-to-speech/with-timestamps: { audio (base64 mp3), alignment (tiempo
//                       de cada letra) } para cortar escenas y subtítulos. Cobra reel_voz_600 / reel_voz_1200 por largo.
//                       Clientes: solo voces de la biblioteca (premade). Jean: además su voz (ELEVENLABS_VOICE_ID).
//   capture  { url, mobile? } → captura real de la web de la herramienta con Microlink (gratis, 50 al día; la URL
//                       solo puede ser http(s) pública). Devuelve la imagen en base64.
//   presenter { image: { bucket, path }, audio (base64 wav ≤ 12 s) } → Kling AI Avatar v2 en fal (imagen + audio:
//                       los labios siguen la voz). Cobra reel_lip_6 / reel_lip_12 según los segundos MEDIDOS en el WAV
//                       (nunca los que manda el navegador). Anota la toma en reel_ia_tomas. Devuelve request_id.
//   status   { request_id } → estado en la cola de fal (solo tomas propias). Si fal la marca fallida, devuelve el cobro
//                       una sola vez.
//   file     { request_id } → el MP4 terminado, en streaming con CORS (solo hosts de fal, solo tomas propias).
//   fetch_link { url } (Reel Studio, 25-oct-2026) → un Reel de Instagram: lo lee con Apify (caché global de
//                       reelSource), baja el video y lo guarda en biblioteca/{uid}/ref/ para analizarlo y sacar
//                       miniaturas. TikTok y YouTube: no se pueden leer por enlace → se pide subir el video.
//   analyze  { path, cortes, duracion } → Gemini MIRA y ESCUCHA el video de referencia (biblioteca/{uid}/ref/…,
//                       hasta 18 MB) y devuelve su ingeniería inversa audiovisual (reelPlan.ts: cleanAnalisis). Cobra
//                       reel_analyze (25, como Analiza un Reel).
//   config, voices, capture, fetch_link: sin cobro, con tope por hora y por día (edge_guard).
// Costos al proveedor en ai_usage: ElevenLabs ≤ US$0,00022/carácter, Kling Avatar US$0,0562/s.
// Ninguna llave sale al cliente. Docs leídas el 24-oct-2026: elevenlabs.io/docs (with-timestamps), microlink.io/docs.
import { corsHeaders } from "npm:@supabase/supabase-js@2.117.1/cors";
import { OWNER_ID } from "../_shared/genjutsu.ts";
import { admin, billingHeaders, caller, charge, fal, FAL_KEY, json, refund, type Gate } from "../_shared/media.ts";
import { ownStoragePath } from "../_shared/paths.ts";
import { wavSeconds } from "../_shared/wav.ts";
import { cleanAnalisis, PROMPT_ANALISIS } from "../_shared/reelPlan.ts";
import { b64 as b64m, geminiMedia, logMediaCost } from "../_shared/geminiMedia.ts";
import { getReel, REEL_RE } from "../_shared/reelSource.ts";

const FN = "reel-ia";
const AVATAR = "fal-ai/kling-video/ai-avatar/v2/standard";
const AVATAR_USD_PER_SEC = 0.0562;
const ELEVEN_USD_PER_CHAR = 0.00022; // tope de los planes de pago de ElevenLabs (Jean tiene 300.000 caracteres/mes, 26-oct-2026)
const MAX_TEXT = 3000; // Jean
const MAX_TEXT_CLIENTE = 1200; // ≈ 80 s de voz: el tope del precio reel_voz_1200
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

/** Tope por hora y por día para lo que no cobra (lector de Instagram, capturas, lista de voces). */
async function tope(uid: string, accion: string, hora: number, dia: number): Promise<Response | null> {
  const { data: g, error } = await admin().rpc("edge_guard", { p_user_id: uid, p_fn: `${FN}:${accion}`, p_max_hour: hora, p_max_day: dia });
  if (error) return json({ error: "No se pudo verificar el acceso. Intenta de nuevo." }, 503);
  if (g?.ok === true) return null;
  return g?.reason === "rate_limited" ? json({ error: "Alcanzaste el límite por ahora. Intenta en un rato." }, 429) : json({ error: "Tu cuenta no tiene acceso activo." }, 403);
}

/** ¿Es una voz de la biblioteca de ElevenLabs (premade)? Las clonadas de la cuenta son de Jean. */
async function vozDeBiblioteca(key: string, id: string): Promise<boolean> {
  const r = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(id)}`, { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!r?.ok) return false;
  const v = await r.json().catch(() => null);
  return v?.category === "premade";
}

const conCobro = (g: Gate, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify({ ...body, billing: { charged: g.charged, balance: g.balance } }), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json", ...billingHeaders(g) },
  });

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
    const who = await caller(req);
    if (!who) return json({ error: "Inicia sesión para usar Reel Studio." }, 401);
    const uid = who.id;
    const jean = uid === OWNER_ID;
    const raw = await req.text();
    if (raw.length > MAX_AUDIO_B64 + 4000) return json({ error: "La solicitud es demasiado grande." }, 413);
    let body: Record<string, unknown> = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return json({ error: "Solicitud inválida." }, 400); }

    if (body.action === "config") return json({ eleven: !!elevenKey() && (!jean || !!voiceId()), fal: !!FAL_KEY, propia: jean && !!voiceId() });

    // ---------- voces de la cuenta (Guardián del Creador, 24-oct-2026) ----------
    // Antes había que pegar el id de una voz. Ahora la app trae la lista con su nombre y una muestra para escuchar.
    if (body.action === "voices") {
      const key = elevenKey();
      if (!key) return json({ voices: [] });
      const limit = await tope(uid, "voices", 30, 200);
      if (limit) return limit;
      const r = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
      if (!r?.ok) { console.error("elevenlabs voices:", r?.status); return json({ voices: [] }); }
      const d = await r.json().catch(() => null);
      const propia = voiceId();
      // deno-lint-ignore no-explicit-any
      // Clientes: solo las voces de la biblioteca (premade). Las clonadas de la cuenta son de Jean.
      const lista = (Array.isArray(d?.voices) ? d.voices : []).filter((v: any) => typeof v?.voice_id === "string" && VOICE_RE.test(v.voice_id) && (jean || v.category === "premade"))
        // deno-lint-ignore no-explicit-any
        .slice(0, 60).map((v: any) => ({
          id: v.voice_id as string,
          nombre: String(v.name ?? "Voz").slice(0, 60),
          muestra: typeof v.preview_url === "string" && v.preview_url.startsWith("https://") ? v.preview_url : null,
          propia: jean && v.voice_id === propia,
          clonada: v.category === "cloned" || v.category === "professional",
        }));
      return json({ voices: lista });
    }

    // ---------- voz (ElevenLabs, con tiempos) ----------
    if (body.action === "voice") {
      // Otra voz de tu cuenta de ElevenLabs (Mi identidad); si no, tu voz clonada de los secretos.
      const pedida = typeof body.voice_id === "string" && VOICE_RE.test(body.voice_id) ? body.voice_id : null;
      const key = elevenKey(), vid = pedida ?? (jean ? voiceId() : null);
      if (!key) { console.error("voz: falta ELEVENLABS_API_KEY"); return json({ error: "La voz no está disponible en este momento. No se te cobró nada." }, 503); }
      if (!vid) return json({ error: "Elige una voz en Opciones avanzadas." }, 400);
      if (!jean && !(await vozDeBiblioteca(key, vid))) return json({ error: "Esa voz no está disponible. Elige otra en Opciones avanzadas." }, 400);
      const text = String(body.text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
      if (text.split(" ").length < 5) return json({ error: "Escribe el guion completo (al menos una frase)." }, 400);
      if (!jean && text.length > MAX_TEXT_CLIENTE) return json({ error: `El guion es muy largo para un reel: ${text.length} caracteres. El máximo es ${MAX_TEXT_CLIENTE} (unos 80 segundos).` }, 400);
      const g = await charge(FN, uid, text.length <= 600 ? "reel_voz_600" : "reel_voz_1200", `Reel Studio · voz (${text.length} caracteres)`, 20, 60);
      if (g instanceof Response) return g;
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
        await refund(g.txId, `elevenlabs ${r.status}`);
        return json({ error: r.status === 404 ? "Esa voz ya no existe en tu cuenta. Elige otra en Opciones avanzadas." : r.status === 401 ? "La voz no está disponible en este momento. No se te cobró nada." : "La voz no respondió. Toca de nuevo en un momento." }, 502);
      }
      const d = await r.json();
      if (typeof d?.audio_base64 !== "string" || !d?.alignment) { await refund(g.txId, "voz incompleta"); return json({ error: "La voz no llegó completa. No se te cobró. Toca de nuevo." }, 502); }
      await logCost(uid, "elevenlabs:eleven_multilingual_v2", Math.round(text.length * ELEVEN_USD_PER_CHAR * 10000) / 10000);
      return conCobro(g, { audio: d.audio_base64, alignment: d.alignment, chars: text.length });
    }

    // ---------- captura real de la web (Microlink) ----------
    if (body.action === "capture") {
      const url = publicUrl(body.url);
      if (!url) return json({ error: "Pon la dirección completa de la web (https://…)." }, 400);
      const limit = await tope(uid, "capture", 30, 100);
      if (limit) return limit;
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
      if (!FAL_KEY) { console.error("presentador: falta FAL_KEY"); return json({ error: "Las tomas de ti hablando no están disponibles ahora. No se te cobró nada." }, 503); }
      const ref = (body.image ?? {}) as { bucket?: unknown; path?: unknown };
      const bucket = ref.bucket === "estudio-avatar" ? "estudio-avatar" : ref.bucket === "personajes" ? "personajes" : ref.bucket === "creativos" ? "creativos" : null;
      const path = bucket ? ownStoragePath(uid, ref.path) : null;
      if (!bucket || !path) return json({ error: "Elige la imagen del presentador." }, 400);
      const audio = typeof body.audio === "string" && body.audio.length <= MAX_AUDIO_B64 ? body.audio : null;
      if (!audio) return json({ error: "Falta el audio del presentador (máximo 12 s)." }, 400);
      const bytes = Uint8Array.from(atob(audio), c => c.charCodeAt(0));
      // El precio sale de los segundos MEDIDOS en el audio, nunca de lo que manda el navegador.
      const medidos = wavSeconds(bytes);
      if (medidos === null || medidos < 0.3) return json({ error: "El audio del presentador no es válido." }, 400);
      if (medidos > 12.2) return json({ error: "Cada toma hablando dura máximo 12 segundos." }, 400);
      const seconds = Math.max(1, Math.ceil(medidos * 10) / 10);
      const db = admin();
      const { data: img } = await db.storage.from(bucket).createSignedUrl(path, 60 * 60);
      if (!img?.signedUrl) return json({ error: "No se encontró la imagen del presentador." }, 400);
      const accion = seconds <= 6 ? "reel_lip_6" : "reel_lip_12";
      const g = await charge(FN, uid, accion, `Reel Studio · toma hablando ${Math.round(seconds)} s`, 20, 80);
      if (g instanceof Response) return g;
      const audioPath = `${uid}/reel-ia-${crypto.randomUUID()}.wav`;
      const up = await db.storage.from("avatar-audio").upload(audioPath, bytes, { contentType: "audio/wav" });
      if (up.error) { await refund(g.txId, "audio sin guardar"); return json({ error: "No se pudo guardar el audio. No se te cobró." }, 500); }
      const { data: au } = await db.storage.from("avatar-audio").createSignedUrl(audioPath, 60 * 60);
      if (!au?.signedUrl) { await refund(g.txId, "audio sin firmar"); return json({ error: "No se pudo preparar el audio. No se te cobró." }, 500); }
      const q = await fal(`https://queue.fal.run/${AVATAR}`, {
        method: "POST",
        body: JSON.stringify({ image_url: img.signedUrl, audio_url: au.signedUrl, prompt: "Person talking directly to the camera with natural expressions and subtle hand gestures, social media video." }),
      });
      if (!q.ok) {
        const t = (await q.text()).slice(0, 300);
        console.error("fal avatar:", q.status, t);
        await refund(g.txId, `fal avatar ${q.status}`);
        // 24-oct-2026: fal respondió 403 "Exhausted balance" y la app solo decía "falló" en cada tramo.
        if (/balance|billing/i.test(t)) return json({ error: jean ? "Se acabó el saldo para tus tomas hablando (cuenta de videos). Recárgalo y toca Regenerar." : "Las tomas hablando no están disponibles en este momento. No se te cobró.", saldo: true }, jean ? 402 : 503);
        return json({ error: q.status === 422 ? "El generador rechazó la imagen o el audio. No se te cobró." : "El generador del presentador no está disponible ahora. No se te cobró." }, 503);
      }
      const queued = await q.json();
      if (typeof queued?.request_id !== "string" || !REQ_ID.test(queued.request_id)) { await refund(g.txId, "fal sin request_id"); return json({ error: "El generador no devolvió el trabajo. No se te cobró." }, 502); }
      const { error: insErr } = await db.from("reel_ia_tomas").insert({ request_id: queued.request_id, user_id: uid, tx_id: g.txId, seconds, action: accion });
      if (insErr) console.error("reel_ia_tomas:", insErr.message);
      await logCost(uid, `fal:${AVATAR}`, Math.round(seconds * AVATAR_USD_PER_SEC * 1000) / 1000);
      return conCobro(g, { request_id: queued.request_id });
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
      const limit = await tope(uid, "fetch_link", 15, 40);
      if (limit) return limit;
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
      const g = await charge(FN, uid, "reel_analyze", "Reel Studio · analizar tu referencia", 10, 30);
      if (g instanceof Response) return g;
      try {
        const { out, cost, usage } = await geminiMedia([
          { inline_data: { mime_type: file.type || "video/mp4", data: b64m(bytes) } },
          { text: PROMPT_ANALISIS(cortes, duracion) },
        ], 12_000, 130_000, 0.2);
        await logMediaCost(uid, FN, cost, usage);
        const analisis = cleanAnalisis(out, duracion);
        if (!analisis) { await refund(g.txId, "análisis ilegible"); return json({ error: "La IA no pudo leer ese video. No se te cobró. Prueba con otro." }, 502); }
        return conCobro(g, { analisis });
      } catch (e) {
        console.error(`${FN} analyze:`, e);
        await refund(g.txId, "análisis falló");
        return json({ error: e instanceof Error && e.name === "TimeoutError" ? "El análisis tardó demasiado. No se te cobró. Prueba con un reel más corto." : "No se pudo analizar el video. No se te cobró." }, 502);
      }
    }

    if (body.action === "status" || body.action === "file") {
      const id = typeof body.request_id === "string" && REQ_ID.test(body.request_id) ? body.request_id : null;
      if (!id) return json({ error: "No encontramos ese video. Toca Regenerar." }, 400);
      // Solo tus tomas. Las de Jean de antes del 26-oct no tienen fila: él puede seguir viéndolas.
      const db = admin();
      const { data: toma } = await db.from("reel_ia_tomas").select("user_id, tx_id, status, refunded_at").eq("request_id", id).maybeSingle();
      if (toma ? toma.user_id !== uid : !jean) return json({ error: "No encontramos ese video. Toca Regenerar." }, 404);
      const r = await falResult(id);
      if (toma && toma.status === "running" && (r.status === "COMPLETED" || r.status === "FAILED")) {
        const status = r.status === "COMPLETED" ? "done" : "failed";
        // Fallida: se devuelve UNA vez (la fila se marca antes de devolver, así dos consultas a la vez no devuelven dos veces).
        const { data: marcada } = await db.from("reel_ia_tomas")
          .update({ status, updated_at: new Date().toISOString(), ...(status === "failed" ? { refunded_at: new Date().toISOString() } : {}) })
          .eq("request_id", id).eq("status", "running").select("tx_id").maybeSingle();
        if (marcada && status === "failed") await refund(marcada.tx_id, "fal marcó la toma como fallida");
      }
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
