/**
 * Montaje del video en el navegador (gratis, sin servidor): imágenes con movimiento suave (Ken
 * Burns), fundido entre escenas, clips animados cuando existen, subtítulos quemados y la voz de
 * cada escena en secuencia. Se graba con MediaRecorder en tiempo real: tarda lo mismo que dura
 * el video. Primero intenta MP4 (H.264 + AAC) y si el navegador no puede, WebM (YouTube acepta
 * los dos). El resultado es un archivo local para descargar; no se sube a ningún lado.
 */
import { subtitleChunks, type SubChunk } from "@/lib/ytScenes";

export type MontageScene = { image: Blob; clip?: Blob | null; audio: AudioBuffer; text: string };
export type Format = "16:9" | "9:16" | "3:4";
export type MontageResult = { blob: Blob; mime: string; ext: "mp4" | "webm"; seconds: number };

/** Pausa al final de cada escena (respiro entre frases) y fundido entre escenas, en segundos. */
export const GAP = 0.45;
const FADE = 0.5;
const FPS = 30;

export function canvasSize(format: Format): { width: number; height: number } {
  if (format === "9:16") return { width: 720, height: 1280 };
  if (format === "3:4") return { width: 720, height: 960 };
  return { width: 1280, height: 720 };
}

/** Formato de grabación: MP4 si el navegador lo graba, si no WebM. null = no se puede grabar aquí. */
export function pickRecorderMime(): { mime: string; ext: "mp4" | "webm" } | null {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return null;
  const options: { mime: string; ext: "mp4" | "webm" }[] = [
    { mime: "video/mp4;codecs=avc1,mp4a.40.2", ext: "mp4" },
    { mime: "video/mp4;codecs=avc1.42E01F,mp4a.40.2", ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
    { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
  ];
  return options.find(o => { try { return MediaRecorder.isTypeSupported(o.mime); } catch { return false; } }) ?? null;
}

export function canRecord(): boolean {
  if (typeof document === "undefined") return false;
  const c = document.createElement("canvas") as HTMLCanvasElement & { captureStream?: unknown };
  return typeof c.captureStream === "function" && !!pickRecorderMime() && typeof AudioContext !== "undefined";
}

/** Duración de cada escena en el video: voz + pausa. */
export const sceneDurations = (audios: { duration: number }[]) => audios.map(a => a.duration + GAP);

export async function decodeAudio(ctx: BaseAudioContext, blob: Blob): Promise<AudioBuffer> {
  return ctx.decodeAudioData(await blob.arrayBuffer());
}

/** Duración de un audio sin dejar abierto un AudioContext. */
export async function audioSeconds(blob: Blob): Promise<number> {
  const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctx) return 0;
  const ctx = new Ctx();
  try { return (await decodeAudio(ctx, blob)).duration; } catch { return 0; } finally { void ctx.close(); }
}

/** Comprime una imagen a WebP (o JPEG si el navegador no codifica WebP), lado mayor ≤ maxSide. */
export async function compressImage(blob: Blob, maxSide = 1280, quality = 0.86): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const enc = (type: string) => new Promise<Blob | null>(res => c.toBlob(b => res(b), type, quality));
  const webp = await enc("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  return (await enc("image/jpeg")) ?? blob;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Dibuja `src` cubriendo el lienzo, con zoom `scale` y desplazamiento (−1…1) en x/y. */
function drawCover(g: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, W: number, H: number, scale = 1, dx = 0, dy = 0) {
  if (!sw || !sh) return;
  const k = Math.max(W / sw, H / sh) * scale;
  const w = sw * k, h = sh * k;
  const x = (W - w) / 2 + dx * (w - W) / 2;
  const y = (H - h) / 2 + dy * (h - H) / 2;
  g.drawImage(src, x, y, w, h);
}

/** Movimiento de cámara de cada escena: alterna acercar, alejar y paneos. */
function kenBurns(i: number, p: number): { scale: number; dx: number; dy: number } {
  const e = ease(Math.max(0, Math.min(1, p)));
  switch (i % 4) {
    case 0: return { scale: 1.02 + 0.12 * e, dx: 0, dy: 0 };
    case 1: return { scale: 1.14 - 0.12 * e, dx: 0, dy: 0 };
    case 2: return { scale: 1.12, dx: -0.8 + 1.6 * e, dy: 0 };
    default: return { scale: 1.12, dx: 0.6 - 1.2 * e, dy: -0.3 + 0.6 * e };
  }
}

function drawSubtitle(g: CanvasRenderingContext2D, chunk: SubChunk, W: number, H: number, vertical: boolean) {
  let fs = Math.round(Math.min(W, H) * (vertical ? 0.058 : 0.05));
  g.textAlign = "center";
  g.textBaseline = "middle";
  const font = (s: number) => `700 ${s}px Manrope, "Segoe UI", system-ui, sans-serif`;
  g.font = font(fs);
  const widest = Math.max(...chunk.lines.map(l => g.measureText(l).width));
  if (widest > W * 0.9) { fs = Math.floor(fs * (W * 0.9) / widest); g.font = font(fs); }
  const lh = fs * 1.25;
  const baseY = H * (vertical ? 0.74 : 0.86) - ((chunk.lines.length - 1) * lh) / 2;
  chunk.lines.forEach((line, k) => {
    const y = baseY + k * lh;
    g.save();
    g.lineJoin = "round";
    g.lineWidth = Math.max(4, fs * 0.16);
    g.strokeStyle = "rgba(0,0,0,0.9)";
    g.shadowColor = "rgba(0,0,0,0.85)";
    g.shadowBlur = fs * 0.35;
    g.strokeText(line, W / 2, y);
    g.shadowBlur = 0;
    g.fillStyle = "#ffffff";
    g.fillText(line, W / 2, y);
    g.restore();
  });
}

type Loaded = { bmp: ImageBitmap; video: HTMLVideoElement | null; url: string | null; start: number; dur: number; subs: SubChunk[] };

/**
 * Graba el video. `onFrame` recibe el lienzo para mostrarlo en pantalla mientras se graba.
 * Se puede cancelar con `signal`.
 */
export async function renderMontage(scenes: MontageScene[], opts: {
  format: Format; subtitles: boolean; ctx: AudioContext; canvas: HTMLCanvasElement;
  onProgress?: (elapsed: number, total: number) => void; signal?: AbortSignal; monitor?: boolean;
}): Promise<MontageResult> {
  const rec = pickRecorderMime();
  if (!rec) throw new Error("Tu navegador no puede grabar video. Prueba con Chrome, Edge o Safari actualizados.");
  if (!scenes.length) throw new Error("No hay escenas para armar.");
  const { width: W, height: H } = canvasSize(opts.format);
  const vertical = H > W;
  const canvas = opts.canvas;
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d", { alpha: false })!;
  const ctx = opts.ctx;

  try { await document.fonts?.load(`700 40px Manrope`); } catch { /* sin fuentes: system-ui */ }

  // Cargar todo antes de empezar a grabar (la grabación es en tiempo real: nada puede esperar).
  const loaded: Loaded[] = [];
  let t = 0;
  for (const s of scenes) {
    const bmp = await createImageBitmap(s.image);
    let video: HTMLVideoElement | null = null, url: string | null = null;
    if (s.clip) {
      url = URL.createObjectURL(s.clip);
      video = document.createElement("video");
      video.muted = true; video.playsInline = true; video.preload = "auto"; video.src = url;
      const ok = await new Promise<boolean>(res => {
        const done = (v: boolean) => { clearTimeout(to); res(v); };
        const to = setTimeout(() => done(false), 15000);
        video!.onloadeddata = () => done(true);
        video!.onerror = () => done(false);
      });
      if (!ok) { URL.revokeObjectURL(url); video = null; url = null; } // si el clip no abre, va la imagen
    }
    const dur = s.audio.duration + GAP;
    loaded.push({ bmp, video, url, start: t, dur, subs: opts.subtitles ? subtitleChunks(s.text, s.audio.duration, vertical ? 26 : 42) : [] });
    t += dur;
  }
  const total = t;

  const dest = ctx.createMediaStreamDestination();
  const stream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(FPS);
  dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
  const recorder = new MediaRecorder(stream, { mimeType: rec.mime, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };

  const sources: AudioBufferSourceNode[] = [];
  const cleanup = () => {
    sources.forEach(s => { try { s.stop(); } catch { /* ya terminó */ } s.disconnect(); });
    loaded.forEach(l => { l.bmp.close?.(); if (l.video) { l.video.pause(); l.video.removeAttribute("src"); l.video.load(); } if (l.url) URL.revokeObjectURL(l.url); });
    stream.getTracks().forEach(tr => tr.stop());
  };

  await ctx.resume();
  const LEAD = 0.3;
  const t0 = ctx.currentTime + LEAD;
  scenes.forEach((s, i) => {
    const src = ctx.createBufferSource();
    src.buffer = s.audio;
    src.connect(dest);
    if (opts.monitor) src.connect(ctx.destination);
    src.start(t0 + loaded[i].start);
    sources.push(src);
  });

  const drawScene = (i: number, local: number, alpha: number) => {
    const l = loaded[i];
    g.globalAlpha = alpha;
    const v = l.video;
    if (v && v.readyState >= 2) {
      drawCover(g, v, v.videoWidth, v.videoHeight, W, H, 1.0);
    } else {
      const kb = kenBurns(i, local / l.dur);
      drawCover(g, l.bmp, l.bmp.width, l.bmp.height, W, H, kb.scale, kb.dx, kb.dy);
    }
    g.globalAlpha = 1;
  };

  let current = -1;
  const startClip = (i: number) => {
    const v = loaded[i]?.video;
    if (!v) return;
    try {
      v.currentTime = 0;
      // Si la escena dura más que el clip, se reproduce más lento (mínimo 0,5×) y queda en el último cuadro.
      v.playbackRate = Math.max(0.5, Math.min(1, (v.duration || 5) / loaded[i].dur));
      void v.play().catch(() => { /* sin reproducción: se usa la imagen */ });
    } catch { /* idem */ }
  };

  return await new Promise<MontageResult>((resolve, reject) => {
    let raf = 0, stopped = false;
    const finish = (err?: Error) => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      clearInterval(backup);
      opts.signal?.removeEventListener("abort", onAbort);
      if (err) {
        try { if (recorder.state !== "inactive") recorder.stop(); } catch { /* nada */ }
        cleanup();
        reject(err);
        return;
      }
      recorder.onstop = () => {
        cleanup();
        const type = rec.mime.split(";")[0];
        resolve({ blob: new Blob(chunks, { type }), mime: type, ext: rec.ext, seconds: total });
      };
      try { recorder.stop(); } catch (e) { cleanup(); reject(e instanceof Error ? e : new Error("No se pudo cerrar la grabación.")); }
    };
    const onAbort = () => finish(new DOMException("Cancelado", "AbortError") as unknown as Error);
    opts.signal?.addEventListener("abort", onAbort);

    const frame = () => {
      if (stopped) return;
      const now = ctx.currentTime - t0;
      g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
      if (now >= 0) {
        let i = loaded.findIndex(l => now < l.start + l.dur);
        if (i < 0) i = loaded.length - 1;
        if (i !== current) { current = i; startClip(i); }
        const local = now - loaded[i].start;
        if (i > 0 && local < FADE) {
          drawScene(i - 1, loaded[i - 1].dur + local, 1);
          drawScene(i, local, local / FADE);
        } else drawScene(i, local, 1);
        if (opts.subtitles) {
          const sub = loaded[i].subs.find(c => local >= c.start && local < c.end);
          if (sub) drawSubtitle(g, sub, W, H, vertical);
        }
        opts.onProgress?.(Math.min(now, total), total);
      } else {
        drawScene(0, 0, 1);
      }
      if (now >= total + 0.2) { finish(); return; }
      // Una sola cadena de cuadros: con la pestaña oculta los rAF no corren y se acumularían (uno por
      // tick del respaldo); al volver se ejecutarían todos juntos y cada uno abriría otra cadena.
      cancelAnimationFrame(raf);
      raf = document.hidden ? 0 : requestAnimationFrame(frame);
    };
    // Respaldo: si el navegador frena requestAnimationFrame (pestaña en segundo plano), se sigue
    // dibujando con un temporizador para que el audio y la imagen no se separen del todo. Al volver
    // a la pestaña, retoma la cadena de rAF (solo si no hay una pendiente).
    const backup = window.setInterval(() => {
      if (document.hidden) frame();
      else if (!raf && !stopped) raf = requestAnimationFrame(frame);
    }, 1000 / FPS);
    recorder.onerror = () => finish(new Error("La grabación falló. Intenta de nuevo."));
    recorder.start(1000);
    raf = requestAnimationFrame(frame);
  });
}
