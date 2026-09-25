import type { Offer } from "@/lib/offers";
import type { OfferIntel } from "@/lib/offerIntel";

/**
 * "Negocio Gemelo en 3 toques" (Mi negocio, etapa 1): Elige → Clona → Cobra.
 * Aquí viven las cuentas; la pantalla está en src/components/journey/GemeloFlow.tsx.
 * Roba como un artista: UNA oferta, mismo producto, precio y embudo; solo se mejora idioma, pago y entrega.
 */

export type CountryCode = "RD" | "CO" | "MX";

/**
 * Cambio aproximado a dólares (revisado el 25-sep-2026). Solo sirve para mostrar el precio de la
 * original en la moneda del usuario con la palabra "aprox."; nunca se cobra con esto.
 */
export const COUNTRIES: Record<CountryCode, { name: string; symbol: string; perUsd: number; step: number; pay: string }> = {
  RD: { name: "República Dominicana", symbol: "RD$", perUsd: 60, step: 10, pay: "Transferencia, tarjeta y efectivo" },
  CO: { name: "Colombia", symbol: "COL$", perUsd: 4000, step: 1000, pay: "Nequi, PSE y tarjeta" },
  MX: { name: "México", symbol: "MX$", perUsd: 18.5, step: 10, pay: "OXXO, SPEI y tarjeta" },
};

/** Dólares que vale 1 unidad de cada moneda que sabemos leer (aprox., mismo día que COUNTRIES). */
const USD_PER: Record<string, number> = { USD: 1, BRL: 0.18, EUR: 1.08, GBP: 1.27, MXN: 1 / 18.5, COP: 1 / 4000, DOP: 1 / 60 };

/** Formato español: 1.990 (punto de miles). */
export const fmtNumber = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export type OriginalPrice = { text: string; usd: number | null };

/** Lee un precio escrito ("US$ 27", "R$47,90", "€19"). Sin moneda clara → sin dólares (no se adivina). */
function parsePriceText(t: string): number | null {
  const m = t.match(/(US\$|USD|R\$|BRL|€|EUR|£|GBP)\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*(USD|BRL|EUR|GBP)/i);
  if (!m) return null;
  const cur = (m[1] ?? m[4] ?? "").toUpperCase();
  const amount = Number((m[2] ?? m[3]).replace(",", "."));
  const code = cur === "US$" ? "USD" : cur === "R$" ? "BRL" : cur === "€" ? "EUR" : cur === "£" ? "GBP" : cur;
  return USD_PER[code] && amount > 0 ? amount * USD_PER[code] : null;
}

/**
 * El precio real de la original: primero el checkout leído (monto + moneda), luego el texto del
 * checkout o del anuncio. Si no hay precio, null: nunca se inventa (el usuario lo pone en "Precio").
 */
export function originalPrice(o: Offer, intel: OfferIntel | null): OriginalPrice | null {
  const cd = intel?.checkout_data;
  if (cd?.price && cd.price > 0) {
    const code = (cd.currency ?? "").toUpperCase();
    const rate = USD_PER[code === "US$" ? "USD" : code === "R$" ? "BRL" : code];
    return { text: `${cd.currency ?? ""} ${cd.price}`.trim(), usd: rate ? cd.price * rate : null };
  }
  for (const t of [intel?.price_text, o.price_hint]) {
    if (!t || !/\d/.test(t) || /%/.test(t)) continue; // "50% de descuento" no es un precio
    return { text: t.trim(), usd: parsePriceText(t) };
  }
  return null;
}

/** Dólares → moneda local, redondeado como se pone un precio (RD$1.020 → RD$1.020, COL$68.000). */
export function toLocal(usd: number, cc: CountryCode) {
  const c = COUNTRIES[cc];
  return `${c.symbol}${fmtNumber(Math.max(c.step, Math.round((usd * c.perUsd) / c.step) * c.step))}`;
}

/**
 * Lo máximo que se puede pagar en anuncios por venta sin perder (CPA máximo), aprox.: precio menos
 * ~5 % de comisión de cobro con tarjeta y 5 % de reembolsos. La cuenta exacta está en "Precio".
 */
export const cpaMaxUsd = (usd: number) => usd * 0.9 - 0.4;

export const LANG_LABEL: Record<string, string> = { es: "Español", en: "Inglés", pt: "Portugués", ru: "Ruso", fr: "Francés", it: "Italiano", de: "Alemán" };

/** Nichos que se ofrecen como filtro rápido (los que más ganadoras tienen). */
export const QUICK_NICHES: { id: string; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "salud_fitness", label: "Salud" },
  { id: "marketing_ventas", label: "Marketing" },
  { id: "dinero_negocios", label: "Dinero" },
  { id: "tecnologia_ia", label: "Tecnología" },
  { id: "belleza_moda", label: "Belleza" },
];

/** Lo que se guarda en products.journey.gemelo al clonar (lo usará "Cobra" y el armado). */
export type Gemelo = {
  offer_id: string;
  offer_name: string;
  country: CountryCode;
  improvements: { lang: boolean; pay: boolean; wa: boolean };
  price_usd: number | null;
  cloned_at: string;
};
