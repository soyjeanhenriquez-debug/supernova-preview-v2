/**
 * Corta un trozo de un audio en el navegador y lo devuelve como WAV mono de 16 bits en base64 (reel "Esta IA hace X":
 * el trozo de la voz del gancho o del cierre que mueve los labios del presentador). Sin red ni costo.
 */
export async function sliceWavBase64(blob: Blob, t0: number, t1: number, rate = 24000): Promise<{ b64: string; seconds: number }> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("Tu navegador no puede cortar el audio.");
  const ctx = new Ctx();
  try {
    const src = await ctx.decodeAudioData(await blob.arrayBuffer());
    const a = Math.max(0, Math.min(src.duration, t0)), b = Math.max(a + 0.2, Math.min(src.duration, t1));
    const seconds = b - a;
    const off = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate);
    const node = off.createBufferSource();
    node.buffer = src;
    node.connect(off.destination);
    node.start(0, a, seconds);
    const out = await off.startRendering();
    return { b64: toBase64(encodeWav(out.getChannelData(0), rate)), seconds };
  } finally { void ctx.close(); }
}

/** PCM 16 bits mono con cabecera WAV. */
export function encodeWav(samples: Float32Array, rate: number): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
