/**
 * Cerebro del Carrusel (05-oct-2026, v2). Funciones puras: tipos de lámina, sistema de diseño, el
 * pedido a la IA y la lectura de su respuesta. Lo que aprendimos de quienes viven de esto:
 *  - Un carrusel no falla por la idea: falla porque se ve promedio. La portada detiene el scroll, así
 *    que la IA propone 3 y recomienda una con su porqué.
 *  - Cada lámina es una página diseñada (pastillas, tarjetas, listas, número gigante de fondo) y se
 *    exporta como imagen: las letras salen perfectas porque son fuentes reales, no las pinta un modelo.
 *  - Sistema bloqueado: UN color de marca del que salen sus tonos (claro, oscuro, degradado) sobre un
 *    fondo crema u oscuro; 2 fuentes (una grita, la otra se lee) + una de máquina para etiquetas; y una
 *    plantilla fija (marca, etiqueta, número, flecha y barra de avance). Ritmo claro / oscuro / degradado.
 *  - Historia en 6 posiciones (Freytag aplicado al carrusel): 1) la portada crea un DESEO que no
 *    había hace 5 segundos (se escribe al final: la línea más interesante va adelante; puede ser una
 *    lista borrosa que se revela); 2) la lámina 2 responde SOLO a la portada (son una unidad: paga la
 *    primera deuda y compra confianza); 3) columna: cada lámina responde a la anterior y abre la
 *    siguiente (no se pueden cambiar de orden); 4) ritmo: tensión y alivio, cada lámina se ve
 *    distinta a la anterior; 5) giro: la lámina que cambia lo que significaba todo lo anterior (la
 *    que se captura); 6) remate: la creencia nueva + UNA acción conectada con ella (no "sígueme").
 * Reglas del manual: sin promesas de ingresos ni plazos, sin testimonios ni cifras inventadas, sin
 * marcas ajenas; el gancho de un anuncio ajeno es solo referencia, nunca se copia.
 */
import type { Brief } from "@/lib/imagePrompts";

export type CarouselGoal = "vender" | "ensenar" | "texto";
/** Tipos de lámina (cada uno tiene su diseño en SlideView). */
export type SlideKind = "portada" | "respuesta" | "problema" | "comparacion" | "solucion" | "tarjetas" | "pasos" | "regla" | "giro" | "llamada";
export type Tone = "claro" | "oscuro" | "degradado";
export type Item = { title: string; text: string };
export type Slide = {
  kind: SlideKind; tone: Tone;
  /** Etiqueta corta en letra de máquina ("EL PROBLEMA", "PASO A PASO"). */
  kicker: string;
  /** Titular; las palabras entre *asteriscos* van con el color de marca. */
  title: string;
  body: string;
  items: Item[];
  /** Portada: pastilla ("7 PASOS") y hasta 3 etiquetas flotantes. */
  tag?: string;
  chips?: string[];
  /** Llamada: la palabra clave que deben escribir o comentar. */
  cta?: string;
  /** El tirón: frase corta abajo que abre la siguiente lámina. */
  bridge?: string;
  /** Veredicto: una línea que remata el punto de la lámina. */
  verdict?: string;
  /** Peso de la lámina para el ritmo: corta (pocas palabras, grande) o densa. */
  weight?: "corta" | "densa";
  /** Lista que la portada muestra borrosa y la lámina 2 revela. */
  reveal?: string[];
  /** Portada póster hecha con IA de imagen (URL local o firmada): reemplaza el diseño de la portada. */
  image?: string;
  /** Dónde quedó guardada esa portada (para volver a firmar la URL al recargar). */
  imagePath?: string;
  /** Foto IA de la lámina (sin texto): de fondo, o en tarjeta en las de tipo regla. */
  photo?: string;
  photoPath?: string;
  /** Escena sugerida para esa foto. */
  scene?: string;
};
export type Cover = { title: string; subtitle: string; tag: string; why: string };
/** `rec` = la portada que recomendó la IA; `pick` = la que eligió la persona. */
/** `idea` = la frase que todo el carrusel defiende. */
export type CarouselDraft = { covers: Cover[]; pick: number; rec?: number; slides: Slide[]; caption: string; scene?: string; idea?: string; clone?: CloneInfo };
export type StyleId = "poster" | "editorial" | "moderno" | "impacto" | "elegante";
/**
 * Sistema de diseño + la "firma" que no se puede copiar (carrusel "Uncopyable" de Grow with Alex): los
 * colores y letras se roban en 5 minutos; lo que no se roba es tu papel, tu mundo, tu frase y tus datos.
 */
export type CarouselDesign = {
  brand: string; name: string; handle: string; style: StyleId; start: "claro" | "oscuro";
  /** Tu papel, para la barra superior (fecha · marca · rol). */
  role?: string;
  /** Tu mundo: el escenario que se repite en todas tus fotos hasta que se vuelve tuyo. */
  world?: string;
  /** Tu frase: la línea que la gente reconoce como tuya. */
  line?: string;
  /** Tu dato real (tus "recibos"): solo datos reales, nunca inventados. */
  receipt?: string;
};

export const SLIDE_COUNTS = [6, 8, 10] as const;
export const DEFAULT_SLIDES = 8;
export const GENERATOR_ID = "carrusel-copy";

export const GOAL_INFO: Record<CarouselGoal, { label: string; line: string }> = {
  vender: { label: "Vender mi producto", line: "Lleva a quien lo lee a escribirte o a comprar." },
  ensenar: { label: "Enseñar algo útil", line: "Se guarda y se comparte. Te da autoridad y seguidores." },
  texto: { label: "Desde un texto mío", line: "Pega un artículo, un guion o lo que dijiste en un video." },
};

export const KIND_LABEL: Record<SlideKind, string> = {
  portada: "Portada", respuesta: "Responde la portada", problema: "Problema", comparacion: "Comparación", regla: "Regla", solucion: "Solución", tarjetas: "Tarjetas", pasos: "Pasos", giro: "El giro", llamada: "Remate",
};

/** Colores de marca sugeridos (de cada uno salen todos sus tonos). */
export const BRAND_COLORS: { name: string; hex: string }[] = [
  { name: "Terracota", hex: "#c96442" },
  { name: "Ámbar", hex: "#e8a33d" },
  { name: "Coral", hex: "#ef5b45" },
  { name: "Azul", hex: "#3d7bf0" },
  { name: "Verde", hex: "#1f9d6b" },
  { name: "Violeta", hex: "#7c5cff" },
  { name: "Rosa", hex: "#e0517f" },
];

export const STYLES: Record<StyleId, { name: string; line: string }> = {
  poster: { name: "Póster", line: "Negra gruesa + cursiva con serifa" },
  editorial: { name: "Editorial", line: "Serifa cálida, como revista" },
  moderno: { name: "Moderno", line: "Limpio y geométrico" },
  impacto: { name: "Impacto", line: "Letra alta y fuerte" },
  elegante: { name: "Elegante", line: "Fino y de lujo" },
};

export const DEFAULT_DESIGN: CarouselDesign = { brand: "#c96442", name: "", handle: "", style: "editorial", start: "oscuro" };
/** Sistema de la cuenta de admin (decisión de Jean, 05-oct-2026): crema, negro y rojo naranja; póster. */
export const ADMIN_DESIGN: CarouselDesign = { brand: "#e8502e", name: "SUPERNOVA", handle: "", style: "poster", start: "claro" };

const HEX = /^#[0-9a-f]{6}$/i;
const clean = (s: unknown, n: number) => (typeof s === "string" ? s : "").replace(/[«»]/g, "'").replace(/\s+/g, " ").trim().slice(0, n);
const noEmoji = (s: string) => s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]|\u{FE0F}/gu, "").replace(/\s+/g, " ").trim();
const txt = (s: unknown, n: number) => noEmoji(clean(s, n));

export const cleanHandle = (h: unknown) => clean(h, 31).replace(/^@+/, "").replace(/[^A-Za-z0-9._]/g, "").slice(0, 30);

/** Limpia un diseño guardado (de la base o del navegador) antes de usarlo. */
export function sanitizeDesign(x: unknown): CarouselDesign {
  const d = (x && typeof x === "object" ? x : {}) as Partial<CarouselDesign>;
  return {
    brand: HEX.test(d.brand ?? "") ? d.brand!.toLowerCase() : DEFAULT_DESIGN.brand,
    name: clean(d.name, 28),
    handle: cleanHandle(d.handle),
    style: d.style && d.style in STYLES ? d.style : DEFAULT_DESIGN.style,
    start: d.start === "claro" ? "claro" : "oscuro",
    role: clean(d.role, 32) || undefined,
    world: clean(d.world, 160) || undefined,
    line: clean(d.line, 80) || undefined,
    receipt: clean(d.receipt, 40) || undefined,
  };
}

/** Lo que la IA debe respetar de la firma de la marca (va en todos los pedidos de texto). */
export function signatureLines(d: Pick<CarouselDesign, "world" | "line">): string[] {
  return [
    d.line ? `FRASE DE LA MARCA (úsala tal cual en el remate, es su firma): «${clean(d.line, 80)}».` : "",
    d.world ? `MUNDO DE LA MARCA (todas las escenas ocurren aquí, para que el perfil se reconozca): ${clean(d.world, 160)}.` : "",
  ].filter(Boolean);
}

// ── Plan de láminas ──────────────────────────────────────────────────────────────────────────────
const PLANS: Record<number, SlideKind[]> = {
  6: ["portada", "respuesta", "comparacion", "pasos", "giro", "llamada"],
  8: ["portada", "respuesta", "problema", "comparacion", "tarjetas", "pasos", "giro", "llamada"],
  10: ["portada", "respuesta", "problema", "comparacion", "tarjetas", "pasos", "solucion", "comparacion", "giro", "llamada"],
};
export function kindPlan(n: number): SlideKind[] {
  return PLANS[n <= 6 ? 6 : n <= 8 ? 8 : 10];
}

/**
 * Ritmo de color: la portada y la lámina 2 comparten tono (son una unidad); el medio alterna claro y
 * oscuro; el giro va en el color de marca (se ve distinto a todo) y el remate en el tono contrario.
 */
export function toneFor(kind: SlideKind, i: number, start: "claro" | "oscuro"): Tone {
  const other = start === "claro" ? "oscuro" : "claro";
  if (kind === "portada" || kind === "respuesta") return start;
  if (kind === "giro") return "degradado";
  if (kind === "llamada") return other;
  // Después de la pareja portada + lámina 2, el medio arranca en el tono contrario.
  return i % 2 === 0 ? other : start;
}
export const retone = (slides: Slide[], start: "claro" | "oscuro"): Slide[] => slides.map((s, i) => ({ ...s, tone: toneFor(s.kind, i, start) }));

const KICKER: Record<SlideKind, string> = {
  portada: "GUÍA", respuesta: "LA RESPUESTA", problema: "EL PROBLEMA", comparacion: "NO / SÍ", regla: "LA REGLA", solucion: "LA SOLUCIÓN", tarjetas: "LO QUE NECESITAS", pasos: "PASO A PASO", giro: "EL GIRO", llamada: "TU SIGUIENTE PASO",
};

/** Borrador gratis (sin IA) para ver el diseño antes de pagar. Se marca como ejemplo en pantalla. */
export function draftCarousel(b: Brief, n = DEFAULT_SLIDES, hook?: string, start: "claro" | "oscuro" = "oscuro"): CarouselDraft {
  const who = clean(b.who, 60).toLowerCase() || "ti";
  const product = clean(b.product, 70) || "tu producto";
  const promise = clean(b.promise, 90).toLowerCase() || "lograrlo";
  const plan = kindPlan(n);
  const reveal = ["Empieza por lo simple", "Hazlo una vez a la semana", "Usa lo que ya tienes"];
  const make = (kind: SlideKind, i: number): Slide => {
    const base = { kind, tone: toneFor(kind, i, start), kicker: KICKER[kind], body: "", items: [] as Item[] };
    switch (kind) {
      case "portada": return { ...base, title: clean(hook, 70) || `Los 3 *secretos* para ${promise}`, body: `Lo que nadie le cuenta a ${who}.`, tag: "GUÍA RÁPIDA", chips: ["Fácil", "Paso a paso", "Desde hoy"], reveal };
      case "respuesta": return { ...base, title: "Aquí *están*", body: "Ninguno pide experiencia. Todos piden orden.", reveal, bridge: "Pero casi todos fallan en el primero" };
      case "problema": return { ...base, title: "Lo que te *frena* hoy", items: [{ title: "No sabes por dónde empezar", text: "Hay mucha información y poca claridad." }, { title: "Pierdes tiempo", text: "Pruebas cosas sueltas que no se conectan." }, { title: "Te rindes antes", text: "Sin un plan, cualquier tropiezo te detiene." }], bridge: "Por eso necesitas otra cosa" };
      case "comparacion": return { ...base, title: "La diferencia está *aquí*", items: [{ title: "NO", text: "Probar cosas sueltas cuando tienes tiempo." }, { title: "SÍ", text: "Un orden fijo que repites cada semana." }], verdict: "El orden gana a la motivación.", bridge: "¿Cómo se ve ese orden?" };
      case "solucion": return { ...base, title: "Un *método* simple", body: `${product}: lo esencial, en orden, para ${promise}.`, bridge: "Y no necesitas mucho" };
      case "tarjetas": return { ...base, title: "Lo que *necesitas*", items: [1, 2, 3, 4].map(k => ({ title: `Idea ${k}`, text: "Una frase corta y concreta." })), bridge: "Ahora, el orden" };
      case "regla": return { ...base, tag: "Regla 1", title: "*orden*", body: "Lo mismo, cada semana.", verdict: "Lo que se repite se vuelve fácil." };
      case "pasos": return { ...base, title: "Hazlo en *3 pasos*", items: [1, 2, 3].map(k => ({ title: `Paso ${k}`, text: "Qué hacer, en una línea." })), bridge: "Y aquí está lo que nadie dice" };
      case "giro": return { ...base, title: "Para que puedas hacerlo *sin pensar* cada semana.", weight: "corta" };
      case "llamada": return { ...base, title: "Ahora sabes que es *orden*, no suerte", body: `Comenta la palabra y te mando ${product}.`, cta: "ORDEN", items: [{ title: "Guárdalo para hacerlo hoy", text: "" }] };
    }
  };
  const slides = plan.map(make);
  return { covers: [{ title: slides[0].title, subtitle: slides[0].body, tag: slides[0].tag ?? "", why: "" }], pick: 0, slides, caption: "" };
}

/** Pedido a la IA (generador carrusel-copy de ai-chat; el servidor cobra antes y devuelve si falla). */
export function carouselRequest(opts: { goal: CarouselGoal; brief: Brief; slides: number; source?: string; hook?: string; angle?: string; evidence?: string; handle?: string; world?: string; line?: string }): string {
  const plan = kindPlan(opts.slides);
  const b = opts.brief;
  const goalLine = opts.goal === "vender"
    ? "OBJETIVO: que quieran el producto. El remate conecta la creencia nueva con escribir una palabra clave por mensaje directo."
    : opts.goal === "ensenar"
      ? "OBJETIVO: enseñar algo útil del tema del producto para que lo guarden y lo compartan. Nada de venta dura: el remate pide comentar una palabra clave conectada con lo aprendido y menciona el producto en una línea."
      : "OBJETIVO: convertir el TEXTO DE ORIGEN en un carrusel con forma de historia. Usa solo ideas que estén en el texto; no inventes datos.";
  const item = '{"titulo":"","texto":""}';
  const shape: Record<SlideKind, string> = {
    portada: "",
    respuesta: '{"tipo":"respuesta","peso":"","etiqueta":"","titulo":"","texto":"","puente":""}',
    problema: `{"tipo":"problema","peso":"","etiqueta":"","titulo":"","items":[${item},${item},${item}],"veredicto":"","puente":""}`,
    comparacion: '{"tipo":"comparacion","peso":"","etiqueta":"","titulo":"","items":[{"titulo":"NO","texto":""},{"titulo":"SÍ","texto":""}],"veredicto":"","puente":""}',
    solucion: '{"tipo":"solucion","peso":"","etiqueta":"","titulo":"","texto":"","veredicto":"","puente":""}',
    tarjetas: `{"tipo":"tarjetas","peso":"","etiqueta":"","titulo":"","items":[${item},${item},${item},${item}],"veredicto":"","puente":""}`,
    pasos: `{"tipo":"pasos","peso":"","etiqueta":"","titulo":"","items":[${item},${item},${item}],"veredicto":"","puente":""}`,
    giro: '{"tipo":"giro","peso":"corta","etiqueta":"","titulo":""}',
    regla: '{"tipo":"regla","peso":"","pastilla":"","titulo":"","texto":"","veredicto":"","escena":"","puente":""}',
    llamada: '{"tipo":"llamada","etiqueta":"","titulo":"","texto":"","palabra":"","items":[{"titulo":""}]}',
  };
  const lines: (string | null)[] = [
    `Escribe un carrusel de Instagram de ${plan.length} láminas en español neutro latinoamericano, de tú, frases cortas y sin jerga.`,
    goalLine,
    "",
    "UN CARRUSEL ES UNA MÁQUINA DE DESEO, NO UNA LISTA. Antes de escribir, define en una frase la idea que todo el carrusel defiende. Cada lámina da un paso hacia ella; ninguna la repite.",
    "",
    "LAS 6 POSICIONES:",
    "1. LA APERTURA (portada, va aparte): crea un DESEO que no tenían hace 5 segundos. Nunca una etiqueta del tema: si solo dice de qué trata, ya cerró la curiosidad antes de abrirla. Formas: tomar partido ('DESCANSAR = DOLOR'), prometer un sistema ('la fórmula del…'), regalar algo ('roba mis plantillas') o mostrar la respuesta y retenerla. Escríbela AL FINAL: la línea más interesante de todo el carrusel va adelante. 3 palabras ideal, máximo 5. Piensa 8 opciones y entrega las 3 mejores, ordenadas. Puedes usar una LISTA OCULTA: 'revelar' = 3 a 6 elementos cortos (máximo 5 palabras cada uno) que la portada muestra borrosos y la lámina 2 muestra claros. Úsala solo si la respuesta es una lista; si no, deja 'revelar' vacío.",
    "2. EL AGARRE (lámina 2): la portada y la lámina 2 son una sola pieza. Responde SOLO a lo que abrió la portada: paga una parte y abre algo más grande, o di la frase que la persona ha pensado y nunca dijo en voz alta, o nombra lo que le cuesta hoy si nada cambia. Escríbela en primera persona. Nunca empieces acusando. Si tuviera sentido debajo de otra portada, está mal.",
    "3. LA COLUMNA (láminas del medio): primero respuestas directas, luego cada respuesta abre la siguiente pregunta, y al final una lámina que solo funciona por todo lo anterior. Cada una termina con su 'puente' (máximo 7 palabras) que le debe a la siguiente una razón para deslizar. Si tapas una lámina y la siguiente se entiende igual, está mal.",
    "4. EL RITMO: marca cada lámina con 'peso' = 'corta' (pocas palabras, una idea que pega) o 'densa' (con su contenido). Nunca dos iguales seguidas, pero sin alternar de forma mecánica.",
    "5. EL GIRO (penúltima): la lámina que cambia lo que significaba todo lo anterior: los consejos dejan de ser consejos y pasan a ser la preparación. Escríbelo como 'Para que puedas ___', nunca 'esto es lo que aprendí'. No suma información. La frase más filosa de todo el carrusel (máximo 14 palabras).",
    "6. EL REMATE (última): dos partes, en orden. 'titulo' = la creencia que ahora tienen y en la portada no. 'palabra' = UNA palabra clave en MAYÚSCULAS que es el paso obvio de esa creencia (no 'INFO' ni 'QUIERO'), y 'texto' = qué reciben si la comentan o la escriben. Una sola acción: dos acciones son cero. Nada de 'sígueme para más'. 'items' = 1 recordatorio corto (guardar o compartir).",
    "",
    "CADA LÁMINA LLEVA ALGO REAL, NO UNA AFIRMACIÓN: un ejemplo con nombre genérico, un antes y después, una regla con veredicto, una comparación. Una idea por lámina; cada una debe funcionar sola como captura de pantalla. 'veredicto' = una línea al final que remata el punto (máximo 10 palabras).",
    "",
    "CÓMO ES CADA TIPO DE LÁMINA (el diseño ya está hecho; tú escribes el texto de cada lugar):",
    "- problema: 3 puntos (titulo de 2 a 5 palabras + texto de máximo 12 palabras).",
    "- comparacion: dos cajas. La primera es lo que NO funciona y la segunda lo que SÍ (puedes cambiar las etiquetas por DÉBIL / FUERTE o ANTES / DESPUÉS). Texto de máximo 18 palabras cada una.",
    "- solucion: la idea central (texto de máximo 30 palabras).",
    "- tarjetas: 4 ideas, herramientas o errores (titulo de 1 a 4 palabras + texto de máximo 10 palabras).",
    "- pasos: 3 pasos en orden (titulo de 2 a 6 palabras + texto de máximo 12 palabras).",
    "'etiqueta' = 1 a 3 palabras en MAYÚSCULAS (ej. EL ERROR, PASO A PASO). Máximo 40 palabras por lámina contando todo.",
    "Antes de escribir, define 'idea': la UNA frase que todo el carrusel defiende. Cada lámina es un paso hacia ella, nunca una repetición.",
    "",
    "REGLAS DE TEXTO:",
    "- Voz simple y directa. Sin rayas largas, sin palabras infladas, sin jerga.",
    "- Titulares de máximo 9 palabras (salvo el giro). En cada titular marca 1 o 2 palabras clave entre asteriscos: *palabra*. Esas van resaltadas.",
    "- Prohibido: promesas de ingresos o de resultados, plazos ('en 7 días'), testimonios, cifras o estudios inventados, urgencia falsa, marcas ajenas, personas famosas, emojis.",
    "- Los únicos números permitidos: los que cuentan lo que hay en el carrusel (ej. '3 pasos') o los que vengan en los datos de abajo.",
    opts.hook ? `- Idea de referencia de un anuncio que ya vende (NO copies sus palabras, escribe otras con la misma idea): «${clean(opts.hook, 160)}».` : null,
    opts.angle ? `- Por qué funciona esa idea: ${clean(opts.angle, 200)}.` : null,
    "",
    "PORTADAS: las 3 mejores de tus 8 opciones, DISTINTAS entre sí. Cada una con titulo (3 a 5 palabras), subtitulo (máximo 12 palabras), pastilla (2 a 3 palabras en MAYÚSCULAS, ej. '3 PASOS') y por_que (qué desea la persona después de leerla que antes no). 'recomendada' = la que más ganas da de deslizar.",
    "ETIQUETAS: 3 palabras muy cortas (máximo 2 palabras cada una) sobre el tema, para decorar la portada.",
    "ESCENA: una escena fotográfica cinematográfica para la portada tipo póster, en una frase: una METÁFORA visual del deseo (ej. una persona diminuta caminando hacia una puerta gigante en el desierto). Personas latinas comunes, sin famosos, sin marcas, sin dinero ni billetes.",
    "PIE DE PUBLICACIÓN: 2 a 4 frases + la misma palabra clave del remate + 3 a 5 hashtags en español del nicho.",
    "",
    `PRODUCTO: ${clean(b.product, 200)}.`,
    clean(b.who, 200) ? `PÚBLICO: ${clean(b.who, 200)}.` : null,
    clean(b.promise, 200) ? `LO QUE LOGRA: ${clean(b.promise, 200)}.` : null,
    clean(b.price, 30) ? `PRECIO REAL: ${clean(b.price, 30)} (úsalo solo si ayuda; no inventes descuentos).` : null,
    opts.evidence ? `PRUEBA REAL DE QUE ESTO VENDE (para ti, no la pongas como testimonio): ${clean(opts.evidence, 120)}.` : null,
    opts.handle ? `CUENTA: @${cleanHandle(opts.handle)}.` : null,
    ...signatureLines(opts),
    opts.source ? `\nTEXTO DE ORIGEN:\n"""\n${(opts.source ?? "").slice(0, 6000)}\n"""` : null,
    "",
    "RESPONDE SOLO con JSON válido, sin texto antes ni después, con esta forma exacta:",
    `{"idea":"","portadas":[{"titulo":"","subtitulo":"","pastilla":"","por_que":""},{"titulo":"","subtitulo":"","pastilla":"","por_que":""},{"titulo":"","subtitulo":"","pastilla":"","por_que":""}],"recomendada":0,"revelar":[],"etiquetas":["","",""],"escena":"","laminas":[${plan.slice(1).map(k => shape[k]).join(",")}],"pie":""}`,
    `"laminas" trae ${plan.length - 1} elementos, en ese orden (la portada va aparte).`,
  ];
  return lines.filter((l): l is string => l !== null).join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Saca el primer objeto JSON de la respuesta (aunque venga con ```json o texto alrededor). */
function firstJson(text: string): unknown {
  const s = text.replace(/```(?:json)?/gi, "");
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === "\"") inStr = false; continue; }
    if (c === "\"") inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

const ITEM_MAX: Partial<Record<SlideKind, number>> = { problema: 3, comparacion: 2, tarjetas: 4, pasos: 4, llamada: 2, regla: 0 };
const upper = (s: string) => s.toLocaleUpperCase("es");

/** Lee la respuesta de la IA. Devuelve null si no sirve (el servidor ya cobró: se avisa y se puede reintentar). */
export function parseCarousel(text: string, n: number, start: "claro" | "oscuro" = "oscuro", opts: { free?: boolean } = {}): CarouselDraft | null {
  return parseCarouselObj(firstJson(text) as Record<string, unknown> | null, n, start, opts);
}

/** Igual que parseCarousel pero con el objeto ya leído. `free`: largo y tipos los decide la IA (clonar). */
export function parseCarouselObj(j: Record<string, unknown> | null, n: number, start: "claro" | "oscuro" = "oscuro", opts: { free?: boolean } = {}): CarouselDraft | null {
  if (!j) return null;
  const covers: Cover[] = (Array.isArray(j.portadas) ? j.portadas : []).slice(0, 3)
    .map((c: Record<string, unknown>) => ({ title: txt(c?.titulo, 90), subtitle: txt(c?.subtitulo, 110), tag: upper(txt(c?.pastilla, 24)), why: clean(c?.por_que, 200) }))
    .filter(c => c.title);
  if (!covers.length) return null;
  const chips = (Array.isArray(j.etiquetas) ? j.etiquetas : []).map(x => txt(x, 22)).filter(Boolean).slice(0, 3);
  const raw = (Array.isArray(j.laminas) ? j.laminas : []) as Record<string, unknown>[];
  const plan: SlideKind[] = opts.free
    ? ["portada", ...raw.slice(0, 9).map((l, i, a) => {
      const t = String(l?.tipo ?? "") as SlideKind;
      if (i === a.length - 1) return "llamada";
      return t in KICKER && t !== "portada" ? t : "tarjetas";
    })]
    : kindPlan(n);
  const rest: Slide[] = raw.slice(0, plan.length - 1).map((l, i) => {
    const asked = String(l?.tipo ?? "") as SlideKind;
    const kind: SlideKind = asked in KICKER && asked !== "portada" ? asked : plan[i + 1];
    const items = (Array.isArray(l?.items) ? l.items : []).slice(0, ITEM_MAX[kind] ?? 0)
      .map((it: Record<string, unknown>) => ({ title: txt(it?.titulo, 70), text: txt(it?.texto, 160) })).filter(it => it.title || it.text);
    const slide: Slide = {
      kind, tone: "oscuro",
      kicker: upper(txt(l?.etiqueta, 26)) || KICKER[kind],
      title: txt(l?.titulo, 140), body: txt(l?.texto, 260), items,
    };
    if (kind === "llamada") slide.cta = upper(txt(l?.palabra, 20)).replace(/[^\p{L}\p{N} ]/gu, "");
    const bridge = txt(l?.puente, 60);
    if (bridge && kind !== "llamada" && kind !== "giro") slide.bridge = bridge;
    const verdict = txt(l?.veredicto, 90);
    if (verdict && kind !== "llamada" && kind !== "giro" && kind !== "respuesta") slide.verdict = verdict;
    if (kind === "regla" && !slide.title && slide.body) slide.title = slide.body;
    if (l?.peso === "corta" || l?.peso === "densa") slide.weight = l.peso;
    const scene = txt(l?.escena, 300);
    if (scene) slide.scene = scene;
    if (kind === "regla") slide.tag = txt(l?.pastilla, 20) || `Regla ${i}`;
    if (kind === "comparacion") slide.items = slide.items.map((it, k) => ({ ...it, title: upper(it.title).slice(0, 14) || (k ? "SÍ" : "NO") }));
    return slide;
  }).filter(s => s.title || s.items.length);
  if (rest.length < 3) return null;
  // La última siempre es la llamada.
  const last = rest[rest.length - 1];
  if (last.kind !== "llamada") rest[rest.length - 1] = { ...last, kind: "llamada" };
  const rec = Number(j.recomendada);
  const pick = Number.isInteger(rec) && rec >= 0 && rec < covers.length ? rec : 0;
  const c = covers[pick];
  const reveal = (Array.isArray(j.revelar) ? j.revelar : []).map(x => txt(x, 40)).filter(Boolean).slice(0, 6);
  const cover: Slide = { kind: "portada", tone: "oscuro", kicker: KICKER.portada, title: c.title, body: c.subtitle, items: [], tag: c.tag, chips, scene: txt(j.escena, 300) || undefined };
  if (reveal.length >= 3) {
    cover.reveal = reveal;
    const second = rest.find(r => r.kind === "respuesta");
    if (second) second.reveal = reveal;
  }
  return { covers, pick, rec: pick, slides: retone([cover, ...rest], start), caption: clean(j.pie, 1200), scene: txt(j.escena, 300) || undefined, idea: txt(j.idea, 200) || undefined };
}

/** Cambia la portada por otra de las propuestas (gratis). */
export function withCover(d: CarouselDraft, i: number): CarouselDraft {
  const c = d.covers[i];
  if (!c) return d;
  const old = d.slides[0];
  // La portada póster tenía el titular anterior escrito en la imagen: se quita.
  return { ...d, pick: i, slides: [{ ...old, title: c.title, body: c.subtitle, tag: c.tag, image: undefined }, ...d.slides.slice(1)] };
}

/**
 * Chequeo de portada (gratis, con reglas): ¿detiene el scroll? Se lee en un segundo, el color de
 * marca está usado con intención y no hay promesas que Meta o el manual rechacen.
 */
export function coverCheck(title: string): { ok: boolean; notes: string[] } {
  const plain = title.replace(/\*/g, "").trim();
  const words = plain.split(/\s+/).filter(Boolean).length;
  const notes: string[] = [];
  if (!plain) notes.push("La portada no tiene titular.");
  if (words > 9) notes.push(`Tiene ${words} palabras: en la portada, 8 o menos se leen en un segundo.`);
  const marks = (title.match(/\*[^*]+\*/g) ?? []).length;
  if (marks === 0) notes.push("Marca 1 palabra clave entre *asteriscos* para que salga en tu color de marca.");
  if (marks > 2) notes.push("Hay demasiadas palabras resaltadas: el color pierde fuerza. Deja 1 o 2.");
  if (/\b(gana|ganar|ganancias?|ingresos?|millonari|dinero f[aá]cil|garantizad)/i.test(plain) || /\$\s?\d|\d+\s?(usd|d[oó]lares)/i.test(plain))
    notes.push("Suena a promesa de dinero: Meta lo puede rechazar y no lo podemos prometer. Habla del proceso o del problema.");
  if (/\ben\s+\d+\s+d[ií]as?\b/i.test(plain)) notes.push("Evita plazos (\"en 7 días\"): es una promesa que no depende de ti.");
  return { ok: notes.length === 0, notes };
}

/** Divide un texto con *marcas* en tramos normales y de color. */
export function accentRuns(s: string): { text: string; accent: boolean }[] {
  const out: { text: string; accent: boolean }[] = [];
  s.split(/(\*[^*]+\*)/g).forEach(p => {
    if (!p) return;
    const accent = p.startsWith("*") && p.endsWith("*") && p.length > 2;
    out.push({ text: accent ? p.slice(1, -1) : p.replace(/\*/g, ""), accent });
  });
  return out;
}

/** Pasos para publicarlo (orgánico en Instagram y, si quiere, como anuncio). */
export const PUBLISH_STEPS = [
  "En Instagram toca + → Publicación y elige las láminas en orden (de la 1 a la última).",
  "Al día siguiente mira Estadísticas → Me gusta por lámina: la 2 debería tener al menos la mitad que la portada. Si tiene menos de un tercio, la lámina 2 no respondió la portada.",
  "Pega el pie de publicación. Publícalo a la hora en que tu público está más activo.",
  "Cuando alguien comente o escriba la palabra clave, respóndele por mensaje directo ese mismo día.",
  "¿Lo quieres como anuncio? En el Administrador de anuncios de Meta elige el formato Carrusel y sube las mismas láminas.",
];

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const STYLE_TYPE: Record<StyleId, string> = {
  poster: "una sans negra muy gruesa (tipo Archivo Black) combinada con una serifa en cursiva para la palabra clave",
  editorial: "una serifa gruesa y cálida de revista",
  moderno: "una sans geométrica muy gruesa",
  impacto: "una sans condensada altísima en mayúsculas",
  elegante: "una serifa de alto contraste, fina y de lujo",
};

/**
 * Prompt de la portada tipo póster editorial (para GPT Image 2, Nano Banana Pro, etc.). La IA de
 * imagen escribe el texto dentro de la foto: barra superior de 3 columnas, titular con UNA palabra
 * enorme que domina, la escena como metáfora del deseo y máximo 3 colores del sistema.
 */
export function posterPrompt(o: { cover: Slide; scene?: string; design: CarouselDesign; brief: Brief; aspect: "4:5" | "1:1"; hasRefs?: boolean; rules: string; date?: Date }): string {
  const runs = accentRuns(o.cover.title);
  const focal = runs.find(r => r.accent)?.text.trim() ?? "";
  const plain = o.cover.title.replace(/\*/g, "").trim();
  const d = o.date ?? new Date();
  const left = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const center = o.design.name || (o.design.handle ? `@${o.design.handle}` : clean(o.brief.product, 30));
  const right = (o.design.role || o.cover.tag || "guía").toLocaleLowerCase("es");
  const scene = clean(o.scene, 300) || `una metáfora visual cinematográfica de: ${clean(o.brief.promise, 120) || plain}`;
  return [
    `Portada editorial para un carrusel de Instagram, diseño tipo póster de revista, formato ${o.aspect === "4:5" ? "vertical 4:5" : "cuadrado 1:1"}.`,
    `BARRA SUPERIOR (5 % desde arriba): tres columnas de texto pequeño en sans negrita, minúsculas, bien separadas: izquierda «${left}», centro «${center}», derecha «${right}».`,
    focal
      ? `TITULAR: «${plain}». La palabra «${focal}» va ENORME y dominante, ocupando casi todo el ancho, en ${STYLE_TYPE[o.design.style]}; el resto de las palabras va mucho más pequeño en sans negrita, pegado arriba y abajo de la palabra grande, formando un solo bloque.`
      : `TITULAR: «${plain}», enorme y dominante, en ${STYLE_TYPE[o.design.style]}, formando un solo bloque.`,
    "El protagonista de la foto puede quedar delante de una parte de las letras grandes para dar profundidad, sin tapar la lectura.",
    `ESCENA: ${scene}.`,
    o.design.world ? `La escena ocurre en el mundo fijo de la marca: ${clean(o.design.world, 160)}.` : "",
    o.hasRefs ? "Usa la persona o el producto de la imagen de referencia adjunta como protagonista, igual que en la referencia." : "",
    `FOTO cinematográfica real, grano de película suave, luz dramática. Máximo 3 colores en todo el diseño: ${o.design.brand} como color dominante, crema y negro.`,
    o.cover.body ? `ABAJO, centrado y pequeño, en sans negrita: «${clean(o.cover.body, 90)}».` : "",
    "Todo el texto en español, escrito EXACTAMENTE como se indica, sin otras palabras, sin logos ni marcas.",
    o.rules,
  ].filter(Boolean).join(" ");
}

export type StoryCheck = { id: "apertura" | "agarre" | "columna" | "ritmo" | "giro" | "remate"; label: string; ok: boolean; why: string };

/**
 * La prueba de la historia (gratis, con reglas): las 6 posiciones sobre 6. Menos de 4 = un carrusel que
 * la gente abandona. Es una revisión de forma; el fondo (si de verdad crea un deseo) lo decide quien lo lee.
 */
export function storyTest(slides: Slide[]): StoryCheck[] {
  const cover = slides[0];
  const words = (cover?.title ?? "").replace(/\*/g, "").trim().split(/\s+/).filter(Boolean).length;
  const middle = slides.slice(2, -2);
  const last = slides[slides.length - 1];
  const turn = slides.find(x => x.kind === "giro");
  const weightOf = (x: Slide) => x.weight ?? (x.kind === "giro" || x.kind === "respuesta" ? "corta" : "densa");
  const repeats = slides.slice(1).filter((x, i) => x.tone === slides[i].tone && weightOf(x) === weightOf(slides[i])).length;
  const noBridge = middle.filter(x => !x.bridge?.trim()).length;
  return [
    { id: "apertura", label: "Apertura", ok: !!cover && words > 0 && words <= 6 && coverCheck(cover.title).notes.filter(n => !/palabras/.test(n)).length === 0,
      why: words > 6 ? `La portada tiene ${words} palabras: con 3 a 5 crea más ganas.` : "Portada corta, con su palabra resaltada y sin promesas." },
    { id: "agarre", label: "Agarre", ok: slides[1]?.kind === "respuesta" && !!slides[1].title.trim(),
      why: slides[1]?.kind === "respuesta" ? "La lámina 2 responde la portada." : "La lámina 2 empieza el contenido en vez de responder la portada." },
    { id: "columna", label: "Columna", ok: middle.length > 0 && noBridge === 0,
      why: noBridge ? `${noBridge} lámina${noBridge > 1 ? "s" : ""} del medio sin tirón hacia la siguiente.` : "Cada lámina abre la siguiente." },
    { id: "ritmo", label: "Ritmo", ok: repeats === 0,
      why: repeats ? "Hay láminas seguidas con el mismo peso y color: se leen como una sola." : "Cambia de peso y color de una lámina a otra." },
    { id: "giro", label: "Giro", ok: !!turn?.title.trim(),
      why: turn ? (/^\s*para que/i.test(turn.title.replace(/\*/g, "")) ? "El giro dice para qué sirve todo lo anterior." : "Hay giro. Más fuerte si empieza con \"Para que puedas…\".") : "Falta la lámina que cambia lo que significaba todo." },
    { id: "remate", label: "Remate", ok: last?.kind === "llamada" && !!last.cta?.trim() && !/^(info|quiero|si|sí)$/i.test(last.cta.trim()),
      why: last?.cta ? "Creencia nueva y una sola acción conectada." : "Falta la palabra clave: una sola acción, conectada con lo que ahora creen." },
  ];
}

/** La medida de la lámina 2: me gusta de la lámina 2 ÷ me gusta de la portada (Estadísticas de Instagram). */
export function slideTwoScore(coverLikes: number, slide2Likes: number): { pct: number; level: "fuerte" | "normal" | "debil"; text: string } | null {
  if (!(coverLikes > 0) || !(slide2Likes >= 0)) return null;
  const pct = Math.round((slide2Likes / coverLikes) * 100);
  if (pct > 50) return { pct, level: "fuerte", text: "Carrusel fuerte: la lámina 2 sostuvo lo que abrió la portada." };
  if (pct >= 30) return { pct, level: "normal", text: "Normal. La meta es 50 %: haz que la lámina 2 responda solo a la portada." };
  return { pct, level: "debil", text: "La lámina 2 no hizo su trabajo: no respondió lo que abrió la portada." };
}

// ── Clonar con ADN ganador ───────────────────────────────────────────────────────────────────────
/**
 * Un carrusel que ya funciona se descompone en ~9 partes. Se mantienen 3 (las que explican por qué
 * funcionó) y se cambia todo lo demás: si se mantiene todo, es una copia; si se mantienen 3, es ADN
 * ganador. Nunca se mantienen sus palabras, fotos, cara, nombre, marca ni números.
 */
export type DnaPart = { id: string; part: string; what: string; matters: boolean; why: string };
export type CloneInfo = {
  summary: string; why: string;
  slides: { n: number; position: string; composition: string; artifact: string; idea: string }[];
  style: { colors: string[]; font: string; style: StyleId; start: "claro" | "oscuro"; photos: string };
  dna: DnaPart[]; keep: string[]; improvements: string[];
  source: { url: string; images: string[]; owner: string; likes: number | null; comments: number | null };
};
export const MAX_KEEP = 3;

/** Lee la respuesta de carousel-clone: el análisis (CloneInfo) y el borrador ya armado. */
export function parseClone(r: Record<string, unknown>, start: "claro" | "oscuro" = "oscuro"): { info: CloneInfo; draft: CarouselDraft } | null {
  const a = (r.analisis ?? {}) as Record<string, unknown>;
  const st = (a.estilo ?? {}) as Record<string, unknown>;
  const src = (r.source ?? {}) as Record<string, unknown>;
  const dna: DnaPart[] = (Array.isArray(r.adn) ? r.adn : []).slice(0, 12).map((d: Record<string, unknown>, i: number) => ({
    id: clean(d?.id, 8) || `a${i + 1}`, part: txt(d?.parte, 80), what: txt(d?.que_es, 200), matters: d?.importa === true, why: txt(d?.por_que, 200),
  })).filter(d => d.part);
  const ids = new Set(dna.map(d => d.id));
  let keep = (Array.isArray(r.mantener) ? r.mantener : []).map(x => clean(x, 8)).filter(id => ids.has(id)).slice(0, MAX_KEEP);
  if (!keep.length) keep = dna.filter(d => d.matters).map(d => d.id).slice(0, MAX_KEEP);
  const sty = String(st.estilo_cercano ?? "");
  const info: CloneInfo = {
    summary: txt(a.resumen, 240), why: txt(a.por_que_funciona, 500),
    slides: (Array.isArray(a.laminas) ? a.laminas : []).slice(0, 10).map((l: Record<string, unknown>, i: number) => ({
      n: Number(l?.n) || i + 1, position: txt(l?.posicion, 30), composition: txt(l?.composicion, 200), artifact: txt(l?.artefacto, 120), idea: txt(l?.idea, 200),
    })),
    style: {
      colors: (Array.isArray(st.colores) ? st.colores : []).filter((c): c is string => typeof c === "string" && HEX.test(c)).map(c => c.toLowerCase()).slice(0, 3),
      font: txt(st.letra, 160), style: (sty in STYLES ? sty : "poster") as StyleId, start: st.empieza === "oscuro" ? "oscuro" : "claro", photos: txt(st.fotos, 200),
    },
    dna, keep, improvements: (Array.isArray(r.mejoras) ? r.mejoras : []).map(x => txt(x, 200)).filter(Boolean).slice(0, 5),
    source: {
      url: clean(src.url, 200), images: (Array.isArray(src.images) ? src.images : []).filter((u): u is string => typeof u === "string" && u.startsWith("https://")).slice(0, 10),
      owner: clean(src.owner, 40), likes: typeof src.likes === "number" ? src.likes : null, comments: typeof src.comments === "number" ? src.comments : null,
    },
  };
  const c = (r.carrusel ?? null) as Record<string, unknown> | null;
  const draft = parseCarouselObj(c, 8, start, { free: true });
  if (!draft) return null;
  return { info, draft: { ...draft, idea: draft.idea ?? txt(c?.idea, 200) } };
}

/** El color de marca del original: el más vivo de sus 3 colores. */
export function brandFromClone(colors: string[]): string | null {
  const sat = (h: string) => { const n = parseInt(h.slice(1), 16); const v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; const mx = Math.max(...v), mn = Math.min(...v); return mx ? (mx - mn) / mx : 0; };
  return [...colors].sort((a, b) => sat(b) - sat(a))[0] ?? null;
}

/**
 * Re-clonar con otras 3 partes (generador carrusel-copy de ai-chat, sin volver a bajar el carrusel):
 * va solo el análisis en texto, nunca las imágenes ni el texto original.
 */
export function recloneRequest(o: { info: CloneInfo; keep: string[]; brief: Brief; goal: CarouselGoal; handle?: string; world?: string; line?: string }): string {
  const keep = o.info.dna.filter(d => o.keep.includes(d.id));
  const change = o.info.dna.filter(d => !o.keep.includes(d.id));
  const n = Math.min(9, Math.max(4, o.info.slides.length - 1));
  return [
    "Vas a escribir un carrusel NUEVO con el ADN ganador de otro que ya funcionó. Mantienes SOLO estas 3 partes y cambias todo lo demás. Nunca copies palabras, fotos, nombres, marcas ni números del original.",
    `Resumen del original: ${o.info.summary}`,
    `Por qué funcionó: ${o.info.why}`,
    "Sus láminas, en orden (posición · composición · idea):",
    ...o.info.slides.map(x => `${x.n}. ${x.position} · ${x.composition} · ${x.idea}`),
    "",
    "MANTIENES (patrones, no contenido):",
    ...keep.map(d => `- ${d.part}: ${d.what}`),
    "CAMBIAS por completo:",
    ...change.map(d => `- ${d.part}`),
    "",
    "Hazlo MEJOR que el original con la fórmula de 6 posiciones (apertura que crea un deseo, agarre en la lámina 2 que responde solo la portada, columna con puentes, ritmo corta/densa, giro 'Para que puedas…', remate con creencia nueva + UNA palabra clave). En 'mejoras' di 3 cosas concretas que hiciste mejor.",
    o.goal === "ensenar" ? "Objetivo: enseñar algo útil del tema del producto." : "Objetivo: que quieran el producto.",
    "Tipos de lámina disponibles: respuesta, problema (3 items), comparacion (2 items: NO/SÍ), solucion, tarjetas (4 items), pasos (3 items), regla (pastilla 'Regla N', titulo de 1 o 2 palabras gigantes, texto ≤10 palabras, veredicto, escena), giro (penúltima), llamada (última, con palabra).",
    "Cada lámina (menos giro y llamada) lleva puente (≤7 palabras), peso (corta o densa) y veredicto si aplica. Marca 1 o 2 palabras de cada titular entre *asteriscos*. 'escena' = foto cinematográfica SIN texto, personas latinas comunes, sin famosos, sin marcas, sin dinero.",
    "Prohibido: promesas de ingresos o resultados, plazos, testimonios o cifras inventadas, urgencia falsa, marcas ajenas, emojis. Español neutro latinoamericano, de tú.",
    "",
    `PRODUCTO: ${clean(o.brief.product, 200)}.`,
    clean(o.brief.who, 200) ? `PÚBLICO: ${clean(o.brief.who, 200)}.` : "",
    clean(o.brief.promise, 200) ? `LO QUE LOGRA: ${clean(o.brief.promise, 200)}.` : "",
    o.handle ? `CUENTA: @${cleanHandle(o.handle)}.` : "",
    ...signatureLines(o),
    "",
    "RESPONDE SOLO con JSON válido:",
    `{"mejoras":["","",""],"carrusel":{"idea":"","portadas":[{"titulo":"","subtitulo":"","pastilla":"","por_que":""},{"titulo":"","subtitulo":"","pastilla":"","por_que":""},{"titulo":"","subtitulo":"","pastilla":"","por_que":""}],"recomendada":0,"revelar":[],"etiquetas":["","",""],"escena":"","laminas":[{"tipo":"","peso":"","etiqueta":"","titulo":"","texto":"","items":[],"veredicto":"","puente":"","palabra":"","pastilla":"","escena":""}],"pie":""}}`,
    `"carrusel.laminas" trae ${n} elementos: la primera respuesta, la penúltima giro y la última llamada.`,
  ].filter(Boolean).join("\n");
}

/** Lee la respuesta de un re-clonado (texto del generador). */
export function parseReclone(text: string, start: "claro" | "oscuro" = "oscuro"): { draft: CarouselDraft; improvements: string[] } | null {
  const j = firstJson(text) as Record<string, unknown> | null;
  if (!j) return null;
  const draft = parseCarouselObj((j.carrusel ?? null) as Record<string, unknown> | null, 8, start, { free: true });
  if (!draft) return null;
  return { draft, improvements: (Array.isArray(j.mejoras) ? j.mejoras : []).map(x => txt(x, 200)).filter(Boolean).slice(0, 5) };
}

/** Foto IA de una lámina, SIN texto (el texto lo pone el diseño, con fuentes reales). */
export function photoPrompt(o: { slide: Slide; design: CarouselDesign; brief: Brief; aspect: "4:5" | "1:1"; card: boolean; hasRefs?: boolean; rules: string }): string {
  const scene = clean(o.slide.scene, 300) || `una escena cinematográfica que muestre: ${o.slide.title.replace(/\*/g, "")}`;
  return [
    `Fotografía cinematográfica real para ${o.card ? "una tarjeta dentro de" : "el fondo de"} una lámina de carrusel de Instagram, formato ${o.aspect === "4:5" ? "vertical 4:5" : "cuadrado 1:1"}.`,
    `ESCENA: ${scene}.`,
    o.design.world ? `Ocurre en el mundo fijo de la marca: ${clean(o.design.world, 160)}.` : "",
    o.card ? "Encuadre limpio, un solo sujeto claro." : "Deja espacio despejado y con poco detalle en la mitad de arriba para poner un titular encima.",
    o.hasRefs ? "Usa la persona o el producto de la imagen de referencia adjunta como protagonista." : "",
    `Luz dramática, grano de película suave, color con ${o.design.brand} como tono dominante.`,
    "SIN ningún texto, letra, número, logo ni marca en la imagen.",
    o.rules.replace(/Si hay texto[^.]*\./, "").trim(),
  ].filter(Boolean).join(" ");
}
