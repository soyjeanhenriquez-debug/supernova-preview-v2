/**
 * "Voz grave" de Sube tu video (16-oct-2026, referencia de Jean: voz de locutor con tono medio de
 * ~120 Hz y volumen parejo). Todo en el navegador, gratis y sin librerías:
 *  1) baja el tono unos semitonos SIN cambiar la velocidad (WSOLA + volver a muestrear),
 *  2) le da cuerpo en los graves, suaviza los agudos y comprime (volumen parejo, "de radio"),
 *  3) lo deja a un volumen alto sin saturar y lo devuelve como WAV para la plantilla.
 * Las partes de cálculo (pitchShift, toWav) son puras y se prueban en voiceFx.test.ts.
 */

/**
 * Estira o encoge el tiempo sin cambiar el tono (WSOLA: ventanas que se buscan la mejor coincidencia
 * para que no se oigan "saltos"). `ratio` > 1 alarga, < 1 acorta.
 */
export function timeStretch(x: Float32Array, ratio: number, sr: number): Float32Array {
  const win = Math.max(256, Math.round(sr * 0.04));
  const hopOut = Math.round(win / 2);
  const hopIn = hopOut / ratio;
  const tol = Math.round(sr * 0.012);
  const outLen = Math.round(x.length * ratio);
  const out = new Float32Array(outLen + win);
  const norm = new Float32Array(outLen + win);
  const hann = new Float32Array(win);
  for (let i = 0; i < win; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (win - 1));

  let prev = 0; // dónde empezó la ventana anterior en la entrada
  for (let k = 0, outPos = 0; outPos < outLen; k++, outPos += hopOut) {
    const target = Math.round(k * hopIn);
    let best = target;
    if (k > 0) {
      // Lo que "seguiría" naturalmente a la ventana anterior; se busca la ventana más parecida.
      const nat = prev + hopOut;
      let bestC = -Infinity;
      for (let off = -tol; off <= tol; off += 2) {
        const s = target + off;
        if (s < 0 || s + win > x.length || nat + win > x.length) continue;
        let c = 0;
        for (let i = 0; i < win; i += 4) c += x[s + i] * x[nat + i];
        if (c > bestC) { bestC = c; best = s; }
      }
    }
    best = Math.max(0, Math.min(best, x.length - win));
    for (let i = 0; i < win; i++) { out[outPos + i] += x[best + i] * hann[i]; norm[outPos + i] += hann[i]; }
    prev = best;
  }
  const res = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) res[i] = norm[i] > 1e-6 ? out[i] / norm[i] : 0;
  return res;
}

/** Cambia el largo con interpolación lineal (al tocarlo más lento, baja el tono). */
export function resample(x: Float32Array, newLen: number): Float32Array {
  const out = new Float32Array(newLen);
  const k = (x.length - 1) / Math.max(1, newLen - 1);
  for (let i = 0; i < newLen; i++) {
    const p = i * k, j = Math.floor(p), f = p - j;
    out[i] = x[j] * (1 - f) + (x[Math.min(j + 1, x.length - 1)] ?? 0) * f;
  }
  return out;
}

/** Baja (semitonos < 0) o sube el tono, con la misma duración. */
export function pitchShift(x: Float32Array, semitones: number, sr: number): Float32Array {
  if (!semitones) return x;
  const p = 2 ** (semitones / 12); // < 1 = más grave
  // Primero se acorta (o alarga) sin cambiar el tono y después se vuelve al largo original: el tono cambia en p.
  return resample(timeStretch(x, p, sr), x.length);
}

/** WAV PCM de 16 bits (mono o estéreo). */
export function toWav(channels: Float32Array[], sr: number): Blob {
  const n = channels[0]?.length ?? 0, ch = channels.length;
  const buf = new ArrayBuffer(44 + n * ch * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * ch * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, channels[c][i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
  }
  return new Blob([buf], { type: "audio/wav" });
}

/**
 * Voz grave del video: devuelve un WAV listo para la plantilla. `semitones` = cuánto baja el tono
 * (por defecto 2, que se nota sin sonar a efecto).
 */
export async function deepVoice(file: Blob, semitones = -2): Promise<Blob> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx || typeof OfflineAudioContext === "undefined") throw new Error("Tu navegador no puede procesar el audio.");
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try { decoded = await ctx.decodeAudioData(await file.arrayBuffer()); } finally { void ctx.close(); }
  const sr = decoded.sampleRate;
  // Mono: la voz va al centro y el cálculo se hace una sola vez.
  const mono = new Float32Array(decoded.length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const d = decoded.getChannelData(c);
    for (let i = 0; i < d.length; i++) mono[i] += d[i] / decoded.numberOfChannels;
  }
  const shifted = pitchShift(mono, semitones, sr);

  // Graves con cuerpo, agudos más suaves y compresión de locutor.
  const off = new OfflineAudioContext(1, shifted.length, sr);
  const src = off.createBufferSource();
  const b = off.createBuffer(1, shifted.length, sr);
  b.copyToChannel(shifted, 0);
  src.buffer = b;
  const low = off.createBiquadFilter(); low.type = "lowshelf"; low.frequency.value = 140; low.gain.value = 5;
  const mud = off.createBiquadFilter(); mud.type = "peaking"; mud.frequency.value = 350; mud.Q.value = 1; mud.gain.value = -2;
  const high = off.createBiquadFilter(); high.type = "highshelf"; high.frequency.value = 7000; high.gain.value = -2;
  const comp = off.createDynamicsCompressor();
  comp.threshold.value = -24; comp.knee.value = 6; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
  src.connect(low).connect(mud).connect(high).connect(comp).connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  const outData = rendered.getChannelData(0);

  // Volumen alto sin saturar: el pico queda en -1 dB.
  let peak = 0;
  for (let i = 0; i < outData.length; i++) peak = Math.max(peak, Math.abs(outData[i]));
  const gain = peak > 0 ? 0.89 / peak : 1;
  const final = new Float32Array(outData.length);
  for (let i = 0; i < outData.length; i++) final[i] = outData[i] * gain;
  return toWav([final], sr);
}
