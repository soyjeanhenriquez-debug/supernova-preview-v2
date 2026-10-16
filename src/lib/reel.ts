/**
 * Analiza un Reel v2 (16-oct-2026): tipos de lo que devuelve reel-analyze, los 3 niveles y los textos
 * que se copian (teleprompter y formato Notion de Jean). Funciones puras: se prueban en reel.test.ts.
 */

export type Nivel = "espejo" | "adaptacion" | "inspiracion";

export const NIVELES: { id: Nivel; nombre: string; pct: string; conserva: string; cambia: string; para: string }[] = [
  { id: "espejo", nombre: "Espejo", pct: "~90 %", conserva: "La misma estructura, los mismos tramos, el mismo tipo de gancho y el mismo ritmo.",
    cambia: "Solo tu nicho, los ejemplos y el cierre.", para: "Para cuando el Reel es de tu mismo tema y quieres ir a lo seguro." },
  { id: "adaptacion", nombre: "Adaptación", pct: "~75 %", conserva: "La estructura y la fórmula del gancho.",
    cambia: "La historia, el ángulo, los ejemplos y el cierre, con tu producto.", para: "Lo recomendado: lo que funcionó, contado con lo tuyo." },
  { id: "inspiracion", nombre: "Inspiración", pct: "~50 %", conserva: "Solo el truco de por qué funcionó.",
    cambia: "Todo el contenido: te damos 3 ideas nuevas y el guion de la mejor.", para: "Para cuando el Reel es de otro tema." },
];
export const NIVEL_BY_ID = Object.fromEntries(NIVELES.map(n => [n.id, n])) as Record<Nivel, (typeof NIVELES)[number]>;

export type Linea = { inicio: number; fin: number; dices: string; se_ve: string; texto_pantalla: string; original: number | null };
export type Version = {
  nivel: Nivel; que_se_mantuvo: string[]; que_cambio: string[]; formula_explicada: string;
  ideas: { titulo: string; por_que: string }[];
  ganchos: string[]; guion: Linea[]; cierre: string;
  publicar: { copy: string; palabra_clave: string; hashtags: string[]; comentario_fijado: string };
};
export type PorQue = {
  resumen: string;
  gancho: { se_ve: string; se_dice: string; texto_pantalla: string; por_que: string };
  claves: string[]; mejorar: string[];
  timeline: { inicio: number; fin: number; etiqueta: string; descripcion: string; se_ve?: string }[];
  formula_gancho: string; mecanismo: string; cta?: { tipo: string; palabra: string };
  idioma?: string; duracion_s?: number | null;
};
export type ReelView = {
  analysis_id: string;
  source: { url: string; shortcode: string; owner: string; views: number | null; likes: number | null; comments: number | null; cover: string | null; duracion_s: number | null };
  por_que_funciona: PorQue;
  version?: Version;
  opciones?: { nicho: string; oferta: string; palabra_clave: string };
};

/** Lo que se dice, una frase por párrafo, sin "Dices:" ni segundos. El gancho elegido reemplaza la primera frase. */
export function teleprompterLines(v: Version, hook = 0): string[] {
  const lines = v.guion.flatMap(t => splitPhrases(t.dices));
  const g = v.ganchos[hook]?.trim();
  if (g) { if (lines.length) lines[0] = g; else lines.push(g); }
  if (v.cierre.trim() && !lines.some(l => l.includes(v.cierre.trim()))) lines.push(...splitPhrases(v.cierre));
  return lines.filter(Boolean);
}

/** Corta un texto en frases (punto, signo de interrogación o exclamación). */
export function splitPhrases(t: string): string[] {
  return (t.match(/[^.!?¡¿]*[¡¿]?[^.!?]*[.!?]+|[^.!?]+$/g) ?? [])
    .map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** Duración estimada al hablar: palabras / 2,5 = segundos. */
export function speakSeconds(lines: string[]): number {
  const words = lines.join(" ").split(/\s+/).filter(Boolean).length;
  return Math.round(words / 2.5);
}

const rango = (a: number, b: number) => `${fmtSec(a)}–${fmtSec(b)} s`;
const fmtSec = (x: number) => (Number.isInteger(x) ? String(x) : String(x).replace(".", ","));

/** Botón A — "Copiar ¿Por qué funciona?" (formato fijo que Jean parsea en Notion). */
export function notionPorQue(p: PorQue): string {
  const gancho = [p.gancho.se_dice && `«${p.gancho.se_dice}»`, p.gancho.por_que].filter(Boolean).join(" — ");
  return [
    `RESUMEN: ${p.resumen}`,
    `GANCHO: ${gancho}`,
    "CLAVES:", ...p.claves.slice(0, 3).map(c => `- ${c}`),
    "MEJORAR:", ...p.mejorar.slice(0, 2).map(m => `- ${m}`),
  ].join("\n");
}

/** Botón B — "Copiar guion (formato Notion)": cada tramo con su rango en una línea sola y "Dices:". */
export function notionGuion(v: Version, hook = 0): string {
  const out = [`GANCHO: ${v.ganchos[hook] ?? v.ganchos[0] ?? ""}`, ""];
  for (const t of v.guion) {
    out.push(rango(t.inicio, t.fin), `Dices: ${t.dices}`, `Se ve: ${t.se_ve}`, `Texto en pantalla: ${t.texto_pantalla}`);
  }
  out.push("", `CIERRE: ${v.cierre}`);
  return out.join("\n");
}

/** Texto de la pestaña Edición: tramos con segundos, lo que se ve y el texto en pantalla (sin el discurso). */
export function editingText(v: Version): string {
  return v.guion.map(t => `${rango(t.inicio, t.fin)}\nSe ve: ${t.se_ve}\nTexto en pantalla: ${t.texto_pantalla}`).join("\n\n");
}

/** Texto de la pestaña Publicar. */
export function publishText(v: Version): string {
  const p = v.publicar;
  return [p.copy, "", `Comenta ${p.palabra_clave}`, "", p.hashtags.join(" "), "", `Comentario fijado: ${p.comentario_fijado}`].join("\n").trim();
}

/** ¿Es un enlace de Reel que el servidor acepta? (la misma forma que REEL_RE del servidor). */
export const REEL_URL_RE = /^https?:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9._]+\/)?(?:reel|reels|p)\/([A-Za-z0-9_-]{5,40})\/?(?:\?.*)?$/;
