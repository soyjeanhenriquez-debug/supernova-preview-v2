/**
 * «Edita tus tomas como tu referencia» en el navegador (06-nov-2026): preparar cada toma (duración, 2 cuadros
 * chicos para la IA y si trae marca de agua). El plan y sus reglas viven en supabase/functions/_shared/montaje.ts
 * (los usa también el servidor). Nada de esto sube el video ni cobra.
 */
import { detectAuto, MIN_CONFIDENCE, workSize, type MarkModel } from "@/lib/watermark";
export { cleanMontaje, duracionMontaje, montajeSimple, MAX_TOMAS, type PlanMontaje, type Segmento, type TomaInfo, type Transicion } from "../../supabase/functions/_shared/montaje";

export type TomaPreparada = { dur: number; W: number; H: number; frames: string[]; marca: MarkModel | null };

function abrir(src: string): Promise<HTMLVideoElement> {
  return new Promise((ok, no) => {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.crossOrigin = "anonymous";
    const to = setTimeout(() => no(new Error("No se pudo abrir una toma.")), 15_000);
    v.onloadeddata = () => { clearTimeout(to); ok(v); };
    v.onerror = () => { clearTimeout(to); no(new Error("No se pudo abrir una toma.")); };
    v.src = src;
  });
}
const ir = (v: HTMLVideoElement, t: number) => new Promise<void>(ok => {
  const listo = () => { v.removeEventListener("seeked", listo); ok(); };
  v.addEventListener("seeked", listo);
  v.currentTime = t;
  setTimeout(listo, 3000);
});

/** Duración, tamaño, 2 cuadros (base64 JPEG de 240 px de ancho, para la IA) y la marca de agua si la hay. */
export async function prepararToma(src: string): Promise<TomaPreparada> {
  const v = await abrir(src);
  try {
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 5;
    const vw = v.videoWidth || 720, vh = v.videoHeight || 1280;
    const w = 240, h = Math.round(vh * (w / vw));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d")!;
    const frames: string[] = [];
    for (const k of [0.25, 0.7]) {
      await ir(v, Math.min(dur - 0.05, dur * k));
      g.drawImage(v, 0, 0, w, h);
      frames.push(c.toDataURL("image/jpeg", 0.6).split(",")[1] ?? "");
    }
    const { W, H } = workSize(vw, vh);
    let marca: MarkModel | null = null;
    try {
      const m = await detectAuto(src, W, H);
      marca = m && m.confidence >= MIN_CONFIDENCE ? m : null;
    } catch { /* sin detección: se arma igual */ }
    return { dur, W, H, frames: frames.filter(Boolean), marca };
  } finally { v.removeAttribute("src"); v.load(); }
}

/** Baja una toma de la app a este equipo (un enlace local evita problemas de CORS al armar). */
export async function aLocal(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Esa toma ya no está disponible.");
  return URL.createObjectURL(await r.blob());
}
