// SUPERNOVA — Las dos capas del Analizador de Reels v2 (Fase 1, 16-oct-2026).
//
//  · Capa A (una vez por Reel, para todos): la IA MIRA el video y devuelve el análisis base: estructura
//    por tramos, fórmula del gancho, mecanismo, CTA y debilidades. No lleva nada del usuario: se guarda
//    en reel_extractions.base y lo reusan todas las cuentas.
//  · Capa B (por usuario × nivel): sin video. Recibe el análisis base + el producto de la persona y
//    escribe su versión según el nivel. Es la parte barata y la que se repite al "probar otro nivel".
//
// Niveles (decisión de Jean): Espejo (~90 %), Adaptación (~75 %, por defecto) e Inspiración (~50 %).
// "Roba como un artista" (manual): se toma estructura, ritmo, gancho y mecanismo; nunca se copia y pega
// en el mismo idioma, ni su cara, su nombre, su marca o sus números.
// Sin imports: solo texto y funciones puras (se prueban con reelLayers_test.ts).

export type Nivel = "espejo" | "adaptacion" | "inspiracion";
export const NIVELES: Nivel[] = ["espejo", "adaptacion", "inspiracion"];
export const asNivel = (v: unknown): Nivel => (NIVELES.includes(v as Nivel) ? v as Nivel : "adaptacion");

export interface Tramo { inicio: number; fin: number; funcion: string; etiqueta: string; que_pasa: string; se_ve: string }
export interface Base {
  idioma: string; duracion_s: number | null; resumen: string;
  transcripcion: { s: number; texto: string }[];
  gancho: { se_ve: string; se_dice: string; texto_pantalla: string; por_que: string };
  estructura: Tramo[];
  formula_gancho: string; mecanismo: string; claves: string[];
  cta: { tipo: string; palabra: string };
  debilidades: string[];
  /**
   * Regla 30/70 (17-oct-2026, lección de @profesiondelfuturo): "descubrimiento" = algo útil que se
   * comparte solo y atrae gente nueva de tu nicho (arriba del embudo); "nicho" = lo que convierte
   * (oferta, prueba, historia, CTA de venta). "" = análisis viejo todavía sin clasificar.
   */
  tipo: Tipo | "";
  tipo_por_que: string;
  /** Resultados que el Reel muestra y no se pueden comprobar (cifras de ventas, "de 3 a 3.000 comentarios"…). */
  no_comprobable: string[];
}
export type Tipo = "descubrimiento" | "nicho";
export interface Linea { inicio: number; fin: number; dices: string; se_ve: string; texto_pantalla: string; original: number | null; original_texto?: string }
export interface Version {
  nivel: Nivel; que_se_mantuvo: string[]; que_cambio: string[]; formula_explicada: string;
  ideas: { titulo: string; por_que: string }[];
  ganchos: string[]; guion: Linea[]; cierre: string;
  publicar: { copy: string; palabra_clave: string; hashtags: string[]; comentario_fijado: string };
  /** Nombres de otros (herramientas, marcas, personas) y promesas del cierre que hay que comprobar antes de grabar. */
  verificar: string[];
}

const s = (v: unknown, n: number) => (typeof v === "string" ? v : "").replace(/\s+/g, " ").trim().slice(0, n);
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? Math.round(x * 10) / 10 : 0; };
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const list = (v: unknown, max: number, len: number) => arr(v).map(x => s(x, len)).filter(Boolean).slice(0, max);

/** Palabra clave del CTA: una sola palabra en MAYÚSCULAS, solo letras y números (con tildes y Ñ). */
export function palabraClave(v: unknown): string {
  return s(v, 40).toUpperCase().replace(/[^A-ZÁÉÍÓÚÜÑ0-9]/g, "").slice(0, 20);
}

// ---------------- Capa A ----------------

export function promptA(o: { caption: string; owner: string; views: number | null; likes: number | null; comments: number | null; seconds: number | null }): string {
  return [
    `Te paso un Reel de Instagram${o.owner ? ` de @${o.owner}` : ""}${o.seconds ? ` (${Math.round(o.seconds)} s)` : ""}${o.views != null ? ` con ${o.views} reproducciones` : ""}${o.likes != null ? `, ${o.likes} me gusta y ${o.comments ?? 0} comentarios` : ""}. Míralo y escúchalo completo.`,
    o.caption ? `Texto de la publicación (solo para entender): """${o.caption}"""` : "",
    "",
    "Eres editor de contenido. Haz el ANÁLISIS BASE de este Reel: solo cómo está hecho y por qué funciona. Todavía NO escribas ninguna versión nueva.",
    "1) transcripcion: lo que se dice, tal cual, en su idioma original, en bloques con su segundo de inicio.",
    "2) gancho (0–3 s): qué se ve, qué se dice, qué texto hay en pantalla y por qué detiene el dedo (o por qué no).",
    "3) estructura: el Reel en tramos por segundos (inicio, fin). 'funcion' es una de: gancho, fundamento, problema, giro, prueba, solucion, cta, otro. 'etiqueta' en 1–3 palabras, 'que_pasa' en una frase y 'se_ve' (plano, gesto, texto, cortes).",
    "4) formula_gancho: el patrón abstracto del gancho en una línea (ej.: 'pregunta incómoda + promesa de respuesta').",
    "5) mecanismo: por qué funciona en la cabeza de quien mira, en 1–3 frases (emoción, curiosidad, identidad, urgencia real…).",
    "6) claves: 3 razones concretas de por qué funciona (ritmo, cortes, texto en pantalla, promesa, formato). Si las cifras son bajas, di con honestidad qué le falló.",
    "7) cta: tipo de llamada a la acción (comentar palabra, seguir, guardar, enlace, ninguna) y la palabra clave si la hay.",
    "8) debilidades: 3 cosas concretas que una versión nueva debería mejorar.",
    TIPO_RULE,
    NO_COMPROBABLE_RULE,
    "Escribe todo en español latino neutro (menos la transcripción, que va en su idioma original).",
    "",
    "RESPONDE SOLO con JSON válido con esta forma:",
    `{"idioma":"es","duracion_s":0,"resumen":"","transcripcion":[{"s":0,"texto":""}],"gancho":{"se_ve":"","se_dice":"","texto_pantalla":"","por_que":""},"estructura":[{"inicio":0,"fin":3,"funcion":"gancho","etiqueta":"","que_pasa":"","se_ve":""}],"formula_gancho":"","mecanismo":"","claves":["","",""],"cta":{"tipo":"","palabra":""},"debilidades":["","",""],"tipo":"descubrimiento","tipo_por_que":"","no_comprobable":[]}`,
  ].filter(Boolean).join("\n");
}

const TIPO_RULE = "9) tipo: \"descubrimiento\" si comparte algo útil que se guarda y se comparte solo y atrae gente NUEVA del nicho (una herramienta, un truco, un dato, una lista útil): arriba del embudo. \"nicho\" si está hecho para convertir a quien ya sigue (oferta, prueba, historia personal, objeciones, llamado a comprar o a escribir). tipo_por_que: por qué, en una frase.";
const NO_COMPROBABLE_RULE = "10) no_comprobable: los resultados que el Reel muestra o promete y que no se pueden comprobar (cifras de ventas o de ingresos, \"de 3 a 3.000 comentarios\", seguidores ganados en días, testimonios sin fuente). Cópialos cortos, tal como se dicen o se ven. Si no hay, lista vacía. Nunca se repiten en una versión nueva.";

/**
 * Para análisis viejos de la caché que no traen tipo: lo clasifica solo con el texto (sin volver a
 * mirar el video). Es una llamada corta.
 */
export function promptTipo(b: Base): string {
  return [
    "Te paso el análisis de un Reel de Instagram (no el video). Clasifícalo.",
    `Resumen: ${b.resumen}`,
    `Gancho: dice «${b.gancho.se_dice}»; texto en pantalla «${b.gancho.texto_pantalla}».`,
    `Mecanismo: ${b.mecanismo}`,
    `Tramos: ${b.estructura.map(t => `${t.funcion}: ${t.que_pasa}`).join(" · ")}`,
    `CTA: ${b.cta.tipo}${b.cta.palabra ? ` (${b.cta.palabra})` : ""}`,
    `Lo que se dice: ${b.transcripcion.map(t => t.texto).join(" ").slice(0, 3000)}`,
    "",
    TIPO_RULE.replace(/^9\) /, ""),
    NO_COMPROBABLE_RULE.replace(/^10\) /, ""),
    "Escribe en español latino neutro.",
    `RESPONDE SOLO con JSON válido: {"tipo":"descubrimiento","tipo_por_que":"","no_comprobable":[]}`,
  ].join("\n");
}

/** Deja tipo, su porqué y los resultados no comprobables con la forma pactada. */
export function cleanTipo(v: unknown): Pick<Base, "tipo" | "tipo_por_que" | "no_comprobable"> {
  const o = obj(v);
  const t = s(o.tipo, 20).toLowerCase();
  return {
    tipo: t === "descubrimiento" || t === "nicho" ? t : "",
    tipo_por_que: s(o.tipo_por_que, 240),
    no_comprobable: list(o.no_comprobable, 4, 160),
  };
}

/** Deja el análisis base con la forma pactada (lo que diga la IA no se confía). null si no sirve. */
export function cleanBase(v: unknown): Base | null {
  const o = obj(v);
  const estructura = arr(o.estructura).slice(0, 14).map(t => {
    const x = obj(t);
    return { inicio: n(x.inicio ?? x.desde), fin: n(x.fin ?? x.hasta), funcion: s(x.funcion ?? x.tramo, 20).toLowerCase(), etiqueta: s(x.etiqueta ?? x.tramo, 40), que_pasa: s(x.que_pasa, 300), se_ve: s(x.se_ve ?? x.para_que, 240) };
  }).filter(t => t.que_pasa || t.etiqueta);
  const g = obj(o.gancho);
  const base: Base = {
    idioma: s(o.idioma, 10) || "es",
    duracion_s: Number.isFinite(Number(o.duracion_s)) && Number(o.duracion_s) > 0 ? n(o.duracion_s) : null,
    resumen: s(o.resumen, 600),
    transcripcion: arr(o.transcripcion).slice(0, 80).map(t => ({ s: n(obj(t).s), texto: s(obj(t).texto, 400) })).filter(t => t.texto),
    gancho: { se_ve: s(g.se_ve, 300), se_dice: s(g.se_dice, 300), texto_pantalla: s(g.texto_pantalla, 200), por_que: s(g.por_que, 400) },
    estructura,
    formula_gancho: s(o.formula_gancho, 200),
    mecanismo: s(o.mecanismo, 500),
    claves: list(o.claves ?? o.por_que_funciona, 4, 300),
    cta: { tipo: s(obj(o.cta).tipo, 60), palabra: palabraClave(obj(o.cta).palabra) },
    debilidades: list(o.debilidades ?? o.mejorar, 4, 300),
    ...cleanTipo(o),
  };
  return base.estructura.length && (base.resumen || base.claves.length) ? base : null;
}

/** Lo que se muestra en "Por qué funciona" (sale del análisis base; no cambia con el nivel). */
export function porQue(b: Base) {
  return {
    resumen: b.resumen, gancho: b.gancho, claves: b.claves, mejorar: b.debilidades,
    timeline: b.estructura.map(t => ({ inicio: t.inicio, fin: t.fin, etiqueta: t.etiqueta || t.funcion, descripcion: t.que_pasa, se_ve: t.se_ve })),
    formula_gancho: b.formula_gancho, mecanismo: b.mecanismo, cta: b.cta, idioma: b.idioma, duracion_s: b.duracion_s,
    tipo: b.tipo, tipo_por_que: b.tipo_por_que, no_comprobable: b.no_comprobable,
  };
}

// ---------------- Capa B ----------------

export const NIVEL_REGLAS: Record<Nivel, string> = {
  // Jean, 16-oct-2026: "que el 90 % espejo sea realmente el 90 %". Misma regla que el modo "tema" de
  // Carrusel (06-oct): casi sus mismas palabras con un toque propio, nunca idéntico.
  espejo:
    "NIVEL ESPEJO (~90 % igual al original). Tu guion es el MISMO texto del original, tramo por tramo: las mismas frases, en el mismo orden, con las mismas pausas, muletillas, preguntas y remates. Cambia SOLO: (1) las palabras propias del tema del original por las del nicho de la persona, (2) los ejemplos concretos, (3) la llamada a la acción final por el CIERRE que se pide abajo, y (4) un toque propio mínimo en cada tramo (un sinónimo, una palabra o el orden de dos palabras) para que nunca sea idéntico. Al menos 9 de cada 10 palabras de cada tramo deben ser las mismas del original. Si el original está en otro idioma, tradúcelo fiel al español latino: misma idea y mismo remate, casi frase por frase, natural. Tu guion tiene exactamente un tramo por cada tramo del original, con sus mismas duraciones, y cada tramo lleva 'original' = el número (desde 0) del tramo que espeja. Los 3 ganchos: el primero es el gancho del original casi igual (con el toque propio); los otros dos, variantes mínimas del mismo gancho.",
  adaptacion:
    "NIVEL ADAPTACIÓN (~75 %). Conserva: la misma estructura y la misma fórmula del gancho. Cambia: la historia, el ángulo, los ejemplos y la llamada a la acción, que salen del producto y del público de la persona. 'formula_explicada' = la fórmula del gancho explicada en una línea y cómo la usaste. 'original' de cada tramo = el número (desde 0) del tramo del original que cumple la misma función, o null.",
  inspiracion:
    "NIVEL INSPIRACIÓN (~50 %). Conserva SOLO el mecanismo psicológico de por qué funcionó. Todo el contenido es nuevo. Primero da 3 ideas de Reel distintas que usan ese mecanismo para el producto de la persona ('ideas': título y por qué funcionaría) y después el guion completo de la MEJOR de las 3. 'original' de cada tramo = null.",
};

export interface BriefB { product: string; who: string; nicho: string; oferta: string; palabra: string; handle: string }

/** Lo que se dice en cada tramo del original (la transcripción repartida por segundos). */
export function tramoTexts(b: Base): string[] {
  return b.estructura.map((t, i) => {
    const last = i === b.estructura.length - 1;
    return b.transcripcion.filter(x => x.s >= t.inicio && (last || x.s < t.fin)).map(x => x.texto).join(" ").slice(0, 700);
  });
}

/**
 * Cómo cierra tu versión (regla 30/70, Jean 19-oct-2026: "seamos coherentes"):
 *  · Si la persona escribió una palabra clave, se usa esa (ella decide).
 *  · Si no y el Reel es de Descubrimiento, cierra pidiendo seguir, guardar o compartir: sin palabra.
 *  · Si no y es de Nicho (o un análisis viejo sin tipo), la IA propone una palabra en español.
 * Nunca se copia la palabra del original (salía "DISCOVERY" en inglés y de otra cuenta).
 */
export type Cierre = { modo: "palabra"; palabra: string } | { modo: "seguir"; palabra: "" };
export function cierreDe(b: Base, palabra: string): Cierre {
  if (palabra) return { modo: "palabra", palabra };
  if (b.tipo === "descubrimiento") return { modo: "seguir", palabra: "" };
  return { modo: "palabra", palabra: "" };
}

export function promptB(b: Base, nivel: Nivel, brief: BriefB): string {
  const dice = nivel === "espejo" ? tramoTexts(b) : [];
  const tramos = b.estructura.map((t, i) => `${i}. ${t.inicio}–${t.fin} s · ${t.funcion}${t.etiqueta ? ` (${t.etiqueta})` : ""}: ${t.que_pasa}${t.se_ve ? ` | Se ve: ${t.se_ve}` : ""}${dice[i] ? ` | Dice: «${dice[i]}»` : ""}`).join("\n");
  const habla = b.transcripcion.map(t => `[${t.s}s] ${t.texto}`).join(" ").slice(0, 5000);
  const c = cierreDe(b, brief.palabra);
  const palabraLinea = c.modo === "seguir"
    ? "Este Reel es de DESCUBRIMIENTO (atrae gente nueva): el cierre NO pide comentar ninguna palabra. Pide seguir la cuenta, guardar el video o mandárselo a alguien, lo que encaje mejor."
    : c.palabra
      ? `Palabra clave del cierre: ${c.palabra} (en MAYÚSCULAS; el cierre pide comentarla).`
      : `Palabra clave del cierre: propón UNA palabra corta en español, en MAYÚSCULAS, que diga lo que recibe quien comenta${b.cta.palabra ? ` (nunca «${b.cta.palabra}», que es la del original)` : ""}. El cierre pide comentarla.`;
  return [
    "Eres guionista de Reels de marca personal en Latinoamérica. Vas a escribir la versión de una persona a partir del análisis de un Reel que ya funciona (no tienes el video: tienes su análisis).",
    "",
    "ANÁLISIS DEL ORIGINAL:",
    `Idioma: ${b.idioma}. Duración: ${b.duracion_s ?? "?"} s.`,
    `Resumen: ${b.resumen}`,
    `Gancho: dice «${b.gancho.se_dice}»; texto en pantalla «${b.gancho.texto_pantalla}»; se ve: ${b.gancho.se_ve}.`,
    `Fórmula del gancho: ${b.formula_gancho}`,
    `Mecanismo: ${b.mecanismo}`,
    `CTA: ${b.cta.tipo}${b.cta.palabra ? ` (palabra ${b.cta.palabra})` : ""}`,
    "Tramos:", tramos,
    habla ? (nivel === "espejo"
      ? `Texto completo del original (es la BASE de tu versión: síguelo frase por frase): ${habla}`
      : `Lo que se dice (solo para entender; no lo copies si está en español): ${habla}`) : "",
    `Lo que debe mejorar: ${b.debilidades.join(" · ")}`,
    b.no_comprobable.length ? `Resultados del original que NO se pueden comprobar (nunca los repitas ni pongas cifras parecidas): ${b.no_comprobable.join(" · ")}` : "",
    "",
    NIVEL_REGLAS[nivel],
    "",
    "LA PERSONA:",
    brief.product ? `Producto: ${brief.product}${brief.who ? `, para ${brief.who}` : ""}.` : "Sin producto.",
    brief.nicho ? `Nicho: ${brief.nicho}.` : "",
    brief.oferta ? `Oferta que empuja este Reel: ${brief.oferta}.` : "",
    brief.handle ? `Su cuenta: @${brief.handle}.` : "",
    palabraLinea,
    "",
    "ESCRIBE, en español latino natural, de tú, para grabar con la cara y el celular:",
    nivel === "espejo"
      ? "- ganchos: 3 opciones según las reglas de ESPEJO (el gancho del original casi igual y dos variantes mínimas). El guion empieza con la primera."
      : "- ganchos: 3 opciones distintas para los primeros 3 segundos, máximo 12 palabras cada una. El guion empieza con la primera.",
    nivel === "espejo"
      ? "- guion: un tramo por cada tramo del original, con sus mismos 'inicio' y 'fin', 'dices' (el texto del original con los cambios mínimos de ESPEJO), 'se_ve' (el mismo plano y gesto del original) y 'texto_pantalla' (el mismo del original adaptado, máximo 6 palabras)."
      : "- guion: tramos con 'inicio' y 'fin' en segundos, 'dices' (lo que se dice, frases cortas y naturales), 'se_ve' (plano, gesto, lugar, corte) y 'texto_pantalla' (máximo 6 palabras).",
    c.modo === "seguir"
      ? "- cierre: UNA sola llamada a la acción: seguir, guardar o compartir. Sin palabra clave."
      : "- cierre: UNA sola llamada a la acción que pide comentar la palabra clave.",
    c.modo === "seguir"
      ? "- publicar: 'copy' (2–4 líneas, sin hashtags), 'palabra_clave' vacía, 5 'hashtags' del tema y 'comentario_fijado' (una pregunta corta que invite a opinar)."
      : "- publicar: 'copy' (2–4 líneas, sin hashtags), 'palabra_clave', 5 'hashtags' del tema y 'comentario_fijado' (lo que la persona fija en los comentarios: qué recibe quien comenta la palabra).",
    "- que_se_mantuvo y que_cambio: 2 a 4 frases cortas cada uno, para que la persona entienda qué tomaste del original y qué es suyo.",
    "- verificar: lo que la persona debe comprobar antes de grabar, en frases cortas: cada herramienta, app, proyecto, marca o persona de otros que nombra tu guion (que existe, que se llama así y que hace lo que dices; si es de otra persona, dale el crédito), y cada material que promete el cierre (guía, PDF, clase: que ya esté hecho). Si no hay nada, lista vacía.",
    "Nunca uses el nombre, la cara, la marca ni los números del original como si fueran de la persona. No inventes resultados ni testimonios. No exageres lo que hace una herramienta («en segundos», «sin mover un dedo»).",
    "",
    "RESPONDE SOLO con JSON válido con esta forma:",
    `{"que_se_mantuvo":[""],"que_cambio":[""],"formula_explicada":"","ideas":[{"titulo":"","por_que":""}],"ganchos":["","",""],"guion":[{"inicio":0,"fin":3,"dices":"","se_ve":"","texto_pantalla":"","original":0}],"cierre":"","publicar":{"copy":"","palabra_clave":"${c.palabra}","hashtags":["","","","",""],"comentario_fijado":""},"verificar":[""]}`,
  ].filter(Boolean).join("\n");
}

/** Deja la versión con la forma pactada. null si no trae guion. En Descubrimiento no queda palabra clave. */
export function cleanVersion(v: unknown, nivel: Nivel, cierre: Cierre, tramosOriginal: number): Version | null {
  const o = obj(v);
  const guion = arr(o.guion).slice(0, 16).map(t => {
    const x = obj(t);
    const orig = Number(x.original);
    return {
      inicio: n(x.inicio ?? x.desde), fin: n(x.fin ?? x.hasta),
      dices: s(x.dices, 500), se_ve: s(x.se_ve, 300), texto_pantalla: s(x.texto_pantalla, 80),
      original: nivel !== "inspiracion" && Number.isInteger(orig) && orig >= 0 && orig < tramosOriginal ? orig : null,
    };
  }).filter(t => t.dices);
  if (!guion.length) return null;
  const p = obj(o.publicar);
  const clave = cierre.modo === "seguir" ? "" : cierre.palabra || palabraClave(p.palabra_clave) || "GRUPO";
  return {
    nivel,
    que_se_mantuvo: list(o.que_se_mantuvo, 4, 200),
    que_cambio: list(o.que_cambio, 4, 200),
    formula_explicada: s(o.formula_explicada, 300),
    ideas: nivel === "inspiracion" ? arr(o.ideas).slice(0, 3).map(i => ({ titulo: s(obj(i).titulo, 120), por_que: s(obj(i).por_que, 300) })).filter(i => i.titulo) : [],
    ganchos: list(o.ganchos, 3, 140),
    guion,
    cierre: s(o.cierre, 300),
    publicar: {
      copy: (typeof p.copy === "string" ? p.copy : "").trim().slice(0, 900),
      palabra_clave: clave,
      hashtags: list(p.hashtags, 6, 40).map(h => (h.startsWith("#") ? h : `#${h}`).replace(/\s+/g, "")),
      comentario_fijado: s(p.comentario_fijado, 300),
    },
    verificar: list(o.verificar, 6, 200),
  };
}
