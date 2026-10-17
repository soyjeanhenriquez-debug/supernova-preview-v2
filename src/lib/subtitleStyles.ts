/**
 * "Estilos de subtítulos y edición" de Sube tu video (16-oct-2026, Fase A; referencias de Jean).
 * Funciones puras: de los subtítulos con tiempos (desde/hasta/texto) salen las palabras con su tiempo
 * y las "pantallas" (grupos de palabras) que muestra cada estilo. Se prueban en subtitleStyles.test.ts.
 */
import type { Subtitle } from "@/lib/burnSubtitles";

export type StyleId = "impacto" | "minimal" | "brillo" | "resaltado" | "clasico" | "caja";

export type SubStyleDef = {
  id: StyleId;
  nombre: string;
  /** Una línea: cómo se ve y para qué sirve. */
  linea: string;
  /** Cuántas palabras por pantalla, como mucho. */
  porPantalla: number;
  mayusculas: boolean;
  /** Dónde va el texto, de 0 (arriba) a 1 (abajo). */
  y: number;
};

export const SUB_STYLES: SubStyleDef[] = [
  { id: "impacto", nombre: "Impacto", linea: "Mayúsculas gruesas abajo y título arriba. Para retener.", porPantalla: 3, mayusculas: true, y: 0.74 },
  { id: "minimal", nombre: "Minimal", linea: "Dos palabras chicas al pecho. La emoción la pone tu cara.", porPantalla: 2, mayusculas: false, y: 0.62 },
  { id: "brillo", nombre: "Una palabra", linea: "Una palabra a la vez, cursiva y con brillo.", porPantalla: 1, mayusculas: false, y: 0.6 },
  { id: "resaltado", nombre: "Palabra en color", linea: "La palabra que dices se pinta en ámbar.", porPantalla: 3, mayusculas: false, y: 0.7 },
  { id: "clasico", nombre: "Clásico", linea: "Blanco con borde negro: se lee en cualquier fondo.", porPantalla: 4, mayusculas: false, y: 0.72 },
  { id: "caja", nombre: "En caja", linea: "Texto en una caja oscura, limpio y serio.", porPantalla: 4, mayusculas: false, y: 0.72 },
];
export const SUB_STYLE_BY_ID = Object.fromEntries(SUB_STYLES.map(s => [s.id, s])) as Record<StyleId, SubStyleDef>;

export type Word = { t0: number; t1: number; w: string };
export type Screen = { t0: number; t1: number; words: Word[] };

/** Palabras con su tiempo: cada subtítulo reparte su duración según el largo de cada palabra. */
export function wordsFromSubs(subs: Subtitle[]): Word[] {
  const out: Word[] = [];
  for (const s of subs) {
    const ws = s.texto.split(/\s+/).map(w => w.trim()).filter(Boolean);
    if (!ws.length || !(s.hasta > s.desde)) continue;
    const weight = ws.map(w => w.length + 2);
    const total = weight.reduce((a, b) => a + b, 0);
    let t = s.desde;
    ws.forEach((w, i) => {
      const d = (s.hasta - s.desde) * (weight[i] / total);
      out.push({ t0: t, t1: t + d, w });
      t += d;
    });
  }
  return out;
}

/**
 * Agrupa las palabras en pantallas de hasta `per` palabras. Corta antes si termina una frase
 * (. ? !) o si hay una pausa de más de 0,6 s, para que el texto acompañe cómo se habla.
 */
export function screensOf(words: Word[], per: number): Screen[] {
  const out: Screen[] = [];
  let cur: Word[] = [];
  const flush = () => { if (cur.length) out.push({ t0: cur[0].t0, t1: cur[cur.length - 1].t1, words: cur }); cur = []; };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (cur.length && prev && w.t0 - prev.t1 > 0.6) flush();
    cur.push(w);
    if (cur.length >= per || /[.?!…]$/.test(w.w)) flush();
  });
  flush();
  return out;
}

/** La pantalla que se ve en el segundo `t` (o null entre frases). */
export function screenAt(screens: Screen[], t: number): Screen | null {
  return screens.find(s => t >= s.t0 && t < s.t1 + 0.05) ?? null;
}

/** Quita la puntuación final de una palabra para mostrarla (las comas sueltas se ven mal en pantalla). */
export const showWord = (w: string, upper: boolean) => {
  const clean = w.replace(/[.,;:]+$/, "");
  return upper ? clean.toLocaleUpperCase("es") : clean;
};
