import type { BusinessProfile, PriceScenario } from "@/lib/businessProfile";

/** Comisiones aproximadas de cada plataforma (se pueden editar). Revisar si cambian. Las usan la
 * calculadora de precio y el Mapa del negocio. */
export const PLATFORM_FEES: { label: string; feePct: number; feeFixed: number; hint: string }[] = [
  { label: "Whop", feePct: 5.2, feeFixed: 0.4, hint: "≈ 2,7% + 0,30 más ~2,5% por tarjeta internacional y cambio de moneda" },
  { label: "Hotmart", feePct: 9.9, feeFixed: 1, hint: "≈ 9,9% + un cargo fijo por venta (varía por país)" },
  { label: "Stripe", feePct: 4.4, feeFixed: 0.3, hint: "≈ 2,9% + 0,30, más ~1,5% si la tarjeta es de otro país" },
  { label: "Pago directo", feePct: 0, feeFixed: 0, hint: "Transferencia, contra entrega o efectivo: sin comisión de plataforma" },
];

/**
 * Cuentas de la calculadora de precio (src/pages/PricingPage.tsx). Las comparte la Mándala para
 * juzgar cada anuncio con lo que de verdad le queda al usuario por venta, no solo con el precio.
 */
export function calcScenario(s: PriceScenario) {
  const fee = s.price * s.feePct / 100 + s.feeFixed;
  const refunds = s.price * s.refundPct / 100;
  const taxes = s.price * s.taxPct / 100;
  // Lo que queda de cada venta ANTES de pagar anuncios: es el máximo que se puede pagar por venta sin perder.
  const beforeAds = s.price - fee - refunds - taxes - s.unitCost;
  const perSale = beforeAds - s.adCostPerSale;
  const salesMonth = s.salesPerDay * 30;
  const revenueMonth = s.price * salesMonth;
  const profitMonth = perSale * salesMonth - s.fixedMonthly;
  const breakEvenPerDay = perSale > 0 ? s.fixedMonthly / 30 / perSale : Infinity;
  const minRoas = beforeAds > 0 ? s.price / beforeAds : Infinity;
  return {
    fee, refunds, taxes, beforeAds, perSale, margin: s.price > 0 ? perSale / s.price : 0,
    salesMonth, revenueMonth, adsMonth: s.adCostPerSale * salesMonth, profitMonth, profitYear: profitMonth * 12,
    breakEvenPerDay, minRoas,
  };
}

/**
 * Lo máximo que el usuario puede pagar en anuncios por cada venta sin perder dinero, según el
 * escenario que eligió en la calculadora (null si todavía no hizo los números).
 */
export function maxAdCostPerSale(p: BusinessProfile): { max: number; currency: string } | null {
  const pr = p.pricing;
  const s = pr?.scenarios?.find(x => x.id === pr.chosen);
  if (!pr || !s) return null;
  const { beforeAds } = calcScenario(s as PriceScenario);
  return { max: beforeAds, currency: pr.currency || "US$" };
}
