// APIMart para "Producir video" (yt-produce). Copia local de lo que Nexo extrae a
// `_shared/apimart.ts` (misma lógica que generate-ad-creative y video-studio, sin cambios de
// comportamiento). Al fusionar, el import de index.ts puede pasar a "../_shared/apimart.ts" y
// esta copia se borra. Las llaves solo salen de Deno.env.
const APIMART = "https://api.apimart.ai/v1";
export const IMAGE_MODEL = "gpt-image-2";
export const TTS_MODEL = "gpt-4o-mini-tts";

const key = () => Deno.env.get("APIMART_API_KEY") ?? "";
const headers = () => ({ Authorization: `Bearer ${key()}`, "Content-Type": "application/json" });
export const hasApimart = () => !!key();

/** Base64 sin dependencias (los imports jsr:@std han fallado al arrancar workers en Supabase). */
export function encodeBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Crea una tarea asíncrona (imagen o video). Devuelve el task_id o null. */
export async function apimartCreateTask(path: string, body: unknown): Promise<{ taskId: string | null; status: number }> {
  const r = await fetch(`${APIMART}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!r.ok) { console.error("apimart crear:", r.status, (await r.text()).slice(0, 300)); return { taskId: null, status: r.status }; }
  const d = await r.json();
  const taskId = d?.data?.[0]?.task_id ?? d?.data?.task_id ?? null;
  if (!taskId) console.error("apimart sin task_id:", JSON.stringify(d).slice(0, 300));
  return { taskId, status: r.status };
}

/** Consulta la tarea hasta que termina. Devuelve `result` o null si falla o se agota el tiempo. */
export async function apimartWaitTask(taskId: string, opts: { intervalMs: number; timeoutMs: number }): Promise<unknown | null> {
  const until = Date.now() + opts.timeoutMs;
  while (Date.now() < until) {
    await new Promise(res => setTimeout(res, opts.intervalMs));
    const t = await fetch(`${APIMART}/tasks/${encodeURIComponent(taskId)}`, { headers: headers() });
    if (!t.ok) continue;
    const d = (await t.json())?.data;
    if (d?.status === "failed" || d?.status === "cancelled") { console.error("apimart tarea:", d?.status); return null; }
    if (d?.status === "completed") return d?.result ?? null;
  }
  console.error("apimart: tiempo agotado");
  return null;
}

/** Todas las URLs https dentro de un resultado (la forma cambia según el modelo). */
export function pickUrls(result: unknown): { video: string | null; frame: string | null; image: string | null } {
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
  return { video, frame, image: urls.find(u => u !== video) ?? null };
}

/** Imagen con GPT Image 2 (~US$0,0081). Devuelve la imagen en base64 o null. */
export async function apimartImage(prompt: string, aspect: string, imageUrls?: string[]): Promise<{ b64: string; mime: string } | null> {
  if (!hasApimart()) return null;
  try {
    const body = (p: string) => ({ model: IMAGE_MODEL, prompt: p, size: aspect, resolution: "1k", n: 1, ...(imageUrls?.length ? { image_urls: imageUrls } : {}) });
    let c = await apimartCreateTask("/images/generations", body(prompt.slice(0, 2000)));
    if (!c.taskId && c.status === 400 && prompt.length > 1000) c = await apimartCreateTask("/images/generations", body(prompt.slice(0, 1000)));
    if (!c.taskId) return null;
    // GPT Image 2 suele tardar 15-40 s; tope ~90 s.
    const result = await apimartWaitTask(c.taskId, { intervalMs: 2500, timeoutMs: 90_000 }) as { images?: { url?: string | string[] }[] } | null;
    const first = result?.images?.[0]?.url;
    const url = Array.isArray(first) ? first[0] : first ?? pickUrls(result).image;
    if (typeof url !== "string" || !url.startsWith("https://")) return null;
    const img = await fetch(url);
    if (!img.ok) return null;
    const mime = img.headers.get("content-type")?.split(";")[0] || "image/png";
    return { b64: encodeBase64(new Uint8Array(await img.arrayBuffer())), mime };
  } catch (e) {
    console.error("apimart imagen:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Voz con gpt-4o-mini-tts (POST /v1/audio/speech, ~US$0,015/min). La documentación de APIMart
 * lista wav/opus/aac/flac/pcm y no menciona `instructions` (OpenAI sí acepta mp3 e instructions):
 * se intenta mp3 + instructions, luego mp3 solo y al final wav. Lo que funcione se recuerda en el
 * worker para no repetir intentos. Devuelve los bytes y su tipo, o null.
 */
let ttsMode: 0 | 1 | 2 = 0;
export async function apimartSpeech(opts: { input: string; voice: string; format?: "mp3"; speed?: number; instructions?: string }): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!hasApimart()) return null;
  const attempts: { response_format: string; instructions?: string }[] = [
    { response_format: opts.format ?? "mp3", instructions: opts.instructions },
    { response_format: opts.format ?? "mp3" },
    { response_format: "wav" },
  ];
  for (let i = ttsMode; i < attempts.length; i++) {
    const a = attempts[i];
    if (i === 0 && !a.instructions) continue;
    try {
      const r = await fetch(`${APIMART}/audio/speech`, {
        method: "POST", headers: headers(),
        body: JSON.stringify({ model: TTS_MODEL, input: opts.input.slice(0, 4096), voice: opts.voice, speed: opts.speed ?? 1, ...a }),
      });
      if (r.status === 400 || r.status === 422) { console.error("apimart voz 400:", (await r.text()).slice(0, 200)); continue; }
      if (!r.ok) { console.error("apimart voz:", r.status, (await r.text()).slice(0, 200)); return null; }
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.length < 500) { console.error("apimart voz: audio vacío"); return null; }
      ttsMode = i as 0 | 1 | 2;
      const ct = r.headers.get("content-type")?.split(";")[0] ?? "";
      const mime = /audio\//.test(ct) ? ct : a.response_format === "wav" ? "audio/wav" : "audio/mpeg";
      return { bytes, mime };
    } catch (e) {
      console.error("apimart voz:", e instanceof Error ? e.message : e);
      return null;
    }
  }
  return null;
}
