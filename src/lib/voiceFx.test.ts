import { describe, expect, it } from "vitest";
import { pitchShift, resample, timeStretch, toWav } from "./voiceFx";

const SR = 16000;
/** Un tono puro de `hz` durante `secs`. */
const tone = (hz: number, secs: number) => Float32Array.from({ length: Math.round(SR * secs) }, (_, i) => Math.sin((2 * Math.PI * hz * i) / SR));

/** Frecuencia dominante por cruces por cero (alcanza para un tono puro). */
function freq(x: Float32Array): number {
  let z = 0;
  const a = Math.floor(x.length * 0.2), b = Math.floor(x.length * 0.8);
  for (let i = a + 1; i < b; i++) if (x[i - 1] < 0 && x[i] >= 0) z++;
  return z / ((b - a) / SR);
}

describe("voz grave", () => {
  it("estirar el tiempo cambia el largo pero no el tono", () => {
    const x = tone(200, 1);
    const y = timeStretch(x, 1.3, SR);
    expect(y.length).toBe(Math.round(x.length * 1.3));
    expect(Math.abs(freq(y) - 200)).toBeLessThan(8);
  });

  it("bajar 2 semitonos deja el mismo largo y baja el tono ~11 %", () => {
    const x = tone(200, 1);
    const y = pitchShift(x, -2, SR);
    expect(y.length).toBe(x.length);
    expect(Math.abs(freq(y) - 200 * 2 ** (-2 / 12))).toBeLessThan(8);
  });

  it("volver a muestrear conserva los extremos", () => {
    const y = resample(Float32Array.from([0, 1, 0]), 5);
    expect(Array.from(y)).toEqual([0, 0.5, 1, 0.5, 0]);
  });

  it("el WAV tiene la cabecera correcta y el tamaño esperado", async () => {
    const wav = toWav([new Float32Array(100)], 48000);
    // El Blob del entorno de pruebas no trae arrayBuffer(): se lee con FileReader, como en navegadores viejos.
    const b = new Uint8Array(await new Promise<ArrayBuffer>(res => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.readAsArrayBuffer(wav); }));
    expect(String.fromCharCode(...b.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...b.slice(8, 12))).toBe("WAVE");
    expect(b.length).toBe(44 + 200);
  });
});
