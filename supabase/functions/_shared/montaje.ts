// SUPERNOVA — «Edita tus tomas como tu referencia» (06-nov-2026, pedido de Jean con el caso de Cindy): la persona ya
// hizo sus tomas (en la app o en otro lado) y tiene un video de referencia o sabe cómo lo quiere. La IA mira la
// referencia y las tomas y propone el montaje; el video se arma en el navegador con Remotion (gratis para nosotros).
// Compartido por el servidor (reel-ia, acción "montaje") y la app (src/lib/montaje.ts). Sin dependencias de Deno.

export type Transicion = "corte" | "zoom" | "fundido";
export type Segmento = { toma: number; desde: number; hasta: number; transicion: Transicion; texto: string };
export type PlanMontaje = {
  /** En palabras simples: cómo es la referencia y cómo lo armamos con sus tomas. */
  resumen: string;
  /** Texto fijo arriba durante todo el video (como «Por solo $15.000 pesos»), o "". */
  rotulo: string;
  segmentos: Segmento[];
  /** Tomas que la referencia tiene y la persona no (para que las haga si quiere). */
  faltan: string[];
};
export type TomaInfo = { n: number; dur: number; nombre: string };

export const MAX_TOMAS = 20;
export const MAX_SEGMENTOS = 40;
const TRANS = new Set<Transicion>(["corte", "zoom", "fundido"]);

export function promptMontaje(tomas: TomaInfo[], conReferencia: boolean, pedido: string): string {
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
    "Responde SOLO este JSON:",
    '{"resumen":"2 frases simples: cómo es la referencia y cómo quedó tu montaje","rotulo":"","segmentos":[{"toma":1,"desde":0,"hasta":2.5,"transicion":"corte|zoom|fundido","texto":""}],"faltan":["toma que la referencia tiene y no hay, en pocas palabras"]}',
    `Reglas: 'toma' entre 1 y ${tomas.length}; 0 ≤ desde < hasta ≤ dur de esa toma; cada trozo de 0,8 s o más; máximo ${MAX_SEGMENTOS} trozos; 'faltan' máximo 4 (vacío si no falta nada).`,
  ].filter(Boolean).join("\n");
}

const txt = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

/** Limpia la respuesta de la IA: solo tomas que existen, tiempos dentro de cada toma, tope de trozos. */
export function cleanMontaje(raw: unknown, tomas: TomaInfo[]): PlanMontaje | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const durDe = new Map(tomas.map(t => [t.n, t.dur]));
  const segmentos: Segmento[] = [];
  for (const s of Array.isArray(r.segmentos) ? r.segmentos : []) {
    if (!s || typeof s !== "object" || segmentos.length >= MAX_SEGMENTOS) continue;
    const x = s as Record<string, unknown>;
    const toma = Math.round(num(x.toma));
    const dur = durDe.get(toma);
    if (!dur) continue;
    let desde = Math.max(0, Math.min(dur, num(x.desde) || 0));
    let hasta = Math.min(dur, Number.isFinite(num(x.hasta)) ? num(x.hasta) : dur);
    // Un trozo muy corto se alarga a 0,8 s: hacia adelante si cabe; si no, empezando antes.
    if (hasta - desde < 0.8) { if (desde + 0.8 <= dur) hasta = desde + 0.8; else { hasta = dur; desde = Math.max(0, dur - 0.8); } }
    if (hasta - desde < 0.5) continue;
    const t = txt(x.transicion, 10) as Transicion;
    segmentos.push({ toma, desde: +desde.toFixed(2), hasta: +hasta.toFixed(2), transicion: TRANS.has(t) ? t : "corte", texto: txt(x.texto, 50) });
  }
  if (!segmentos.length) return null;
  return {
    resumen: txt(r.resumen, 320),
    rotulo: txt(r.rotulo, 60),
    segmentos,
    faltan: (Array.isArray(r.faltan) ? r.faltan : []).map(f => txt(f, 90)).filter(Boolean).slice(0, 4),
  };
}

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
export const duracionMontaje = (p: PlanMontaje) => p.segmentos.reduce((a, s) => a + (s.hasta - s.desde), 0);
