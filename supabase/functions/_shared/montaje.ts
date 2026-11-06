// SUPERNOVA — «Edita tus tomas como tu referencia» (06-nov-2026, pedido de Jean con el caso de Cindy): la persona ya
// hizo sus tomas (en la app o en otro lado) y tiene un video de referencia o sabe cómo lo quiere. La IA mira la
// referencia y las tomas y propone el montaje; el video se arma en el navegador con Remotion (gratis para nosotros).
// Compartido por el servidor (reel-ia, acción "montaje") y la app (src/lib/montaje.ts). Sin dependencias de Deno.

export type Transicion = "corte" | "zoom" | "fundido";
export type Segmento = {
  /** Número de la toma (1…n). 0 = un plano que no tiene y se crea con IA: va con «nueva». */
  toma: number; desde: number; hasta: number; transicion: Transicion; texto: string;
  /** Parte del guion que se oye en este trozo (solo con voz nueva). */
  frase?: string;
  /** Índice (1…) en «nuevas» cuando toma = 0. */
  nueva?: number;
  /** Velocidad del trozo (0,5–1): baja cuando la toma es más corta que su frase. */
  vel?: number;
  /** La toma se repite porque ni a la mitad de velocidad alcanza para su frase. */
  loop?: boolean;
};
/** Un plano de la referencia que la persona no tiene: se recrea con IA (nunca se usa el de otra persona). */
export type Nueva = { desc: string; prompt: string };
/** Qué se escucha: el sonido de sus tomas, su texto con una voz nueva, o un texto que escribe la IA. */
export type ModoVoz = "tomas" | "propio" | "ia";
export type PlanMontaje = {
  /** En palabras simples: cómo es la referencia y cómo lo armamos con sus tomas. */
  resumen: string;
  /** Texto fijo arriba durante todo el video (como «Por solo $15.000 pesos»), o "". */
  rotulo: string;
  segmentos: Segmento[];
  /** Tomas que la referencia tiene y la persona no (para que las haga si quiere). */
  faltan: string[];
  /** Texto de la voz en off (solo con voz nueva). */
  guion?: string;
  /** Planos que se crean con IA (máximo MAX_NUEVAS). */
  nuevas?: Nueva[];
};
export type TomaInfo = { n: number; dur: number; nombre: string };

export const MAX_TOMAS = 20;
export const MAX_SEGMENTOS = 40;
export const MAX_NUEVAS = 4;
/** Tope del guion: el precio de la voz llega hasta 1.200 caracteres (reel_voz_1200). */
export const MAX_GUION = 1200;
/** Largo de un plano creado con IA (vid_mini_5). */
export const DUR_NUEVA = 5;
const TRANS = new Set<Transicion>(["corte", "zoom", "fundido"]);

export function promptMontaje(tomas: TomaInfo[], conReferencia: boolean, pedido: string, voz: ModoVoz = "tomas", texto = ""): string {
  return [
    "Eres editor de reels para emprendedores de LATAM. Tienes las TOMAS de una persona (cada una con 2 cuadros de muestra, en orden)" +
      (conReferencia ? " y un VIDEO DE REFERENCIA que quiere imitar en la edición." : "."),
    pedido ? `Cómo lo quiere la persona: «${pedido}».` : "",
    "Tomas (n = número, dur = segundos):",
    ...tomas.map(t => `- n=${t.n} · dur=${t.dur.toFixed(1)} s · «${t.nombre}»`),
    "",
    "Arma el montaje para que se parezca lo más posible a " + (conReferencia ? "la referencia: mismo orden de ideas, mismo ritmo de cortes (duración de cada plano), mismas transiciones y los mismos rótulos de pantalla." : "lo que pidió la persona.") +
      " Usa SOLO las tomas que hay; una toma se puede usar en varios trozos. El primer trozo es el gancho: el más llamativo.",
    "Si la referencia tiene un texto fijo arriba todo el video (un precio, una oferta), ponlo en 'rotulo' en español, sin inventar cifras: si no se ve claro, deja ''.",
    "'texto' de cada trozo: un rótulo corto (máximo 6 palabras) solo si la referencia lo tiene en ese momento; si no, ''.",
    "Nunca copies nombres, marcas ni @ de otras personas.",
    conReferencia
      ? `Si la referencia tiene un plano que las tomas no cubren (por ejemplo un detalle del producto o un ambiente), ponlo igual en 'segmentos' con toma=0 y nueva=k, y descríbelo en 'nuevas' (máximo ${MAX_NUEVAS}): 'desc' en español en pocas palabras y 'prompt' en inglés para un generador de video vertical de ${DUR_NUEVA} s (qué se ve, luz, movimiento de cámara; sin personas reconocibles, sin logos, sin texto en pantalla). Un trozo con toma=0 dura ${DUR_NUEVA} s o menos (desde=0). Lo que no se puede crear con IA (la persona hablando a cámara, por ejemplo) va en 'faltan'.`
      : "No uses toma=0 ni 'nuevas'.",
    ...vozReglas(voz, texto, conReferencia),
    "Responde SOLO este JSON:",
    '{"resumen":"2 frases simples: cómo es la referencia y cómo quedó tu montaje","rotulo":"","guion":"","segmentos":[{"toma":1,"desde":0,"hasta":2.5,"transicion":"corte|zoom|fundido","texto":"","frase":""}],"nuevas":[{"desc":"","prompt":""}],"faltan":["toma que la referencia tiene y no hay, en pocas palabras"]}',
    `Reglas: 'toma' entre 0 y ${tomas.length}; 0 ≤ desde < hasta ≤ dur de esa toma; cada trozo de 0,8 s o más; máximo ${MAX_SEGMENTOS} trozos; 'faltan' máximo 4 (vacío si no falta nada).`,
  ].filter(Boolean).join("\n");
}

function vozReglas(voz: ModoVoz, texto: string, conReferencia: boolean): string[] {
  if (voz === "tomas") return ["Se oye el sonido de las tomas: deja 'guion' y cada 'frase' vacíos."];
  const comun = "Cada trozo lleva en 'frase' la parte del guion que se oye mientras se ve (frases seguidas, en orden, sin saltarse palabras; todas juntas forman el guion entero). Elige la imagen de cada trozo según lo que dice su frase. Ninguna 'frase' vacía.";
  if (voz === "propio") return [
    `Una voz nueva va a leer ESTE texto de la persona, tal cual: «${texto}».`,
    "Pon ese mismo texto en 'guion' sin cambiar palabras y repártelo en los trozos.",
    comun,
  ];
  return [
    `Escribe tú el guion de la voz en off en español latino, de tú, frases cortas, máximo ${MAX_GUION - 300} caracteres: ` +
      (conReferencia ? "la misma idea y estructura de la referencia, adaptada a lo que pidió la persona." : "según lo que pidió la persona."),
    "Nunca inventes cifras, precios, resultados ni testimonios: si la referencia los dice, usa solo los que la persona escribió; si no hay, no pongas números. Nada de promesas de ingresos.",
    comun,
  ];
}
/** Texto de voz limpio y con tope (el que pega la persona o el que escribe la IA). */
export function limpiarTextoVoz(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, MAX_GUION) : "";
}

const txt = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

/** Limpia la respuesta de la IA: solo tomas que existen, tiempos dentro de cada toma, tope de trozos.
 *  Con voz nueva exige guion y una frase por trozo; los planos a crear con IA (toma 0) solo si están en «nuevas». */
export function cleanMontaje(raw: unknown, tomas: TomaInfo[], voz: ModoVoz = "tomas", texto = ""): PlanMontaje | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const durDe = new Map(tomas.map(t => [t.n, t.dur]));
  const nuevasIA: Nueva[] = (Array.isArray(r.nuevas) ? r.nuevas : []).slice(0, MAX_NUEVAS).map(n => {
    const x = (n && typeof n === "object" ? n : {}) as Record<string, unknown>;
    return { desc: txt(x.desc, 90), prompt: txt(x.prompt, 600) };
  });
  const conVoz = voz !== "tomas";
  const segmentos: Segmento[] = [];
  const usadas: number[] = []; // índice viejo de «nuevas» → se renumeran en el orden en que aparecen
  for (const s of Array.isArray(r.segmentos) ? r.segmentos : []) {
    if (!s || typeof s !== "object" || segmentos.length >= MAX_SEGMENTOS) continue;
    const x = s as Record<string, unknown>;
    const toma = Math.round(num(x.toma));
    let nueva: number | undefined;
    let dur = durDe.get(toma);
    if (toma === 0) {
      const k = Math.round(num(x.nueva));
      const n = nuevasIA[k - 1];
      if (!n || n.prompt.length < 10) continue;
      if (!usadas.includes(k)) usadas.push(k);
      nueva = usadas.indexOf(k) + 1;
      dur = DUR_NUEVA;
    }
    if (!dur) continue;
    let desde = Math.max(0, Math.min(dur, num(x.desde) || 0));
    let hasta = Math.min(dur, Number.isFinite(num(x.hasta)) ? num(x.hasta) : dur);
    // Un trozo muy corto se alarga a 0,8 s: hacia adelante si cabe; si no, empezando antes.
    if (hasta - desde < 0.8) { if (desde + 0.8 <= dur) hasta = desde + 0.8; else { hasta = dur; desde = Math.max(0, dur - 0.8); } }
    if (hasta - desde < 0.5) continue;
    const t = txt(x.transicion, 10) as Transicion;
    const seg: Segmento = { toma, desde: +desde.toFixed(2), hasta: +hasta.toFixed(2), transicion: TRANS.has(t) ? t : "corte", texto: txt(x.texto, 50) };
    if (nueva) seg.nueva = nueva;
    if (conVoz) seg.frase = txt(x.frase, 400);
    segmentos.push(seg);
  }
  if (!segmentos.length) return null;
  const plan: PlanMontaje = {
    resumen: txt(r.resumen, 320),
    rotulo: txt(r.rotulo, 60),
    segmentos,
    faltan: (Array.isArray(r.faltan) ? r.faltan : []).map(f => txt(f, 90)).filter(Boolean).slice(0, 4),
  };
  if (usadas.length) plan.nuevas = usadas.map(k => nuevasIA[k - 1]);
  if (conVoz) {
    // Con su texto manda lo que escribió la persona, aunque la IA lo haya tocado.
    const guion = voz === "propio" ? limpiarTextoVoz(texto) : limpiarTextoVoz(r.guion) || limpiarTextoVoz(segmentos.map(s => s.frase).join(" "));
    if (palabras(guion) < 5) return null;
    plan.guion = guion;
  }
  return plan;
}

const palabras = (t = "") => t.split(/\s+/).filter(Boolean).length;

/**
 * Con voz nueva, cada trozo dura lo que tarda en decirse su frase. Reparte las palabras de la voz (tiempos reales
 * de ElevenLabs) entre los trozos en proporción a las palabras de cada frase (así aguanta que la persona edite el
 * guion), y recorta cada toma a ese largo. Si la toma es más corta que su frase, se empieza antes y, si aún no
 * alcanza, se pone más lenta (hasta la mitad) y, en el último caso, se repite.
 * `durDe(seg)` = segundos de la toma de ese trozo.
 */
export function ajustarAVoz(plan: PlanMontaje, voz: { t0: number; t1: number }[], durDe: (s: Segmento) => number): PlanMontaje {
  const segs = plan.segmentos;
  if (!voz.length || !segs.length) return plan;
  const pesos = segs.map(s => Math.max(1, palabras(s.frase)));
  const total = pesos.reduce((a, b) => a + b, 0);
  const V = voz.length;
  const fin = voz[V - 1].t1 + 0.4;
  const cortes: number[] = [0];
  let acum = 0;
  for (let i = 0; i < segs.length - 1; i++) {
    acum += pesos[i];
    const k = Math.min(V - 1, Math.max(1, Math.round((acum / total) * V)));
    const t = (voz[k - 1].t1 + voz[k].t0) / 2;
    cortes.push(Math.max(t, cortes[cortes.length - 1] + 0.5));
  }
  cortes.push(Math.max(fin, cortes[cortes.length - 1] + 0.5));
  const segmentos = segs.map((s, i) => {
    const need = cortes[i + 1] - cortes[i];
    const dur = Math.max(0.1, durDe(s));
    const out: Segmento = { ...s };
    delete out.vel; delete out.loop;
    let desde = Math.min(s.desde, Math.max(0, dur - 0.1));
    if (dur - desde < need) desde = Math.max(0, dur - need);
    if (dur - desde >= need) { out.desde = +desde.toFixed(3); out.hasta = +(desde + need).toFixed(3); return out; }
    const vel = Math.max(0.5, dur / need);
    out.desde = 0; out.hasta = +(need * vel).toFixed(3); out.vel = +vel.toFixed(3);
    if (need * vel > dur + 0.01) out.loop = true;
    return out;
  });
  return { ...plan, segmentos };
}

/** Segundos que dura un trozo en el video (con su velocidad). */
export const segundosDe = (s: Segmento) => (s.hasta - s.desde) / (s.vel ?? 1);

/** «Mis tomas tal cual»: cada toma entera, en el orden elegido, con cortes secos. Gratis (sin IA). */
export function montajeSimple(tomas: TomaInfo[]): PlanMontaje {
  return {
    resumen: "Tus tomas enteras, en el orden que elegiste, unidas con cortes.",
    rotulo: "",
    segmentos: tomas.map(t => ({ toma: t.n, desde: 0, hasta: +t.dur.toFixed(2), transicion: "corte" as Transicion, texto: "" })),
    faltan: [],
  };
}

/** Segundos totales del montaje. */
export const duracionMontaje = (p: PlanMontaje) => p.segmentos.reduce((a, s) => a + segundosDe(s), 0);
