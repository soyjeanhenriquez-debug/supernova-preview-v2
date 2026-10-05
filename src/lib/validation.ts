/**
 * Lógica de la etapa 2 "Comprueba que se vende" (src/pages/ValidationPage.tsx), sin React para
 * poder probarla. Sin IA y sin créditos.
 *
 * Cada pregunta se responde "Sí", "No" o "No sé". "No sé" vale medio punto y entra en la lista
 * "Por comprobar" con una comprobación de 1 minuto: así nadie responde al azar.
 * Las respuestas viejas (true/false de la versión Verdadero/Falso) se leen como sí/no.
 */

export type Block = "producto" | "mercado";
export type Answer = "si" | "no" | "nose";
export type Answers = Record<string, Answer>;

/** Comprobación automática con datos reales del catálogo (RPC radar_search, gratis). */
export type AutoCheck = "radar_30d";

export type Question = {
  id: string;
  block: Block;
  /** Pregunta en lenguaje simple, de tú. */
  text: string;
  /** Texto para tiendas de productos físicos (business_type === "ecommerce"). */
  textEcom?: string;
  /** "Cómo saberlo": una comprobación concreta de 1 minuto. */
  how: string;
  howEcom?: string;
  /** Peso dentro de su bloque (1 normal, 2 importante). */
  weight: number;
  /** Consejo cuando la respuesta es "No". */
  tip: string;
  tipEcom?: string;
  /** Pantalla de la app que ayuda a comprobarlo o mejorarlo (nombre interno de Index.tsx). */
  page?: string;
  auto?: AutoCheck;
};

export const QUESTIONS: Question[] = [
  // PRODUCTO — los id se conservan de la versión Verdadero/Falso para no perder lo guardado.
  { id: "p_problema", block: "producto", weight: 2, page: "Ofertas",
    text: "¿Tu producto le quita un problema a alguien o le da algo que desea mucho?",
    how: "Pregúntate: ¿alguien buscaría esto en Google o le pediría ayuda a un amigo con esto? Si la respuesta es sí, marca Sí.",
    tip: "La gente paga por dejar de sufrir algo o por lograr algo que desea mucho. Busca un ángulo más urgente." },
  { id: "p_tangible", block: "producto", weight: 1, page: "Mándala",
    text: "¿La persona sabrá cuándo ya logró el resultado?",
    textEcom: "¿Se entiende en un video de 5 segundos qué hace y qué cambia al usarlo?",
    how: "Completa la frase «Después de usarlo vas a poder ___». Si la llenas con algo concreto (ej.: «hacer 10 recetas en la freidora de aire»), es Sí.",
    howEcom: "Imagina el video: si en 5 segundos se ve el antes y el después, es Sí.",
    tip: "Convierte la promesa en algo concreto: qué tendrá, en cuánto tiempo, cómo lo notará.",
    tipEcom: "Si no se puede mostrar en uso, cuesta venderlo con anuncios. Piensa en cómo demostrarlo en 5 segundos." },
  { id: "p_frase", block: "producto", weight: 1, page: "Mi negocio",
    text: "¿Puedes explicar qué es y para quién es en una sola frase?",
    how: "Léele tu frase a alguien. Si la entiende sin preguntarte nada, es Sí.",
    tip: "Si no cabe en una frase, el anuncio tampoco lo va a explicar. Simplifica la promesa en tu ficha." },
  { id: "p_prueba_venta", block: "producto", weight: 2, page: "Buscar Ofertas Winner", auto: "radar_30d",
    text: "¿Hay alguien anunciando algo parecido desde hace más de 30 días?",
    how: "Búscalo en el Radar: si ves anuncios con más de 30 días activos, es Sí. Nadie paga anuncios un mes entero si no vende.",
    tip: "Un anuncio que sigue activo más de un mes suele ser señal de que vende. Busca esa prueba antes de invertir." },
  { id: "p_entrega", block: "producto", weight: 1, page: "Mini Apps",
    text: "¿Puedes hacerlo y entregarlo tú (o con ayuda de la IA), sin depender de otros?",
    textEcom: "¿Tienes un proveedor confiable y un envío que llega en pocos días?",
    how: "Haz la lista de lo que necesitas para entregarlo. Si todo lo puedes hacer tú esta semana, es Sí.",
    howEcom: "Pregúntale a tu proveedor cuánto tarda el envío. Si llega en una semana o menos y ya viste una muestra, es Sí.",
    tip: "Empieza por una versión que puedas armar tú: una guía, una plantilla o una mini app.",
    tipEcom: "Pide muestras y compara proveedores antes de anunciar. Un envío lento trae reclamos y reembolsos." },
  { id: "p_giro", block: "producto", weight: 1, page: "Ofertas",
    text: "¿Tu versión tiene algo distinto a lo que ya existe?",
    how: "Mira 3 ofertas parecidas. Si puedes decir «la mía es igual, pero ___» (en español, más corta, con un bono, por WhatsApp), es Sí.",
    tip: "No hace falta inventar nada: cambia el público, el formato, el bono o la forma de explicarlo." },
  { id: "p_testimonios", block: "producto", weight: 1, page: "Mi negocio",
    text: "¿Puedes conseguir 3 personas que lo prueben y te den su opinión?",
    how: "Piensa en 3 conocidos que tengan este problema. Si se lo puedes dar gratis esta semana a cambio de su opinión sincera, es Sí.",
    tip: "Dáselo gratis o con descuento a 3–5 personas a cambio de su opinión sincera. Nunca inventes testimonios." },
  { id: "p_precio_valor", block: "producto", weight: 1, page: "Precio",
    text: "¿Tu precio es poco comparado con lo que la persona gana o se ahorra?",
    how: "Piensa cuánto le cuesta seguir con el problema (tiempo, dinero, frustración). Si es más que tu precio, es Sí.",
    tip: "Suma bonos, compáralo con lo que cuesta seguir con el problema o prueba otro precio." },
  { id: "p_escalera", block: "producto", weight: 1, page: "Generadores",
    text: "¿Puedes venderle algo más a quien ya te compró?",
    textEcom: "¿Se puede vender en combo o la gente lo vuelve a comprar?",
    how: "Si se te ocurre una segunda parte, una versión completa o un servicio extra, es Sí.",
    howEcom: "Si tiene sentido comprar 2 o 3, o se acaba y se vuelve a comprar, es Sí.",
    tip: "Piensa en un segundo producto o una versión premium: vender a quien ya confía en ti cuesta menos.",
    tipEcom: "Arma un pack de 2 o 3 unidades o un combo con un accesorio: sube lo que te queda por pedido." },

  // MERCADO
  { id: "m_dinero", block: "mercado", weight: 2, page: "Precio",
    text: "¿Tu cliente puede pagar este precio y ya compra cosas por internet?",
    textEcom: "¿Tu cliente puede pagarlo y confía en comprar por internet (o puedes ofrecer pago contra entrega)?",
    how: "Piensa en tu cliente: ¿ya paga cosas por internet (Netflix, cursos, compras por Instagram)? Si sí, es Sí.",
    tip: "Revisa a quién le vendes: a veces el mismo producto funciona mejor para otro público con más poder de compra." },
  { id: "m_permitido", block: "mercado", weight: 2, page: "Hooks",
    text: "¿Se puede anunciar sin problema? (no promete curas, dinero fácil ni apuestas)",
    how: "Lee tu promesa: si dice que cura algo, que bajas X kilos o que ganas X dinero, es No. Si la puedes decir sin esas promesas, es Sí.",
    tip: "En temas delicados las plataformas rechazan anuncios o cierran cuentas. Cambia el ángulo a uno sin promesas médicas ni de ingresos." },
  { id: "m_alcance", block: "mercado", weight: 1, page: "Hooks",
    text: "¿Sabes dónde pasa tiempo tu cliente (qué redes usa, qué cuentas sigue)?",
    how: "Nombra 3 cuentas, grupos o páginas que sigue tu cliente. Si te salen rápido, es Sí.",
    tip: "Define sus intereses, qué ve y qué sigue. Si no lo sabes, empieza por ganchos que le hablen directo." },
  { id: "m_todo_el_ano", block: "mercado", weight: 1, page: "Ofertas",
    text: "¿Se compra en cualquier mes, no solo en una fecha (Navidad, regreso a clases…)?",
    how: "Si alguien lo compraría en marzo igual que en diciembre, es Sí.",
    tip: "Una oferta de temporada puede servir, pero solo unas semanas. Para empezar, busca una que se venda siempre." },
  { id: "m_competencia", block: "mercado", weight: 1, page: "Buscar Ofertas Winner", auto: "radar_30d",
    text: "¿Hay varios vendedores distintos anunciando algo parecido (no uno solo)?",
    how: "En el Radar, cuenta cuántos anunciantes distintos salen con tu tema. 3 o más es Sí: hay mercado y espacio para ti.",
    tip: "Cero competencia suele significar cero demanda. Si solo hay uno, mira si es un gigante difícil de igualar." },
];

export const TOTAL = QUESTIONS.length;
export const BLOCK_WEIGHT: Record<Block, number> = { producto: 0.6, mercado: 0.4 };
const ANSWER_VALUE: Record<Answer, number> = { si: 1, nose: 0.5, no: 0 };

export const PAGE_LABEL: Record<string, string> = {
  "Ofertas": "Ver ofertas",
  "Buscar Ofertas Winner": "Buscar en el Radar",
  "Mini Apps": "Ver Mini Apps",
  "Precio": "Abrir Precio y ganancia",
  "Mándala": "Abrir la Mándala",
  "Generadores": "Usar los generadores",
  "Hooks": "Ver ganchos",
  "Mi negocio": "Revisar mi ficha",
};

/**
 * Lee lo guardado: acepta "si"/"no"/"nose" y también true/false de la versión anterior.
 * Descarta ids que ya no existen y valores raros.
 */
export function normalizeAnswers(raw: unknown): Answers {
  if (!raw || typeof raw !== "object") return {};
  const out: Answers = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!QUESTIONS.some(q => q.id === k)) continue;
    if (v === true || v === "si") out[k] = "si";
    else if (v === false || v === "no") out[k] = "no";
    else if (v === "nose") out[k] = "nose";
  }
  return out;
}

/** Puntaje de un bloque (0–1): Sí = 1, No sé = 0,5, No = 0, ponderado. null si no hay respuestas. */
export function blockScore(block: Block, answers: Answers): number | null {
  let got = 0, total = 0;
  for (const q of QUESTIONS) {
    const a = answers[q.id];
    if (q.block !== block || !a) continue;
    total += q.weight;
    got += q.weight * ANSWER_VALUE[a];
  }
  return total ? got / total : null;
}

export function overallScore(answers: Answers): number | null {
  const p = blockScore("producto", answers);
  const m = blockScore("mercado", answers);
  if (p === null && m === null) return null;
  if (p === null) return Math.round((m ?? 0) * 100);
  if (m === null) return Math.round(p * 100);
  return Math.round((p * BLOCK_WEIGHT.producto + m * BLOCK_WEIGHT.mercado) * 100);
}

/** Preguntas con una respuesta dada; las importantes (peso 2) primero. */
export function byAnswer(answers: Answers, value: Answer, block?: Block): Question[] {
  return QUESTIONS
    .filter(q => (!block || q.block === block) && answers[q.id] === value)
    .sort((a, b) => b.weight - a.weight);
}

/** Con tantos "No sé" la nota todavía no dice mucho. */
export const UNSURE_LIMIT = 4;

export type Verdict = { tone: "good" | "mid" | "bad" | "unsure"; title: string; text: string };

export function verdict(score: number, answers: Answers): Verdict {
  const unsure = byAnswer(answers, "nose");
  const keyUnsure = unsure.filter(q => q.weight === 2).length;
  if (unsure.length >= UNSURE_LIMIT || keyUnsure >= 2) {
    return { tone: "unsure", title: "Todavía te faltan datos para decidir",
      text: `Tienes ${unsure.length} respuestas en "No sé". Compruébalas (cada una toma 1 minuto) y tu nota va a decir mucho más.` };
  }
  if (score >= 75) return { tone: "good", title: "Adelante: tiene lo que necesita para vender", text: "Tu oferta pasa la prueba. Sigue con el precio y cuida los puntos débiles que queden." };
  if (score >= 50) return { tone: "mid", title: "Se puede, pero refuerza estos puntos antes de invertir", text: "Hay base, pero los puntos débiles te pueden hacer gastar de más en anuncios. Trabájalos primero." };
  return { tone: "bad", title: "Cambia de oferta o ajústala antes de gastar en anuncios", text: "Hoy le faltan señales importantes. Mejor ajustarla o elegir otra ahora que perder dinero después." };
}

export type NextStep =
  | { kind: "fix"; question: Question }      // un punto importante salió "No"
  | { kind: "check"; question: Question }    // hay algo "Por comprobar"
  | { kind: "price" }                         // pasa: ponle precio
  | { kind: "change" };                       // nota baja sin un arreglo claro

/**
 * El siguiente paso, en orden: 1) arreglar un punto importante en "No", 2) comprobar lo que quedó
 * en "No sé" (primero lo importante), 3) con nota ≥ 50 ponerle precio, 4) si no, cambiar de oferta.
 */
export function nextStep(answers: Answers): NextStep {
  const keyNo = byAnswer(answers, "no").find(q => q.weight === 2);
  if (keyNo) return { kind: "fix", question: keyNo };
  const unsure = byAnswer(answers, "nose")[0];
  if (unsure) return { kind: "check", question: unsure };
  const score = overallScore(answers) ?? 0;
  return score >= 50 ? { kind: "price" } : { kind: "change" };
}

// ---------- Sugerencias con lo que la app ya sabe (el usuario siempre confirma) ----------

export type ProfileLike = {
  product?: string; who?: string; promise?: string; price?: string; proof?: string;
  business_type?: string | null;
};
export type Suggestion = { answer: Answer; why: string };

const strip = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Temas que Meta y TikTok revisan con lupa. Se buscan en la ficha, sin tildes. */
const REGULATED: { label: string; words: string[] }[] = [
  { label: "salud o el cuerpo", words: ["bajar de peso", "adelgaz", "perder peso", "kilos", "cura", "curar", "diabetes", "hipertension", "ansiedad", "depresion", "suplemento", "pastilla", "medicina", "detox", "quema grasa", "quemar grasa", "dolor", "enfermedad", "cancer", "fertilidad", "ereccion", "colageno"] },
  { label: "dinero fácil o inversiones", words: ["ganar dinero", "dinero facil", "ingresos pasivos", "hazte rico", "trading", "forex", "cripto", "bitcoin", "inversion", "invertir", "opciones binarias", "libertad financiera", "ganar dolares"] },
  { label: "apuestas", words: ["apuesta", "casino", "loteria", "pronostico", "tipster", "ruleta", "poker", "bet"] },
];

const SEASONAL = ["navidad", "naviden", "halloween", "san valentin", "dia de las madres", "dia del padre", "regreso a clases", "vuelta al cole", "black friday", "año nuevo", "ano nuevo", "verano", "semana santa", "dia de muertos", "mundial"];

/** ¿La palabra aparece al inicio de una palabra del texto? Las cortas (≤ 4 letras) deben ser exactas. */
function hasWord(t: string, w: string): boolean {
  const esc = w.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
  const end = w.length <= 4 ? "(?![a-z0-9])" : "";
  return new RegExp("(?:^|[^a-z0-9])" + esc + end).test(t);
}

export function regulatedTopic(text: string): string | null {
  const t = strip(text);
  for (const r of REGULATED) {
    if (r.words.some(w => hasWord(t, w))) return r.label;
  }
  return null;
}

export function seasonalWord(text: string): string | null {
  const t = strip(text);
  return SEASONAL.find(w => hasWord(t, strip(w))) ?? null;
}

/** Sugerencias para algunas preguntas, sacadas de la ficha. Nunca se marcan solas. */
export function suggestions(p: ProfileLike): Record<string, Suggestion> {
  const out: Record<string, Suggestion> = {};
  const all = [p.product, p.who, p.promise].filter(Boolean).join(" · ");

  const reg = regulatedTopic(all);
  out.m_permitido = reg
    ? { answer: "no", why: `Tu ficha habla de ${reg}: las plataformas revisan más estos anuncios. Si lo dices sin prometer resultados, puede ser Sí.` }
    : { answer: "si", why: "No vimos en tu ficha temas delicados (salud con promesas, dinero fácil, apuestas)." };

  const season = seasonalWord(all);
  if (season) out.m_todo_el_ano = { answer: "no", why: `Tu ficha menciona «${season}»: parece de temporada.` };

  if (p.proof && p.proof.trim().length >= 3) {
    out.p_testimonios = { answer: "si", why: `En tu ficha pusiste una prueba: «${p.proof.trim().slice(0, 80)}».` };
  }
  if (p.business_type === "infoproducto") {
    out.p_entrega = { answer: "si", why: "Es un producto digital: lo puedes armar tú con ayuda de la IA." };
  }
  return out;
}

// ---------- Comprobación con el catálogo (radar_search) ----------

const STOP = new Set(["de", "del", "la", "las", "el", "los", "un", "una", "unos", "unas", "para", "por", "con", "sin", "en", "y", "o", "a", "al", "que", "tu", "tus", "mi", "mis", "su", "sus", "como", "mas", "muy", "es", "se", "lo", "le", "les", "curso", "guia", "ebook", "programa", "metodo", "pack", "kit", "digital", "online"]);

/** Palabras clave para buscar en el Radar: hasta 2 palabras con sentido del producto. */
export function keywordWords(product: string): string[] {
  return strip(product)
    .split(/[^a-z0-9ñ]+/)
    .filter(w => w.length >= 3 && !STOP.has(w));
}

export function defaultKeyword(product: string): string {
  return keywordWords(product).slice(0, 2).join(" ");
}

export type RadarRow = { page_name?: string | null; advertiser?: string | null; days_active?: number | null };
export type RadarCheck = {
  total: number;
  capped: boolean;
  examples: { name: string; days: number }[];
  advertisers: number;
};

/** Resume la respuesta de radar_search: total, ejemplos y anunciantes distintos. */
export function summarizeRadar(res: { total?: number; capped?: boolean; rows?: RadarRow[] } | null): RadarCheck {
  const rows = res?.rows ?? [];
  const names = rows.map(r => (r.page_name || r.advertiser || "").trim()).filter(Boolean);
  const seen = new Set<string>();
  const examples: { name: string; days: number }[] = [];
  rows.forEach((r, i) => {
    const name = names[i] ?? "";
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    examples.push({ name, days: Math.round(r.days_active ?? 0) });
  });
  return { total: res?.total ?? 0, capped: !!res?.capped, examples: examples.slice(0, 3), advertisers: seen.size };
}

/** Número en formato español (2.000). */
export const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
