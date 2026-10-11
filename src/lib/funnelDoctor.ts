/**
 * "¿Dónde se me escapan las ventas?" (07-oct-2026): la mirada de afuera.
 *
 * Lo que aprendimos de los consultores detrás de las marcas grandes (Fladlien con Iman Gadzhi, Pierre
 * con Brez Scales, Blake con Shelby Sapp, Caleb con Alex Hormozi): no hicieron MÁS cosas. Miraron los
 * números de cada etapa por separado, encontraron la que frenaba todo y cambiaron 2 o 3 cosas. Brez
 * creía que le faltaba contenido y en realidad solo contactaba al 22 % de los que le escribían.
 *
 * Aquí la persona anota sus números reales de un periodo (ej.: los últimos 30 días) y la app:
 *   1) calcula la tasa de cada paso del embudo,
 *   2) la compara con un mínimo sano (regla práctica, NO promesa; la persona puede cambiarla),
 *   3) ordena los cambios por cuántas ventas más darían con el mismo tráfico,
 *   4) avisa cuando el problema está abajo del embudo y "más anuncios / más contenido" no lo arregla.
 * Todo en el navegador: no gasta IA ni créditos ("medir va incluido").
 */

export type StageId = "ctr" | "lead" | "contact" | "close" | "repeat";

export interface FunnelInputs {
  /** Personas que vieron tu anuncio o tu contenido (alcance o vistas). */
  views: number;
  /** Clics hacia tu página, tu WhatsApp o tu enlace. */
  clicks: number;
  /** Personas que te escribieron o dejaron sus datos (leads). */
  leads: number;
  /** De esas, a cuántas les respondiste y tuviste una conversación de verdad. */
  contacted: number;
  /** Ventas. */
  sales: number;
  /** Clientes que te volvieron a comprar algo (opcional). */
  repeat: number;
  /** Reembolsos o devoluciones (opcional). */
  refunds: number;
  /** Lo que gastaste en anuncios en el periodo (opcional, en tu moneda). */
  spend: number;
  /** Lo máximo que puedes pagar por venta sin perder (sale de "Precio y ganancia"; opcional). */
  maxCpa: number;
}

export const EMPTY_FUNNEL: FunnelInputs = { views: 0, clicks: 0, leads: 0, contacted: 0, sales: 0, repeat: 0, refunds: 0, spend: 0, maxCpa: 0 };

export interface StageDef {
  id: StageId;
  /** Nombre corto del paso. */
  label: string;
  /** De qué número a qué número va. */
  from: keyof FunnelInputs;
  to: keyof FunnelInputs;
  /** Mínimo sano por defecto, en %. Regla práctica para empezar, no un resultado prometido. */
  healthy: number;
  /** Qué significa en palabras simples. */
  meaning: string;
  /** Qué suele estar pasando cuando este paso está bajo. */
  diagnosis: string;
  /** Qué cambiar (2 o 3 acciones, la primera es la más fuerte). */
  actions: string[];
  /** Dónde se arregla dentro de SUPERNOVA (página de Index.tsx) y el texto del botón. */
  fix: { page: string; label: string };
  /** true = arreglarlo con más anuncios o más contenido NO ayuda (el error de Brez). */
  downstream: boolean;
}

export const STAGES: StageDef[] = [
  {
    id: "ctr", label: "Ven → hacen clic", from: "views", to: "clicks", healthy: 1, downstream: false,
    meaning: "De cada 100 que ven tu anuncio o tu post, cuántos tocan el enlace (CTR = % que hace clic).",
    diagnosis: "La gente te ve pero no se detiene: el gancho o la imagen no le habla a quien tiene el problema.",
    actions: [
      "Cambia solo los primeros 3 segundos o la primera línea: prueba 3 ganchos nuevos con el mismo anuncio.",
      "Modela un anuncio que lleva muchos días pagándose en tu nicho (eso prueba que atrapa).",
      "Di para quién es en la primera frase: \"Si vendes por WhatsApp y…\".",
    ],
    fix: { page: "Hooks", label: "Ver ganchos que ya funcionan" },
  },
  {
    id: "lead", label: "Hacen clic → te escriben", from: "clicks", to: "leads", healthy: 10, downstream: false,
    meaning: "De cada 100 que llegan a tu página o enlace, cuántos te escriben o dejan sus datos.",
    diagnosis: "Llegan y se van: la página no cumple lo que prometió el anuncio, o pedir información cuesta mucho.",
    actions: [
      "Que el titular de la página repita la misma promesa del anuncio, con las mismas palabras.",
      "Un solo botón y un solo paso: \"Escríbeme por WhatsApp\" o \"Comprar\", nada más.",
      "Pon el precio y la garantía (solo si existe) a la vista, sin que tengan que preguntar.",
    ],
    fix: { page: "Generadores", label: "Rehacer el texto de mi página" },
  },
  {
    id: "contact", label: "Te escriben → les respondes", from: "leads", to: "contacted", healthy: 80, downstream: true,
    meaning: "De cada 100 que te escriben, a cuántos les contestas y conversas de verdad.",
    diagnosis: "Se te enfrían los interesados: tardas en responder o a muchos nunca les contestas. Fue el problema de Brez Scales: creía que le faltaba contenido y solo contactaba al 22 %.",
    actions: [
      "Responde en menos de 1 hora. Pon un mensaje de bienvenida automático en WhatsApp Business.",
      "Etiqueta a cada persona (\"nuevo\", \"preguntó precio\", \"casi compra\") para que nadie se quede sin respuesta.",
      "No subas el presupuesto ni publiques más hasta contestar a casi todos: estarías pagando por gente que dejas ir.",
    ],
    fix: { page: "Recuperar", label: "Mensajes para los que dejaste sin respuesta" },
  },
  {
    id: "close", label: "Conversas → te compran", from: "contacted", to: "sales", healthy: 10, downstream: true,
    meaning: "De cada 100 con los que conversas, cuántos compran.",
    diagnosis: "Hablan contigo pero no compran: la oferta, el precio o el momento en que la presentas no convencen.",
    actions: [
      "Presenta la oferta y el precio antes: en la primera conversación, no después de varios días (a Iman Gadzhi le funcionó vender el día 2 y no el 4).",
      "Responde la duda que más te dicen antes de que te la digan (\"¿y si no me funciona?\" → tu garantía real).",
      "Escríbeles el día 1, 3 y 7 a los que dijeron \"lo pienso\".",
    ],
    fix: { page: "Recuperar", label: "Crear mis mensajes de seguimiento" },
  },
  {
    id: "repeat", label: "Te compran → te vuelven a comprar", from: "sales", to: "repeat", healthy: 10, downstream: true,
    meaning: "De cada 100 clientes, cuántos te compran algo más.",
    diagnosis: "Le vendes una vez a cada cliente y ahí termina: es la palanca que ya tienes y no estás usando.",
    actions: [
      "Ofrece el siguiente paso (más avanzado o con acompañamiento) a quien ya te compró y está contento.",
      "Agrega un order bump: el extra de un clic antes de pagar.",
      "Escríbeles a tus clientes viejos con algo nuevo. Ya confían en ti.",
    ],
    fix: { page: "Order bump", label: "Armar mi order bump" },
  },
];

export interface StageResult {
  def: StageDef;
  /** Tasa real en %, o null si faltan números. */
  rate: number | null;
  healthy: number;
  /** rate / healthy (1 = justo en el mínimo). null si no hay datos. */
  ratio: number | null;
  /** Ventas extra en el mismo periodo si este paso llegara al mínimo sano, con el mismo tráfico. */
  extraSales: number;
  status: "sin-datos" | "bien" | "bajo" | "muy-bajo";
}

export interface Alert { id: "refunds" | "cpa" | "data"; text: string }

export interface Diagnosis {
  stages: StageResult[];
  /** Hasta 3 cambios, el primero es el que más ventas mueve (como los "3 cambios" de Fladlien). */
  top: StageResult[];
  /** El paso que más frena. */
  bottleneck: StageResult | null;
  /** El problema está abajo del embudo: más anuncios o más contenido no lo arreglan. */
  moreTrafficWontHelp: boolean;
  alerts: Alert[];
  cpa: number | null;
  /** Hay suficientes números para decir algo. */
  enough: boolean;
}

const num = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Formato español: 2.000 · 0,8 %. */
export const fmtPct = (v: number) => `${v.toLocaleString("es-ES", { maximumFractionDigits: v < 10 ? 1 : 0 })} %`;

/** Los campos que la persona deja vacíos llegan como undefined: ese paso no se mide (0 sí cuenta). */
export function diagnose(raw: Partial<FunnelInputs>, healthyOverride: Partial<Record<StageId, number>> = {}, currency = ""): Diagnosis {
  const money = (n: number) => `${currency ? `${currency} ` : ""}${n.toLocaleString("es-ES", { maximumFractionDigits: 2 })}`;
  const i = Object.fromEntries(Object.entries({ ...EMPTY_FUNNEL, ...raw }).map(([k, v]) => [k, num(Number(v))])) as unknown as FunnelInputs;
  const sales = i.sales;

  const stages: StageResult[] = STAGES.map(def => {
    const healthy = num(healthyOverride[def.id] ?? def.healthy) || def.healthy;
    const a = i[def.from];
    const b = i[def.to];
    // Un paso se mide solo si anotó los dos números y el de arriba no es 0.
    const missing = a <= 0 || raw[def.to] === undefined || raw[def.from] === undefined;
    const rate = missing ? null : pct(Math.min(b, a), a);
    const ratio = rate === null ? null : rate / healthy;
    let extraSales = 0;
    if (ratio !== null && ratio < 1) {
      if (def.id === "repeat") {
        // Las recompras se suman a las ventas: llegar al mínimo = clientes × mínimo − recompras de hoy.
        extraSales = Math.max(0, (sales * healthy) / 100 - i.repeat);
      } else if (rate !== null && rate > 0) {
        // Embudo en cadena: subir un paso multiplica todo lo de abajo por healthy/rate.
        extraSales = sales * (healthy / rate - 1);
      } else {
        // Tasa 0: con la tasa sana, lo que sigue abajo se estima con las tasas de abajo que sí hay.
        let flow = (a * healthy) / 100;
        const idx = STAGES.findIndex(s => s.id === def.id);
        for (const next of STAGES.slice(idx + 1)) {
          if (next.id === "repeat") break;
          const r = pct(i[next.to], i[next.from]);
          flow *= ((r ?? next.healthy) / 100);
        }
        extraSales = flow;
      }
    }
    const status: StageResult["status"] = ratio === null ? "sin-datos" : ratio >= 1 ? "bien" : ratio >= 0.5 ? "bajo" : "muy-bajo";
    return { def, rate: rate === null ? null : round1(rate), healthy, ratio, extraSales: round1(extraSales), status };
  });

  const weak = stages.filter(s => s.ratio !== null && s.ratio < 1);
  // Primero lo que más ventas mueve; si empatan (o no hay ventas aún), el que está más lejos del mínimo.
  const ranked = [...weak].sort((x, y) => (y.extraSales - x.extraSales) || ((x.ratio ?? 1) - (y.ratio ?? 1)));
  const top = ranked.slice(0, 3);
  const bottleneck = top[0] ?? null;
  // Si el paso que más frena está abajo del embudo, comprar más tráfico solo llena un balde roto.
  const moreTrafficWontHelp = !!bottleneck && bottleneck.def.downstream && bottleneck.def.id !== "repeat";

  const alerts: Alert[] = [];
  if (i.refunds > 0 && sales > 0 && (i.refunds / sales) * 100 > 10) {
    alerts.push({ id: "refunds", text: `Se devuelve ${fmtPct(round1((i.refunds / sales) * 100))} de lo que vendes. Puede que estés atrayendo a la persona equivocada: no se arregla vendiendo más, sino cambiando a quién le habla tu anuncio (y entregando lo que prometes).` });
  }
  const cpa = i.spend > 0 && sales > 0 ? Math.round((i.spend / sales) * 100) / 100 : null;
  if (cpa !== null && i.maxCpa > 0 && cpa > i.maxCpa) {
    alerts.push({ id: "cpa", text: `Cada venta te cuesta ${money(cpa)} en anuncios y lo máximo que aguanta tu precio es ${money(i.maxCpa)}. No subas el presupuesto: arregla primero el paso que más frena, o sube tu ganancia por cliente (order bump, siguiente paso).` });
  }
  if (i.spend > 0 && sales === 0 && i.maxCpa > 0 && i.spend > i.maxCpa * 2) {
    alerts.push({ id: "cpa", text: `Llevas ${money(i.spend)} en anuncios sin ventas, más del doble de lo que aguanta una venta. Pausa y revisa el paso que más frena antes de seguir gastando.` });
  }
  const measured = stages.filter(s => s.rate !== null).length;
  const enough = measured >= 2;
  if (!enough) alerts.push({ id: "data", text: "Anota al menos dos pasos seguidos (por ejemplo, cuántos te escribieron y cuántos compraron) para ver dónde se escapan las ventas." });

  return { stages, top, bottleneck, moreTrafficWontHelp, alerts, cpa, enough };
}

/**
 * Lo que ya tienes y no estás exprimiendo (el cierre del video: "¿qué tienes montado que no estás
 * usando?"). Cada "no" lleva a la herramienta que lo resuelve.
 */
export const LEVERS: { id: string; q: string; page: string; label: string }[] = [
  { id: "reply", q: "¿Le respondes a todos los que te escriben en menos de 1 hora?", page: "Recuperar", label: "Mensajes listos" },
  { id: "followup", q: "¿Le vuelves a escribir a quien dijo \"lo pienso\"?", page: "Recuperar", label: "Seguimiento de 4 mensajes" },
  { id: "bump", q: "¿Tienes un extra de un clic antes de pagar (order bump)?", page: "Order bump", label: "Armar order bump" },
  { id: "next", q: "¿Le ofreces algo más a quien ya te compró?", page: "Generadores", label: "Oferta de ascensión" },
  { id: "list", q: "¿Usas tu lista de WhatsApp o de correo al menos una vez por semana?", page: "Contenido", label: "Calendario de contenido" },
  { id: "price", q: "¿Revisaste en los últimos 30 días si tu precio deja ganancia después de anuncios?", page: "Precio", label: "Precio y ganancia" },
];
