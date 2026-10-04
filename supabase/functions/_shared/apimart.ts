// SUPERNOVA — Cliente compartido de APIMart (plan ATLAS, 04-oct-2026). Sacado de código que ya
// funciona en generate-ad-creative (imagen) y video-studio (tareas y URLs), sin cambiar comportamiento.
// La llave sale SOLO de Deno.env (APIMART_API_KEY). Ninguna función cobra aquí: el cobro va antes,
// en edge_guard_charge, y el reembolso lo hace quien llama si esto devuelve null.
//
// Docs: https://docs.apimart.ai/_llms/en/api-manual.md
//  · Imagen gpt-image-2: POST /v1/images/generations (async) → GET /v1/tasks/{id}.
//    Se cobra por resolución (1k/2k/4k); `image_urls` (hasta 15, URL pública o data URI) activa
//    imagen a imagen. La doc no indica recargo por referencias.
//  · Voz: POST /v1/audio/speech, gpt-4o-mini-tts. La doc lista wav/opus/aac/flac/pcm (no mp3) y
//    no menciona `instructions`: se intenta mp3 + instructions → mp3 → wav (ver apimartSpeech).

export const APIMART = "https://api.apimart.ai/v1";
export const APIMART_IMAGE_MODEL = "gpt-image-2";

export type ApimartAspect = "1:1" | "4:5" | "9:16" | "16:9";

function headers(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

// Base64 sin dependencias (los imports jsr:@std han fallado al arrancar workers en Supabase).
export function encodeBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Crea una tarea asíncrona. Devuelve el task_id o null. */
export async function apimartCreateTask(path: string, body: Record<string, unknown>): Promise<string | null> {
  const key = Deno.env.get("APIMART_API_KEY");
  if (!key) return null;
  try {
    const r = await fetch(`${APIMART}${path}`, { method: "POST", headers: headers(key), body: JSON.stringify(body) });
    if (!r.ok) { console.error("apimart crear:", r.status, (await r.text()).slice(0, 300)); return null; }
    const created = await r.json();
    const taskId = created?.data?.[0]?.task_id ?? created?.data?.task_id;
    if (typeof taskId !== "string" || !taskId) { console.error("apimart sin task_id:", JSON.stringify(created).slice(0, 300)); return null; }
    return taskId;
  } catch (e) {
    console.error("apimart crear:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Espera a que una tarea termine. Devuelve `data` de la tarea completada o null (falló / tiempo agotado). */
// deno-lint-ignore no-explicit-any
export async function apimartWaitTask(taskId: string, opts: { intervalMs?: number; timeoutMs?: number } = {}): Promise<any | null> {
  const key = Deno.env.get("APIMART_API_KEY");
  if (!key) return null;
  const interval = Math.max(500, opts.intervalMs ?? 2500);
  const deadline = Date.now() + Math.max(interval, opts.timeoutMs ?? 90_000);
  while (Date.now() < deadline) {
    await new Promise(res => setTimeout(res, interval));
    try {
      const t = await fetch(`${APIMART}/tasks/${encodeURIComponent(taskId)}`, { headers: headers(key) });
      if (!t.ok) { await t.text(); continue; }
      const d = (await t.json())?.data;
      if (d?.status === "failed" || d?.status === "cancelled") { console.error("apimart tarea:", d?.status); return null; }
      if (d?.status === "completed") return d;
    } catch { /* red: se reintenta */ }
  }
  console.error("apimart: tiempo agotado");
  return null;
}

/** Busca la URL de video y la de una imagen (último cuadro) dentro de un resultado de APIMart. */
export function pickUrls(result: unknown): { video: string | null; frame: string | null } {
  const urls: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") { if (/^https:\/\//.test(v)) urls.push(v); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(result);
  const isVideo = (u: string) => /\.(mp4|mov|webm)(\?|$)/i.test(u) || /video/i.test(u);
  const isImage = (u: string) => /\.(png|jpe?g|webp)(\?|$)/i.test(u);
  const video = urls.find(isVideo) ?? null;
  const frame = urls.find(u => u !== video && isImage(u)) ?? null;
  return { video, frame };
}

/**
 * Imagen con gpt-image-2. `imageUrls` (opcional, máx. 15 según la doc; aquí se usan ≤ 3) activa
 * imagen a imagen: SOLO URLs firmadas por el servidor de carpetas del propio usuario, nunca del cliente.
 * El texto va entero (ahí están las reglas: sin dinero, sin marcas); si APIMart lo rechaza por largo,
 * se reintenta recortado a 1.000 caracteres. Hasta ~90 s (suele tardar 15-40 s).
 */
export async function apimartImage(prompt: string, aspect: string, imageUrls?: string[]): Promise<{ b64: string; mime: string; cost: number | null } | null> {
  const key = Deno.env.get("APIMART_API_KEY");
  if (!key) return null;
  const refs = (imageUrls ?? []).filter(u => typeof u === "string" && u.startsWith("https://")).slice(0, 15);
  try {
    const create = (p: string) => fetch(`${APIMART}/images/generations`, {
      method: "POST", headers: headers(key),
      body: JSON.stringify({
        model: APIMART_IMAGE_MODEL, prompt: p, size: aspect, resolution: "1k", n: 1,
        ...(refs.length ? { image_urls: refs } : {}),
      }),
    });
    let r = await create(prompt.slice(0, 2000));
    if (r.status === 400 && prompt.length > 1000) { await r.text(); r = await create(prompt.slice(0, 1000)); }
    if (!r.ok) { console.error("apimart crear:", r.status, (await r.text()).slice(0, 300)); return null; }
    const created = await r.json();
    const taskId = created?.data?.[0]?.task_id ?? created?.data?.task_id;
    if (!taskId) { console.error("apimart sin task_id:", JSON.stringify(created).slice(0, 300)); return null; }
    const d = await apimartWaitTask(String(taskId), { intervalMs: 2500, timeoutMs: 90_000 });
    if (!d) return null;
    const first = d?.result?.images?.[0]?.url;
    const url = Array.isArray(first) ? first[0] : first;
    if (typeof url !== "string" || !url.startsWith("https://")) return null;
    const img = await fetch(url);
    if (!img.ok) return null;
    const mime = img.headers.get("content-type")?.split(";")[0] || "image/png";
    const cost = typeof d?.cost === "number" && Number.isFinite(d.cost) ? d.cost : null;
    return { b64: encodeBase64(new Uint8Array(await img.arrayBuffer())), mime, cost };
  } catch (e) {
    console.error("apimart:", e instanceof Error ? e.message : e);
    return null;
  }
}

export const APIMART_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
export type ApimartVoice = typeof APIMART_VOICES[number];

export const TTS_MODEL = "gpt-4o-mini-tts";
export const hasApimart = () => !!Deno.env.get("APIMART_API_KEY");

/**
 * Voz con gpt-4o-mini-tts (POST /v1/audio/speech, ~US$0,015/min, máx. 4.096 caracteres). La doc de
 * APIMart lista wav/opus/aac/flac/pcm y no menciona `instructions` (OpenAI sí acepta mp3 e
 * instructions): se intenta mp3 + instructions, luego mp3 solo y al final wav. Lo que funcione se
 * recuerda en el worker para no repetir intentos. Devuelve los bytes y su tipo, o null.
 * (Versión de ECO / yt-produce, unificada aquí por Nexo el 04-oct-2026.)
 */
let ttsMode: 0 | 1 | 2 = 0;
export async function apimartSpeech(opts: {
  input: string; voice: ApimartVoice | string; format?: "mp3"; speed?: number; instructions?: string;
}): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const key = Deno.env.get("APIMART_API_KEY");
  if (!key) return null;
  const input = String(opts.input ?? "").slice(0, 4096);
  if (!input.trim()) return null;
  const voice = (APIMART_VOICES as readonly string[]).includes(opts.voice) ? opts.voice : "alloy";
  const speed = typeof opts.speed === "number" && Number.isFinite(opts.speed) ? Math.min(4, Math.max(0.25, opts.speed)) : 1;
  const attempts: { response_format: string; instructions?: string }[] = [
    { response_format: opts.format ?? "mp3", instructions: opts.instructions?.slice(0, 500) },
    { response_format: opts.format ?? "mp3" },
    { response_format: "wav" },
  ];
  for (let i = ttsMode; i < attempts.length; i++) {
    const a = attempts[i];
    if (i === 0 && !a.instructions) continue;
    try {
      const r = await fetch(`${APIMART}/audio/speech`, {
        method: "POST", headers: headers(key),
        body: JSON.stringify({ model: TTS_MODEL, input, voice, speed, ...a }),
      });
      if (r.status === 400 || r.status === 422) { console.error("apimart voz 400:", (await r.text()).slice(0, 200)); continue; }
      if (!r.ok) { console.error("apimart voz:", r.status, (await r.text()).slice(0, 200)); return null; }
      const ct = r.headers.get("content-type")?.split(";")[0] ?? "";
      if (ct.includes("application/json")) { console.error("apimart voz json:", (await r.text()).slice(0, 200)); return null; }
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.length < 500) { console.error("apimart voz: audio vacío"); return null; }
      ttsMode = i as 0 | 1 | 2;
      const mime = /audio\//.test(ct) ? ct : a.response_format === "wav" ? "audio/wav" : "audio/mpeg";
      return { bytes, mime };
    } catch (e) {
      console.error("apimart voz:", e instanceof Error ? e.message : e);
      return null;
    }
  }
  return null;
}
