/**
 * Motion graphics con estilo (08-oct-2026, decisión de Jean). Adapta el flujo "referencia de estilo →
 * prompt maestro → escenas → voz → montaje" sin generar video con IA: la IA (función motion-graphics)
 * solo devuelve el ADN del estilo y las escenas; aquí se DIBUJA cada cuadro en un canvas, con fuentes
 * reales y el texto perfecto en español, y se graba con MediaRecorder (gratis, en tiempo real).
 *
 * Contraparte de listas en supabase/functions/motion-graphics/index.ts: si cambias una, cambia la otra.
 */
import { pickRecorderMime } from "@/lib/montage";

export const MOTION_FONTS = ["Sora", "Manrope", "Anton", "Bebas Neue", "Montserrat", "Archivo Black", "Space Grotesk", "Playfair Display", "DM Serif Display", "Inter"] as const;
export type MotionFont = typeof MOTION_FONTS[number];
export type TextAnim = "pop" | "rise" | "type" | "fade" | "slam";
export type Transition = "cut" | "fade" | "slide" | "zoom" | "wipe";
export type Deco = "none" | "lines" | "grain" | "circles" | "grid" | "glow";
export type Highlight = "color" | "box" | "underline";
export type Camera = "still" | "push" | "drift";
export type Layout = "statement" | "big_word" | "list" | "question" | "contrast" | "quote" | "cta";

export type MotionStyle = {
  name: string; summary: string;
  palette: { bg: string; bg2: string; fg: string; accent: string; muted: string };
  font: MotionFont; weight: number; uppercase: boolean; align: "center" | "left";
  text_anim: TextAnim; transition: Transition; deco: Deco; highlight: Highlight; camera: Camera;
  energy: 1 | 2 | 3;
  /** Del prompt maestro (solo estilos modelados de una referencia). */
  motif?: string; breakdown?: string[]; master_prompt?: string;
};
export type Beat = { layout: Layout; text: string; emphasis: string[]; items: string[]; narration: string; seconds: number };
/** Clip de 10 s del "prompt maestro universal": cubre escenas seguidas, para generarlo con IA aparte. */
export type MotionClip = { beats: number[]; headline: string; subline: string; prompt: string };
export type MotionPlan = { title: string; beats: Beat[]; clips?: MotionClip[]; caption: string };
export type MotionFormat = "9:16" | "1:1" | "16:9";

export function motionSize(f: MotionFormat): { width: number; height: number } {
  if (f === "16:9") return { width: 1280, height: 720 };
  if (f === "1:1") return { width: 900, height: 900 };
  return { width: 720, height: 1280 };
}

// ---------- Estilos listos (presets) ----------
const S = (s: Omit<MotionStyle, "summary"> & { summary?: string }): MotionStyle => ({ summary: "", ...s });
export const MOTION_PRESETS: (MotionStyle & { id: string })[] = [
  { id: "impacto", ...S({ name: "Impacto", summary: "Negro y ámbar, letras gruesas que golpean, cortes rápidos. Para motivación y ganchos.",
    palette: { bg: "#0a0a0a", bg2: "#1c1408", fg: "#f7f3ea", accent: "#f5a524", muted: "#8a8478" },
    font: "Anton", weight: 400, uppercase: true, align: "center", text_anim: "slam", transition: "zoom", deco: "grain", highlight: "color", camera: "push", energy: 3 }) },
  { id: "documental", ...S({ name: "Documental", summary: "Serif elegante sobre tonos cálidos oscuros, aparece suave. Para historias y explicaciones.",
    palette: { bg: "#14110d", bg2: "#2a2219", fg: "#efe6d6", accent: "#d9a35b", muted: "#9b8f7d" },
    font: "DM Serif Display", weight: 400, uppercase: false, align: "left", text_anim: "fade", transition: "fade", deco: "lines", highlight: "underline", camera: "drift", energy: 1 }) },
  { id: "cinetico", ...S({ name: "Cinético", summary: "Palabra a palabra con rebote, colores vivos y fondos que cambian. Para Reels y TikTok.",
    palette: { bg: "#111827", bg2: "#1e1b4b", fg: "#ffffff", accent: "#facc15", muted: "#a5b4fc" },
    font: "Montserrat", weight: 900, uppercase: true, align: "center", text_anim: "pop", transition: "slide", deco: "circles", highlight: "box", camera: "push", energy: 3 }) },
  { id: "minimal", ...S({ name: "Minimal claro", summary: "Fondo claro, mucho aire, letras limpias que suben. Para educar y vender sin ruido.",
    palette: { bg: "#f6f5f2", bg2: "#e9e6df", fg: "#111111", accent: "#ff5a1f", muted: "#6b6b6b" },
    font: "Manrope", weight: 800, uppercase: false, align: "left", text_anim: "rise", transition: "wipe", deco: "grid", highlight: "underline", camera: "still", energy: 2 }) },
  { id: "tecno", ...S({ name: "Tecno", summary: "Azul profundo con brillo y máquina de escribir. Para apps, IA y negocios digitales.",
    palette: { bg: "#050b18", bg2: "#0b2140", fg: "#e6f1ff", accent: "#38bdf8", muted: "#7c93b3" },
    font: "Space Grotesk", weight: 700, uppercase: false, align: "left", text_anim: "type", transition: "wipe", deco: "glow", highlight: "color", camera: "drift", energy: 2 }) },
];

// ---------- Fuentes ----------
const FONT_CSS: Record<MotionFont, string> = {
  "Sora": "family=Sora:wght@400;600;700;800",
  "Manrope": "family=Manrope:wght@400;600;700;800",
  "Anton": "family=Anton",
  "Bebas Neue": "family=Bebas+Neue",
  "Montserrat": "family=Montserrat:ital,wght@0,400;0,600;0,700;0,800;0,900",
  "Archivo Black": "family=Archivo+Black",
  "Space Grotesk": "family=Space+Grotesk:wght@400;600;700",
  "Playfair Display": "family=Playfair+Display:wght@400;600;700;800;900",
  "DM Serif Display": "family=DM+Serif+Display",
  "Inter": "family=Inter:wght@400;600;700;800;900",
};
/** Fuentes de una sola grosura: se dibujan siempre en 400 aunque el estilo pida otra. */
const SINGLE_WEIGHT = new Set<MotionFont>(["Anton", "Bebas Neue", "Archivo Black", "DM Serif Display"]);
export const fontWeightFor = (s: Pick<MotionStyle, "font" | "weight">) => (SINGLE_WEIGHT.has(s.font) ? 400 : s.weight);

export async function loadMotionFont(font: MotionFont, weight: number): Promise<void> {
  if (typeof document === "undefined") return;
  const href = `https://fonts.googleapis.com/css2?${FONT_CSS[font]}&display=swap`;
  if (!document.querySelector(`link[href="${href}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = href;
    document.head.appendChild(link);
    await new Promise<void>(res => { link.onload = () => res(); link.onerror = () => res(); setTimeout(res, 4000); });
  }
  try { await document.fonts.load(`${weight} 80px "${font}"`, "ÁÉÍÓÚÑ¿?áéíóúñ"); } catch { /* se usa la de respaldo */ }
}

// ---------- Validación del estilo que viene del servidor o de localStorage ----------
const HEX = /^#[0-9a-f]{6}$/i;
const pickOne = <T extends string>(v: unknown, list: readonly T[], def: T): T => (list.includes(v as T) ? (v as T) : def);
export function sanitizeStyle(raw: unknown, base: MotionStyle = MOTION_PRESETS[0]): MotionStyle {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const p = (s.palette && typeof s.palette === "object" ? s.palette : {}) as Record<string, unknown>;
  const col = (k: keyof MotionStyle["palette"]) => (typeof p[k] === "string" && HEX.test(p[k] as string) ? (p[k] as string) : base.palette[k]);
  return {
    name: typeof s.name === "string" && s.name.trim() ? s.name.trim().slice(0, 30) : base.name,
    summary: typeof s.summary === "string" ? s.summary.slice(0, 240) : "",
    palette: { bg: col("bg"), bg2: col("bg2"), fg: col("fg"), accent: col("accent"), muted: col("muted") },
    font: pickOne(s.font, MOTION_FONTS, base.font),
    weight: [400, 600, 700, 800, 900].includes(Number(s.weight)) ? Number(s.weight) : base.weight,
    uppercase: typeof s.uppercase === "boolean" ? s.uppercase : base.uppercase,
    align: pickOne(s.align, ["center", "left"] as const, base.align),
    text_anim: pickOne(s.text_anim, ["pop", "rise", "type", "fade", "slam"] as const, base.text_anim),
    transition: pickOne(s.transition, ["cut", "fade", "slide", "zoom", "wipe"] as const, base.transition),
    deco: pickOne(s.deco, ["none", "lines", "grain", "circles", "grid", "glow"] as const, base.deco),
    highlight: pickOne(s.highlight, ["color", "box", "underline"] as const, base.highlight),
    camera: pickOne(s.camera, ["still", "push", "drift"] as const, base.camera),
    energy: ([1, 2, 3].includes(Number(s.energy)) ? Number(s.energy) : base.energy) as 1 | 2 | 3,
    ...(typeof s.motif === "string" && s.motif ? { motif: s.motif.slice(0, 160) } : {}),
    ...(Array.isArray(s.breakdown) ? { breakdown: s.breakdown.filter((l): l is string => typeof l === "string").slice(0, 8).map(l => l.slice(0, 280)) } : {}),
    ...(typeof s.master_prompt === "string" && s.master_prompt ? { master_prompt: s.master_prompt.slice(0, 3500) } : {}),
  };
}

/** Lo que se manda al servidor como biblia de estilo (sin el desglose ni el prompt largo). */
export function styleForServer(s: MotionStyle) {
  const { breakdown: _b, master_prompt: _m, ...rest } = s;
  return rest;
}

// ---------- Voz: tramos de ≤ 600 caracteres (lo que acepta yt-produce) ----------
export const MAX_VOICE_CHARS = 600;
export type VoiceChunk = { beats: number[]; text: string };
/** Agrupa narraciones seguidas en tramos de ≤ max caracteres: menos llamadas = menos créditos. */
export function voiceChunks(beats: Pick<Beat, "narration" | "text">[], max = MAX_VOICE_CHARS): VoiceChunk[] {
  const out: VoiceChunk[] = [];
  let cur: VoiceChunk | null = null;
  beats.forEach((b, i) => {
    const line = (b.narration || b.text).replace(/\s+/g, " ").trim().slice(0, max);
    if (!line) return;
    if (cur && cur.text.length + 1 + line.length <= max) {
      cur.beats.push(i); cur.text += ` ${line}`;
    } else {
      cur = { beats: [i], text: line };
      out.push(cur);
    }
  });
  return out;
}

export type Timeline = { start: number; dur: number }[];
const MIN_BEAT = 1.4;
/**
 * Tiempo de cada escena. Sin voz: los segundos del plan. Con voz: cada tramo dura lo que su audio y
 * se reparte entre sus escenas según lo largo de cada narración (mínimo 1,4 s), más un respiro final.
 */
export function buildTimeline(beats: Pick<Beat, "narration" | "text" | "seconds">[], chunks?: VoiceChunk[], audioSecs?: number[], tail = 0.6): Timeline {
  const durs = beats.map(b => Math.max(MIN_BEAT, b.seconds || 3));
  if (chunks && audioSecs && chunks.length === audioSecs.length) {
    chunks.forEach((c, k) => {
      const lens = c.beats.map(i => Math.max(8, (beats[i].narration || beats[i].text).length));
      const sum = lens.reduce((a, b) => a + b, 0);
      c.beats.forEach((i, j) => { durs[i] = Math.max(MIN_BEAT, (audioSecs[k] * lens[j]) / sum); });
    });
  }
  if (durs.length) durs[durs.length - 1] += tail;
  let t = 0;
  return durs.map(d => { const r = { start: t, dur: d }; t += d; return r; });
}
export const timelineTotal = (tl: Timeline) => (tl.length ? tl[tl.length - 1].start + tl[tl.length - 1].dur : 0);

// ---------- Dibujo ----------
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t: number) => { const x = clamp01(t); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const backOut = (t: number) => { const c1 = 1.70158, c3 = c1 + 1, x = clamp01(t) - 1; return 1 + c3 * x * x * x + c1 * x * x; };
const norm = (w: string) => w.toLocaleLowerCase("es").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]/gu, "");

function hexToRgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
/** Pseudoaleatorio estable (mismo cuadro = mismo grano). */
function rand(seed: number) { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); }

type Word = { w: string; hot: boolean };
function wordsOf(text: string, emphasis: string[], upper: boolean): Word[] {
  const hot = new Set(emphasis.flatMap(e => e.split(/\s+/)).map(norm).filter(Boolean));
  return text.split(/\s+/).filter(Boolean).map(w => ({ w: upper ? w.toLocaleUpperCase("es") : w, hot: hot.has(norm(w)) }));
}

type Placed = Word & { x: number; y: number; width: number };
/** Reparte las palabras en líneas que caben en maxW; baja el tamaño hasta que caben en maxH. */
function fitWords(g: CanvasRenderingContext2D, words: Word[], font: (s: number) => string, start: number, maxW: number, maxH: number, maxLines: number, lh = 1.12) {
  let size = start;
  for (let guard = 0; guard < 40; guard++) {
    g.font = font(size);
    const space = g.measureText(" ").width;
    const lines: { words: (Word & { width: number })[]; width: number }[] = [];
    let cur: { words: (Word & { width: number })[]; width: number } = { words: [], width: 0 };
    let tooWide = false;
    for (const w of words) {
      const width = g.measureText(w.w).width;
      if (width > maxW) tooWide = true;
      const next = cur.words.length ? cur.width + space + width : width;
      if (cur.words.length && next > maxW) { lines.push(cur); cur = { words: [], width: 0 }; }
      cur.words.push({ ...w, width });
      cur.width = cur.words.length === 1 ? width : cur.width + space + width;
    }
    if (cur.words.length) lines.push(cur);
    const height = lines.length * size * lh;
    if ((!tooWide && lines.length <= maxLines && height <= maxH) || size <= 18) return { size, lines, space, lh: size * lh };
    size = Math.floor(size * 0.92);
  }
  return { size: 18, lines: [], space: 4, lh: 20 };
}

type Ctx = { g: CanvasRenderingContext2D; W: number; H: number; s: MotionStyle; vertical: boolean };

function drawBackground(c: Ctx, t: number, beatIndex: number) {
  const { g, W, H, s } = c;
  const P = s.palette;
  // Degradado que cambia de dirección en cada escena (da sensación de "nuevo plano").
  const ang = (beatIndex % 4) * (Math.PI / 2) + t * 0.05;
  const cx = W / 2 + Math.cos(ang) * W * 0.4, cy = H / 2 + Math.sin(ang) * H * 0.4;
  const grad = g.createRadialGradient(cx, cy, 0, W / 2, H / 2, Math.max(W, H) * 0.95);
  grad.addColorStop(0, P.bg2);
  grad.addColorStop(1, P.bg);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  const u = Math.min(W, H);
  g.save();
  switch (s.deco) {
    case "lines": {
      g.strokeStyle = hexToRgba(P.muted, 0.14); g.lineWidth = 1.5;
      const gap = u * 0.09, off = (t * 18) % gap;
      for (let x = -H; x < W + H; x += gap) { g.beginPath(); g.moveTo(x + off, 0); g.lineTo(x + off - H * 0.5, H); g.stroke(); }
      break;
    }
    case "grid": {
      g.strokeStyle = hexToRgba(P.muted, 0.12); g.lineWidth = 1;
      const gap = u * 0.08, off = (t * 10) % gap;
      for (let x = -gap + off; x < W; x += gap) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = -gap + off; y < H; y += gap) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      break;
    }
    case "circles": {
      g.strokeStyle = hexToRgba(P.accent, 0.22); g.lineWidth = Math.max(2, u * 0.004);
      for (let k = 0; k < 3; k++) {
        const r = u * (0.28 + k * 0.17) * (1 + 0.04 * Math.sin(t * 1.4 + k));
        g.beginPath(); g.arc(W * (k === 1 ? 0.85 : 0.15), H * (0.2 + k * 0.32), r, 0, Math.PI * 2); g.stroke();
      }
      break;
    }
    case "glow": {
      const gl = g.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, u * 0.7);
      gl.addColorStop(0, hexToRgba(P.accent, 0.22 + 0.06 * Math.sin(t * 2)));
      gl.addColorStop(1, hexToRgba(P.accent, 0));
      g.fillStyle = gl; g.fillRect(0, 0, W, H);
      break;
    }
    case "grain": {
      const f = Math.floor(t * 24);
      g.fillStyle = hexToRgba(P.fg, 0.05);
      for (let k = 0; k < 900; k++) g.fillRect(rand(f * 1000 + k) * W, rand(f * 1000 + k + 0.5) * H, 2, 2);
      break;
    }
  }
  g.restore();
}

/** Aparición de una palabra k (de n) en el tiempo local `lt` de la escena. */
function wordState(anim: TextAnim, k: number, lt: number, energy: number) {
  const stagger = anim === "slam" ? 0.16 : anim === "fade" ? 0.07 : 0.11 / (energy * 0.5 + 0.5);
  const dur = anim === "fade" ? 0.5 : 0.32;
  const p = clamp01((lt - 0.08 - k * stagger) / dur);
  switch (anim) {
    case "pop": return { a: clamp01(p * 2), scale: 0.55 + 0.45 * backOut(p), dy: 0 };
    case "rise": return { a: easeOut(p), scale: 1, dy: (1 - easeOut(p)) * 0.6 };
    case "slam": return { a: clamp01(p * 3), scale: 1 + 0.9 * (1 - easeOut(p)), dy: 0 };
    case "fade": return { a: easeInOut(p), scale: 1, dy: 0 };
    default: return { a: p > 0 ? 1 : 0, scale: 1, dy: 0 }; // type: se maneja por letras
  }
}

/** Dibuja un bloque de texto animado. Devuelve dónde terminó (para poner lo que va debajo). */
function drawTextBlock(c: Ctx, text: string, emphasis: string[], lt: number, o: { size: number; maxW: number; maxH: number; maxLines: number; cx: number; top: number; color?: string; anim?: TextAnim; center?: boolean }) {
  const { g, s } = c;
  const P = s.palette;
  const weight = fontWeightFor(s);
  const font = (sz: number) => `${weight} ${sz}px "${s.font}", Sora, system-ui, sans-serif`;
  const words = wordsOf(text, emphasis, s.uppercase);
  const fit = fitWords(g, words, font, o.size, o.maxW, o.maxH, o.maxLines);
  const anim = o.anim ?? s.text_anim;
  const center = o.center ?? s.align === "center";
  const placed: Placed[] = [];
  fit.lines.forEach((line, li) => {
    let x = center ? o.cx - line.width / 2 : o.cx - o.maxW / 2;
    const y = o.top + li * fit.lh + fit.size * 0.85;
    line.words.forEach(w => { placed.push({ ...w, x, y }); x += w.width + fit.space; });
  });
  g.font = font(fit.size);
  g.textBaseline = "alphabetic";
  g.textAlign = "left";
  const totalChars = placed.reduce((a, w) => a + w.w.length + 1, 0);
  const typed = anim === "type" ? Math.floor(clamp01((lt - 0.05) / Math.max(0.6, Math.min(1.6, totalChars * 0.035))) * totalChars) : Infinity;
  let charsSoFar = 0;
  placed.forEach((w, k) => {
    const st = wordState(anim, k, lt, s.energy);
    let shown = w.w;
    if (anim === "type") {
      const left = typed - charsSoFar;
      charsSoFar += w.w.length + 1;
      if (left <= 0) return;
      shown = w.w.slice(0, left);
    }
    if (st.a <= 0) return;
    g.save();
    g.globalAlpha = st.a;
    const mx = w.x + w.width / 2, my = w.y - fit.size * 0.35 + st.dy * fit.size;
    g.translate(mx, my); g.scale(st.scale, st.scale); g.translate(-mx, -my + st.dy * fit.size);
    const hp = clamp01((lt - 0.25 - k * 0.11) / 0.35);
    if (w.hot && s.highlight === "box") {
      const pad = fit.size * 0.12;
      g.fillStyle = P.accent;
      g.fillRect(w.x - pad, w.y - fit.size * 0.86, (w.width + pad * 2) * easeOut(hp * 1.4), fit.size * 1.06);
      g.fillStyle = P.bg;
    } else {
      g.fillStyle = w.hot ? P.accent : (o.color ?? P.fg);
    }
    g.fillText(shown, w.x, w.y);
    if (w.hot && s.highlight === "underline") {
      g.fillStyle = P.accent;
      g.fillRect(w.x, w.y + fit.size * 0.1, w.width * easeOut(hp), Math.max(3, fit.size * 0.07));
    }
    g.restore();
  });
  // Cursor de la máquina de escribir.
  if (anim === "type" && typed < totalChars && placed.length && Math.floor(lt * 3) % 2 === 0) {
    const last = placed[placed.length - 1];
    g.fillStyle = P.accent;
    g.fillRect(last.x + last.width + 6, last.y - fit.size * 0.8, Math.max(3, fit.size * 0.08), fit.size * 0.9);
  }
  return { bottom: o.top + fit.lines.length * fit.lh, size: fit.size };
}

function drawBeat(c: Ctx, b: Beat, lt: number, dur: number) {
  const { g, W, H, s, vertical } = c;
  const P = s.palette;
  const u = Math.min(W, H);
  const padX = W * (vertical ? 0.09 : 0.1);
  const maxW = W - padX * 2;
  const cx = W / 2;
  const left = s.align === "left";

  switch (b.layout) {
    case "big_word": {
      const r = drawTextBlock(c, b.text, b.emphasis.length ? b.emphasis : [b.text], lt, { size: u * 0.26, maxW, maxH: H * 0.45, maxLines: 3, cx, top: H * 0.5 - u * 0.17, anim: s.text_anim === "type" ? "slam" : s.text_anim, center: true });
      void r;
      break;
    }
    case "list": {
      const head = drawTextBlock(c, b.text, b.emphasis, lt, { size: u * 0.085, maxW, maxH: H * 0.25, maxLines: 3, cx, top: H * (vertical ? 0.22 : 0.14) });
      const per = Math.max(0.35, (dur - 0.9) / Math.max(1, b.items.length + 0.5));
      b.items.forEach((it, k) => {
        const p = easeOut((lt - 0.5 - k * per) / 0.35);
        if (p <= 0) return;
        const y = head.bottom + u * 0.08 + k * u * 0.15;
        g.save();
        g.globalAlpha = p;
        g.translate((1 - p) * -40, 0);
        const bx = left ? padX : padX + maxW * 0.08;
        g.fillStyle = P.accent;
        g.beginPath(); g.arc(bx + u * 0.03, y + u * 0.045, u * 0.028, 0, Math.PI * 2); g.fill();
        g.fillStyle = P.bg; g.font = `800 ${Math.round(u * 0.032)}px Sora, system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(String(k + 1), bx + u * 0.03, y + u * 0.047);
        g.textAlign = "left"; g.textBaseline = "alphabetic";
        g.restore();
        g.save(); g.globalAlpha = p; g.translate((1 - p) * -40, 0);
        drawTextBlock(c, it, [], 99, { size: u * 0.06, maxW: maxW * 0.8, maxH: u * 0.13, maxLines: 2, cx: (left ? padX : padX + maxW * 0.08) + u * 0.09 + maxW * 0.4, top: y, color: P.fg, anim: "fade", center: false });
        g.restore();
      });
      break;
    }
    case "contrast": {
      const head = drawTextBlock(c, b.text, b.emphasis, lt, { size: u * 0.08, maxW, maxH: H * 0.22, maxLines: 3, cx, top: H * (vertical ? 0.2 : 0.12) });
      const [a, z] = b.items;
      const boxH = vertical ? H * 0.17 : H * 0.26;
      const gap = u * 0.04;
      const top = head.bottom + u * 0.07;
      const pa = easeOut((lt - 0.45) / 0.4), pz = easeOut((lt - 0.45 - Math.min(1.2, dur * 0.3)) / 0.4);
      const panel = (txt: string, y: number, p: number, on: boolean) => {
        if (p <= 0 || !txt) return;
        g.save(); g.globalAlpha = p; g.translate(0, (1 - p) * 30);
        g.fillStyle = on ? hexToRgba(P.accent, 0.16) : hexToRgba(P.muted, 0.12);
        g.strokeStyle = on ? P.accent : hexToRgba(P.muted, 0.5); g.lineWidth = 2;
        g.beginPath(); g.roundRect(padX, y, maxW, boxH, u * 0.03); g.fill(); g.stroke();
        g.restore();
        g.save(); g.globalAlpha = p; g.translate(0, (1 - p) * 30);
        const r = drawTextBlock(c, txt, [], 99, { size: u * 0.06, maxW: maxW * 0.86, maxH: boxH * 0.8, maxLines: 3, cx, top: y + boxH * 0.18, color: on ? P.fg : P.muted, anim: "fade", center: true });
        if (!on) { g.fillStyle = P.muted; g.fillRect(cx - maxW * 0.3, y + boxH * 0.18 + (r.bottom - y - boxH * 0.18) / 2, maxW * 0.6 * p, 3); }
        g.restore();
      };
      panel(a, top, pa, false);
      panel(z, top + boxH + gap, pz, true);
      break;
    }
    case "question": {
      const qp = easeOut((lt - 0.05) / 0.5);
      g.save(); g.globalAlpha = 0.18 * qp; g.fillStyle = P.accent;
      g.font = `900 ${Math.round(u * 0.9)}px "${s.font}", Sora, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("?", W * 0.72, H * 0.5 + (1 - qp) * 40); g.restore();
      drawTextBlock(c, b.text, b.emphasis, lt, { size: u * 0.11, maxW, maxH: H * 0.55, maxLines: 6, cx, top: H * (vertical ? 0.3 : 0.24) });
      break;
    }
    case "quote": {
      const qp = easeOut(lt / 0.5);
      g.save(); g.globalAlpha = qp; g.fillStyle = P.accent;
      g.font = `900 ${Math.round(u * 0.32)}px "Playfair Display", Georgia, serif`; g.textAlign = left ? "left" : "center"; g.textBaseline = "alphabetic";
      g.fillText("“", left ? padX - u * 0.02 : cx, H * (vertical ? 0.36 : 0.36)); g.restore();
      drawTextBlock(c, b.text, b.emphasis, lt, { size: u * 0.085, maxW, maxH: H * 0.45, maxLines: 6, cx, top: H * (vertical ? 0.36 : 0.36) });
      break;
    }
    case "cta": {
      const r = drawTextBlock(c, b.text, b.emphasis, lt, { size: u * 0.1, maxW, maxH: H * 0.4, maxLines: 5, cx, top: H * (vertical ? 0.3 : 0.22), center: true });
      const p = backOut((lt - 0.55) / 0.45);
      if (lt > 0.55) {
        const pulse = 1 + 0.04 * Math.sin(lt * 5);
        const bw = Math.min(maxW, u * 0.62) * Math.max(0, p) * pulse, bh = u * 0.13 * pulse;
        const by = r.bottom + u * 0.08;
        g.save();
        g.fillStyle = P.accent;
        g.beginPath(); g.roundRect(cx - bw / 2, by, bw, bh, bh / 2); g.fill();
        if (p > 0.8) {
          g.fillStyle = P.bg; g.font = `800 ${Math.round(u * 0.07)}px "${s.font}", Sora, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
          g.fillText("→", cx + Math.sin(lt * 6) * u * 0.012, by + bh / 2 + 2);
        }
        g.restore();
      }
      break;
    }
    default: {
      // statement
      const top = H * (vertical ? 0.32 : 0.26);
      if (left) { g.fillStyle = P.accent; g.fillRect(padX, top - u * 0.06, u * 0.12 * easeOut(lt / 0.4), Math.max(4, u * 0.012)); }
      drawTextBlock(c, b.text, b.emphasis, lt, { size: u * 0.12, maxW, maxH: H * 0.5, maxLines: 6, cx, top });
    }
  }
}

/** Un cuadro del video en el tiempo `t` (segundos). */
export function drawMotionFrame(g: CanvasRenderingContext2D, W: number, H: number, style: MotionStyle, beats: Beat[], tl: Timeline, t: number) {
  const c: Ctx = { g, W, H, s: style, vertical: H > W };
  if (!beats.length || !tl.length) { g.fillStyle = style.palette.bg; g.fillRect(0, 0, W, H); return; }
  let i = tl.findIndex(x => t < x.start + x.dur);
  if (i < 0) i = tl.length - 1;
  const lt = Math.max(0, t - tl[i].start);
  const TR = style.transition === "cut" ? 0 : 0.42 / (style.energy * 0.35 + 0.65);

  const layer = (k: number, localT: number) => {
    g.save();
    if (style.camera !== "still") {
      const p = clamp01(localT / tl[k].dur);
      const sc = style.camera === "push" ? 1 + 0.06 * easeInOut(p) : 1.02;
      const dx = style.camera === "drift" ? Math.sin((tl[k].start + localT) * 0.5) * W * 0.012 : 0;
      g.translate(W / 2 + dx, H / 2); g.scale(sc, sc); g.translate(-W / 2, -H / 2);
    }
    drawBeat(c, beats[k], localT, tl[k].dur);
    g.restore();
  };

  drawBackground(c, t, i);
  if (i > 0 && lt < TR) {
    const p = easeInOut(lt / TR);
    const prevT = tl[i - 1].dur;
    switch (style.transition) {
      case "fade":
        g.save(); g.globalAlpha = 1 - p; layer(i - 1, prevT); g.restore();
        g.save(); g.globalAlpha = p; layer(i, lt); g.restore();
        break;
      case "slide":
        g.save(); g.translate(-W * p, 0); layer(i - 1, prevT); g.restore();
        g.save(); g.translate(W * (1 - p), 0); layer(i, lt); g.restore();
        break;
      case "zoom":
        g.save(); g.globalAlpha = 1 - p; g.translate(W / 2, H / 2); g.scale(1 + p * 0.5, 1 + p * 0.5); g.translate(-W / 2, -H / 2); layer(i - 1, prevT); g.restore();
        g.save(); g.globalAlpha = p; g.translate(W / 2, H / 2); g.scale(0.8 + 0.2 * p, 0.8 + 0.2 * p); g.translate(-W / 2, -H / 2); layer(i, lt); g.restore();
        break;
      case "wipe": {
        const x = W * p;
        g.save(); g.beginPath(); g.rect(x, 0, W - x, H); g.clip(); layer(i - 1, prevT); g.restore();
        g.save(); g.beginPath(); g.rect(0, 0, x, H); g.clip(); drawBackground(c, t, i); layer(i, lt); g.restore();
        g.fillStyle = style.palette.accent; g.fillRect(x - 4, 0, 8, H);
        break;
      }
      default: layer(i, lt);
    }
  } else {
    layer(i, lt);
  }
}

// ---------- Reproducir y grabar ----------
export type PlayHandle = { stop: () => void; done: Promise<{ blob: Blob; mime: string; ext: "mp4" | "webm" } | null> };

/**
 * Reproduce el motion en el canvas (con la voz si hay) usando el reloj del audio. Con `record`, lo
 * graba a la vez (MP4 si el navegador puede, si no WebM) y `done` entrega el archivo.
 */
export function playMotion(o: {
  canvas: HTMLCanvasElement; ctx: AudioContext; style: MotionStyle; beats: Beat[]; tl: Timeline;
  audio?: { buffer: AudioBuffer; at: number }[]; record?: boolean; monitor?: boolean;
  onProgress?: (t: number, total: number) => void;
}): PlayHandle {
  const { canvas, ctx } = o;
  const g = canvas.getContext("2d", { alpha: false })!;
  const W = canvas.width, H = canvas.height;
  const total = timelineTotal(o.tl);
  const rec = o.record ? pickRecorderMime() : null;
  if (o.record && !rec) throw new Error("Tu navegador no puede grabar video. Prueba con Chrome, Edge o Safari actualizados.");

  const dest = ctx.createMediaStreamDestination();
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  const chunks: Blob[] = [];
  if (rec) {
    stream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(30);
    dest.stream.getAudioTracks().forEach(tr => stream!.addTrack(tr));
    recorder = new MediaRecorder(stream, { mimeType: rec.mime, videoBitsPerSecond: 3_000_000, audioBitsPerSecond: 128_000 });
    recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  }

  const sources: AudioBufferSourceNode[] = [];
  const LEAD = 0.25;
  let t0 = 0, timer = 0, stopped = false;
  let resolveDone!: (v: { blob: Blob; mime: string; ext: "mp4" | "webm" } | null) => void;
  let rejectDone!: (e: Error) => void;
  const done = new Promise<{ blob: Blob; mime: string; ext: "mp4" | "webm" } | null>((res, rej) => { resolveDone = res; rejectDone = rej; });

  const cleanup = () => {
    clearInterval(timer);
    sources.forEach(s => { try { s.stop(); } catch { /* ya terminó */ } s.disconnect(); });
    stream?.getTracks().forEach(tr => tr.stop());
  };
  const finish = (cancelled: boolean) => {
    if (stopped) return;
    stopped = true;
    if (!recorder) { cleanup(); resolveDone(null); return; }
    if (cancelled) { try { recorder.stop(); } catch { /* nada */ } cleanup(); resolveDone(null); return; }
    recorder.onstop = () => { cleanup(); const type = rec!.mime.split(";")[0]; resolveDone({ blob: new Blob(chunks, { type }), mime: type, ext: rec!.ext }); };
    try { recorder.stop(); } catch (e) { cleanup(); rejectDone(e instanceof Error ? e : new Error("No se pudo cerrar la grabación.")); }
  };

  const frame = () => {
    if (stopped) return;
    const now = ctx.currentTime - t0;
    drawMotionFrame(g, W, H, o.style, o.beats, o.tl, Math.max(0, Math.min(now, total)));
    o.onProgress?.(Math.max(0, Math.min(now, total)), total);
    if (now >= total + 0.15) finish(false);
  };

  void ctx.resume().then(() => {
    if (stopped) return;
    t0 = ctx.currentTime + LEAD;
    (o.audio ?? []).forEach(a => {
      const src = ctx.createBufferSource();
      src.buffer = a.buffer;
      src.connect(dest);
      if (o.monitor !== false) src.connect(ctx.destination);
      src.start(t0 + a.at);
      sources.push(src);
    });
    // Temporizador fijo de 30 cuadros/s, no requestAnimationFrame: rAF se frena a 1–2 cuadros/s si la
    // ventana queda tapada o en un panel embebido, y el video grabado salía cortado (probado 08-oct).
    // El reloj es el del audio: aunque un cuadro llegue tarde, imagen y voz no se separan.
    if (recorder) { recorder.onerror = () => { cleanup(); stopped = true; rejectDone(new Error("La grabación falló. Intenta de nuevo.")); }; recorder.start(1000); }
    timer = window.setInterval(frame, 1000 / 30);
    frame();
  });

  return { stop: () => finish(true), done };
}

// ---------- Referencia: sacar cuadros de un video o de imágenes (todo local) ----------
export const REF_FRAMES = 6;
const FRAME_MAX_CHARS = 210_000;

function frameToDataUrl(src: CanvasImageSource, sw: number, sh: number): string {
  const k = Math.min(1, 448 / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  for (const q of [0.72, 0.55, 0.4]) {
    const url = c.toDataURL("image/jpeg", q);
    if (url.length <= FRAME_MAX_CHARS) return url;
  }
  return c.toDataURL("image/jpeg", 0.3);
}

/** Cuadros repartidos a lo largo de un video local (no se sube el video: solo ~6 fotos pequeñas). */
export async function framesFromVideo(file: Blob, n = REF_FRAMES): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  try {
    await new Promise<void>((res, rej) => {
      const to = setTimeout(() => rej(new Error("No pudimos abrir ese video. Prueba con un MP4.")), 15000);
      v.onloadeddata = () => { clearTimeout(to); res(); };
      v.onerror = () => { clearTimeout(to); rej(new Error("No pudimos abrir ese video. Prueba con un MP4.")); };
    });
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const at = Math.min(dur - 0.05, (dur * (i + 0.5)) / n);
      await new Promise<void>(res => { const to = setTimeout(res, 4000); v.onseeked = () => { clearTimeout(to); res(); }; v.currentTime = Math.max(0, at); });
      if (v.videoWidth) out.push(frameToDataUrl(v, v.videoWidth, v.videoHeight));
    }
    return out;
  } finally {
    v.removeAttribute("src"); v.load();
    URL.revokeObjectURL(url);
  }
}

export async function framesFromImages(files: Blob[]): Promise<string[]> {
  const out: string[] = [];
  for (const f of files.slice(0, REF_FRAMES)) {
    const bmp = await createImageBitmap(f);
    out.push(frameToDataUrl(bmp, bmp.width, bmp.height));
    bmp.close?.();
  }
  return out;
}

// ---------- Mis estilos (en este navegador) ----------
const STYLES_KEY = "supernova.motion.styles.v1";
export function loadSavedStyles(): MotionStyle[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STYLES_KEY) || "[]");
    return Array.isArray(raw) ? raw.slice(0, 12).map(s => sanitizeStyle(s)) : [];
  } catch { return []; }
}
export function saveStyle(s: MotionStyle): MotionStyle[] {
  const list = [s, ...loadSavedStyles().filter(x => x.name !== s.name)].slice(0, 12);
  try { window.localStorage.setItem(STYLES_KEY, JSON.stringify(list)); } catch { /* sin almacenamiento */ }
  return list;
}

// ---------- Todas las partes para editar en CapCut o Remotion ----------
const srtTime = (t: number) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
/** Subtítulos: lo que dice la voz en cada escena (o su texto, si no hay narración). */
export function toSrt(beats: Pick<Beat, "narration" | "text">[], tl: Timeline): string {
  return beats.map((b, i) => `${i + 1}\n${srtTime(tl[i].start)} --> ${srtTime(tl[i].start + tl[i].dur)}\n${(b.narration || b.text).trim()}\n`).join("\n");
}

/** Mezcla los tramos de voz en una sola pista, cada uno en su segundo del video (WAV 16 bits mono). */
export function voiceTrackWav(parts: { buffer: AudioBuffer; at: number }[], total: number): Blob {
  const rate = parts[0]?.buffer.sampleRate ?? 44100;
  const n = Math.ceil(total * rate);
  const mix = new Float32Array(n);
  for (const { buffer, at } of parts) {
    const ch = buffer.getChannelData(0);
    const off = Math.round(at * rate);
    for (let i = 0; i < ch.length && off + i < n; i++) mix[off + i] += ch[i];
  }
  const out = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) out.setUint8(o + i, t.charCodeAt(i)); };
  str(0, "RIFF"); out.setUint32(4, 36 + n * 2, true); str(8, "WAVE"); str(12, "fmt ");
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  str(36, "data"); out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, mix[i])) * 0x7fff, true);
  return new Blob([out.buffer], { type: "audio/wav" });
}

/** Prompts para generar tomas con IA aparte (Omni Flash, Veo, Seedance) y el desglose del estilo. */
export function promptsText(style: MotionStyle, plan: MotionPlan): string {
  const lines = [`MOTION GRAPHICS · ${plan.title}`, `Estilo: ${style.name}${style.summary ? ` — ${style.summary}` : ""}`];
  if (style.motif) lines.push(`Motivo que se repite: ${style.motif}`);
  if (style.breakdown?.length) lines.push("", "DESGLOSE DE LA REFERENCIA", ...style.breakdown.map(l => `- ${l}`));
  if (style.master_prompt) lines.push("", "PROMPT DEL ESTILO (10 s, listo para pegar)", style.master_prompt);
  (plan.clips ?? []).forEach((c, k) => {
    lines.push("", `CLIP ${k + 1} de ${plan.clips!.length} · "${c.headline}" (escenas ${c.beats.map(b => b + 1).join(", ")})`);
    if (c.subline) lines.push(c.subline);
    lines.push(c.prompt);
  });
  lines.push("", "TEXTO PARA PUBLICAR", plan.caption);
  return lines.join("\n");
}

const README = `TODAS LAS PARTES DE TU MOTION GRAPHICS (SUPERNOVA)

video.mp4 / video.webm  El video ya armado, con la voz.
voz.wav                 La voz sola, en una pista que empieza en el segundo 0 del video.
subtitulos.srt          Lo que dice la voz, escena por escena.
prompts.txt             Prompts de 10 segundos por clip (Google Omni Flash, Veo o Seedance) y el estilo.
plan.json               Escenas, tiempos, textos y estilo (para Remotion u otro editor).

EDITAR EN CAPCUT
1. Nuevo proyecto → Importar: el video (y voz.wav si quieres la voz aparte).
2. Texto → Subtítulos → Importar subtitulos.srt si quieres subtítulos encima.
3. Agrega música baja debajo de la voz, revisa el ritmo y exporta en 1080p.

EDITAR EN REMOTION
plan.json trae cada escena con su inicio y duración en segundos ("timeline"), su texto,
palabras resaltadas, tipo de escena y el estilo (colores, letra, animación, transición).
Usa voz.wav como pista de audio desde el cuadro 0.
`;

// Zip sin compresión (los MP4, WebM y WAV ya vienen comprimidos o pesan poco): sin librerías.
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b: Uint8Array) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const blobBytes = (b: Blob): Promise<Uint8Array> =>
  typeof b.arrayBuffer === "function" ? b.arrayBuffer().then(x => new Uint8Array(x))
    : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result as ArrayBuffer)); r.onerror = () => rej(r.error); r.readAsArrayBuffer(b); });
export async function makeZip(files: { name: string; data: Blob | string }[]): Promise<Blob> {
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const data = typeof f.data === "string" ? enc.encode(f.data) : await blobBytes(f.data);
    const name = enc.encode(f.name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(local.buffer, name as BlobPart, data as BlobPart);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer] as BlobPart[], { type: "application/zip" });
}

export async function motionPackage(o: {
  style: MotionStyle; plan: MotionPlan; tl: Timeline; format: MotionFormat;
  video?: { blob: Blob; ext: string } | null; voice?: { buffer: AudioBuffer; at: number }[];
}): Promise<Blob> {
  const total = timelineTotal(o.tl);
  const files: { name: string; data: Blob | string }[] = [{ name: "LEEME.txt", data: README }];
  if (o.video) files.push({ name: `video.${o.video.ext}`, data: o.video.blob });
  if (o.voice?.length) files.push({ name: "voz.wav", data: voiceTrackWav(o.voice, total) });
  files.push({ name: "subtitulos.srt", data: toSrt(o.plan.beats, o.tl) });
  files.push({ name: "prompts.txt", data: promptsText(o.style, o.plan) });
  files.push({ name: "plan.json", data: JSON.stringify({
    title: o.plan.title, format: o.format, size: motionSize(o.format), fps: 30, seconds: Math.round(total * 100) / 100,
    style: o.style, caption: o.plan.caption, clips: o.plan.clips ?? [],
    scenes: o.plan.beats.map((b, i) => ({ ...b, start: Math.round(o.tl[i].start * 1000) / 1000, duration: Math.round(o.tl[i].dur * 1000) / 1000 })),
  }, null, 2) });
  return makeZip(files);
}
