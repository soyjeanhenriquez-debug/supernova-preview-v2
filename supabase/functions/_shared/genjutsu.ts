// SUPERNOVA — Genjutsu (07-oct-2026): laboratorio oculto SOLO para Jean. Video de referencia con
// Seedance 2.0 (reference-to-video) por Higgsfield o APIMart. Sin créditos ni planes.
// Compuerta en el SERVIDOR: el token debe ser de su usuario (id y correo). Las llaves viven en los
// secrets de Supabase (APIMART_API_KEY, HF_API_KEY_ID, HF_API_KEY_SECRET) y nunca salen al cliente.
//
// Proveedores (documentación leída el 07-oct-2026):
//  · Higgsfield — POST https://api.higgsfield.ai/bytedance/seedance-2.0/reference-to-video
//    Auth: "Authorization: Key {HF_API_KEY_ID}:{HF_API_KEY_SECRET}". Cuerpo: prompt, video_urls[≤3],
//    image_urls[≤9], duration 4–15, aspect_ratio (16:9, 4:3, 1:1, 3:4, 9:16, 21:9), resolution.
//    Respuesta: { status, request_id, status_url, cancel_url }. Estado: GET /requests/{id}/status →
//    queued | in_progress | completed | failed | nsfw | canceled; video en video.url (≥7 días).
//  · APIMart — POST https://api.apimart.ai/v1/videos/generations, Bearer, model "seedance-2.0".
//    Cuerpo: prompt, video_urls[≤3, total 1,8–15,2 s, 480p–720p], image_urls[≤9], duration 4–15,
//    size (16:9, 9:16, 1:1, 4:3, 3:4, 21:9, adaptive), resolution. Respuesta: data[0].task_id.
//    Estado: GET /v1/tasks/{id} → data.status pending | processing | completed | failed.
import { admin } from "./media.ts";
import { APIMART, pickUrls } from "./apimart.ts";

export const OWNER_ID = "2687ca65-02c7-40db-b2fc-8ed0d57a4424";
const OWNER_EMAIL = "soyjeanhenriquez@gmail.com";
export const BUCKET = "genjutsu";
export type Provider = "higgsfield" | "apimart";
export type JobStatus = "queued" | "in_progress" | "completed" | "failed";
const HF = "https://api.higgsfield.ai";

/** Devuelve el id si quien llama es Jean; si no, null. Nunca confía en datos del cliente. */
export async function owner(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data } = await admin().auth.getUser(token);
  const u = data?.user;
  return u && u.id === OWNER_ID && (u.email ?? "").toLowerCase() === OWNER_EMAIL ? u.id : null;
}

/** Ruta de Storage de Jean, sin trucos ({uid}/…, sin ".."). */
export function ownPath(uid: string, p: unknown): string | null {
  if (typeof p !== "string" || p.length > 300 || !p.startsWith(`${uid}/`) || p.includes("..") || p.includes("//")) return null;
  return p;
}

/**
 * Lo que cada modo le pide al modelo antes del prompt de Jean (Seedance reference-to-video):
 *  · movimiento: los personajes de las imágenes hacen exactamente los movimientos del video.
 *  · objetos: se cambia el objeto/producto/ropa del video por el de las imágenes; lo demás igual.
 */
export const MODE_PROMPT: Record<"movimiento" | "objetos", string> = {
  movimiento: "Motion transfer: the character(s) from the reference images perform exactly the same movements, timing, camera motion and framing as the reference video. Keep their faces, bodies, clothes and identity from the images.",
  objetos: "Object swap: keep the reference video exactly the same (people, movement, camera, light, background) and replace only the main object, product or clothing with the one from the reference images, matching its shape, colors and details.",
};

export async function signed(path: string): Promise<string | null> {
  const { data } = await admin().storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

const hfAuth = (): string | null => {
  const id = Deno.env.get("HF_API_KEY_ID"), secret = Deno.env.get("HF_API_KEY_SECRET");
  return id && secret ? `Key ${id}:${secret}` : null;
};
const apimartKey = () => Deno.env.get("APIMART_API_KEY") ?? null;
export const providerReady = (p: Provider) => (p === "higgsfield" ? !!hfAuth() : !!apimartKey());

const errText = async (r: Response) => {
  const t = (await r.text()).slice(0, 300);
  try { const j = JSON.parse(t); return String(j?.error?.message ?? j?.detail ?? j?.message ?? t).slice(0, 300); } catch { return t; }
};

export type SubmitInput = { prompt: string; videoUrl: string; imageUrls: string[]; duration: number; aspect: string; idempotency: string };

/** Manda el trabajo al proveedor. Devuelve el id de su tarea o un error legible. */
export async function submit(p: Provider, i: SubmitInput): Promise<{ taskId: string } | { error: string }> {
  if (p === "higgsfield") {
    const auth = hfAuth();
    if (!auth) return { error: "Faltan HF_API_KEY_ID y HF_API_KEY_SECRET en los secrets de Supabase." };
    const body: Record<string, unknown> = { prompt: i.prompt, video_urls: [i.videoUrl], duration: i.duration, aspect_ratio: i.aspect, resolution: "720p" };
    if (i.imageUrls.length) body.image_urls = i.imageUrls;
    const r = await fetch(`${HF}/bytedance/seedance-2.0/reference-to-video`, {
      method: "POST", headers: { Authorization: auth, "Content-Type": "application/json", "Idempotency-Key": i.idempotency },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) return { error: `Higgsfield ${r.status}: ${await errText(r)}` };
    const j = await r.json();
    return typeof j?.request_id === "string" ? { taskId: j.request_id } : { error: "Higgsfield no devolvió request_id." };
  }
  const key = apimartKey();
  if (!key) return { error: "Falta APIMART_API_KEY en los secrets de Supabase." };
  const body: Record<string, unknown> = { model: "seedance-2.0", prompt: i.prompt, video_urls: [i.videoUrl], duration: i.duration, size: i.aspect, resolution: "720p" };
  if (i.imageUrls.length) body.image_urls = i.imageUrls;
  const r = await fetch(`${APIMART}/videos/generations`, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) return { error: `APIMart ${r.status}: ${await errText(r)}` };
  const j = await r.json();
  const id = Array.isArray(j?.data) ? j.data[0]?.task_id : j?.data?.task_id;
  return typeof id === "string" ? { taskId: id } : { error: "APIMart no devolvió task_id." };
}

/** Consulta el estado en el proveedor y lo normaliza. */
export async function poll(p: Provider, taskId: string): Promise<{ status: JobStatus; resultUrl?: string; error?: string } | null> {
  try {
    if (p === "higgsfield") {
      const auth = hfAuth();
      if (!auth) return { status: "failed", error: "Faltan las llaves de Higgsfield." };
      const r = await fetch(`${HF}/requests/${encodeURIComponent(taskId)}/status`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) { await r.text(); return null; }
      const j = await r.json();
      const s = String(j?.status ?? "");
      if (s === "completed") return typeof j?.video?.url === "string" ? { status: "completed", resultUrl: j.video.url } : { status: "failed", error: "Terminó sin video." };
      if (s === "failed" || s === "nsfw" || s === "canceled") return { status: "failed", error: s === "nsfw" ? "El proveedor lo marcó como contenido no permitido." : `Higgsfield: ${s}` };
      return { status: s === "in_progress" ? "in_progress" : "queued" };
    }
    const key = apimartKey();
    if (!key) return { status: "failed", error: "Falta la llave de APIMart." };
    const r = await fetch(`${APIMART}/tasks/${encodeURIComponent(taskId)}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) { await r.text(); return null; }
    const d = (await r.json())?.data;
    const s = String(d?.status ?? "");
    if (s === "completed") {
      const { video } = pickUrls(d?.result ?? d);
      return video ? { status: "completed", resultUrl: video } : { status: "failed", error: "Terminó sin video." };
    }
    if (s === "failed" || s === "cancelled") return { status: "failed", error: String(d?.error?.message ?? d?.fail_reason ?? `APIMart: ${s}`).slice(0, 300) };
    return { status: s === "processing" ? "in_progress" : "queued" };
  } catch {
    return null; // red: se reintenta en la próxima consulta
  }
}
