import { currencyForCountry, currencyInfo, fmtMoney, fromUsd, parseAmount } from "@/lib/pricing";
import type { BuildFormat, BuildSize, BuildTone, Piece } from "@/lib/productBuilder";

/**
 * Agente de producto (9.º agente, 29-oct-2026): convierte una oferta en un producto listo para vender
 * conversando. Lógica pura (sin red ni React) para poder probarla: qué ya sabe, qué falta preguntar
 * (máx. 4 preguntas con opción recomendada), el plan, los ajustes en una línea, el precio por ticket
 * del nicho y los textos de venta. Sin pasos de control que frenen (decisión de Jean, 29-oct-2026): el
 * agente entrega y ya; solo no inventa datos (los textos de venta dicen lo que el producto trae de verdad).
 * La escritura y el cobro NO viven aquí: los hace la función product-builder en el servidor.
 */

export type Genero = "recetario" | "guia" | "plantilla" | "servicio" | "curso";
export type Nivel = "principiante" | "intermedio" | "avanzado";
export type Largo = "corto" | "normal";
export type Tono = Extract<BuildTone, "cercano" | "limpio">;
export type PreguntaId = "genero" | "nivel" | "largo" | "tono";

export const GENERO_LABEL: Record<Genero, string> = {
  recetario: "Recetario", guia: "Guía", plantilla: "Plantillas", servicio: "Servicio por escrito", curso: "Mini curso",
};
export const NIVEL_LABEL: Record<Nivel, string> = { principiante: "Empieza de cero", intermedio: "Ya sabe lo básico", avanzado: "Tiene experiencia" };
export const TONO_LABEL: Record<Tono, string> = { cercano: "Cercano, de tú", limpio: "Claro y profesional" };

/** Lo que la app ya sabe de la persona y su oferta (ficha del producto activo, oferta modelada, ADN, país). */
export interface Contexto {
  nombre: string;
  producto: string;
  paraQuien: string;
  promesa: string;
  /** Precio de la ficha tal cual ("US$1,99", "1.99"). */
  precio: string;
  priceAmount: number | null;
  priceCurrency: string | null;
  /** Prueba o garantía real de la ficha (si no hay, nunca se menciona una garantía). */
  prueba: string;
  /** Oferta que modela (viene de Ofertas → "Hacer mi versión"). */
  oferta: { nombre: string; precioUsd: number | null } | null;
  /** Cómo habla la persona (ADN, pregunta 12). */
  voz: string;
  /** País ISO de 2 letras (pantalla de edad y país). */
  pais: string | null;
}

export interface Ajustes {
  genero: Genero;
  nivel: Nivel;
  largo: Largo;
  tono: Tono;
  /** Solo recetario: cuántas recetas trae. */
  recetas: number;
  /** Pedidos sueltos de la persona ("agrega 10 recetas veganas"). */
  extras: string[];
}

export type Deducido = Partial<Omit<Ajustes, "extras">>;

export interface Opcion { id: string; label: string; hint?: string }
export interface Pregunta { id: PreguntaId; titulo: string; porque: string; opciones: Opcion[]; recomendada: string }

export const RECETAS_OPCIONES = [20, 40, 60] as const;
export const MAX_RECETAS = 70;
export const MIN_RECETAS = 10;
export const MAX_PREGUNTAS = 4;
const MAX_NOTAS = 500;

// ---------- Qué ya sabe (sin preguntar) ----------

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const GENERO_PISTAS: [Genero, RegExp][] = [
  ["recetario", /recet|postre|reposter|cocina|dulce|relleno|bizcoch|torta|pastel|galleta|panader|menu|comida|almuerzo|bebida|batido|cocte/],
  ["curso", /\bcurso|clases?\b|leccion|modulo|masterclass|taller/],
  ["plantilla", /plantilla|template|formato[s]? listo|checklist|planner|planificador/],
  ["servicio", /servicio|asesor|consultor|diagnostic|auditor|mentor|plan personalizado|a la medida/],
  ["guia", /\bguia|ebook|e-book|libro|manual/],
];

/** Lo que se puede deducir de la ficha, el ADN y la oferta. Cada valor trae por qué se sabe. */
export function deducir(ctx: Contexto): { valores: Deducido; razones: Partial<Record<PreguntaId, string>> } {
  const valores: Deducido = {};
  const razones: Partial<Record<PreguntaId, string>> = {};
  const texto = norm([ctx.nombre, ctx.producto, ctx.promesa, ctx.oferta?.nombre ?? ""].join(" "));
  const quien = norm(ctx.paraQuien);

  for (const [g, re] of GENERO_PISTAS) {
    if (re.test(texto)) { valores.genero = g; razones.genero = `Tu ficha dice que es ${GENERO_LABEL[g].toLowerCase()}.`; break; }
  }

  const nRecetas = texto.match(/(\d{2,3})\s*(recetas|rellenos|postres|dulces|platos|menus)/);
  if (valores.genero === "recetario" && nRecetas) {
    const n = Math.min(MAX_RECETAS, Math.max(MIN_RECETAS, Number(nRecetas[1])));
    valores.recetas = n;
    valores.largo = n <= 20 ? "corto" : "normal";
    razones.largo = `Tu oferta habla de ${n} recetas.`;
  }

  if (/principiante|desde cero|de cero|sin experiencia|nunca ha|empieza|novat/.test(quien + " " + texto)) {
    valores.nivel = "principiante"; razones.nivel = "Tu ficha dice que es para quien empieza.";
  } else if (/avanzad|profesional(es)?\b|expert/.test(quien)) {
    valores.nivel = "avanzado"; razones.nivel = "Tu ficha dice que es para gente con experiencia.";
  }

  const voz = norm(ctx.voz);
  if (voz.trim().length >= 10) {
    valores.tono = /formal|profesional|serio|sobrio|elegante/.test(voz) && !/nada de (sonar )?formal/.test(voz) ? "limpio" : "cercano";
    razones.tono = "Lo sé por cómo dices que hablas (Tu ADN).";
  }
  return { valores, razones };
}

/** Las preguntas que faltan (máx. 4), cada una con la opción recomendada ya marcada. */
export function preguntasPendientes(ctx: Contexto, d: Deducido): Pregunta[] {
  const out: Pregunta[] = [];
  const genero = d.genero ?? "guia";
  if (!d.genero) {
    out.push({
      id: "genero", titulo: "¿Qué le vas a entregar a quien compra?",
      porque: "Así sé cómo armar cada parte.", recomendada: "guia",
      opciones: (Object.keys(GENERO_LABEL) as Genero[]).map(g => ({ id: g, label: GENERO_LABEL[g] })),
    });
  }
  if (!d.nivel) {
    out.push({
      id: "nivel", titulo: "¿Cuánto sabe quien te compra?",
      porque: "Cambia qué tan simple explico cada paso.", recomendada: "principiante",
      opciones: (Object.keys(NIVEL_LABEL) as Nivel[]).map(n => ({ id: n, label: NIVEL_LABEL[n] })),
    });
  }
  if (!d.largo) {
    // Si el género se va a preguntar, el largo se pregunta igual en términos generales.
    const precio = precioBaseUsd(ctx);
    if (!d.genero || genero !== "recetario") {
      out.push({
        id: "largo", titulo: "¿Qué tan largo lo quieres?",
        porque: "Un precio bajo se vende mejor con algo corto y directo.",
        recomendada: precio !== null && precio <= 10 ? "corto" : "normal",
        opciones: [
          { id: "corto", label: "Corto", hint: "Se lee en una tarde" },
          { id: "normal", label: "Completo", hint: "Más partes y más ejemplos" },
        ],
      });
    } else {
      out.push({
        id: "largo", titulo: "¿Cuántas recetas trae?",
        porque: "Menos recetas, mejor revisadas, venden igual a precio bajo.", recomendada: "40",
        opciones: RECETAS_OPCIONES.map(n => ({ id: String(n), label: `${n} recetas` })),
      });
    }
  }
  if (!d.tono) {
    out.push({
      id: "tono", titulo: "¿Cómo quieres que suene?",
      porque: "No llenaste cómo hablas en Tu ADN.", recomendada: "cercano",
      opciones: (Object.keys(TONO_LABEL) as Tono[]).map(t => ({ id: t, label: TONO_LABEL[t] })),
    });
  }
  return out.slice(0, MAX_PREGUNTAS);
}

/** Junta lo deducido con lo que contestó (o "Decide tú": la recomendada). Nunca queda nada vacío. */
export function ajustesFinales(d: Deducido, respuestas: Partial<Record<PreguntaId, string>>): Ajustes {
  const genero = (respuestas.genero as Genero | undefined) ?? d.genero ?? "guia";
  let largo: Largo = d.largo ?? "normal";
  let recetas = d.recetas ?? 40;
  const rl = respuestas.largo;
  if (rl === "corto" || rl === "normal") largo = rl;
  else if (rl && /^\d+$/.test(rl)) { recetas = Number(rl); largo = recetas <= 20 ? "corto" : "normal"; }
  if (genero === "recetario" && !d.recetas && !(rl && /^\d+$/.test(rl))) recetas = largo === "corto" ? 20 : 40;
  return {
    genero,
    nivel: (respuestas.nivel as Nivel | undefined) ?? d.nivel ?? "principiante",
    largo,
    tono: (respuestas.tono as Tono | undefined) ?? d.tono ?? "cercano",
    recetas: clampRecetas(recetas),
    extras: [],
  };
}

const clampRecetas = (n: number) => Math.min(MAX_RECETAS, Math.max(MIN_RECETAS, Math.round(n)));

// ---------- Cómo se le pide al constructor (product-builder) ----------

export const formatoDe = (g: Genero): BuildFormat => (g === "curso" ? "curso" : "ebook");
/** Partes principales que arma el servidor (ebook: 5/7 capítulos; curso: 3×3 / 4×3 lecciones). */
export function partesPrincipales(a: Pick<Ajustes, "genero" | "largo">): number {
  if (a.genero === "curso") return a.largo === "corto" ? 9 : 12;
  return a.largo === "corto" ? 5 : 7;
}
export const recetasPorCapitulo = (a: Pick<Ajustes, "genero" | "largo" | "recetas">) =>
  Math.ceil(a.recetas / partesPrincipales(a));

export function pedidoIndice(a: Ajustes): { format: BuildFormat; size: BuildSize; tone: BuildTone; genre: Genero } {
  return { format: formatoDe(a.genero), size: a.largo, tone: a.tono, genre: a.genero };
}

const NIVEL_NOTA: Record<Nivel, string> = {
  principiante: "Quien compra empieza de cero: pasos muy simples, sin palabras técnicas.",
  intermedio: "Quien compra ya sabe lo básico: ve al grano y suma trucos prácticos.",
  avanzado: "Quien compra tiene experiencia: detalles finos y variaciones.",
};

const GENERO_NOTA: Record<Genero, (a: Ajustes) => string> = {
  recetario: a => `Es un recetario de ${a.recetas} recetas en ${partesPrincipales(a)} categorías (unas ${recetasPorCapitulo(a)} por capítulo).`,
  guia: () => "Es una guía práctica paso a paso.",
  plantilla: () => "Es un paquete de plantillas listas para llenar.",
  servicio: () => "Es un servicio que se entrega por escrito: cada parte es lo que recibe el cliente.",
  curso: () => "Es un mini curso en lecciones cortas.",
};

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/** Las notas que acompañan al índice (≤ 500 caracteres, el tope del servidor). */
export function notasIndice(a: Ajustes, ctx: Contexto): string {
  const partes = [GENERO_NOTA[a.genero](a), NIVEL_NOTA[a.nivel]];
  if (ctx.oferta?.nombre) partes.push(`Sigue la estructura de la oferta «${clip(ctx.oferta.nombre, 60)}», con contenido propio.`);
  if (ctx.voz.trim()) partes.push(`Voz de la persona: ${clip(ctx.voz.trim(), 100)}`);
  if (a.extras.length) partes.push(`Pedidos: ${a.extras.join("; ")}`);
  let out = partes.join(" ");
  // Si no cabe, se quedan los pedidos más nuevos (lo último que pidió manda).
  const extras = [...a.extras];
  while (out.length > MAX_NOTAS && extras.length > 1) {
    extras.shift();
    out = [...partes.slice(0, -1), `Pedidos: ${extras.join("; ")}`].join(" ");
  }
  return clip(out, MAX_NOTAS);
}

/** Indicaciones para escribir cada parte (≤ 500). Funcionan aunque el servidor aún no conozca el género. */
export function instruccionesParte(a: Ajustes, p: Pick<Piece, "kind">): string {
  const nivel = NIVEL_NOTA[a.nivel];
  if (a.genero === "recetario" && p.kind === "capitulo") {
    return clip(`Recetario: este capítulo trae ${recetasPorCapitulo(a)} recetas distintas a las de los otros capítulos. Cada receta con "### nombre", rinde, ingredientes con medidas, preparación en pasos y un consejo. ${nivel} Sin promesas de salud ni de ganancias.`, MAX_NOTAS);
  }
  if (a.genero === "plantilla" && p.kind === "capitulo") {
    return clip(`Plantilla lista para llenar con [espacios], cuándo usarla y un ejemplo lleno. ${nivel}`, MAX_NOTAS);
  }
  if (a.genero === "servicio" && p.kind === "capitulo") {
    return clip(`Parte del entregable que recibe el cliente: paso a paso y plantilla con [espacios]. ${nivel}`, MAX_NOTAS);
  }
  return nivel;
}

// ---------- Precio (regla de ticket del nicho) ----------

/** Ticket típico por tipo de producto, en US$ (low ticket: se vende por impulso y por WhatsApp). */
export const TICKET: Record<Genero, { min: number; max: number; sugerido: number }> = {
  recetario: { min: 1.99, max: 9, sugerido: 4.99 },
  plantilla: { min: 4.99, max: 17, sugerido: 7 },
  guia: { min: 7, max: 17, sugerido: 9 },
  curso: { min: 17, max: 47, sugerido: 27 },
  servicio: { min: 27, max: 97, sugerido: 47 },
};

function precioBaseUsd(ctx: Contexto): number | null {
  if (ctx.oferta?.precioUsd && ctx.oferta.precioUsd > 0) return ctx.oferta.precioUsd;
  const cur = ctx.priceCurrency || (/(US\$|USD|\$)/.test(ctx.precio) ? "US$" : null);
  const n = ctx.priceAmount ?? parseAmount(ctx.precio);
  if (n === null || n <= 0) return null;
  if (!cur || cur === "US$" || cur === "USD") return n;
  const rate = currencyInfo(cur).perUsd;
  return rate ? n / rate : null;
}

export interface Precio { monto: number; moneda: string; texto: string; local: string | null; razon: string }

/**
 * Precio sugerido. Orden: el de la oferta que modelas (mismo ticket, nunca uno inventado) → el de tu
 * ficha → el ticket típico de este tipo de producto. Con el país, el equivalente en su moneda.
 */
export function precioSugerido(g: Genero, ctx: Contexto, override?: number | null): Precio {
  let monto: number;
  let moneda = "US$";
  let razon: string;
  const t = TICKET[g];
  if (override && override > 0) {
    monto = override; razon = "El precio que elegiste.";
  } else if (ctx.oferta?.precioUsd && ctx.oferta.precioUsd > 0) {
    monto = ctx.oferta.precioUsd; razon = "El mismo precio de la oferta que modelas: ya se probó que se vende así.";
  } else if ((ctx.priceAmount ?? parseAmount(ctx.precio)) && (ctx.priceAmount ?? parseAmount(ctx.precio))! > 0) {
    monto = (ctx.priceAmount ?? parseAmount(ctx.precio))!;
    moneda = ctx.priceCurrency && ctx.priceCurrency !== "USD" ? ctx.priceCurrency : "US$";
    razon = "El precio de tu ficha.";
  } else {
    monto = t.sugerido;
    razon = `Un ${GENERO_LABEL[g].toLowerCase()} suele venderse entre ${fmtMoney(t.min, "US$", { short: true })} y ${fmtMoney(t.max, "US$", { short: true })}.`;
  }
  const texto = fmtMoney(monto, moneda, { short: true });
  let local: string | null = null;
  const suya = currencyForCountry(ctx.pais);
  if (moneda === "US$" && suya !== "US$" && currencyInfo(suya).perUsd) {
    local = `≈ ${fmtMoney(fromUsd(monto, suya), suya, { short: true })}`;
  }
  return { monto, moneda, texto, local, razon };
}

// ---------- Ajustes en una línea de chat ----------

export interface ResultadoAjuste {
  ajustes: Ajustes;
  /** Hay que rehacer el índice (gratis) para que se vea el cambio. */
  rehacer: boolean;
  titulo?: string;
  precio?: number;
  tono?: Tono;
  respuesta: string;
}

const PALABRAS_NUM: Record<string, number> = { cinco: 5, diez: 10, quince: 15, veinte: 20, treinta: 30 };

export function interpretarAjuste(lineaRaw: string, a: Ajustes): ResultadoAjuste {
  const linea = lineaRaw.trim().slice(0, 200);
  const n = norm(linea);
  const sig = { ...a, extras: [...a.extras] };
  const esRecetario = a.genero === "recetario";

  // Título: "llámalo …", "título: …", "que se llame …" (no rehace nada).
  const mt = linea.match(/(?:t[ií]tulo\s*[:-]?|ll[aá]malo|que se llame|ponle de nombre)\s*["«“]?(.+?)["»”]?\s*$/i);
  if (mt && mt[1].trim().length >= 3) {
    const titulo = clip(mt[1].trim(), 160);
    return { ajustes: sig, rehacer: false, titulo, respuesta: `Listo. Ahora se llama «${titulo}».` };
  }

  // Precio: "cóbralo a 4,99", "precio 7", "véndelo en US$9".
  if (/precio|cobra|vend[eé]lo|que cueste|cuesta/.test(n)) {
    const m = linea.match(/(\d+(?:[.,]\d{1,2})?)/);
    const v = m ? parseAmount(m[1]) : null;
    if (v && v > 0) return { ajustes: sig, rehacer: false, precio: v, respuesta: `Hecho. Precio: ${fmtMoney(v, "US$", { short: true })}.` };
  }

  // Tono (no cambia el índice: cambia cómo se escribe).
  if (/formal|profesional|serio/.test(n)) { sig.tono = "limpio"; return { ajustes: sig, rehacer: false, tono: "limpio", respuesta: "Hecho. Lo escribo claro y profesional." }; }
  if (/cercan|amigable|relajad|de tu\b/.test(n)) { sig.tono = "cercano"; return { ajustes: sig, rehacer: false, tono: "cercano", respuesta: "Hecho. Lo escribo cercano, de tú." }; }

  // Cambiar el tipo de producto.
  const mg = n.match(/\b(?:hazlo|conviertelo|que sea|cambialo a)\s+(?:un|una|en|un\s+)?\s*(recetario|guia|plantillas?|servicio|mini ?curso|curso)/);
  if (mg) {
    const g: Genero = mg[1].startsWith("recet") ? "recetario" : mg[1].startsWith("guia") ? "guia" : mg[1].startsWith("plantilla") ? "plantilla" : mg[1].startsWith("servicio") ? "servicio" : "curso";
    sig.genero = g;
    return { ajustes: sig, rehacer: true, respuesta: `Lo cambio a ${GENERO_LABEL[g].toLowerCase()} y rehago el índice.` };
  }

  // Nivel.
  if (/principiante|desde cero|mas facil|mas simple|basico/.test(n)) { sig.nivel = "principiante"; return { ajustes: sig, rehacer: true, respuesta: "Lo hago más simple, para quien empieza." }; }
  if (/avanzad|experto/.test(n)) { sig.nivel = "avanzado"; return { ajustes: sig, rehacer: true, respuesta: "Lo subo de nivel, para quien ya tiene experiencia." }; }

  // Más corto / más largo.
  if (/mas cort|mas breve|menos (capitulos|recetas|lecciones|partes)|resum/.test(n)) {
    if (esRecetario) { sig.recetas = clampRecetas(a.recetas - 20); sig.largo = sig.recetas <= 20 ? "corto" : "normal"; }
    else sig.largo = "corto";
    return { ajustes: sig, rehacer: true, respuesta: esRecetario ? `Lo dejo en ${sig.recetas} recetas.` : "Lo hago más corto." };
  }
  if (/mas larg|mas complet|mas (capitulos|lecciones|partes)/.test(n)) {
    if (esRecetario) { sig.recetas = clampRecetas(a.recetas + 20); sig.largo = "normal"; }
    else sig.largo = "normal";
    return { ajustes: sig, rehacer: true, respuesta: esRecetario ? `Lo subo a ${sig.recetas} recetas.` : "Lo hago más completo." };
  }

  // "agrega 10 recetas veganas": suma recetas (con tope) y deja el pedido.
  const mr = n.match(/(?:agrega|anade|suma|pon|incluye|mete)\s+(\d{1,2}|cinco|diez|quince|veinte|treinta)\s+recetas?\s*(.*)$/);
  if (esRecetario && mr) {
    const k = /^\d+$/.test(mr[1]) ? Number(mr[1]) : PALABRAS_NUM[mr[1]];
    const antes = a.recetas;
    sig.recetas = clampRecetas(a.recetas + k);
    sig.extras.push(clip(linea, 120));
    const tope = antes + k > MAX_RECETAS ? ` Por ahora el tope es ${MAX_RECETAS} recetas.` : "";
    return { ajustes: sig, rehacer: true, respuesta: `Hecho: ${sig.recetas} recetas, con lo que pediste.${tope}` };
  }

  const ma = n.match(/^(?:agrega|anade|incluye|suma|pon|mete)\b/);
  if (ma) { sig.extras.push(clip(linea, 120)); return { ajustes: sig, rehacer: true, respuesta: "Lo agrego y rehago el índice." }; }
  const mq = linea.match(/^(?:quita|saca|elimina|sin)\s+(.+)$/i);
  if (mq) { sig.extras.push(clip(`No incluyas ${mq[1].trim()}`, 120)); return { ajustes: sig, rehacer: true, respuesta: "Lo quito y rehago el índice." }; }

  sig.extras.push(clip(linea, 120));
  return { ajustes: sig, rehacer: true, respuesta: "Lo tomo en cuenta y rehago el índice." };
}

// ---------- El plan ----------

export interface Plan {
  titulo: string;
  subtitulo: string;
  promesa: string;
  paraQuien: string;
  indice: { titulo: string; brief: string; kind: Piece["kind"]; module: string | null }[];
  incluye: string[];
  precio: Precio;
}

/** Promesa honesta: lo que el producto enseña, nunca un resultado. Si trae riesgos, se reemplaza. */
export function promesaHonesta(texto: string, titulo: string): string {
  const t = texto.trim();
  if (t && !revisarTexto(t).some(h => h.tipo !== "cifra")) return t;
  return `Aprende paso a paso lo que trae «${titulo}».`;
}

export function armarPlan(args: {
  titulo: string; subtitulo: string | null; promesa?: string | null; audiencia?: string | null;
  piezas: Pick<Piece, "title" | "brief" | "kind" | "module" | "idx">[]; ajustes: Ajustes; ctx: Contexto; precioElegido?: number | null;
  /** Recetas contadas de verdad (después de escribir). Si hay, mandan sobre las prometidas. */
  recetasReales?: number | null;
}): Plan {
  const { ajustes: a, ctx } = args;
  const orden = [...args.piezas].sort((x, y) => x.idx - y.idx);
  const principales = orden.filter(p => p.kind !== "bono");
  const bonos = orden.filter(p => p.kind === "bono");
  const incluye: string[] = [];
  if (a.genero === "recetario") {
    const n = args.recetasReales ?? a.recetas;
    incluye.push(`${n} recetas paso a paso en ${principales.length} categorías`);
  } else if (a.genero === "curso") {
    const modulos = new Set(principales.map(p => p.module ?? "")).size;
    incluye.push(`${principales.length} lecciones cortas en ${modulos} módulos, con guion y tarea`);
  } else if (a.genero === "plantilla") {
    incluye.push(`${principales.length} plantillas listas para llenar, con un ejemplo cada una`);
  } else if (a.genero === "servicio") {
    incluye.push(`${principales.length} partes del entregable, con plantilla para tu cliente`);
  } else {
    incluye.push(`${principales.length} capítulos con pasos y ejercicios`);
  }
  for (const b of bonos) incluye.push(`Bono: ${b.title}`);
  incluye.push("En PDF, listo para mandar por WhatsApp o correo");
  return {
    titulo: args.titulo,
    subtitulo: args.subtitulo ?? "",
    promesa: promesaHonesta(args.promesa ?? ctx.promesa, args.titulo),
    paraQuien: (args.audiencia ?? "").trim() || ctx.paraQuien,
    indice: orden.map(p => ({ titulo: p.title, brief: p.brief ?? "", kind: p.kind, module: p.module })),
    incluye,
    precio: precioSugerido(a.genero, ctx, args.precioElegido),
  };
}

// ---------- Textos de venta (gratis: salen del plan, sin inventar nada) ----------

const garantiaReal = (prueba: string) => /garant|devuelv|devoluc|reembols/i.test(prueba);

export function textoPaginaVenta(plan: Plan, ctx: Contexto): string {
  const partes = [
    plan.titulo,
    plan.subtitulo,
    "",
    `Para quién es: ${plan.paraQuien}`,
    `Qué aprendes: ${plan.promesa}`,
    "",
    "Qué incluye:",
    ...plan.incluye.map(i => `• ${i}`),
    "",
    "Lo que vas a ver:",
    ...plan.indice.filter(i => i.kind !== "bono").slice(0, 8).map(i => `• ${i.titulo}`),
    "",
    `Precio: ${plan.precio.texto}${plan.precio.local ? ` (${plan.precio.local})` : ""}. Pago único.`,
  ];
  if (garantiaReal(ctx.prueba)) partes.push(`Garantía: ${ctx.prueba.trim()}`);
  partes.push("", "Lo recibes al momento, en PDF.");
  return partes.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n").trim();
}

export function textoWhatsApp(plan: Plan, ctx: Contexto): string {
  const destacados = plan.indice.filter(i => i.kind !== "bono").slice(0, 4).map(i => `✅ ${i.titulo}`);
  const lineas = [
    "¡Hola! 😊 Gracias por escribir.",
    "",
    `Te cuento rápido: *${plan.titulo}* es para ${plan.paraQuien.replace(/^para\s+/i, "").replace(/\.$/, "")}.`,
    plan.incluye[0] ? `Trae ${plan.incluye[0].charAt(0).toLowerCase()}${plan.incluye[0].slice(1)}.` : "",
    "",
    ...destacados,
    "",
    `💵 Solo *${plan.precio.texto}*${plan.precio.local ? ` (${plan.precio.local})` : ""}, pago único.`,
  ];
  if (garantiaReal(ctx.prueba)) lineas.push(`🛡️ ${ctx.prueba.trim()}`);
  lineas.push("", "¿Te paso el enlace para pagar?");
  return lineas.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n").trim();
}

// ---------- Promesa del plan (no frena nada: solo redacta la promesa como lo que el producto enseña) ----------

export type TipoHallazgo = "salud" | "ingresos" | "garantia" | "cifra";
export interface Hallazgo { tipo: TipoHallazgo; donde: string; frase: string }

const RIESGOS: [TipoHallazgo, RegExp][] = [
  ["salud", /\b(cura[rs]?|curan|sana[rs]?|sanar|adelgaz\w*|baja(r|s)? de peso|perder peso|quema(r)? grasa|desintoxic\w*|detox|previene|prevenir|sin dolor|alivia\w*|milagros?[oa]?|diabet\w*|colesterol|presi[oó]n arterial|inmunidad|anticancer\w*)\b/i],
  ["ingresos", /(\bgana(r|s|r[aá]s)?\s+(hasta\s+)?(US\$|\$|RD\$|MX\$|\d)|\bingresos?\s+(extra|garantizad\w*|pasivos?|seguros?)|\bdinero\s+(seguro|f[aá]cil|r[aá]pido)|\bhazte rico|\blibertad financiera|\bvive de esto|\brecupera(s|r[aá]s)? tu inversi[oó]n|\bresultados garantizados)/i],
  ["garantia", /\bgarant[ií]\w*/i],
  ["cifra", /(\b(el|un)\s+\d{1,3}\s*%\s+de\s+(las?|los)\b|\bmiles de (personas|clientes|alumn\w+|mujeres|familias)|\+\s?\d[\d.]*\s*(clientes|alumn\w+|ventas|personas)|\btestimonios?\b|\bestudios? (demuestra|muestran|cient[ií]fic\w*)|\bcomprobado cient[ií]ficamente|\blos m[eé]dicos (dicen|recomiendan))/i],
];

const frase = (texto: string, idx: number) => {
  const ini = Math.max(0, texto.lastIndexOf("\n", idx) + 1);
  const finRaw = texto.indexOf("\n", idx);
  const fin = finRaw === -1 ? texto.length : finRaw;
  return clip(texto.slice(ini, fin).replace(/^[#>*\-\s]+/, "").trim(), 140);
};

/** Busca promesas de salud o ingresos, garantías y cifras sin respaldo en un texto (lo usa promesaHonesta). */
export function revisarTexto(texto: string, donde = ""): Hallazgo[] {
  const out: Hallazgo[] = [];
  for (const [tipo, re] of RIESGOS) {
    const m = re.exec(texto);
    if (m) out.push({ tipo, donde, frase: frase(texto, m.index) });
  }
  return out;
}

/** Recetas escritas: cada "### nombre" de un capítulo cuenta como una receta. */
export function contarRecetas(md: string): number {
  const SECCIONES = /^(ejemplo|paso a paso|ejercicio|resumen|ingredientes|preparaci[oó]n|consejo|rinde)\b/i;
  return md.split("\n").filter(l => /^###\s+\S/.test(l) && !SECCIONES.test(l.replace(/^###\s+/, ""))).length;
}

/**
 * Recetas que de verdad trae lo escrito (cambio de Jean, 29-oct-2026: sin avisos ni pasos de control que
 * frenen; el agente entrega y ya). Solo sirve para que los textos de venta digan el número real.
 */
export function recetasEscritas(piezas: Pick<Piece, "content" | "kind">[], a: Pick<Ajustes, "genero">): number | null {
  if (a.genero !== "recetario") return null;
  const n = piezas.filter(p => p.kind === "capitulo").reduce((s, p) => s + contarRecetas(p.content ?? ""), 0);
  return n > 0 ? n : null;
}

/** "Reintentar con otro enfoque" cuando la IA se niega: mismas indicaciones + pedir otro ángulo (≤ 500). */
export function otroEnfoque(instrucciones: string): string {
  return clip(`${instrucciones} Escríbelo con otro enfoque: más general y práctico, sin detalles que la IA pueda rechazar.`.trim(), MAX_NOTAS);
}
