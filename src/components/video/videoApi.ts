import { supabase } from "@/integrations/supabase/client";
import { fnErrorMessage, fnHeaders, invokeErrorMessage, readBilling, type ServerBilling } from "@/lib/fnAuth";

/**
 * Llamadas a la función video-studio (KINEMA, 04-oct-2026). El servidor cobra antes de generar y
 * devuelve los créditos si falla; aquí solo se refleja lo que dijo el servidor.
 */
export type VideoKind = "clip" | "serie" | "anuncio" | "ugc" | "yt_scene";
export type VideoJob = {
  id: string; status: "queued" | "running" | "done" | "failed"; result_url: string | null;
  last_frame_url?: string | null; prompt: string; seconds: number; created_at?: string; kind?: VideoKind | null; template?: string | null;
};
export type CreateBody = {
  prompt: string; seconds: 5 | 10; size: "9:16" | "16:9" | "1:1"; audio?: boolean; kind: VideoKind; template?: string | null;
  product_id?: string; from_job_id?: string; image_path?: string; image_bucket?: "creativos" | "personajes";
};

export async function invokeVideo<T = { job: VideoJob; billing?: { charged: number; balance: number | null }; error?: string; progress?: number | null }>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("video-studio", { body });
  if (error) throw new Error(await invokeErrorMessage(error, "No se pudo crear el video."));
  return data as T;
}

export const createVideo = (b: CreateBody) => invokeVideo(b);

/** Espera a que el clip termine (consulta cada 6 s, hasta ~6 min). No cobra nada. */
export async function waitForVideo(jobId: string, onProgress?: (p: number | null) => void): Promise<VideoJob> {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 6000));
    const r = await invokeVideo({ action: "status", job_id: jobId });
    onProgress?.(typeof r.progress === "number" ? r.progress : null);
    if (r.job.status === "done" || r.job.status === "failed") return r.job;
  }
  throw new Error("El video está tardando más de lo normal. Revisa en unos minutos en \"Tus videos de hoy\".");
}

/** ¿UGC con presentador está abierto para esta cuenta? (interruptor de admin; gratis). */
export async function loadVideoConfig(): Promise<{ ready: boolean; ugc: boolean }> {
  try {
    const r = await invokeVideo<{ ready?: boolean; ugc?: boolean }>({ action: "config" });
    return { ready: r.ready !== false, ugc: r.ugc === true };
  } catch {
    return { ready: true, ugc: false };
  }
}

/**
 * Contrato para ECO (montaje del video largo): baja el MP4 de un trabajo PROPIO y terminado a
 * través de la función (CORS), para dibujarlo en un canvas sin "contaminarlo". No cobra.
 */
export async function fetchJobFile(jobId: string): Promise<Blob> {
  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-studio`, {
    method: "POST", headers: await fnHeaders(), body: JSON.stringify({ action: "file", job_id: jobId }),
  });
  if (!resp.ok) throw new Error(await fnErrorMessage(resp, "No se pudo bajar el video."));
  return await resp.blob();
}

export async function downloadVideo(url: string, name: string) {
  try {
    const blob = await (await fetch(url)).blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(href), 5000);
  } catch {
    window.open(url, "_blank", "noopener"); // si el proveedor no deja descargar directo, se abre aparte
  }
}

/** "Mejorar el guion con IA": generador ugc-script de ai-chat (lo cobra el servidor). */
export async function streamUgcScript(system: string, user: string): Promise<{ text: string; billing: ServerBilling }> {
  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
    method: "POST", headers: await fnHeaders(),
    body: JSON.stringify({ generator_id: "ugc-script", generator_title: "Guion de video IA", systemPrompt: system, messages: [{ role: "user", content: user }] }),
  });
  if (!resp.ok || !resp.body) throw new Error(await fnErrorMessage(resp, "La IA no respondió. No se te cobró: intenta de nuevo."));
  const billing = readBilling(resp);
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).replace(/\r$/, ""); buf = buf.slice(nl + 1);
      if (!line.startsWith("data: ")) continue;
      const j = line.slice(6).trim();
      if (j === "[DONE]") continue;
      try { const c = JSON.parse(j).choices?.[0]?.delta?.content; if (c) text += c; } catch { /* trozo incompleto */ }
    }
  }
  return { text, billing };
}

/** Foto de presentador elegida en "Sin mostrar tu cara" → la toma el estudio al abrir. */
export const PRESENTER_KEY = "supernova.video.presenter";
export function takePresenter(uid: string): string | null {
  try {
    const p = window.sessionStorage.getItem(PRESENTER_KEY);
    window.sessionStorage.removeItem(PRESENTER_KEY);
    return p && p.startsWith(`${uid}/`) && !p.includes("..") ? p : null;
  } catch { return null; }
}
export function setPresenter(path: string) {
  try { window.sessionStorage.setItem(PRESENTER_KEY, path); } catch { /* sin almacenamiento */ }
}
