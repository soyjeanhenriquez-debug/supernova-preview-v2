import { assertEquals } from "jsr:@std/assert@1";
import { wavSeconds } from "./wav.ts";

/** WAV PCM mono de `seconds` segundos a `rate` Hz y 16 bits. */
function wav(seconds: number, rate = 24000, extraChunk = false): Uint8Array {
  const data = Math.round(seconds * rate) * 2;
  const extra = extraChunk ? 8 + 4 : 0;
  const b = new Uint8Array(44 + extra + data);
  const dv = new DataView(b.buffer);
  const w = (o: number, t: string) => [...t].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  w(0, "RIFF"); dv.setUint32(4, 36 + extra + data, true); w(8, "WAVE");
  w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  let o = 36;
  if (extraChunk) { w(o, "LIST"); dv.setUint32(o + 4, 4, true); o += 12; }
  w(o, "data"); dv.setUint32(o + 4, data, true);
  return b;
}

Deno.test("wavSeconds mide la duración real del audio", () => {
  assertEquals(wavSeconds(wav(5)), 5);
  assertEquals(wavSeconds(wav(11.5, 16000)), 11.5);
  assertEquals(wavSeconds(wav(3, 24000, true)), 3);
});

Deno.test("wavSeconds rechaza lo que no es un WAV (el precio no puede salir de datos inventados)", () => {
  assertEquals(wavSeconds(new Uint8Array(10)), null);
  const falso = wav(5); falso[0] = 0;
  assertEquals(wavSeconds(falso), null);
  const sinRate = wav(5); new DataView(sinRate.buffer).setUint32(28, 0, true);
  assertEquals(wavSeconds(sinRate), null);
});

Deno.test("wavSeconds no se deja engañar por una cabecera que dice más datos de los que hay", () => {
  const b = wav(2);
  new DataView(b.buffer).setUint32(40, 24000 * 2 * 60, true); // dice 60 s, trae 2 s
  assertEquals(wavSeconds(b), 2);
});
