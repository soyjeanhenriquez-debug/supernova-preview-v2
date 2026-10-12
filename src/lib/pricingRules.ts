import { fmtMoney, fmtNum } from "@/lib/pricing";

/**
 * Las reglas de medición de SUPERNOVA, en UN solo lugar (12-oct-2026). Las usan Resultados
 * (veredicto de cada anuncio), "¿Dónde se me escapan las ventas?", la calculadora de Precio y el
 * Plan de lanzamiento, para que ninguna pantalla diga una cosa distinta de otra.
 * Son reglas prácticas para decidir, no promesas de resultados.
 */
export const MEASURE = {
  /** Días que se deja correr un anuncio antes de juzgarlo. */
  waitDays: 3,
  /** CTR (% de quienes lo ven que hacen clic) por debajo de esto = el gancho no detiene. */
  ctrMin: 0.8,
  /** Gastó esta cantidad de veces el máximo por venta (o el precio) sin vender = apagar. */
  killMultiple: 2,
  /** Ganador: subir el presupuesto este % … */
  scalePct: 20,
  /** … cada tantos días. */
  scaleEveryDays: 2,
} as const;

/** Las 4 reglas en frases cortas (para mostrarlas tal cual). `limit` = "tu máximo por venta" o "el precio". */
export function measureRules(limit = "tu máximo por venta"): string[] {
  return [
    `Mide a los ${MEASURE.waitDays} días, no antes.`,
    `CTR (% que hace clic) menor a ${fmtNum(MEASURE.ctrMin, 1)} %: cambia el gancho o la imagen.`,
    `Gastaste ${MEASURE.killMultiple} veces ${limit} y no vendió: apágalo.`,
    `Cada venta te cuesta menos que ${limit}: sube el presupuesto un ${MEASURE.scalePct} % cada ${MEASURE.scaleEveryDays} días.`,
  ];
}

export type VerdictTone = "good" | "bad" | "wait" | "fix";
export type AdNumbers = { spend: number | null; ctr: number | null; sales: number | null };

/**
 * Veredicto de un anuncio con las reglas de arriba. Si el usuario hizo los números en la
 * calculadora, el límite es su máximo real por venta (precio − comisiones − reembolsos −
 * impuestos − costo); si no, el precio, que es más optimista. null = no hay gasto anotado.
 */
export function adVerdict(
  ad: AdNumbers, price: number | null, max: { max: number; currency: string } | null, currency = "US$",
): { tone: VerdictTone; text: string } | null {
  if (ad.spend == null) return null;
  const spend = Math.max(0, Number(ad.spend) || 0);
  const sales = Math.max(0, Math.round(Number(ad.sales ?? 0) || 0));
  const ctr = ad.ctr == null || !Number.isFinite(Number(ad.ctr)) ? null : Math.max(0, Number(ad.ctr));
  const cur = max?.currency ?? currency;
  const fmt = (n: number) => fmtMoney(n, cur);
  // La calculadora dice que, con ese precio, cada venta pierde dinero aun sin pagar anuncios.
  if (max && max.max <= 0) {
    return { tone: "bad", text: "Con tu precio actual no te queda margen: comisiones, reembolsos e impuestos se comen toda la venta antes de pagar anuncios. Sube el precio o baja costos en la calculadora antes de invertir más." };
  }
  const limit = max && max.max > 0 ? max.max : price && price > 0 ? price : 0;
  const limitTxt = max && max.max > 0 ? `tu máximo por venta (${fmt(max.max)}, de tu calculadora)` : limit ? `el precio de tu producto (${fmt(limit)})` : "el precio de tu producto";
  const k = MEASURE.killMultiple;
  if (sales > 0) {
    const cpa = spend / sales;
    if (!limit || cpa <= limit) {
      return { tone: "good", text: `Ganador: cada venta te costó ${fmt(cpa)}${limit ? `, por debajo de ${limitTxt}: te quedan unos ${fmt(limit - cpa)} por venta` : ""}. Márcalo como ganador, pide variaciones y sube el presupuesto poco a poco: un ${MEASURE.scalePct} % cada ${MEASURE.scaleEveryDays} días.` };
    }
    return { tone: "fix", text: `Vende, pero cada venta te cuesta ${fmt(cpa)}, más que ${limitTxt}: pierdes unos ${fmt(cpa - limit)} en cada una. Solo te conviene si cada cliente te compra más (un extra antes de pagar o una oferta después) o si pruebas otro gancho.` };
  }
  if (limit && spend >= limit * k) return { tone: "bad", text: `Ya gastaste ${k} veces ${limitTxt} y no vendió: apágalo y prueba otro ángulo en la rueda.` };
  if (ctr != null && ctr < MEASURE.ctrMin) return { tone: "fix", text: `Menos del ${fmtNum(MEASURE.ctrMin, 1)} % de quienes lo ven hacen clic (CTR bajo): casi nadie se detiene. Cambia los primeros 3 segundos o el ángulo.` };
  if (ctr != null && spend > 0) return { tone: "fix", text: `La gente hace clic, pero todavía no compra. Si sigue así cuando hayas gastado ${k} veces ${limitTxt}, revisa tu página de ventas y tu oferta: qué prometes, qué incluye y el precio.` };
  return { tone: "wait", text: `Aún es pronto para decidir: déjalo correr ${MEASURE.waitDays} días o hasta gastar unas ${k} veces ${limitTxt}.` };
}
