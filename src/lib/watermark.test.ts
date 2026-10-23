import { describe, expect, it } from "vitest";
import { buildModel, cleanPatch, computeResidue, lumaOf, PRESETS, MIN_CONFIDENCE, type Pixels } from "./watermark";

// Escena que se mueve (textura suave que se desplaza) + una estrella blanca semitransparente fija,
// como el brillo de Gemini. W × H = la esquina de abajo a la derecha.
const W = 160, H = 120, FRAMES = 24, ALPHA = 0.45, CX = 120, CY = 86, RAD = 14;

function scene(f: number, x: number, y: number) {
  const t = f * 7;
  return 70 + 50 * Math.sin((x + t) / 9) * Math.cos((y - t * 0.6) / 11) + 25 * Math.sin((x * 0.7 + y * 1.3 + t * 2) / 5);
}
function star(x: number, y: number) {
  const dx = x - CX, dy = y - CY, r = Math.hypot(dx, dy);
  if (r > RAD) return 0;
  const ang = Math.atan2(dy, dx);
  const lim = RAD * (0.35 + 0.65 * Math.abs(Math.cos(2 * ang)) ** 3);
  return r <= lim ? ALPHA : 0;
}
function frame(f: number, mark: boolean): Pixels {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const base = scene(f, x, y), a = mark ? star(x, y) : 0, i = (y * W + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = a * 255 + (1 - a) * base;
    data[i + 3] = 255;
  }
  return { data, width: W, height: H };
}
const region = { x: 0, y: 0, w: W, h: H };

describe("quitar marca de agua", () => {
  it("encuentra la marca fija y la quita casi por completo", () => {
    const frames = Array.from({ length: FRAMES }, (_, f) => lumaOf(frame(f, true)));
    const model = buildModel(frames, region, { engine: "recuperar", corner: "br" })!;
    expect(model).not.toBeNull();
    expect(model.confidence).toBeGreaterThan(MIN_CONFIDENCE);
    // La zona encontrada contiene la estrella.
    expect(model.rect.x).toBeLessThanOrEqual(CX - RAD);
    expect(model.rect.x + model.rect.w).toBeGreaterThanOrEqual(CX + RAD);

    const p = { ...PRESETS.recomendado, adaptive: false };
    const residue = computeResidue(model, p.gain);
    // Un cuadro que no estaba en las muestras.
    const test = frame(5.5, true), clean = frame(5.5, false);
    const { x, y, w, h } = model.rect;
    const patch = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    for (let yy = 0; yy < h; yy++) patch.data.set(test.data.subarray(((y + yy) * W + x) * 4, ((y + yy) * W + x + w) * 4), yy * w * 4);
    let before = 0, after = 0, n = 0;
    const errAt = (d: Uint8ClampedArray, i: number, xx: number, yy: number) => Math.abs(d[i] - clean.data[((y + yy) * W + x + xx) * 4]);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (star(x + xx, y + yy)) { before += errAt(patch.data, (yy * w + xx) * 4, xx, yy); n++; }
    cleanPatch(patch, model, p, residue);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (star(x + xx, y + yy)) after += errAt(patch.data, (yy * w + xx) * 4, xx, yy);
    expect(before / n).toBeGreaterThan(40);
    expect(after / n).toBeLessThan(before / n * 0.2);
  });

  it("con ajuste cuadro a cuadro también queda limpio", () => {
    const frames = Array.from({ length: FRAMES }, (_, f) => lumaOf(frame(f, true)));
    const model = buildModel(frames, region, { engine: "recuperar" })!;
    const { x, y, w, h } = model.rect;
    const test = frame(11.3, true), clean = frame(11.3, false);
    const patch = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    for (let yy = 0; yy < h; yy++) patch.data.set(test.data.subarray(((y + yy) * W + x) * 4, ((y + yy) * W + x + w) * 4), yy * w * 4);
    cleanPatch(patch, model, { ...PRESETS.recomendado, adaptive: true }, computeResidue(model, 1));
    let err = 0, n = 0;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (star(x + xx, y + yy)) { err += Math.abs(patch.data[(yy * w + xx) * 4] - clean.data[((y + yy) * W + x + xx) * 4]); n++; }
    expect(err / n).toBeLessThan(15);
  });

  it("sin marca no se inventa una", () => {
    const frames = Array.from({ length: FRAMES }, (_, f) => lumaOf(frame(f, false)));
    const model = buildModel(frames, region, { engine: "recuperar" });
    expect(model === null || model.confidence < MIN_CONFIDENCE).toBe(true);
  });

  it("modo General con un logo opaco: rellena el recuadro", () => {
    const frames = Array.from({ length: FRAMES }, (_, f) => lumaOf(frame(f, false)));
    const model = buildModel(frames, region, { within: { x: 40, y: 30, w: 20, h: 16 }, engine: "rellenar" })!;
    expect(model.engine).toBe("rellenar");
    expect(model.fill).toEqual({ x: 40 - model.rect.x, y: 30 - model.rect.y, w: 20, h: 16 });
    const { x, y, w, h } = model.rect;
    const clean = frame(3, false);
    const patch = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    for (let yy = 0; yy < h; yy++) patch.data.set(clean.data.subarray(((y + yy) * W + x) * 4, ((y + yy) * W + x + w) * 4), yy * w * 4);
    // Un logo blanco opaco tapa el recuadro.
    for (let yy = 30; yy < 46; yy++) for (let xx = 40; xx < 60; xx++) { const i = ((yy - y) * w + xx - x) * 4; patch.data[i] = patch.data[i + 1] = patch.data[i + 2] = 255; }
    cleanPatch(patch, model, { ...PRESETS.recomendado, adaptive: false }, null);
    let err = 0, n = 0;
    for (let yy = 30; yy < 46; yy++) for (let xx = 40; xx < 60; xx++) { err += Math.abs(patch.data[((yy - y) * w + xx - x) * 4] - clean.data[(yy * W + xx) * 4]); n++; }
    expect(err / n).toBeLessThan(30); // antes: blanco puro, ≈ 180 de error
  });
});
