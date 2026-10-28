/**
 * Cortes y miniaturas de un video de referencia, en el navegador (Reel Studio, 25-oct-2026). Se recorre el video a
 * 6 cuadros por segundo en miniatura (32×56, gris), se mide cuánto cambia cada cuadro contra el anterior y donde el
 * cambio salta muy por encima de lo normal hay un corte. Después se saca una miniatura real del medio de cada plano.
 * La parte pura (dónde hay cortes) se prueba en videoCortes.test.ts.
 */

/** Diferencia media (0-255) entre dos cuadros en gris del mismo tamaño. */
export function diferencia(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return a.length ? s / a.length : 0;
}

/**
 * Dónde hay cortes: cambios que superan 3 veces la mediana y un mínimo absoluto, con al menos 0,4 s entre cortes.
 * `difs[i]` = diferencia entre el cuadro i-1 y el i (difs[0] = 0); `paso` = segundos entre cuadros.
 */
export function detectarCortes(difs: number[], paso: number, minGap = 0.4): number[] {
  const orden = difs.slice(1).sort((x, y) => x - y);
  const mediana = orden.length ? orden[Math.floor(orden.length / 2)] : 0;
  const umbral = Math.max(14, mediana * 3);
  const out: number[] = [];
  difs.forEach((d, i) => {
    if (i === 0 || d < umbral) return;
    const t = i * paso;
    if (out.length && t - out[out.length - 1] < minGap) { if (d > difs[Math.round(out[out.length - 1] / paso)]) out[out.length - 1] = t; return; }
    out.push(t);
  });
  return out;
}

/** Planos (inicio y fin) a partir de los cortes. */
export const planosDeCortes = (cortes: number[], duracion: number) =>
  [0, ...cortes].map((t0, i) => ({ t0, t1: i < cortes.length ? cortes[i] : duracion }));

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise(resolve => {
    const done = () => { v.removeEventListener("seeked", done); resolve(); };
    v.addEventListener("seeked", done);
    v.currentTime = t;
    setTimeout(done, 1500); // un cuadro que no llega no traba todo
  });
}

async function abrir(src: string): Promise<HTMLVideoElement> {
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.crossOrigin = "anonymous"; v.src = src;
  await new Promise<void>((resolve, reject) => {
    v.onloadeddata = () => resolve();
    v.onerror = () => reject(new Error("Este navegador no pudo abrir el video. Prueba con un MP4."));
  });
  return v;
}

/** Recorre el video y devuelve su duración y los cortes. onProgress de 0 a 1 (avance real del recorrido). */
export async function analizarCortes(src: string, onProgress?: (x: number) => void): Promise<{ duracion: number; cortes: number[] }> {
  const v = await abrir(src);
  const duracion = Number.isFinite(v.duration) ? v.duration : 0;
  const fps = 6, paso = 1 / fps;
  const c = document.createElement("canvas"); c.width = 32; c.height = 56;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const difs: number[] = [];
  let prev: Uint8ClampedArray | null = null;
  const n = Math.floor(duracion * fps);
  for (let i = 0; i <= n; i++) {
    await seek(v, Math.min(duracion - 0.05, i * paso));
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    const g = new Uint8ClampedArray(c.width * c.height);
    for (let k = 0; k < g.length; k++) g[k] = (px[k * 4] * 0.3 + px[k * 4 + 1] * 0.59 + px[k * 4 + 2] * 0.11) | 0;
    difs.push(prev ? diferencia(prev, g) : 0);
    prev = g;
    if (i % 6 === 0) onProgress?.(i / Math.max(1, n));
  }
  v.removeAttribute("src"); v.load();
  return { duracion, cortes: detectarCortes(difs, paso) };
}

/** Una miniatura JPEG (270 px de ancho) del medio de cada plano. */
export async function miniaturas(src: string, planos: { t0: number; t1: number }[]): Promise<Blob[]> {
  const v = await abrir(src);
  const w = 270, h = Math.round(w * ((v.videoHeight || 16) / (v.videoWidth || 9)));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  const out: Blob[] = [];
  for (const p of planos) {
    await seek(v, Math.min(Math.max(0, v.duration - 0.05), (p.t0 + p.t1) / 2));
    ctx.drawImage(v, 0, 0, w, h);
    out.push(await new Promise<Blob>(r => c.toBlob(b => r(b ?? new Blob()), "image/jpeg", 0.78)));
  }
  v.removeAttribute("src"); v.load();
  return out;
}

/**
 * Un cuadro del video en buena calidad (máx. 1080 de ancho). recorte "arriba" = solo la mitad de arriba (la captura de
 * una pantalla dividida, sin la persona de abajo). Espejo (28-oct-2026): las imágenes del original, sin IA.
 */
export async function cuadro(src: string, t: number, recorte: "todo" | "arriba" = "todo"): Promise<Blob> {
  const v = await abrir(src);
  try {
    await seek(v, Math.min(Math.max(0, v.duration - 0.05), t));
    const vw = v.videoWidth || 1080, vh = v.videoHeight || 1920;
    const sh = recorte === "arriba" ? Math.round(vh / 2) : vh;
    const w = Math.min(1080, vw), h = Math.round(sh * (w / vw));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(v, 0, 0, vw, sh, 0, 0, w, h);
    return await new Promise<Blob>((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error("No se pudo leer el cuadro."))), "image/jpeg", 0.9));
  } finally { v.removeAttribute("src"); v.load(); }
}
