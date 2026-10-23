/**
 * Quitar marca de agua (20-oct-2026, pedido de Jean, modelo: la herramienta de AvatarHype Academy).
 * Todo pasa en el navegador: el video no sale del equipo y no gasta créditos.
 *  · Gemini / Omni / Veo: la marca es un brillo blanco semitransparente fijo en una esquina. Se
 *    encuentra sola: en 24 cuadros del video se busca lo que se queda quieto mientras la escena se
 *    mueve, se calcula su transparencia (alpha) pixel por pixel y se deshace la mezcla:
 *    original = (con marca − alpha · 255) / (1 − alpha).
 *  · General: la persona marca un recuadro. Si la marca es transparente se recupera lo de debajo
 *    igual; si es opaca (un logo), se rellena desde los bordes del recuadro.
 * Ajustes: limpieza de bordes (halo), residuo (brillo fijo que queda), fuerza y ajuste cuadro a cuadro.
 * La parte de cálculo no toca el DOM (se prueba en watermark.test.ts); lo del navegador va al final.
 */
import { pickRecorderMime } from "@/lib/montage";

export type Rect = { x: number; y: number; w: number; h: number };
export type Pixels = { data: Uint8ClampedArray; width: number; height: number };
export type Corner = "br" | "bl" | "tr" | "tl";
export type Engine = "recuperar" | "rellenar";

export type MarkModel = {
  engine: Engine;
  /** Zona del cuadro que se procesa (coordenadas del video ya escalado). */
  rect: Rect;
  /** Transparencia de la marca dentro de `rect` (0 = sin marca). Solo en "recuperar". */
  alpha?: Float32Array;
  /** 0..1: dónde suele quedar el halo (borde de la marca). */
  edge?: Float32Array;
  /** Luma de los cuadros de muestra dentro de `rect`, para recalcular el residuo. */
  samples?: Float32Array[];
  /** Recuadro a rellenar, en coordenadas de `rect`. Solo en "rellenar". */
  fill?: Rect;
  /** Qué tan claro se ve que es una marca fija (correlación media, -1..1). */
  confidence: number;
  corner?: Corner;
};

export type CleanParams = { gain: number; edge: number; residue: number; adaptive: boolean };

export const PRESETS = {
  recomendado: { gain: 1, edge: 1.5, residue: 1 },
  limpieza: { gain: 1.08, edge: 2.2, residue: 1.5 },
  fidelidad: { gain: 0.96, edge: 0.8, residue: 0.6 },
} as const;
export type PresetId = keyof typeof PRESETS;

/** Por debajo de esto no se toca el video (salvo "Aceptar marcas dudosas"). */
export const MIN_CONFIDENCE = 0.4;
export const LOW_CONFIDENCE = 0.15;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function lumaOf(px: Pixels, r?: Rect): Float32Array {
  const rr = r ?? { x: 0, y: 0, w: px.width, h: px.height };
  const out = new Float32Array(rr.w * rr.h);
  const d = px.data, W = px.width;
  for (let y = 0; y < rr.h; y++) {
    for (let x = 0; x < rr.w; x++) {
      const i = ((rr.y + y) * W + rr.x + x) * 4;
      out[y * rr.w + x] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
  }
  return out;
}

/** Desenfoque de caja separable (la ventana se encoge en los bordes). */
export function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.max(0, Math.round(radius));
  if (!r) return src.slice();
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  const pre = new Float64Array(Math.max(w, h) + 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) pre[x + 1] = pre[x] + src[y * w + x];
    for (let x = 0; x < w; x++) {
      const a = Math.max(0, x - r), b = Math.min(w - 1, x + r);
      tmp[y * w + x] = (pre[b + 1] - pre[a]) / (b - a + 1);
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) pre[y + 1] = pre[y] + tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      const a = Math.max(0, y - r), b = Math.min(h - 1, y + r);
      out[y * w + x] = (pre[b + 1] - pre[a]) / (b - a + 1);
    }
  }
  return out;
}

/** Rellena lo enmascarado con una superficie suave que toca los bordes conocidos (Laplace). */
export function harmonicFill(src: Float32Array, mask: Uint8Array, w: number, h: number, iters = 160): Float32Array {
  const out = src.slice();
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return out;
  const known = new Float32Array(w * h), val = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) if (!mask[i]) { known[i] = 1; val[i] = src[i]; }
  const R = Math.max(2, Math.ceil(Math.max(x1 - x0, y1 - y0) / 2) + 2);
  const bk = boxBlur(known, w, h, R), bv = boxBlur(val, w, h, R);
  for (let i = 0; i < w * h; i++) if (mask[i]) out[i] = bk[i] > 1e-6 ? bv[i] / bk[i] : 128;
  const omega = 1.7;
  for (let it = 0; it < iters; it++) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      let s = 0, c = 0;
      if (x > 0) { s += out[i - 1]; c++; }
      if (x < w - 1) { s += out[i + 1]; c++; }
      if (y > 0) { s += out[i - w]; c++; }
      if (y < h - 1) { s += out[i + w]; c++; }
      if (c) out[i] += omega * (s / c - out[i]);
    }
  }
  return out;
}

export function temporalMedian(frames: Float32Array[], n: number): Float32Array {
  const N = frames.length, out = new Float32Array(n), buf = new Float32Array(N);
  for (let i = 0; i < n; i++) {
    for (let f = 0; f < N; f++) buf[f] = frames[f][i];
    buf.sort();
    out[i] = N % 2 ? buf[(N - 1) / 2] : (buf[N / 2 - 1] + buf[N / 2]) / 2;
  }
  return out;
}

/** Desviación robusta (MAD × 1,4826). */
function robustStd(v: Float32Array): number {
  const s = v.slice().sort();
  const med = s[s.length >> 1];
  const dev = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) dev[i] = Math.abs(s[i] - med);
  dev.sort();
  return dev[dev.length >> 1] * 1.4826;
}

function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const f = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) f[i] = mask[i];
  const b = boxBlur(f, w, h, r);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = b[i] > 1e-4 ? 1 : 0;
  return out;
}

type Box = { x0: number; y0: number; x1: number; y1: number };

/** La mancha con más brillo de más, junto con las que quedan pegadas (letras de un logo). */
function mainBlob(seed: Uint8Array, score: Float32Array, w: number, h: number, near: number): Uint8Array | null {
  const label = new Int32Array(w * h).fill(-1);
  const blobs: { sum: number; box: Box }[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!seed[s] || label[s] >= 0) continue;
    const id = blobs.length;
    const box = { x0: w, y0: h, x1: -1, y1: -1 };
    let sum = 0;
    label[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w, y = (i / w) | 0;
      sum += score[i];
      if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb) if (j >= 0 && seed[j] && label[j] < 0) { label[j] = id; stack.push(j); }
    }
    blobs.push({ sum, box });
  }
  if (!blobs.length) return null;
  let best = 0;
  blobs.forEach((b, i) => { if (b.sum > blobs[best].sum) best = i; });
  const m = blobs[best].box;
  const keep = blobs.map(b => b.box.x1 >= m.x0 - near && b.box.x0 <= m.x1 + near && b.box.y1 >= m.y0 - near && b.box.y0 <= m.y1 + near);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (label[i] >= 0 && keep[label[i]]) out[i] = 1;
  return out;
}

function ncc(a: Float32Array, b: Float32Array, w: number, box: Box): number {
  let sa = 0, sb = 0, n = 0;
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) { const i = y * w + x; sa += a[i]; sb += b[i]; n++; }
  if (!n) return 0;
  const ma = sa / n, mb = sb / n;
  let ab = 0, aa = 0, bb = 0;
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const i = y * w + x, da = a[i] - ma, db = b[i] - mb;
    ab += da * db; aa += da * da; bb += db * db;
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}

function highpass(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const b = boxBlur(src, w, h, r), out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = src[i] - b[i];
  return out;
}

export type MarkEstimate = { alpha: Float32Array; mask: Uint8Array; box: Box; confidence: number; meanAlpha: number };

/**
 * Busca una marca fija y semitransparente en los cuadros de una zona (luma, w × h).
 * `within` limita dónde puede estar (el recuadro que marcó la persona, en coordenadas de la zona).
 */
export function estimateMark(frames: Float32Array[], w: number, h: number, within?: Rect): MarkEstimate | null {
  const n = w * h;
  const med = temporalMedian(frames, n);
  const r = Math.max(4, Math.round(Math.min(w, h) * 0.08));
  const hp = highpass(med, w, h, r);
  const thr = Math.max(4, 2.5 * robustStd(hp));
  const seed = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (within && (x < within.x || x >= within.x + within.w || y < within.y || y >= within.y + within.h)) continue;
    if (hp[y * w + x] > thr) seed[y * w + x] = 1;
  }
  const blob = mainBlob(seed, hp, w, h, r);
  if (!blob) return null;
  const mask = dilate(blob, w, h, Math.max(2, Math.round(r * 0.4)));
  const bg = harmonicFill(med, mask, w, h);
  const alpha = new Float32Array(n);
  const box: Box = { x0: w, y0: h, x1: -1, y1: -1 };
  let sum = 0, area = 0, count = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!mask[i]) continue;
    area++;
    if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y;
    const a = (med[i] - bg[i]) / Math.max(1, 255 - bg[i]);
    if (a > 0.003) { alpha[i] = Math.min(0.95, a); sum += alpha[i]; count++; }
  }
  const meanAlpha = count ? sum / count : 0;
  if (sum < 4 || area > n * 0.3) return { alpha, mask, box, confidence: 0, meanAlpha };

  // ¿Lo encontrado está en TODOS los cuadros? Una marca fija se parece a sí misma en cada uno;
  // algo de la escena que se mueve, no.
  const cb: Box = { x0: Math.max(0, box.x0 - r), y0: Math.max(0, box.y0 - r), x1: Math.min(w - 1, box.x1 + r), y1: Math.min(h - 1, box.y1 + r) };
  const ta = highpass(alpha, w, h, r);
  const scores = frames.map(f => ncc(highpass(f, w, h, r), ta, w, cb)).sort((a, b) => a - b);
  return { alpha, mask, box, confidence: scores[scores.length >> 1], meanAlpha };
}

function edgeMap(alpha: Float32Array, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h);
  let max = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const gx = (x < w - 1 ? alpha[i + 1] : alpha[i]) - (x > 0 ? alpha[i - 1] : alpha[i]);
    const gy = (y < h - 1 ? alpha[i + w] : alpha[i]) - (y > 0 ? alpha[i - w] : alpha[i]);
    g[i] = Math.hypot(gx, gy);
    if (g[i] > max) max = g[i];
  }
  const b = boxBlur(g, w, h, 1);
  const out = new Float32Array(w * h);
  if (max > 0) for (let i = 0; i < w * h; i++) out[i] = clamp(b[i] / (0.5 * max), 0, 1);
  return out;
}

function cropArr(src: Float32Array, w: number, c: Rect): Float32Array {
  const out = new Float32Array(c.w * c.h);
  for (let y = 0; y < c.h; y++) out.set(src.subarray((c.y + y) * w + c.x, (c.y + y) * w + c.x + c.w), y * c.w);
  return out;
}

/**
 * Arma el modelo de limpieza de una zona del cuadro (`region`, en coordenadas del video) con sus
 * cuadros de muestra. `within` = recuadro de la persona (modo General), en coordenadas del video.
 */
export function buildModel(frames: Float32Array[], region: Rect, opts: { within?: Rect; engine?: Engine | "auto"; corner?: Corner } = {}): MarkModel | null {
  const { w, h } = region;
  const local = opts.within ? { x: opts.within.x - region.x, y: opts.within.y - region.y, w: opts.within.w, h: opts.within.h } : undefined;
  const est = opts.engine === "rellenar" ? null : estimateMark(frames, w, h, local);
  const transparent = !!est && est.confidence >= LOW_CONFIDENCE && est.meanAlpha < 0.8;
  const engine: Engine = opts.engine && opts.engine !== "auto" ? opts.engine : (local && !transparent ? "rellenar" : "recuperar");

  if (engine === "rellenar") {
    if (!local) return null;
    const pad = 4;
    const c: Rect = { x: Math.max(0, local.x - pad), y: Math.max(0, local.y - pad), w: 0, h: 0 };
    c.w = Math.min(w, local.x + local.w + pad) - c.x; c.h = Math.min(h, local.y + local.h + pad) - c.y;
    return {
      engine, rect: { x: region.x + c.x, y: region.y + c.y, w: c.w, h: c.h },
      fill: { x: local.x - c.x, y: local.y - c.y, w: local.w, h: local.h }, confidence: est?.confidence ?? 0,
    };
  }
  if (!est) return null;
  const pad = Math.max(4, Math.round(Math.min(w, h) * 0.04));
  const c: Rect = { x: Math.max(0, est.box.x0 - pad), y: Math.max(0, est.box.y0 - pad), w: 0, h: 0 };
  c.w = Math.min(w - 1, est.box.x1 + pad) - c.x + 1; c.h = Math.min(h - 1, est.box.y1 + pad) - c.y + 1;
  const alpha = cropArr(est.alpha, w, c);
  return {
    engine, rect: { x: region.x + c.x, y: region.y + c.y, w: c.w, h: c.h },
    alpha, edge: edgeMap(alpha, c.w, c.h), samples: frames.map(f => cropArr(f, w, c)),
    confidence: est.confidence, corner: opts.corner,
  };
}

/** El brillo fijo que queda después de quitar la marca (se resta con "Limpieza de residuo"). */
export function computeResidue(model: MarkModel, gain: number): Float32Array | null {
  if (model.engine !== "recuperar" || !model.alpha || !model.samples?.length) return null;
  const { w, h } = model.rect, n = w * h, a = model.alpha;
  const cleaned = model.samples.map(s => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const k = Math.min(0.97, a[i] * gain); out[i] = k < 0.003 ? s[i] : clamp((s[i] - k * 255) / (1 - k), 0, 255); }
    return out;
  });
  const med = temporalMedian(cleaned, n);
  const mark = new Uint8Array(n);
  for (let i = 0; i < n; i++) mark[i] = a[i] > 0.003 ? 1 : 0;
  const mask = dilate(mark, w, h, 1);
  const bg = harmonicFill(med, mask, w, h);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) if (mask[i]) out[i] = med[i] - bg[i];
  return out;
}

/** Ajuste cuadro a cuadro: la fuerza que deja menos rastro del dibujo de la marca. */
function bestScale(px: Pixels, alpha: Float32Array, gain: number): number {
  const { width: w, height: h } = px, n = w * h;
  const y = lumaOf(px);
  const lap = (v: Float32Array, i: number, x: number, yy: number) =>
    4 * v[i] - (x > 0 ? v[i - 1] : v[i]) - (x < w - 1 ? v[i + 1] : v[i]) - (yy > 0 ? v[i - w] : v[i]) - (yy < h - 1 ? v[i + w] : v[i]);
  const la = new Float32Array(n);
  let norm = 0;
  for (let yy = 0; yy < h; yy++) for (let x = 0; x < w; x++) { const i = yy * w + x; la[i] = lap(alpha, i, x, yy); norm += la[i] * la[i]; }
  if (norm < 1e-6) return 1;
  let best = 1, bestScore = Infinity;
  const c = new Float32Array(n);
  for (let k = 0.8; k <= 1.2001; k += 0.05) {
    for (let i = 0; i < n; i++) { const a = Math.min(0.97, alpha[i] * gain * k); c[i] = a < 0.003 ? y[i] : (y[i] - a * 255) / (1 - a); }
    let dot = 0;
    for (let yy = 0; yy < h; yy++) for (let x = 0; x < w; x++) { const i = yy * w + x; if (alpha[i] > 0.003) dot += lap(c, i, x, yy) * la[i]; }
    if (Math.abs(dot) < bestScore) { bestScore = Math.abs(dot); best = k; }
  }
  return best;
}

function smoothWhere(px: Pixels, weight: (i: number) => number, radius: number) {
  const { width: w, height: h, data: d } = px;
  const src = d.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, m = weight(i);
    if (m <= 0.01) continue;
    let r = 0, g = 0, b = 0, c = 0;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = (yy * w + xx) * 4;
      r += src[j]; g += src[j + 1]; b += src[j + 2]; c++;
    }
    const j = i * 4;
    d[j] = src[j] + (r / c - src[j]) * m;
    d[j + 1] = src[j + 1] + (g / c - src[j + 1]) * m;
    d[j + 2] = src[j + 2] + (b / c - src[j + 2]) * m;
  }
}

/** Rellena el recuadro interpolando sus 4 bordes (como el filtro delogo de ffmpeg) y suaviza la costura. */
function fillFromEdges(px: Pixels, f: Rect, edge: number) {
  const { width: w, height: h, data: d } = px;
  const src = d.slice();
  const at = (x: number, y: number, c: number) => src[(clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)) * 4 + c];
  // Promedio de 3 pixeles a lo largo del borde para que el ruido del video no deje rayas.
  const side = (x: number, y: number, c: number, vertical: boolean) =>
    vertical ? (at(x, y - 1, c) + at(x, y, c) + at(x, y + 1, c)) / 3 : (at(x - 1, y, c) + at(x, y, c) + at(x + 1, y, c)) / 3;
  const L = f.x - 1, R = f.x + f.w, T = f.y - 1, B = f.y + f.h;
  const hasL = L >= 0, hasR = R < w, hasT = T >= 0, hasB = B < h;
  for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) {
    const wl = hasL ? 1 / (x - L) : 0, wr = hasR ? 1 / (R - x) : 0, wt = hasT ? 1 / (y - T) : 0, wb = hasB ? 1 / (B - y) : 0;
    const sw = wl + wr + wt + wb;
    if (!sw) continue;
    const j = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) {
      d[j + c] = ((hasL ? side(L, y, c, true) * wl : 0) + (hasR ? side(R, y, c, true) * wr : 0)
        + (hasT ? side(x, T, c, false) * wt : 0) + (hasB ? side(x, B, c, false) * wb : 0)) / sw;
    }
  }
  const band = Math.max(1, Math.round(edge * 2));
  smoothWhere(px, i => {
    const x = i % w, y = (i / w) | 0;
    const dist = Math.min(Math.abs(x - f.x), Math.abs(x - (f.x + f.w - 1)), Math.abs(y - f.y), Math.abs(y - (f.y + f.h - 1)));
    const inside = x >= f.x - band && x < f.x + f.w + band && y >= f.y - band && y < f.y + f.h + band;
    return inside && dist <= band ? 1 - dist / (band + 1) : 0;
  }, edge > 2 ? 2 : 1);
}

/** Limpia un pedazo del cuadro (`px` = exactamente `model.rect`). Cambia `px.data` en el lugar. */
export function cleanPatch(px: Pixels, model: MarkModel, p: CleanParams, residue: Float32Array | null) {
  if (model.engine === "rellenar") { if (model.fill) fillFromEdges(px, model.fill, p.edge); return; }
  const a0 = model.alpha;
  if (!a0) return;
  const d = px.data, n = px.width * px.height;
  const g = p.gain * (p.adaptive ? bestScale(px, a0, p.gain) : 1);
  for (let i = 0; i < n; i++) {
    const a = Math.min(0.97, a0[i] * g);
    const res = residue ? residue[i] * p.residue : 0;
    if (a < 0.003 && !res) continue;
    const inv = 1 / (1 - a), j = i * 4;
    d[j] = (d[j] - a * 255) * inv - res;
    d[j + 1] = (d[j + 1] - a * 255) * inv - res;
    d[j + 2] = (d[j + 2] - a * 255) * inv - res;
  }
  const e = model.edge;
  if (e && p.edge > 0) smoothWhere(px, i => clamp(e[i] * p.edge / 1.5, 0, 1), p.edge > 2 ? 2 : 1);
}

// ---------------------------------------------------------------- navegador

export const MAX_SECONDS = 180;
const SAMPLES = 24;

/** Tamaño de trabajo: el del video, con el lado mayor en 1920 como máximo. */
export function workSize(vw: number, vh: number) {
  const k = Math.min(1, 1920 / Math.max(vw, vh));
  return { W: Math.round(vw * k / 2) * 2, H: Math.round(vh * k / 2) * 2 };
}

export function cornerRects(W: number, H: number): { corner: Corner; rect: Rect }[] {
  const w = Math.min(W, Math.max(96, Math.round(W * 0.22))), h = Math.min(H, Math.max(96, Math.round(H * 0.22)));
  return [
    { corner: "br", rect: { x: W - w, y: H - h, w, h } },
    { corner: "bl", rect: { x: 0, y: H - h, w, h } },
    { corner: "tr", rect: { x: W - w, y: 0, w, h } },
    { corner: "tl", rect: { x: 0, y: 0, w, h } },
  ];
}

export const CORNER_LABEL: Record<Corner, string> = { br: "abajo a la derecha", bl: "abajo a la izquierda", tr: "arriba a la derecha", tl: "arriba a la izquierda" };

function openVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    const to = setTimeout(() => reject(new Error("Tu navegador no pudo abrir el video. Prueba con un MP4.")), 10_000);
    v.onloadeddata = () => { clearTimeout(to); resolve(v); };
    v.onerror = () => { clearTimeout(to); reject(new Error("Tu navegador no pudo abrir el video. Prueba con un MP4.")); };
  });
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise(resolve => {
    const to = setTimeout(resolve, 3_000);
    v.onseeked = () => { clearTimeout(to); resolve(); };
    v.currentTime = t;
  });
}

/** Luma de 24 cuadros repartidos en el video, para cada zona pedida. */
async function sampleRegions(url: string, W: number, H: number, regions: Rect[]): Promise<Float32Array[][]> {
  const v = await openVideo(url);
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  const out: Float32Array[][] = regions.map(() => []);
  const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
  try {
    for (let i = 0; i < SAMPLES; i++) {
      await seek(v, Math.min(dur - 0.05, (i + 0.5) / SAMPLES * dur));
      g.drawImage(v, 0, 0, W, H);
      regions.forEach((r, k) => {
        const img = g.getImageData(r.x, r.y, r.w, r.h);
        out[k].push(lumaOf({ data: img.data, width: r.w, height: r.h }));
      });
    }
  } finally { v.removeAttribute("src"); v.load(); }
  return out;
}

/** Modo Gemini / Omni / Veo: revisa las 4 esquinas y se queda con la marca más clara. */
export async function detectAuto(url: string, W: number, H: number): Promise<MarkModel | null> {
  const corners = cornerRects(W, H);
  const samples = await sampleRegions(url, W, H, corners.map(c => c.rect));
  let best: MarkModel | null = null, bestScore = -Infinity;
  corners.forEach((c, k) => {
    const m = buildModel(samples[k], c.rect, { engine: "recuperar", corner: c.corner });
    // Gemini la pone abajo a la derecha: a igualdad, gana esa esquina.
    const score = m ? m.confidence * (c.corner === "br" ? 1.1 : 1) : -Infinity;
    if (m && score > bestScore) { best = m; bestScore = score; }
  });
  return best;
}

/** Modo General: el recuadro que marcó la persona (coordenadas del video escalado). */
export async function modelFromRect(url: string, W: number, H: number, rect: Rect, engine: Engine | "auto"): Promise<MarkModel | null> {
  const pad = Math.max(8, Math.round(Math.max(rect.w, rect.h) * 0.5));
  const region: Rect = { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), w: 0, h: 0 };
  region.w = Math.min(W, rect.x + rect.w + pad) - region.x;
  region.h = Math.min(H, rect.y + rect.h + pad) - region.y;
  const [frames] = await sampleRegions(url, W, H, [region]);
  return buildModel(frames, region, { within: rect, engine });
}

/** Dibuja el cuadro actual del video en `g` y le quita la marca. */
export function drawClean(g: CanvasRenderingContext2D, video: HTMLVideoElement, W: number, H: number,
  model: MarkModel | null, p: CleanParams, residue: Float32Array | null) {
  g.drawImage(video, 0, 0, W, H);
  if (!model) return;
  const { x, y, w, h } = model.rect;
  const img = g.getImageData(x, y, w, h);
  cleanPatch({ data: img.data, width: w, height: h }, model, p, residue);
  g.putImageData(img, x, y);
}

export type CleanResult = { blob: Blob; ext: "mp4" | "webm" };

/** Graba el video limpio en tiempo real (tarda lo que dura el video), con su audio. */
export async function exportClean(url: string, model: MarkModel, p: CleanParams, residue: Float32Array | null, opts: {
  canvas: HTMLCanvasElement; W: number; H: number; mbps: number; onProgress?: (t: number, total: number) => void; signal?: AbortSignal;
}): Promise<CleanResult> {
  const rec = pickRecorderMime();
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!rec || !Ctx) throw new Error("Tu navegador no puede grabar video. Ábrelo en Chrome o Safari actualizados.");
  const video = document.createElement("video");
  video.src = url; video.playsInline = true; video.preload = "auto";
  await new Promise<void>((res, rej) => {
    const to = setTimeout(() => rej(new Error("Tu navegador no pudo abrir el video.")), 10_000);
    video.onloadeddata = () => { clearTimeout(to); res(); };
    video.onerror = () => { clearTimeout(to); rej(new Error("Tu navegador no pudo abrir el video.")); };
  });
  const { canvas, W, H } = opts;
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d", { alpha: false, willReadFrequently: true })!;

  const ctx = new Ctx();
  const dest = ctx.createMediaStreamDestination();
  try { ctx.createMediaElementSource(video).connect(dest); } catch { /* sin audio: se graba solo la imagen */ }
  const stream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(30);
  dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
  const recorder = new MediaRecorder(stream, { mimeType: rec.mime, videoBitsPerSecond: Math.round(opts.mbps * 1_000_000), audioBitsPerSecond: 160_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };

  const total = video.duration;
  // Reloj propio (no requestAnimationFrame): el navegador frena el dibujo de pantalla cuando la
  // ventana no está al frente y el video saldría a saltos. Se dibuja cada vez que avanza el cuadro.
  let timer = 0, last = -1, stopped = false;
  const tick = () => {
    if (stopped) return;
    if (video.currentTime !== last) {
      last = video.currentTime;
      drawClean(g, video, W, H, model, p, residue);
      opts.onProgress?.(video.currentTime, total);
    }
    timer = window.setTimeout(tick, 8);
  };
  // Con la pestaña oculta los relojes también se frenan: se pausa y se sigue al volver.
  const onVisibility = () => {
    if (stopped) return;
    if (document.hidden) { video.pause(); if (recorder.state === "recording") recorder.pause(); }
    else { if (recorder.state === "paused") recorder.resume(); void video.play(); }
  };
  const done = new Promise<void>((res, rej) => {
    video.onended = () => res();
    opts.signal?.addEventListener("abort", () => rej(new DOMException("Cancelado", "AbortError")));
  });
  try {
    await ctx.resume();
    drawClean(g, video, W, H, model, p, residue);
    recorder.start(250);
    document.addEventListener("visibilitychange", onVisibility);
    tick();
    await video.play();
    await done;
  } finally {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    if (recorder.state !== "inactive") await new Promise<void>(res => { recorder.onstop = () => res(); recorder.stop(); });
    video.pause();
    void ctx.close();
  }
  return { blob: new Blob(chunks, { type: rec.mime.split(";")[0] }), ext: rec.ext };
}
