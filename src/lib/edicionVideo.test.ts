import { describe, expect, it } from "vitest";
import { dejarEncargo, momentosBroll, reelDinamicoConTuVideo, tomarEncargo, tramosPorAudio, visualBroll } from "@/lib/edicionVideo";

const SR = 16_000;
/** Audio de prueba: tramos [desde, hasta, amplitud] sobre un ruido de fondo muy bajo. */
function audio(dur: number, partes: [number, number, number][]): Float32Array {
  const a = new Float32Array(Math.round(dur * SR));
  for (let i = 0; i < a.length; i++) a[i] = Math.sin(i * 7.3) * 0.001;
  for (const [d, h, amp] of partes) for (let i = Math.round(d * SR); i < Math.round(h * SR); i++) a[i] = Math.sin(i * 0.12) * amp;
  return a;
}

describe("tramosPorAudio", () => {
  it("corta los silencios largos y deja la voz con margen", () => {
    const ts = tramosPorAudio(audio(10, [[1, 3, 0.3], [6, 8, 0.3]]), SR);
    expect(ts).toHaveLength(2);
    expect(ts[0].a).toBeCloseTo(0.85, 1);
    expect(ts[0].b).toBeCloseTo(3.15, 1);
    expect(ts[1].a).toBeCloseTo(5.85, 1);
  });
  it("una pausa corta (respiración) no se corta", () => {
    const ts = tramosPorAudio(audio(6, [[1, 2, 0.3], [2.3, 4, 0.3]]), SR);
    expect(ts).toHaveLength(1);
  });
  it("sin voz no devuelve tramos", () => {
    expect(tramosPorAudio(audio(5, []), SR)).toEqual([]);
  });
  it("un chasquido suelto no cuenta como frase", () => {
    const ts = tramosPorAudio(audio(8, [[1, 3, 0.3], [5, 5.05, 0.5]]), SR);
    expect(ts).toHaveLength(1);
  });
});

describe("momentosBroll", () => {
  const subs = Array.from({ length: 20 }, (_, i) => ({ desde: i * 2, hasta: i * 2 + 1.8, texto: `frase ${i}` }));
  it("uno cada ~7 s, sin tocar los primeros ni los últimos 3 s", () => {
    const m = momentosBroll(subs, 40);
    expect(m.length).toBeGreaterThan(2);
    expect(m[0].t).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < m.length; i++) expect(m[i].t - m[i - 1].t).toBeGreaterThanOrEqual(7);
    expect(m[m.length - 1].t + m[m.length - 1].dur).toBeLessThanOrEqual(37);
  });
  it("usa el tiempo del video recortado", () => {
    const m = momentosBroll(subs, 20, [{ a: 10, b: 30 }]);
    expect(m[0].t).toBeGreaterThanOrEqual(3);
    expect(m[0].texto).toMatch(/frase/);
  });
  it("respeta el máximo", () => {
    expect(momentosBroll(subs, 40, [], 2)).toHaveLength(2);
  });
});

describe("encargo y descripción", () => {
  it("el encargo se recoge una sola vez", () => {
    const file = new File(["x"], "v.mp4", { type: "video/mp4" });
    dejarEncargo({ file, itemId: "1", modo: "broll", caption: "" });
    expect(tomarEncargo()?.itemId).toBe("1");
    expect(tomarEncargo()).toBeNull();
  });
  it("la descripción del B-roll nunca pasa de 600 caracteres", () => {
    expect(visualBroll({ t: 4, dur: 1.8, texto: "x".repeat(400) }, "y".repeat(400)).length).toBeLessThanOrEqual(600);
  });
});

describe("Reel dinámico con tu video", () => {
  it("cada tramo arranca en su segundo del video (sin silencios), con su sonido, y planos de ~2 s", () => {
    const { props, segundos } = reelDinamicoConTuVideo({ src: "blob:v", dur: 20, ts: [{ a: 1, b: 7 }, { a: 10, b: 14 }], words: [], brolls: [], palabra: "" });
    expect(segundos).toBeCloseTo(10);
    expect(props.tramos).toEqual([
      { desde: 0, hasta: 6, clip: "blob:v", img: null, inicio: 1, sonido: true },
      { desde: 6, hasta: 10, clip: "blob:v", img: null, inicio: 10, sonido: true },
    ]);
    expect(props.planos.every(p => p.t1 - p.t0 <= 2.1)).toBe(true);
    expect(props.planos[props.planos.length - 1].t1).toBeCloseTo(10);
  });
  it("el B-roll tapa justo su momento y el resto eres tú", () => {
    const { props } = reelDinamicoConTuVideo({ src: "v", dur: 12, ts: [], words: [], brolls: [{ t: 4, dur: 1.8, src: "img" }], palabra: "GUIA" });
    const b = props.planos.filter(p => p.forma === "broll");
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ t0: 4, t1: 5.8, top: { url: "img" } });
    expect(props.palabra).toBe("GUIA");
  });
});
