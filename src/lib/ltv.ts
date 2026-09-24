/**
 * Mapa del negocio · cuánto vale un cliente (LTV) y cuánto se puede pagar por conseguirlo.
 *
 * Un embudo no vende solo el producto principal: vende order bump (en el mismo pago), upsell
 * después de pagar, downsell a quien dice que no al upsell y, a veces, una suscripción mensual.
 * Por eso un producto de US$17 puede dejar US$30 por cliente, y eso cambia cuánto se puede pagar
 * en anuncios. Estas cuentas usan precios reales del checkout cuando los hay; las tasas (qué % de
 * compradores toma cada paso) son supuestos que el usuario ajusta. Es una estimación, no una promesa.
 */

export interface LtvInputs {
  /** Precio del producto principal. */
  price: number;
  /** Order bump: se paga en el mismo pago que el principal. */
  bumpPrice: number;
  /** % de compradores que agrega el bump (0–100). */
  bumpTakePct: number;
  /** Upsell: oferta de un clic después de pagar. */
  upsellPrice: number;
  upsellTakePct: number;
  /** Downsell: versión más barata para quien dijo que no al upsell. % sobre los que rechazan el upsell. */
  downsellPrice: number;
  downsellTakePct: number;
  /** Suscripción mensual (continuidad). */
  subPrice: number;
  subTakePct: number;
  /** Meses que se queda en promedio quien se suscribe. */
  subMonths: number;
  /** Comisión de la plataforma: % + cargo fijo por cada cobro. */
  feePct: number;
  feeFixed: number;
  /** % del dinero que se devuelve en reembolsos. */
  refundPct: number;
}

export interface LtvResult {
  /** Lo que paga en promedio cada cliente, sumando todo el embudo. */
  gross: number;
  /** Cuánto del bruto viene de cada paso. */
  parts: { main: number; bump: number; upsell: number; downsell: number; subscription: number };
  fees: number;
  refunds: number;
  /** Lo que queda por cliente después de comisiones y reembolsos = máximo por venta para no perder. */
  net: number;
  /** Máximo por venta para no perder si SOLO vendiera el producto principal. */
  netFrontOnly: number;
  /** Máximo por venta para ganar holgado (ROAS 2: cada dólar en anuncios vuelve como dos). */
  cpaRoas2: number;
}

const clampPct = (v: number) => (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0) / 100;
const pos = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

export function calcLtv(i: LtvInputs): LtvResult {
  const price = pos(i.price);
  const b = clampPct(i.bumpTakePct);
  const u = clampPct(i.upsellTakePct);
  const d = clampPct(i.downsellTakePct);
  const s = clampPct(i.subTakePct);
  const months = pos(i.subMonths);
  const feeRate = clampPct(i.feePct);
  const feeFixed = pos(i.feeFixed);
  const refundRate = clampPct(i.refundPct);

  const parts = {
    main: price,
    bump: b * pos(i.bumpPrice),
    upsell: u * pos(i.upsellPrice),
    downsell: (1 - u) * d * pos(i.downsellPrice),
    subscription: s * pos(i.subPrice) * months,
  };
  const gross = parts.main + parts.bump + parts.upsell + parts.downsell + parts.subscription;

  // El bump se cobra junto con el principal (un solo cargo fijo); upsell, downsell y cada mes de
  // suscripción son cobros aparte.
  const charges = 1
    + (pos(i.upsellPrice) > 0 ? u : 0)
    + (pos(i.downsellPrice) > 0 ? (1 - u) * d : 0)
    + (pos(i.subPrice) > 0 ? s * months : 0);
  const fees = gross * feeRate + feeFixed * charges;
  const refunds = gross * refundRate;
  const net = gross - fees - refunds;

  const netFrontOnly = price - (price * feeRate + feeFixed) - price * refundRate;

  return {
    gross: round2(gross),
    parts: {
      main: round2(parts.main), bump: round2(parts.bump), upsell: round2(parts.upsell),
      downsell: round2(parts.downsell), subscription: round2(parts.subscription),
    },
    fees: round2(fees),
    refunds: round2(refunds),
    net: round2(net),
    netFrontOnly: round2(netFrontOnly),
    cpaRoas2: round2(Math.max(0, Math.min(net, gross / 2))),
  };
}

/**
 * Tasas típicas de arranque (supuestos, no datos de esta oferta). Se muestran como tales y el
 * usuario las ajusta. Referencias habituales en infoproductos: bump 20–40 %, upsell 10–20 %,
 * downsell 10–20 % de quienes rechazan el upsell, reembolsos 3–8 %.
 */
export const TYPICAL_RATES = { bumpTakePct: 30, upsellTakePct: 15, downsellTakePct: 15, subTakePct: 0, subMonths: 3, refundPct: 5 };

/** Lee un número de un texto de precio ("R$ 47", "$24,99", "USD 1.297"). null si no hay. */
export function parsePriceText(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = t.match(/(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?/);
  if (!m) return null;
  const whole = m[1].replace(/[.,]/g, "");
  const n = Number(m[2] ? `${whole}.${m[2]}` : whole);
  return Number.isFinite(n) && n > 0 ? n : null;
}
