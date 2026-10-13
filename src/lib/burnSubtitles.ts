/**
 * "Sube tu video" (13-oct-2026): todo el trabajo pesado pasa en el navegador, gratis.
 *  1) extractAudio: saca el audio de tu video (WAV 16 kHz mono, ≈3 MB por 90 s) para que la IA lo
 *     escuche. El video nunca sube al servidor (pesa mucho para el celular).
 *  2) toSrt: el archivo de subtítulos para CapCut, Edits o YouTube.
 *  3) burnSubtitles: graba tu video con los subtítulos encima, en tiempo real (tarda lo que dura el
 *     video), con la misma técnica de "Armar video final" (src/lib/montage.ts).
 */
import { pickRecorderMime } from "@/lib/montage";

export type Subtitle = { desde: number; hasta: number; texto: string; clave?: string };
export type SubStyle = "clasico" | "resaltado" | "caja";

export const MAX_VIDEO_SECONDS = 90;
const SAMPLE_RATE = 16_000;

function AudioCtx(): typeof AudioContext | null {
  return (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) ?? null;
}

/** Duración del video sin cargarlo entero. */
export function videoSeconds(file: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    v.preload = "metadata"; v.muted = true; v.src = url;
    v.onloadedmetadata = () => { const d = v.duration; URL.revokeObjectURL(url); resolve(Number.isFinite(d) ? d : 0); };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Tu navegador no pudo abrir ese video. Prueba con un MP4 o MOV grabado con el celular.")); };
  });
}

function wavBase64(samples: Float32Array, rate: number): string {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(bytes);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const u8 = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Audio del video en WAV 16 kHz mono (base64) + duración. */
export async function extractAudio(file: Blob): Promise<{ audio: string; seconds: number }> {
  const Ctx = AudioCtx();
  if (!Ctx || typeof OfflineAudioContext === "undefined") throw new Error("Tu navegador no puede leer el audio. Prueba con Chrome o Safari actualizados.");
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try { decoded = await ctx.decodeAudioData(await file.arrayBuffer()); }
  catch { throw new Error("No pudimos leer el audio de ese video. Prueba con un MP4 o MOV grabado con el celular."); }
  finally { void ctx.close(); }
  const seconds = decoded.duration;
  if (seconds > MAX_VIDEO_SECONDS + 1) throw new Error(`El video dura ${Math.round(seconds)} s. Por ahora el máximo es ${MAX_VIDEO_SECONDS} s: recórtalo y vuelve a subirlo.`);
  const off = new OfflineAudioContext(1, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE);
  const src = off.createBufferSource();
  src.buffer = decoded; src.connect(off.destination); src.start();
  const mono = await off.startRendering();
  return { audio: wavBase64(mono.getChannelData(0), SAMPLE_RATE), seconds };
}

const srtTime = (s: number) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

/** Archivo .srt (CapCut, Edits, YouTube). */
export function toSrt(subs: Subtitle[]): string {
  return subs.map((s, i) => `${i + 1}\n${srtTime(s.desde)} --> ${srtTime(s.hasta)}\n${s.texto}\n`).join("\n");
}

/** El subtítulo que toca en el segundo t (o null). */
export function subtitleAt(subs: Subtitle[], t: number): Subtitle | null {
  for (const s of subs) if (t >= s.desde && t < s.hasta) return s;
  return null;
}

/** Corta un texto en líneas que caben en `maxWidth`. */
function wrap(g: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/)) {
    const next = cur ? `${cur} ${w}` : w;
    if (g.measureText(next).width > maxWidth && cur) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

/** Dibuja un subtítulo. Estilos: clásico (blanco con borde), resaltado (palabra clave en ámbar), caja. */
export function drawSub(g: CanvasRenderingContext2D, sub: Subtitle, W: number, H: number, style: SubStyle) {
  const fs = Math.round(Math.min(W, H) * 0.068);
  g.font = `800 ${fs}px Manrope, "Segoe UI", system-ui, sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  const text = style === "resaltado" ? sub.texto.toUpperCase() : sub.texto;
  const lines = wrap(g, text, W * 0.86);
  const lh = fs * 1.2;
  const y0 = H * 0.7 - ((lines.length - 1) * lh) / 2;
  const key = (sub.clave ?? "").toLowerCase();
  lines.forEach((line, k) => {
    const y = y0 + k * lh;
    if (style === "caja") {
      const w = g.measureText(line).width + fs * 0.7;
      g.fillStyle = "rgba(0,0,0,0.72)";
      g.fillRect(W / 2 - w / 2, y - lh / 2, w, lh);
      g.fillStyle = "#ffffff";
      g.fillText(line, W / 2, y);
      return;
    }
    g.save();
    g.lineJoin = "round"; g.lineWidth = Math.max(5, fs * 0.18);
    g.strokeStyle = "rgba(0,0,0,0.92)";
    g.strokeText(line, W / 2, y);
    if (style === "resaltado" && key) {
      // Palabra clave en ámbar: se pinta palabra por palabra.
      const words = line.split(" ");
      let x = W / 2 - g.measureText(line).width / 2;
      g.textAlign = "left";
      for (const w of words) {
        g.fillStyle = w.toLowerCase().replace(/[^\p{L}\d]/gu, "") === key.replace(/[^\p{L}\d]/gu, "") ? "#F5A623" : "#ffffff";
        g.fillText(w, x, y);
        x += g.measureText(`${w} `).width;
      }
    } else {
      g.fillStyle = "#ffffff";
      g.fillText(line, W / 2, y);
    }
    g.restore();
  });
}

export type BurnResult = { blob: Blob; ext: "mp4" | "webm"; mime: string };

/** Graba el video con los subtítulos encima (tiempo real). */
export async function burnSubtitles(file: Blob, subs: Subtitle[], opts: {
  style: SubStyle; canvas: HTMLCanvasElement; onProgress?: (t: number, total: number) => void; signal?: AbortSignal;
}): Promise<BurnResult> {
  const rec = pickRecorderMime();
  const Ctx = AudioCtx();
  if (!rec || !Ctx) throw new Error("Tu navegador no puede grabar video. Descarga el archivo .srt y súbelo a CapCut junto con tu video.");
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url; video.playsInline = true; video.preload = "auto"; video.crossOrigin = "anonymous";
  await new Promise<void>((res, rej) => {
    const to = setTimeout(() => rej(new Error("Tu navegador no pudo abrir el video. Descarga el .srt y úsalo en CapCut.")), 10_000);
    video.onloadeddata = () => { clearTimeout(to); res(); };
    video.onerror = () => { clearTimeout(to); rej(new Error("Tu navegador no pudo abrir el video. Descarga el .srt y úsalo en CapCut.")); };
  });
  try { await document.fonts?.load("800 40px Manrope"); } catch { /* system-ui */ }

  // Tamaño: el del video, con el lado mayor en 1280 como máximo (rápido en el celular).
  const k = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
  const W = Math.round(video.videoWidth * k / 2) * 2, H = Math.round(video.videoHeight * k / 2) * 2;
  const canvas = opts.canvas; canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d", { alpha: false })!;

  const ctx = new Ctx();
  const dest = ctx.createMediaStreamDestination();
  try { ctx.createMediaElementSource(video).connect(dest); } catch { /* sin audio: se graba solo la imagen */ }
  const stream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(30);
  dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
  const recorder = new MediaRecorder(stream, { mimeType: rec.mime, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };

  const total = video.duration;
  let raf = 0;
  const draw = () => {
    g.drawImage(video, 0, 0, W, H);
    const s = subtitleAt(subs, video.currentTime);
    if (s) drawSub(g, s, W, H, opts.style);
    opts.onProgress?.(video.currentTime, total);
    raf = requestAnimationFrame(draw);
  };

  const done = new Promise<void>((res, rej) => {
    video.onended = () => res();
    opts.signal?.addEventListener("abort", () => rej(new DOMException("Cancelado", "AbortError")));
  });
  try {
    await ctx.resume();
    recorder.start(250);
    draw();
    await video.play();
    await done;
  } finally {
    cancelAnimationFrame(raf);
    if (recorder.state !== "inactive") {
      await new Promise<void>(res => { recorder.onstop = () => res(); recorder.stop(); });
    }
    video.pause();
    URL.revokeObjectURL(url);
    void ctx.close();
  }
  return { blob: new Blob(chunks, { type: rec.mime.split(";")[0] }), ext: rec.ext, mime: rec.mime };
}
