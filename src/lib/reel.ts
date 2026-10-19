/**
 * Analiza un Reel v2 (16-oct-2026): tipos de lo que devuelve reel-analyze, los 3 niveles y los textos
 * que se copian (teleprompter y formato Notion de Jean). Funciones puras: se prueban en reel.test.ts.
 */
import { scriptFidelity, spokenLines } from "../../supabase/functions/_shared/reelFidelity";
import { MODOS, type Modo } from "../../supabase/functions/_shared/brandDna";
export { splitPhrases } from "../../supabase/functions/_shared/reelFidelity";

/**
 * Los 4 modos (Jean, 19-oct-2026). Ids internos sin cambiar: inspiracion = REINVENTAR, adaptacion = VENDER
 * (las versiones viejas "adaptacion" se leen como VENDER). Nombres, líneas y porcentajes salen de la
 * misma definición que usa el servidor (brandDna.ts). El porcentaje es fidelidad creativa, no texto.
 */
export type Nivel = Modo;
export const NIVELES = MODOS.map(m => ({
  id: m.id, nombre: m.nombre, pct: m.pct, line: m.line, quiere: m.quiere,
}));
export const NIVEL_BY_ID = Object.fromEntries(NIVELES.map(n => [n.id, n])) as Record<Nivel, (typeof NIVELES)[number]>;
export type Revision = { ok: boolean; checks: { id: string; ok: boolean; nota: string; critico: boolean }[]; corregida: boolean; semantica: boolean };
/** Nombre corto de cada punto de la revisión, para la pantalla. */
export const CHECK_LABEL: Record<string, string> = {
  tema: "Mismo tema", tesis: "Misma enseñanza", gancho_mecanismo: "Gancho con la misma función", estructura: "Estructura reconocible",
  intencion: "Misma emoción", nada_ajeno: "Nada ajeno al original", redaccion_original: "Redacción propia", idea_central: "Idea central reconocible",
  interpretacion_propia: "Interpretación tuya", tratamiento_nuevo: "Historia nueva", usa_mecanismo: "Usa su fórmula",
  conexion_natural: "Conexión natural con la oferta", coherencia_oferta: "Coherente con la oferta", sin_promesas: "Sin promesas de resultados",
  cta_correcto: "Llamada a la acción correcta", sin_inventos: "Sin datos inventados", tono: "Tu tono", aporta: "Aporta algo concreto",
  sin_copia: "Sin frases copiadas", sin_ofertas: "Sin ofertas que no tocan", cta_permitido: "Llamada a la acción permitida",
  sin_promesas_dinero: "Sin promesas de dinero", sin_privada: "Sin tu experiencia privada",
};

export type Linea = { inicio: number; fin: number; dices: string; se_ve: string; texto_pantalla: string; original: number | null; original_texto?: string };
export type Version = {
  /** Solo versiones viejas (criterio de texto 90 %, retirado el 19-oct-2026). */
  espejo_validado?: boolean;
  revision?: Revision;
  espejo_referencia?: "original" | "traduccion";
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
  /** Regla 30/70 (17-oct-2026): descubrimiento atrae gente nueva; nicho convierte. Vacío en análisis viejos. */
  tipo?: Tipo | ""; tipo_por_que?: string;
  /** Resultados del original que no se pueden comprobar (no se repiten en tu versión). */
  no_comprobable?: string[];
  /** A6 (19-oct-2026): análisis de la referencia y palabras orientadoras. Vacío en análisis viejos. */
  referencia?: { tema: string; tesis: string; intencion: string; argumentos: string[]; preservar: string[]; no_introducir: string[] };
  conceptos?: string[]; mecanismos?: string[];
};
export type Tipo = "descubrimiento" | "nicho";
export const TIPOS: Record<Tipo, { nombre: string; para: string }> = {
  descubrimiento: { nombre: "Descubrimiento", para: "Atrae gente nueva de tu nicho: se guarda y se comparte solo. Va en el 30 % de lo que publicas." },
  nicho: { nombre: "Nicho", para: "Convierte a quien ya te sigue en mensajes y ventas. Va en el 70 % de lo que publicas." },
};
export type ReelView = {
  analysis_id: string;
  source: { url: string; shortcode: string; owner: string; views: number | null; likes: number | null; comments: number | null; cover: string | null; duracion_s: number | null };
  por_que_funciona: PorQue;
  version?: Version;
  /** Lo elegido en esa generación (19-oct-2026). Las viejas traían { nicho, oferta, palabra_clave }. */
  opciones?: {
    palabra_clave?: string; modo?: Nivel; objetivo?: string; offer_id?: string | null; offer_name?: string; offer_status?: string;
    waitlist_ok?: boolean; conceptos?: string[]; toque?: string; intensidad?: string; con_adn?: boolean;
    nicho?: string; oferta?: string;
  };
};

/** Lo que se dice, una frase por párrafo, sin "Dices:" ni segundos. El gancho elegido reemplaza la primera frase. */
export function teleprompterLines(v: Version, hook = 0): string[] {
  return spokenLines(v, hook);
}

/**
 * Coincidencia textual del teleprompter, incluido el gancho seleccionado y el cierre.
 * Misma métrica que el servidor; null si falta referencia completa para comparar.
 */
export function parecido(v: Version, hook = 0): number | null {
  return scriptFidelity(v, hook)?.percent ?? null;
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
    ...(p.tipo ? [`TIPO: ${TIPOS[p.tipo].nombre}${p.tipo_por_que ? ` — ${p.tipo_por_que}` : ""}`] : []),
    `GANCHO: ${gancho}`,
    "CLAVES:", ...p.claves.slice(0, 3).map(c => `- ${c}`),
    "MEJORAR:", ...p.mejorar.slice(0, 2).map(m => `- ${m}`),
    ...(p.no_comprobable?.length ? ["NO SE PUEDE COMPROBAR (no lo repitas):", ...p.no_comprobable.map(x => `- ${x}`)] : []),
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
  return [p.copy, "", ...(p.palabra_clave ? [`Comenta ${p.palabra_clave}`, ""] : []), p.hashtags.join(" "), "", `Comentario fijado: ${p.comentario_fijado}`].join("\n").trim();
}

/** ¿Es un enlace de Reel que el servidor acepta? (la misma forma que REEL_RE del servidor). */
export const REEL_URL_RE = /^https?:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9._]+\/)?(?:reel|reels|p)\/([A-Za-z0-9_-]{5,40})\/?(?:\?.*)?$/;
