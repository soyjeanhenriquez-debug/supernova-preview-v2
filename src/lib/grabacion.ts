// Grabar con tu guion encima (27-oct-2026, Jean: «si ya tengo mi guion, grabarlo con el teleprompter en pantalla y
// luego que SUPERNOVA le ponga los subtítulos»). Aquí va lo que no depende de la cámara: el formato del video y la
// toma que pasa de Reel Studio a «Sube tu video» sin salir de la app.

/** El formato que el navegador sabe grabar: MP4 si puede (Safari y Chrome nuevos), si no WebM. */
export function formatoGrabacion(isSupported: (t: string) => boolean): { mime: string; ext: "mp4" | "webm" } | null {
  const opciones: [string, "mp4" | "webm"][] = [
    ["video/mp4;codecs=avc1,mp4a.40.2", "mp4"], ["video/mp4", "mp4"],
    ["video/webm;codecs=vp9,opus", "webm"], ["video/webm;codecs=vp8,opus", "webm"], ["video/webm", "webm"],
  ];
  for (const [mime, ext] of opciones) {
    try { if (isSupported(mime)) return { mime, ext }; } catch { /* sigue con la otra */ }
  }
  return null;
}

/** La palabra para comentar que dice el guion («Comenta PRESUPUESTO…»), para el cierre del video. */
export function palabraDelCierre(guion: string): string {
  const m = /coment[ae]\s+(?:la\s+palabra\s+)?[«"'“]?([\p{L}\p{N}]{2,20})/iu.exec(guion);
  return m ? m[1].toLocaleUpperCase("es") : "";
}

export type Toma = { file: File; guion: string };
let pendiente: Toma | null = null;
/** Deja la toma lista para «Sube tu video» (la misma pestaña: el video no sale de tu navegador). */
export function dejarToma(t: Toma) { pendiente = t; }
/** «Sube tu video» la recoge una sola vez. */
export function tomarToma(): Toma | null { const t = pendiente; pendiente = null; return t; }
