// Duración real de un WAV PCM leyendo su cabecera RIFF (26-oct-2026). Reel Studio cobra cada toma hablando según los
// segundos MEDIDOS aquí, nunca según lo que dice el navegador.
/** Segundos reales de un WAV PCM (cabecera RIFF): bytes de datos / bytes por segundo. null si no es un WAV válido. */
export function wavSeconds(bytes: Uint8Array): number | null {
  if (bytes.length < 44 || String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.subarray(8, 12)) !== "WAVE") return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 12, byteRate = 0;
  while (off + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(off, off + 4));
    const size = dv.getUint32(off + 4, true);
    if (id === "fmt " && off + 20 <= bytes.length) byteRate = dv.getUint32(off + 16, true);
    if (id === "data") return byteRate > 0 ? Math.min(size, bytes.length - off - 8) / byteRate : null;
    off += 8 + size + (size % 2);
  }
  return null;
}
