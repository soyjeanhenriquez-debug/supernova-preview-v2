// Quitar silencios y frases repetidas de tu toma (27-oct-2026, Jean). Con los tiempos de los subtítulos se arma la
// lista de tramos que se quedan: lo que dices, con un margen, sin las pausas largas ni los intentos que repetiste
// (cuando dices una frase y la vuelves a empezar, se queda la última). No usa IA ni créditos: corta en tu navegador.
import type { Subtitle } from "@/lib/burnSubtitles";
import type { Word } from "@/lib/subtitleStyles";

export type Tramo = { a: number; b: number };

/** Margen antes y después de cada frase (los tiempos de los subtítulos son aproximados). */
export const MARGEN = 0.22;
/** Una pausa más corta que esto se deja (es respiración, no silencio). */
export const PAUSA_MAX = 0.45;

const palabras = (s: string) => s.toLocaleLowerCase("es").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

/**
 * Frases que repetiste: una frase que vuelve a decirse (casi igual) en una de las 2 siguientes, o un arranque corto
 * que la siguiente repite y completa. Se marca la de antes: la buena es la última.
 */
export function repetidas(subs: Subtitle[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < subs.length; i++) {
    const a = palabras(subs[i].texto);
    if (!a.length) continue;
    for (const j of [i + 1, i + 2]) {
      const b = palabras(subs[j]?.texto ?? "");
      if (!b.length) continue;
      const comun = a.filter(w => b.includes(w)).length / a.length;
      const arranque = a.slice(0, 2).join(" ") === b.slice(0, 2).join(" ");
      const prefijo = a.length <= 6 && a.every((w, k) => b[k] === w);
      if (prefijo || (arranque && comun >= 0.7)) { out.push(i); break; }
    }
  }
  return out;
}

/** Los tramos que se quedan del video original (en segundos), sin silencios largos ni las frases quitadas. */
export function tramos(subs: Subtitle[], dur: number, quitar: Set<number> = new Set()): Tramo[] {
  const fin = dur > 0 ? dur : Infinity;
  const base = subs.map((s, i) => ({ s, i }))
    .filter(({ s, i }) => !quitar.has(i) && s.hasta > s.desde && s.texto.trim())
    .map(({ s }) => ({ a: Math.max(0, s.desde - MARGEN), b: Math.min(fin, s.hasta + MARGEN) }))
    .sort((x, y) => x.a - y.a);
  const out: Tramo[] = [];
  for (const t of base) {
    const last = out[out.length - 1];
    if (last && t.a - last.b <= PAUSA_MAX) last.b = Math.max(last.b, t.b);
    else out.push({ ...t });
  }
  return out.filter(t => t.b - t.a > 0.05);
}

export const duracion = (ts: Tramo[]) => ts.reduce((n, t) => n + (t.b - t.a), 0);

/** Pasa un momento del video original al video recortado (o null si cae en una parte quitada). */
export function aRecortado(t: number, ts: Tramo[]): number | null {
  let off = 0;
  for (const x of ts) {
    if (t >= x.a && t <= x.b) return off + (t - x.a);
    off += x.b - x.a;
  }
  return null;
}

/** Las palabras con su tiempo en el video recortado (las de partes quitadas no se muestran). */
export function palabrasRecortadas(words: Word[], ts: Tramo[]): Word[] {
  const out: Word[] = [];
  for (const w of words) {
    const t0 = aRecortado(w.t0, ts), t1 = aRecortado(w.t1, ts);
    if (t0 === null || t1 === null) continue;
    out.push({ ...w, t0, t1: Math.max(t1, t0 + 0.05) });
  }
  return out;
}
