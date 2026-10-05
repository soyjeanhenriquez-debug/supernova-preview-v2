/**
 * Tema del carrusel (05-oct-2026): de UN color de marca salen todos sus tonos, como un sistema de
 * diseño de verdad. Principal, claro (+35 % blanco), oscuro (+35 % negro), fondo crema con el matiz
 * de la marca (nunca blanco puro), fondo casi negro con el mismo matiz y un degradado principal → oscuro.
 * Cada tono de lámina (claro, oscuro, degradado) elige el acento que SÍ se lee sobre su fondo.
 */
import type { StyleId, Tone } from "@/lib/carousel";

export type Fonts = {
  display: string; displayWeight: number; body: string; mono: string; monoWeight?: number; upperTitle?: boolean; css: string;
  /** Fuente de las palabras resaltadas (la "cursiva con serifa" del estilo póster). */
  accent?: { family: string; italic: boolean; weight: number };
  /** Diseño plano: bordes gruesos, sombra sólida de color, color de marca liso (sin degradado). */
  flat?: boolean;
  /** Fondos fijos del estilo (si no, salen del matiz de la marca). */
  lightBg?: string; darkBg?: string;
};
export const FONTS: Record<StyleId, Fonts> = {
  poster: {
    display: "Archivo Black", displayWeight: 400, body: "Inter", mono: "Inter", monoWeight: 800, flat: true, lightBg: "#f4efe6", darkBg: "#0b0b0b",
    accent: { family: "Instrument Serif", italic: true, weight: 400 },
    css: "family=Archivo+Black&family=Inter:wght@400;600;700;800&family=Instrument+Serif:ital@0;1",
  },
  editorial: { display: "Fraunces", displayWeight: 700, body: "Nunito Sans", mono: "JetBrains Mono", css: "family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Nunito+Sans:wght@400;600;700&family=JetBrains+Mono:wght@500;700" },
  moderno: { display: "Sora", displayWeight: 700, body: "Manrope", mono: "JetBrains Mono", css: "family=Sora:wght@600;700&family=Manrope:wght@400;600;700&family=JetBrains+Mono:wght@500;700" },
  impacto: { display: "Anton", displayWeight: 400, body: "Inter", mono: "Space Mono", upperTitle: true, css: "family=Anton&family=Inter:wght@400;600;700&family=Space+Mono:wght@400;700" },
  elegante: { display: "Playfair Display", displayWeight: 700, body: "DM Sans", mono: "DM Mono", css: "family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;600;700&family=DM+Mono:wght@500" },
};

type RGB = [number, number, number];
const toRgb = (hex: string): RGB => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = ([r, g, b]: RGB) => `#${[r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
const mix = (a: string, b: string, t: number) => { const x = toRgb(a), y = toRgb(b); return toHex([0, 1, 2].map(i => x[i] + (y[i] - x[i]) * t) as RGB); };
export const rgba = (hex: string, a: number) => { const [r, g, b] = toRgb(hex); return `rgba(${r},${g},${b},${a})`; };

function hue(hex: string): number {
  const [r, g, b] = toRgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 30;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
function hsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}
function lum(hex: string) {
  const [r, g, b] = toRgb(hex).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

/** Acerca un color a blanco o negro hasta que se lea sobre el fondo (sin cambiar su matiz). */
function readable(color: string, bg: string, min: number, toward: "#000000" | "#ffffff"): string {
  for (let t = 0; t <= 1; t += 0.05) { const c = mix(color, toward, t); if (contrast(c, bg) >= min) return c; }
  return toward;
}

export type Palette = { primary: string; light: string; dark: string; lightBg: string; darkBg: string };
export function palette(brand: string, style?: StyleId): Palette {
  const h = hue(brand);
  const f = style ? FONTS[style] : undefined;
  return {
    primary: brand,
    light: mix(brand, "#ffffff", 0.35),
    dark: mix(brand, "#000000", 0.35),
    lightBg: f?.lightBg ?? hsl(h, 0.42, 0.955),
    darkBg: f?.darkBg ?? hsl(h, 0.22, 0.07),
  };
}

/** Colores concretos de una lámina según su tono. */
export type ToneColors = {
  bg: string; text: string; muted: string; accent: string; card: string; border: string; track: string;
  /** Texto sobre un botón/pastilla rellena de acento. */
  onAccent: string; glow: string;
};
export function toneColors(brand: string, tone: Tone, style?: StyleId): ToneColors {
  const p = palette(brand, style);
  const flat = style ? !!FONTS[style].flat : false;
  if (tone === "claro") {
    const text = mix(p.darkBg, "#000000", 0.2);
    const accent = readable(p.primary, p.lightBg, 3, "#000000");
    if (flat) return { bg: p.lightBg, text: "#0b0b0b", muted: rgba("#0b0b0b", 0.66), accent, card: "#ffffff", border: "#0b0b0b", track: rgba("#0b0b0b", 0.12), onAccent: contrast("#ffffff", accent) >= 3 ? "#ffffff" : "#0b0b0b", glow: "transparent" };
    return { bg: p.lightBg, text, muted: rgba(text, 0.62), accent, card: rgba("#ffffff", 0.75), border: rgba(p.dark, 0.14), track: rgba(text, 0.1), onAccent: contrast("#ffffff", accent) >= 3 ? "#ffffff" : text, glow: rgba(p.primary, 0.1) };
  }
  if (tone === "oscuro") {
    const text = "#f6f1ea";
    const accent = flat ? readable(p.primary, p.darkBg, 4.5, "#ffffff") : readable(p.light, p.darkBg, 4.5, "#ffffff");
    if (flat) return { bg: p.darkBg, text: "#f4efe6", muted: rgba("#f4efe6", 0.68), accent, card: rgba("#ffffff", 0.05), border: rgba("#f4efe6", 0.85), track: rgba("#ffffff", 0.14), onAccent: contrast("#ffffff", p.primary) >= 3 ? "#ffffff" : "#0b0b0b", glow: "transparent" };
    return { bg: p.darkBg, text, muted: rgba(text, 0.62), accent, card: rgba("#ffffff", 0.045), border: rgba("#ffffff", 0.09), track: rgba("#ffffff", 0.1), onAccent: contrast("#ffffff", p.primary) >= 3 ? "#ffffff" : p.darkBg, glow: rgba(p.primary, 0.22) };
  }
  // Degradado de marca: el texto en blanco o en el fondo oscuro, el que más se lea.
  const whiteOk = contrast("#ffffff", p.primary) >= 2.6;
  if (flat) {
    const text = whiteOk ? "#ffffff" : "#0b0b0b";
    return { bg: p.primary, text, muted: rgba(text, 0.82), accent: whiteOk ? "#0b0b0b" : "#ffffff", card: rgba("#ffffff", 0.14), border: "#0b0b0b", track: rgba("#0b0b0b", 0.18), onAccent: whiteOk ? "#ffffff" : "#0b0b0b", glow: "transparent" };
  }
  const text = whiteOk ? "#ffffff" : p.darkBg;
  return {
    bg: flat ? p.primary : `linear-gradient(150deg, ${p.primary} 0%, ${p.dark} 100%)`, text, muted: whiteOk ? rgba("#ffffff", 0.78) : rgba(p.darkBg, 0.72),
    accent: whiteOk ? p.lightBg : p.darkBg, card: whiteOk ? rgba("#ffffff", 0.12) : rgba("#ffffff", 0.3), border: whiteOk ? rgba("#ffffff", 0.22) : rgba(p.darkBg, 0.18),
    track: whiteOk ? rgba("#ffffff", 0.22) : rgba(p.darkBg, 0.15), onAccent: whiteOk ? p.dark : "#ffffff", glow: rgba("#ffffff", 0.12),
  };
}

// ── Fuentes ──────────────────────────────────────────────────────────────────────────────────────
const cssUrl = (s: StyleId) => `https://fonts.googleapis.com/css2?${FONTS[s].css}&display=swap`;

/** Pone la hoja de fuentes del estilo en la página (para la vista previa) y espera a que cargue. */
export async function loadStyleFonts(s: StyleId): Promise<void> {
  if (typeof document === "undefined") return;
  if (!document.querySelector(`link[data-carousel-style="${s}"]`)) {
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = cssUrl(s); l.dataset.carouselStyle = s;
    const ready = new Promise<void>(res => { l.onload = () => res(); l.onerror = () => res(); });
    document.head.appendChild(l);
    await Promise.race([ready, new Promise(r => setTimeout(r, 4000))]);
  }
  const f = FONTS[s];
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`${f.displayWeight} 80px "${f.display}"`, "ÁÉÍÓÚÑ¿?"),
        document.fonts.load(`400 40px "${f.body}"`, "áéíóúñ"),
        document.fonts.load(`700 40px "${f.body}"`, "áéíóúñ"),
        document.fonts.load(`${f.monoWeight ?? 500} 30px "${f.mono}"`, "ABC"),
        ...(f.accent ? [document.fonts.load(`${f.accent.italic ? "italic " : ""}${f.accent.weight} 80px "${f.accent.family}"`, "áéíóú")] : []),
      ]),
      new Promise(r => setTimeout(r, 4000)),
    ]);
  } catch { /* se ve con la de respaldo */ }
}

const embedCache = new Map<StyleId, Promise<string>>();
/**
 * CSS de las fuentes con los archivos incrustados (base64), para que la imagen exportada lleve las
 * fuentes reales. Solo el subconjunto latino (trae todo el español: á, ñ, ¿, ¡) para que pese poco.
 */
export function fontEmbedCss(s: StyleId): Promise<string> {
  const hit = embedCache.get(s);
  if (hit) return hit;
  const job = (async () => {
    const css = await (await fetch(cssUrl(s))).text();
    const blocks = css.split(/(?=\/\*\s*[a-z-]+\s*\*\/)/).filter(b => /\/\*\s*latin\s*\*\//.test(b));
    const out: string[] = [];
    for (const b of blocks) {
      const url = b.match(/url\((https:[^)]+)\)/)?.[1];
      if (!url) continue;
      const buf = await (await fetch(url)).arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      out.push(b.replace(url, `data:font/woff2;base64,${btoa(bin)}`));
    }
    return out.join("\n");
  })();
  job.catch(() => embedCache.delete(s));
  embedCache.set(s, job);
  return job;
}

/**
 * Lámina → PNG. html-to-image arma el SVG con todo incrustado (fuentes, fotos) y el dibujo final se
 * hace aquí, sin requestAnimationFrame: así la descarga no se queda colgada si la pestaña pasa a
 * segundo plano mientras se exporta.
 */
export async function slideToBlob(node: HTMLElement, width: number, height: number, fontEmbedCSS: string, type: "image/png" | "image/webp" = "image/png"): Promise<Blob> {
  const { toSvg } = await import("html-to-image");
  const svg = await toSvg(node, { width, height, fontEmbedCSS, cacheBust: false });
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("No se pudo preparar la lámina.")); img.src = svg; });
  const c = document.createElement("canvas");
  c.width = width; c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar la lámina.");
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error("No se pudo preparar la lámina."))), type, 0.92));
}
