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
export type Layout = "statement" | "big_word" | "list" | "question" | "contrast" | "quote" | "cta"
  // 09-oct-2026 (método de Mirko: intro con tarjetas, portada de cada punto, gráfica con datos reales, producto):
  | "cards" | "chapter" | "chart" | "product";
export const LAYOUTS: Layout[] = ["statement", "big_word", "list", "question", "contrast", "quote", "cta", "cards", "chapter", "chart", "product"];

export type MotionStyle = {
  name: string; summary: string;
  palette: { bg: string; bg2: string; fg: string; accent: string; muted: string };
  font: MotionFont; weight: number; uppercase: boolean; align: "center" | "left";
  text_anim: TextAnim; transition: Transition; deco: Deco; highlight: Highlight; camera: Camera;
  energy: 1 | 2 | 3;
  /** Del prompt maestro (solo estilos modelados de una referencia). */
  motif?: string; breakdown?: string[]; master_prompt?: string;
};
export type Beat = {
  layout: Layout; text: string; emphasis: string[]; items: string[]; narration: string; seconds: number;
  /** chart: los valores REALES (vienen del guion o los escribe la persona; nunca inventados). items = etiquetas. */
  values?: number[];
  /** product: nombre del archivo de la foto (imagenes/<nombre> en el paquete). */
  image?: string;
};
/** Imágenes ya cargadas para dibujar (fotos de producto), por nombre de archivo. */
export type MotionAssets = Record<string, CanvasImageSource & { width: number; height: number }>;
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

/**
 * La letra del estilo + las dos fijas del dibujo (números de la lista en Sora, comillas en Playfair).
 * Devuelve las que NO cargaron (sin internet o Google Fonts lento): el video sale con la de respaldo,
 * pero quien llama puede avisar.
 */
export async function loadMotionFonts(s: Pick<MotionStyle, "font" | "weight">): Promise<string[]> {
  const list: [MotionFont, number][] = [[s.font, fontWeightFor(s)], ["Sora", 800], ["Playfair Display", 900]];
  const ok = await Promise.all(list.map(([f, w]) => loadMotionFont(f, w)));
  return list.filter((_, i) => !ok[i]).map(([f]) => f);
}

/** Carga una fuente de Google Fonts con tope de tiempo en CADA paso (QA 08-oct: si el archivo de la
 * fuente quedaba a medio bajar, document.fonts.load no volvía nunca y el render se colgaba). */
export async function loadMotionFont(font: MotionFont, weight: number, timeoutMs = 6000): Promise<boolean> {
  if (typeof document === "undefined") return false;
  const within = <T,>(p: Promise<T>) => Promise.race([p, new Promise<null>(res => setTimeout(() => res(null), timeoutMs))]);
  const href = `https://fonts.googleapis.com/css2?${FONT_CSS[font]}&display=swap`;
  if (!document.querySelector(`link[href="${href}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = href;
    document.head.appendChild(link);
    await within(new Promise<void>(res => { link.onload = () => res(); link.onerror = () => res(); }));
  }
  try {
    const faces = await within(document.fonts.load(`${weight} 80px "${font}"`, "ÁÉÍÓÚÑ¿?áéíóúñ"));
    return Array.isArray(faces) && faces.length > 0;
  } catch { return false; }
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
      shareWithMin(audioSecs[k], lens).forEach((d, j) => { durs[c.beats[j]] = d; });
    });
  }
  if (durs.length) durs[durs.length - 1] += tail;
  let t = 0;
  return durs.map(d => { const r = { start: t, dur: d }; t += d; return r; });
}
/**
 * Reparte `total` según `weights`, con mínimo MIN_BEAT por escena. Las que suben al mínimo le quitan
 * ese tiempo a las demás del MISMO tramo (antes se sumaba y la imagen se iba atrasando respecto a la
 * voz: QA del 08-oct-2026). Si el tramo es tan corto que no alcanza, cada una queda en el mínimo.
 */
export function shareWithMin(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (!n) return [];
  if (total <= MIN_BEAT * n) return weights.map(() => MIN_BEAT);
  const fixed = new Set<number>();
  for (;;) {
    const free = weights.map((w, i) => (fixed.has(i) ? 0 : w));
    const sum = free.reduce((a, b) => a + b, 0);
    const left = total - fixed.size * MIN_BEAT;
    const out = weights.map((w, i) => (fixed.has(i) ? MIN_BEAT : (left * w) / sum));
    const low = out.findIndex((d, i) => !fixed.has(i) && d < MIN_BEAT);
    if (low < 0) return out;
    fixed.add(low);
  }
}
export const timelineTotal = (tl: Timeline) => (tl.length ? tl[tl.length - 1].start + tl[tl.length - 1].dur : 0);

// ---------- Dibujo ----------
// Regla: dentro de una escena la transparencia se MULTIPLICA (globalAlpha *=), nunca se pisa; si no,
// el fundido de la transición se perdía y el texto viejo desaparecía de golpe (QA 08-oct).
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t: number) => { const x = clamp01(t); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const backOut = (t: number) => { const c1 = 1.70158, c3 = c1 + 1, x = clamp01(t) - 1; return 1 + c3 * x * x * x + c1 * x * x; };
const norm = (w: string) => w.toLocaleLowerCase("es").normalize("NFD").replace(/n\u0303/g, "ñ").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]/gu, "");

function hexToRgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
/** Pseudoaleatorio estable (mismo cuadro = mismo grano). */
function rand(seed: number) { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); }

type Word = { w: string; hot: boolean };
/** Marca las palabras de cada frase resaltada SOLO donde la frase aparece completa y seguida. */
export function wordsOf(text: string, emphasis: string[], upper: boolean): Word[] {
  const raw = text.split(/\s+/).filter(Boolean);
  const keys = raw.map(norm);
  const hot = new Array(raw.length).fill(false);
  for (const e of emphasis) {
    const phrase = e.split(/\s+/).map(norm).filter(Boolean);
    if (!phrase.length) continue;
    for (let i = 0; i + phrase.length <= keys.length; i++) {
      if (phrase.every((p, j) => keys[i + j] === p)) for (let j = 0; j < phrase.length; j++) hot[i + j] = true;
    }
  }
  return raw.map((w, i) => ({ w: upper ? w.toLocaleUpperCase("es") : w, hot: hot[i] }));
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

type Ctx = { g: CanvasRenderingContext2D; W: number; H: number; s: MotionStyle; vertical: boolean; assets?: MotionAssets };

/** Lee un número escrito en español: "2.000" → 2000, "0,8" → 0.8, "US$ 1.250,50" → 1250.5. */
export function parseNum(raw: string): number {
  const t = raw.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(t)) return NaN;
  return Number(t.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
}
/** "Ene: 2.000; Feb: 2.500" (o un renglón por dato) → etiquetas y valores. Sin etiqueta: solo el valor. */
export function parseChartData(raw: string): { labels: string[]; values: number[] } {
  const labels: string[] = [], values: number[] = [];
  for (const part of raw.split(/[;\n]+/)) {
    const m = part.match(/^\s*(.*?)\s*[:=]\s*(.+)$/);
    const v = parseNum(m ? m[2] : part);
    if (!Number.isFinite(v)) continue;
    labels.push(m ? m[1].slice(0, 12) : "");
    values.push(v);
  }
  return { labels: labels.slice(0, 12), values: values.slice(0, 12) };
}

/** Números en formato español: 2.000 y 0,8 (sin redondear lo que trae la persona). */
export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "";
  const [int, dec] = String(Math.round(n * 100) / 100).split(".");
  const sign = int.startsWith("-") ? "-" : "";
  const digits = int.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${digits}${dec ? `,${dec}` : ""}`;
}

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
      g.strokeStyle = hexToRgba(P.muted, 0.14); g.lineWidth = 1.5 * (u / 720);
      const gap = u * 0.09, off = (t * 18) % gap;
      for (let x = -H; x < W + H; x += gap) { g.beginPath(); g.moveTo(x + off, 0); g.lineTo(x + off - H * 0.5, H); g.stroke(); }
      break;
    }
    case "grid": {
      g.strokeStyle = hexToRgba(P.muted, 0.12); g.lineWidth = u / 720;
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
      const dot = 2 * (u / 720), dots = Math.round(900 * (W * H) / (720 * 1280));
      for (let k = 0; k < dots; k++) g.fillRect(rand(f * 1000 + k) * W, rand(f * 1000 + k + 0.5) * H, dot, dot);
      break;
    }
  }
  g.restore();
}

/**
 * Cuándo entra cada palabra: el escalonado del estilo, pero todas tienen que haber terminado de entrar
 * a más tardar al 60 % de la escena (QA 08-oct: con texto largo en escenas cortas, Impacto dejaba
 * palabras sin aparecer). `n` = palabras del bloque, `sceneDur` = duración de la escena.
 */
function wordTiming(anim: TextAnim, n: number, energy: number, sceneDur: number) {
  const base = anim === "slam" ? 0.16 : anim === "fade" ? 0.07 : 0.11 / (energy * 0.5 + 0.5);
  const dur = anim === "fade" ? 0.5 : 0.32;
  const budget = Math.max(0.3, sceneDur * 0.6 - 0.08 - dur);
  return { stagger: n > 1 ? Math.min(base, budget / (n - 1)) : base, dur: Math.min(dur, Math.max(0.15, sceneDur * 0.25)) };
}
/** La primera palabra ya va entrando en el cuadro 0 de cada escena (antes había 3–4 cuadros vacíos). */
const LEAD_IN = 0.12;
/** Aparición de una palabra k en el tiempo local `lt` de la escena. */
function wordState(anim: TextAnim, k: number, lt: number, tm: { stagger: number; dur: number }) {
  const p = clamp01((lt + LEAD_IN - k * tm.stagger) / tm.dur);
  switch (anim) {
    case "pop": return { a: clamp01(p * 2), scale: 0.55 + 0.45 * backOut(p), dy: 0 };
    case "rise": return { a: easeOut(p), scale: 1, dy: (1 - easeOut(p)) * 0.6 };
    case "slam": return { a: clamp01(p * 3), scale: 1 + 0.55 * (1 - easeOut(p)), dy: 0 };
    case "fade": return { a: easeInOut(p), scale: 1, dy: 0 };
    default: return { a: p > 0 ? 1 : 0, scale: 1, dy: 0 }; // type: se maneja por letras
  }
}

/** Dibuja un bloque de texto animado. Devuelve dónde terminó (para poner lo que va debajo). */
type LineBox = { x: number; y: number; width: number };
function drawTextBlock(c: Ctx, text: string, emphasis: string[], lt: number, o: { size: number; maxW: number; maxH: number; maxLines: number; cx: number; top: number; color?: string; anim?: TextAnim; center?: boolean; dur?: number; vcenter?: boolean }) {
  const { g, s } = c;
  const P = s.palette;
  const weight = fontWeightFor(s);
  const font = (sz: number) => `${weight} ${sz}px "${s.font}", Sora, system-ui, sans-serif`;
  const words = wordsOf(text, emphasis, s.uppercase);
  const fit = fitWords(g, words, font, o.size, o.maxW, o.maxH, o.maxLines);
  const anim = o.anim ?? s.text_anim;
  const center = o.center ?? s.align === "center";
  const placed: Placed[] = [];
  const lineBoxes: LineBox[] = [];
  // vcenter: `top` es el centro del bloque (big_word, paneles del contraste).
  const top = o.vcenter ? o.top - (fit.lines.length * fit.lh) / 2 : o.top;
  fit.lines.forEach((line, li) => {
    let x = center ? o.cx - line.width / 2 : o.cx - o.maxW / 2;
    const y = top + li * fit.lh + fit.size * 0.85;
    lineBoxes.push({ x, y, width: line.width });
    line.words.forEach(w => { placed.push({ ...w, x, y }); x += w.width + fit.space; });
  });
  const sceneDur = o.dur ?? 3;
  const tm = wordTiming(anim, placed.length, s.energy, sceneDur);
  g.font = font(fit.size);
  g.textBaseline = "alphabetic";
  g.textAlign = "left";
  const totalChars = placed.reduce((a, w) => a + w.w.length + 1, 0);
  // Máquina de escribir: termina a más tardar al 55 % de la escena (antes cortaba a media palabra).
  const typeTime = Math.max(0.3, Math.min(1.6, totalChars * 0.035, sceneDur * 0.55));
  const typed = anim === "type" ? Math.floor(clamp01((lt + LEAD_IN) / typeTime) * totalChars) : Infinity;
  let charsSoFar = 0;
  let cursor: { x: number; y: number } | null = null;
  placed.forEach((w, k) => {
    const st = wordState(anim, k, lt, tm);
    let shown = w.w;
    if (anim === "type") {
      const left = typed - charsSoFar;
      charsSoFar += w.w.length + 1;
      if (left <= 0) return;
      shown = w.w.slice(0, left);
      g.font = font(fit.size);
      cursor = { x: w.x + g.measureText(shown).width, y: w.y };
    }
    if (st.a <= 0) return;
    g.save();
    g.globalAlpha *= st.a;
    const mx = w.x + w.width / 2, my = w.y - fit.size * 0.35 + st.dy * fit.size;
    g.translate(mx, my); g.scale(st.scale, st.scale); g.translate(-mx, -my + st.dy * fit.size);
    // El resalte arranca cuando entra la palabra (antes esperaba un escalonado fijo y la palabra
    // quedaba invisible: texto del color del fondo sin su caja todavía).
    const hp = clamp01((lt + LEAD_IN - k * tm.stagger - tm.dur * 0.5) / 0.25);
    if (w.hot && s.highlight === "box") {
      const pad = fit.size * 0.12;
      g.fillStyle = P.accent;
      // Alto de la caja con aire para las tildes de mayúsculas (Ñ, Á).
      g.fillRect(w.x - pad, w.y - fit.size * 1.0, (w.width + pad * 2) * easeOut(hp), fit.size * 1.22);
      g.fillStyle = hp > 0.5 ? P.bg : (o.color ?? P.fg);
    } else {
      g.fillStyle = w.hot ? P.accent : (o.color ?? P.fg);
    }
    g.fillText(shown, w.x, w.y);
    if (w.hot && s.highlight === "underline" && shown === w.w) { // en "type", el subrayado espera a la palabra entera
      g.fillStyle = P.accent;
      g.fillRect(w.x, w.y + fit.size * 0.1, w.width * easeOut(hp), Math.max(3, fit.size * 0.07));
    }
    g.restore();
  });
  // Cursor de la máquina de escribir: justo donde va escribiendo.
  const cur = cursor as { x: number; y: number } | null;
  if (anim === "type" && typed < totalChars && cur && Math.floor(lt * 3) % 2 === 0) {
    g.fillStyle = P.accent;
    g.fillRect(cur.x + fit.size * 0.06, cur.y - fit.size * 0.8, Math.max(3, fit.size * 0.08), fit.size * 0.9);
  }
  return { bottom: top + fit.lines.length * fit.lh, size: fit.size, lines: lineBoxes };
}

function drawBeat(c: Ctx, b: Beat, lt: number, dur: number) {
  const { g, W, H, s, vertical } = c;
  const P = s.palette;
  const u = Math.min(W, H);
  const padX = W * (vertical ? 0.09 : 0.1);
  const maxW = W - padX * 2;
  const cx = W / 2;
  const left = s.align === "left";
  const square = !vertical && W / H < 1.2;
  /** Altura de arranque según formato: vertical / cuadrado / horizontal. */
  const at = (v: number, sq: number, h: number) => H * (vertical ? v : square ? sq : h);

  switch (b.layout) {
    case "big_word": {
      drawTextBlock(c, b.text, b.emphasis.length ? b.emphasis : [b.text], lt, { size: u * 0.26, maxW, maxH: H * 0.45, maxLines: 3, cx, top: H * 0.5, vcenter: true, anim: s.text_anim === "type" ? "slam" : s.text_anim, center: true, dur });
      break;
    }
    case "list": {
      const head = drawTextBlock(c, b.text, b.emphasis, lt, { size: u * 0.085, maxW, maxH: H * 0.25, maxLines: 3, cx, top: at(0.28, 0.16, 0.14), dur: dur * 0.5 });
      const items = b.items.filter(it => it.trim());
      const per = Math.max(0.35, (dur - 0.9) / Math.max(1, items.length + 0.5));
      const slide = 40 * (u / 720);
      items.forEach((it, k) => {
        const p = easeOut((lt - 0.5 - k * per) / 0.35);
        if (p <= 0) return;
        const y = head.bottom + u * 0.09 + k * u * 0.17;
        g.save();
        g.globalAlpha *= p;
        g.translate((1 - p) * -slide, 0);
        const bx = left ? padX : padX + maxW * 0.08;
        g.fillStyle = P.accent;
        g.beginPath(); g.arc(bx + u * 0.035, y + u * 0.045, u * 0.036, 0, Math.PI * 2); g.fill();
        g.fillStyle = P.bg; g.font = `800 ${Math.round(u * 0.042)}px Sora, system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(String(k + 1), bx + u * 0.035, y + u * 0.048);
        g.textAlign = "left"; g.textBaseline = "alphabetic";
        g.restore();
        g.save(); g.globalAlpha *= p; g.translate((1 - p) * -slide, 0);
        drawTextBlock(c, it, [], 99, { size: u * 0.068, maxW: maxW * 0.8, maxH: u * 0.13, maxLines: 2, cx: (left ? padX : padX + maxW * 0.08) + u * 0.09 + maxW * 0.4, top: y, color: P.fg, anim: "fade", center: false });
        g.restore();
      });
      break;
    }
    case "contrast": {
      const head = drawTextBlock(c, b.text, b.emphasis, lt, { size: u * 0.08, maxW, maxH: H * 0.22, maxLines: 3, cx, top: at(0.24, 0.12, 0.12), dur: Math.min(dur, 1.2) });
      const [a, z] = b.items;
      const boxH = vertical ? H * 0.17 : H * 0.26;
      const gap = u * 0.04;
      const top = head.bottom + u * 0.07;
      const pa = easeOut((lt - 0.45) / 0.4), pz = easeOut((lt - 0.45 - Math.min(1.2, dur * 0.3)) / 0.4);
      const panel = (txt: string, y: number, p: number, on: boolean) => {
        if (p <= 0 || !txt) return;
        const lift = 30 * (u / 720);
        g.save(); g.globalAlpha *= p; g.translate(0, (1 - p) * lift);
        g.fillStyle = on ? hexToRgba(P.accent, 0.16) : hexToRgba(P.muted, 0.12);
        g.strokeStyle = on ? P.accent : hexToRgba(P.muted, 0.5); g.lineWidth = 2;
        g.beginPath(); g.roundRect(padX, y, maxW, boxH, u * 0.03); g.fill(); g.stroke();
        g.restore();
        g.save(); g.globalAlpha *= p; g.translate(0, (1 - p) * lift);
        const r = drawTextBlock(c, txt, [], 99, { size: u * 0.06, maxW: maxW * 0.86, maxH: boxH * 0.8, maxLines: 3, cx, top: y + boxH / 2, vcenter: true, color: on ? P.fg : P.muted, anim: "fade", center: true });
        // Tachado del "antes": una raya por renglón, del ancho de ese renglón.
        if (!on) { g.fillStyle = P.muted; r.lines.forEach(l => g.fillRect(l.x, l.y - r.size * 0.32, l.width * p, Math.max(2, r.size * 0.06))); }
        g.restore();
      };
      panel(a, top, pa, false);
      panel(z, top + boxH + gap, pz, true);
      break;
    }
    case "question": {
      const qp = easeOut((lt - 0.05) / 0.5);
      g.save(); g.globalAlpha *= 0.18 * qp; g.fillStyle = P.accent;
      // "?" de fondo: más chico y tenue, dentro del cuadro también en 1:1 y 16:9.
      g.font = `900 ${Math.round(u * (vertical ? 0.9 : 0.7))}px "${s.font}", Sora, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
      g.globalAlpha *= vertical ? 1 : 0.7;
      g.fillText("?", W * (vertical ? 0.72 : 0.8), H * 0.5 + (1 - qp) * 40 * (u / 720)); g.restore();
      drawTextBlock(c, b.text, b.emphasis, lt, { size: u * 0.11, maxW, maxH: H * 0.55, maxLines: 6, cx, top: at(0.34, 0.26, 0.24), dur });
      break;
    }
    case "quote": {
      const qp = easeOut(lt / 0.5);
      g.save(); g.globalAlpha *= qp; g.fillStyle = P.accent;
      g.font = `900 ${Math.round(u * 0.32)}px "Playfair Display", Georgia, serif`; g.textAlign = left ? "left" : "center"; g.textBaseline = "alphabetic";
      g.fillText("“", left ? padX - u * 0.02 : cx, at(0.4, 0.36, 0.36)); g.restore();
      drawTextBlock(c, b.text, b.emphasis, lt, { size: u * 0.085, maxW, maxH: H * 0.45, maxLines: 6, cx, top: at(0.4, 0.36, 0.36), dur });
      break;
    }
    case "cta": {
      const r = drawTextBlock(c, b.text, b.emphasis, lt, { size: u * 0.1, maxW, maxH: H * 0.4, maxLines: 5, cx, top: at(0.34, 0.24, 0.22), center: true, dur: dur * 0.7 });
      const p = backOut((lt - 0.55) / 0.45);
      if (lt > 0.55) {
        const pulse = 1 + 0.04 * Math.sin(lt * 5);
        const bw = Math.min(maxW, u * 0.62) * Math.max(0, p) * pulse, bh = u * 0.13 * pulse;
        const by = r.bottom + u * 0.08;
        g.save();
        g.fillStyle = P.accent;
        g.beginPath(); g.roundRect(cx - bw / 2, by, bw, bh, bh / 2); g.fill();
        if (p > 0.8) {
          // El botón dice la palabra clave de la llamada (la resaltada), si cabe; si no, solo la flecha.
          const key = (b.emphasis[0] ?? "").toLocaleUpperCase("es");
          g.fillStyle = P.bg; g.textAlign = "center"; g.textBaseline = "middle";
          g.font = `800 ${Math.round(u * 0.055)}px "${s.font}", Sora, sans-serif`;
          const label = key && g.measureText(`${key} →`).width < bw * 0.85 ? `${key} →` : "→";
          if (label === "→") g.font = `800 ${Math.round(u * 0.07)}px "${s.font}", Sora, sans-serif`;
          g.fillText(label, cx + Math.sin(lt * 6) * u * 0.008, by + bh / 2 + 2);
        }
        g.restore();
      }
      break;
    }
    case "cards": {
      // Título + 2 a 5 tarjetas numeradas que entran una por una en abanico (intro "5 formas de…").
      const head = drawTextBlock(c, b.text, b.emphasis, lt, { size: u * 0.085, maxW, maxH: H * 0.2, maxLines: 3, cx, top: at(0.14, 0.1, 0.1), center: true, dur: Math.min(dur, 1.2) });
      const items = b.items.filter(it => it.trim()).slice(0, 5);
      if (!items.length) break;
      const n = items.length;
      const cols = vertical ? (n <= 3 ? 1 : 2) : square ? Math.min(n, 3) : n;
      const rows = Math.ceil(n / cols);
      const gap = u * 0.03;
      const areaTop = head.bottom + u * 0.06;
      const areaH = Math.min(H * (vertical ? 0.62 : 0.62), H - areaTop - H * (vertical ? 0.12 : 0.08));
      const cw = (maxW - gap * (cols - 1)) / cols;
      const ch = Math.min((areaH - gap * (rows - 1)) / rows, vertical && cols === 1 ? u * 0.3 : cw * 1.25);
      const startY = areaTop + Math.max(0, (areaH - (ch * rows + gap * (rows - 1))) / 2);
      const per = Math.max(0.12, Math.min(0.35, (dur * 0.6 - 0.3) / Math.max(1, n)));
      items.forEach((it, k) => {
        const p = easeOut((lt - 0.25 - k * per) / 0.45);
        if (p <= 0) return;
        const col = k % cols, row = Math.floor(k / cols);
        // La última fila, si queda incompleta, va centrada.
        const inRow = row === rows - 1 ? n - row * cols : cols;
        const rowW = inRow * cw + (inRow - 1) * gap;
        const x = padX + (maxW - rowW) / 2 + col * (cw + gap);
        const y = startY + row * (ch + gap);
        g.save();
        g.globalAlpha *= p;
        g.translate(x + cw / 2, y + ch);
        g.rotate((1 - p) * -0.22); // abanico: entran girando desde la izquierda
        g.translate(-(x + cw / 2) - (1 - p) * u * 0.08, -(y + ch));
        g.fillStyle = hexToRgba(P.fg, 0.06);
        g.strokeStyle = hexToRgba(P.accent, 0.55); g.lineWidth = Math.max(1.5, u * 0.003);
        g.beginPath(); g.roundRect(x, y, cw, ch, u * 0.025); g.fill(); g.stroke();
        const r = Math.min(cw, ch) * 0.13;
        g.fillStyle = P.accent;
        g.beginPath(); g.arc(x + r * 1.6, y + r * 1.6, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = P.bg; g.font = `800 ${Math.round(r * 1.15)}px Sora, system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(String(k + 1), x + r * 1.6, y + r * 1.66);
        g.textAlign = "left"; g.textBaseline = "alphabetic";
        g.restore();
        g.save(); g.globalAlpha *= p;
        g.translate(-(1 - p) * u * 0.08, 0);
        drawTextBlock(c, it, [], 99, { size: Math.min(u * 0.06, ch * 0.2), maxW: cw * 0.84, maxH: ch * 0.5, maxLines: 3, cx: x + cw / 2, top: y + ch * 0.66, vcenter: true, anim: "fade", center: true });
        g.restore();
      });
      break;
    }
    case "chapter": {
      // Portada de un punto: número grande (entra desde la izquierda) + título (sube desde abajo).
      const num = (b.items[0] ?? "").trim() || "1";
      const np = easeOut((lt + LEAD_IN) / 0.5);
      const big = u * (vertical ? 0.42 : 0.36);
      g.save();
      g.globalAlpha *= np;
      g.fillStyle = P.accent; g.textBaseline = "alphabetic";
      g.font = `${fontWeightFor(s)} ${Math.round(big)}px "${s.font}", Sora, sans-serif`;
      const nw = g.measureText(num).width;
      const nx = vertical ? cx - nw / 2 : padX;
      const ny = vertical ? H * 0.46 : H * 0.5 + big * 0.36;
      g.fillText(num, nx - (1 - np) * u * 0.25, ny);
      g.restore();
      // Línea fina que une número y título.
      const lp = easeOut((lt - 0.2) / 0.4);
      g.fillStyle = hexToRgba(P.accent, 0.8);
      if (vertical) g.fillRect(cx - u * 0.12 * lp, H * 0.5, u * 0.24 * lp, Math.max(3, u * 0.008));
      else g.fillRect(padX + nw + u * 0.05, H * 0.5 - big * 0.28, Math.max(3, u * 0.008), big * 0.56 * lp);
      g.save();
      const tp = easeOut((lt - 0.25) / 0.45);
      g.globalAlpha *= tp;
      g.translate(0, (1 - tp) * u * 0.06);
      if (vertical) drawTextBlock(c, b.text, b.emphasis, lt, { size: u * 0.11, maxW, maxH: H * 0.25, maxLines: 3, cx, top: H * 0.55, center: true, dur });
      else {
        const tx = padX + nw + u * 0.1;
        const tw = W - padX - tx;
        drawTextBlock(c, b.text, b.emphasis, lt, { size: u * 0.12, maxW: tw, maxH: H * 0.5, maxLines: 3, cx: tx + tw / 2, top: H * 0.5, vcenter: true, center: false, dur });
      }
      g.restore();
      break;
    }
    case "chart": {
      // Gráfica de línea que se dibuja sola. SOLO con valores reales (guion o la persona); sin valores
      // no se dibuja nada inventado: queda el título.
      const head = drawTextBlock(c, b.text, b.emphasis, lt, { size: u * 0.075, maxW, maxH: H * 0.18, maxLines: 2, cx, top: at(0.16, 0.08, 0.08), center: true, dur: Math.min(dur, 1) });
      const vals = (b.values ?? []).filter(Number.isFinite).slice(0, 12);
      if (vals.length < 2) break;
      const labels = b.items.slice(0, vals.length);
      const top = head.bottom + u * 0.1;
      const bottom = H * (vertical ? 0.72 : 0.82);
      const x0 = padX + u * 0.02, x1 = W - padX - u * 0.02;
      const min = Math.min(...vals), max = Math.max(...vals);
      const span = max - min || Math.abs(max) || 1;
      const lo = min - span * 0.12, hi = max + span * 0.18;
      const px = (i: number) => x0 + ((x1 - x0) * i) / (vals.length - 1);
      const py = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
      // Rejilla suave.
      g.strokeStyle = hexToRgba(P.muted, 0.18); g.lineWidth = Math.max(1, u * 0.0015);
      for (let k = 0; k <= 3; k++) { const y = top + ((bottom - top) * k) / 3; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); }
      const prog = easeInOut((lt - 0.35) / Math.max(0.6, dur * 0.55));
      const reach = prog * (vals.length - 1);
      const pts: [number, number][] = [];
      for (let i = 0; i <= Math.floor(reach); i++) pts.push([px(i), py(vals[i])]);
      if (reach < vals.length - 1 && reach > 0) {
        const i = Math.floor(reach), f = reach - i;
        pts.push([px(i) + (px(i + 1) - px(i)) * f, py(vals[i]) + (py(vals[i + 1]) - py(vals[i])) * f]);
      }
      if (pts.length >= 2) {
        const grad = g.createLinearGradient(0, top, 0, bottom);
        grad.addColorStop(0, hexToRgba(P.accent, 0.28)); grad.addColorStop(1, hexToRgba(P.accent, 0));
        g.beginPath(); g.moveTo(pts[0][0], bottom); pts.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(pts[pts.length - 1][0], bottom); g.closePath();
        g.fillStyle = grad; g.fill();
        g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.strokeStyle = P.accent; g.lineWidth = Math.max(3, u * 0.008); g.lineJoin = "round"; g.lineCap = "round"; g.stroke();
      }
      g.textAlign = "center"; g.textBaseline = "top";
      g.font = `600 ${Math.round(u * 0.032)}px Sora, system-ui, sans-serif`;
      vals.forEach((v, i) => {
        if (i > reach + 0.001) return;
        g.fillStyle = P.accent; g.beginPath(); g.arc(px(i), py(v), Math.max(4, u * 0.011), 0, Math.PI * 2); g.fill();
        if (labels[i] && (vals.length <= 7 || i % 2 === 0 || i === vals.length - 1)) { g.fillStyle = P.muted; g.fillText(labels[i], px(i), bottom + u * 0.02); }
      });
      // El último valor, grande, al terminar de dibujar.
      const lp = easeOut((reach - (vals.length - 1.3)) / 0.3);
      if (lp > 0) {
        const lx = px(vals.length - 1), ly = py(vals[vals.length - 1]);
        g.save(); g.globalAlpha *= lp;
        g.font = `800 ${Math.round(u * 0.06)}px "${s.font}", Sora, sans-serif`; g.fillStyle = P.fg;
        g.textAlign = lx > W * 0.7 ? "right" : "center"; g.textBaseline = "bottom";
        g.fillText(fmtNum(vals[vals.length - 1]), lx, ly - u * 0.03);
        g.restore();
      }
      g.textAlign = "left"; g.textBaseline = "alphabetic";
      break;
    }
    case "product": {
      // Foto del producto flotando + sus características alrededor (estilo anuncio de Apple).
      const img = b.image ? c.assets?.[b.image] : undefined;
      const head = drawTextBlock(c, b.text, b.emphasis, lt, { size: u * 0.08, maxW, maxH: H * 0.16, maxLines: 2, cx, top: at(0.1, 0.06, 0.08), center: true, dur: Math.min(dur, 1) });
      const feats = b.items.filter(it => it.trim()).slice(0, 4);
      const boxW = vertical ? maxW * 0.8 : square ? maxW * 0.5 : maxW * 0.42;
      const boxH = vertical ? H * 0.36 : H * 0.58;
      const bx = cx - boxW / 2, by = head.bottom + u * 0.04;
      const ip = easeOut((lt + LEAD_IN) / 0.6);
      const float = Math.sin(lt * 1.6) * u * 0.012;
      if (img && img.width && img.height) {
        const k = Math.min(boxW / img.width, boxH / img.height) * (0.9 + 0.1 * ip);
        const w = img.width * k, h = img.height * k;
        // Sombra en el piso.
        g.save(); g.globalAlpha *= 0.35 * ip; g.fillStyle = "#000";
        g.beginPath(); g.ellipse(cx, by + boxH * 0.97, w * 0.32, u * 0.018, 0, 0, Math.PI * 2); g.fill(); g.restore();
        g.save(); g.globalAlpha *= ip;
        g.drawImage(img, cx - w / 2, by + (boxH - h) / 2 + float + (1 - ip) * u * 0.05, w, h);
        g.restore();
      } else {
        // Sin foto todavía: un marco que dice qué falta (la persona sube la foto en el editor).
        g.save(); g.globalAlpha *= ip * 0.8;
        g.setLineDash([u * 0.015, u * 0.012]); g.strokeStyle = hexToRgba(P.muted, 0.6); g.lineWidth = Math.max(2, u * 0.004);
        g.beginPath(); g.roundRect(bx, by, boxW, boxH, u * 0.03); g.stroke(); g.setLineDash([]);
        g.fillStyle = P.muted; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `600 ${Math.round(u * 0.04)}px Sora, system-ui, sans-serif`;
        g.fillText("Foto de tu producto", cx, by + boxH / 2); g.textAlign = "left"; g.textBaseline = "alphabetic";
        g.restore();
      }
      const per = Math.max(0.15, Math.min(0.4, (dur * 0.65 - 0.6) / Math.max(1, feats.length)));
      feats.forEach((f, k) => {
        const p = easeOut((lt - 0.6 - k * per) / 0.4);
        if (p <= 0) return;
        let x: number, y: number, fw: number;
        if (vertical || square) {
          fw = maxW * (feats.length > 2 ? 0.48 : 0.9);
          const cols = feats.length > 2 ? 2 : 1;
          x = padX + (k % cols) * (maxW - fw) + (cols === 1 ? (maxW - fw) / 2 : 0);
          y = by + boxH + u * 0.05 + Math.floor(k / cols) * u * 0.14;
        } else {
          fw = (W - boxW) / 2 - padX - u * 0.04;
          x = k % 2 === 0 ? padX : cx + boxW / 2 + u * 0.04;
          y = by + boxH * (0.15 + Math.floor(k / 2) * 0.45);
        }
        const fh = u * 0.11;
        g.save(); g.globalAlpha *= p; g.translate(0, (1 - p) * u * 0.04);
        g.fillStyle = hexToRgba(P.fg, 0.07); g.strokeStyle = hexToRgba(P.accent, 0.5); g.lineWidth = Math.max(1.5, u * 0.003);
        g.beginPath(); g.roundRect(x, y, fw, fh, fh / 2); g.fill(); g.stroke();
        g.fillStyle = P.accent; g.beginPath(); g.arc(x + fh * 0.5, y + fh / 2, fh * 0.14, 0, Math.PI * 2); g.fill();
        g.restore();
        g.save(); g.globalAlpha *= p; g.translate(0, (1 - p) * u * 0.04);
        drawTextBlock(c, f, [], 99, { size: u * 0.042, maxW: fw - fh * 1.1, maxH: fh * 0.8, maxLines: 2, cx: x + fh * 0.85 + (fw - fh * 1.1) / 2, top: y + fh / 2, vcenter: true, center: false, anim: "fade", color: P.fg });
        g.restore();
      });
      break;
    }
    default: {
      // statement
      const top = at(0.36, 0.28, 0.26);
      if (left) { g.fillStyle = P.accent; g.fillRect(padX, top - u * 0.06, u * 0.12 * easeOut(lt / 0.4), Math.max(4, u * 0.012)); }
      drawTextBlock(c, b.text, b.emphasis, lt, { size: u * 0.12, maxW, maxH: H * 0.5, maxLines: 6, cx, top, dur });
    }
  }
}

/** Un cuadro del video en el tiempo `t` (segundos). */
export function drawMotionFrame(g: CanvasRenderingContext2D, W: number, H: number, style: MotionStyle, beats: Beat[], tl: Timeline, t: number, assets?: MotionAssets) {
  const c: Ctx = { g, W, H, s: style, vertical: H > W, assets };
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
        g.save(); g.beginPath(); g.rect(x, 0, W - x, H); g.clip(); drawBackground(c, t, i - 1); layer(i - 1, prevT); g.restore();
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
  audio?: { buffer: AudioBuffer; at: number }[]; record?: boolean; monitor?: boolean; assets?: MotionAssets;
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
    if (cancelled || !recording) { try { if (recording) recorder.stop(); } catch { /* nada */ } cleanup(); resolveDone(null); return; }
    recorder.onstop = () => { cleanup(); const type = rec!.mime.split(";")[0]; resolveDone({ blob: new Blob(chunks, { type }), mime: type, ext: rec!.ext }); };
    try { recorder.stop(); } catch (e) { cleanup(); rejectDone(e instanceof Error ? e : new Error("No se pudo cerrar la grabación.")); }
  };

  let recording = false;
  const frame = () => {
    if (stopped) return;
    const now = ctx.currentTime - t0;
    // La grabación arranca justo cuando arranca la voz (t0), no antes: así el MP4, voz.wav y el .srt
    // del paquete empiezan en el mismo segundo 0 (QA 08-oct: el video iba ~0,25 s atrasado).
    if (recorder && !recording && now >= 0) { recording = true; recorder.start(1000); }
    drawMotionFrame(g, W, H, o.style, o.beats, o.tl, Math.max(0, Math.min(now, total)), o.assets);
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
    if (recorder) recorder.onerror = () => { cleanup(); stopped = true; rejectDone(new Error("La grabación falló. Intenta de nuevo.")); };
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
  // Sin saltos de línea dentro de un subtítulo (un renglón vacío parte el bloque del .srt) y sin
  // subtítulos vacíos: se numeran solo los que tienen texto.
  return beats.map((b, i) => ({ i, t: (b.narration || b.text).replace(/\s+/g, " ").trim() })).filter(x => x.t)
    .map((x, n) => `${n + 1}\n${srtTime(tl[x.i].start)} --> ${srtTime(tl[x.i].start + tl[x.i].dur)}\n${x.t}\n`).join("\n");
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
  /** Fotos de producto por nombre de archivo (van en imagenes/; plan.json las nombra en scenes[].image). */
  images?: Record<string, Blob>;
}): Promise<Blob> {
  const total = timelineTotal(o.tl);
  const files: { name: string; data: Blob | string }[] = [{ name: "LEEME.txt", data: README }];
  if (o.video) files.push({ name: `video.${o.video.ext}`, data: o.video.blob });
  if (o.voice?.length) files.push({ name: "voz.wav", data: voiceTrackWav(o.voice, total) });
  files.push({ name: "subtitulos.srt", data: toSrt(o.plan.beats, o.tl) });
  files.push({ name: "prompts.txt", data: promptsText(o.style, o.plan) });
  for (const [name, blob] of Object.entries(o.images ?? {})) {
    if (o.plan.beats.some(b => b.image === name)) files.push({ name: `imagenes/${name}`, data: blob });
  }
  files.push({ name: "plan.json", data: JSON.stringify({
    title: o.plan.title, format: o.format, size: motionSize(o.format), fps: 30, seconds: Math.round(total * 100) / 100,
    style: o.style, caption: o.plan.caption, clips: o.plan.clips ?? [],
    scenes: o.plan.beats.map((b, i) => ({ ...b, start: Math.round(o.tl[i].start * 1000) / 1000, duration: Math.round(o.tl[i].dur * 1000) / 1000 })),
  }, null, 2) });
  return makeZip(files);
}
