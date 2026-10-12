import type { BusinessProfile, PriceScenario, Pricing } from "@/lib/businessProfile";

/** Comisiones aproximadas de cada plataforma (se pueden editar). Revisar si cambian. Las usan la
 * calculadora de precio y el Mapa del negocio. El cargo fijo está en dólares (US$). */
export const PLATFORM_FEES: { label: string; feePct: number; feeFixed: number; hint: string }[] = [
  { label: "Whop", feePct: 5.2, feeFixed: 0.4, hint: "≈ 2,7 % + US$0,30 más ~2,5 % por tarjeta internacional y cambio de moneda" },
  { label: "Hotmart", feePct: 9.9, feeFixed: 1, hint: "≈ 9,9 % + un cargo fijo por venta (varía por país)" },
  { label: "Stripe", feePct: 4.4, feeFixed: 0.3, hint: "≈ 2,9 % + US$0,30, más ~1,5 % si la tarjeta es de otro país" },
  { label: "Pago directo", feePct: 0, feeFixed: 0, hint: "Transferencia, contra entrega o efectivo: sin comisión de plataforma" },
];

// ───────────────────────── Monedas ─────────────────────────

/**
 * Monedas de la calculadora. `perUsd` es el cambio APROXIMADO que ya usa la app (src/lib/gemelo.ts,
 * 25-sep-2026); solo sirve para que los valores de ejemplo (precio de arranque, cargo fijo de la
 * plataforma) salgan en una cifra razonable de esa moneda. Nunca se cobra ni se convierte con esto.
 * Sin cambio conocido = null: el ejemplo queda en el número de dólares y la persona lo ajusta.
 */
export const CURRENCY_INFO: { label: string; name: string; perUsd: number | null; decimals: 0 | 2 }[] = [
  { label: "US$", name: "Dólar", perUsd: 1, decimals: 2 },
  { label: "RD$", name: "Peso dominicano", perUsd: 60, decimals: 2 },
  { label: "MX$", name: "Peso mexicano", perUsd: 18.5, decimals: 2 },
  { label: "COL$", name: "Peso colombiano", perUsd: 4000, decimals: 0 },
  { label: "S/", name: "Sol peruano", perUsd: null, decimals: 2 },
  { label: "ARS$", name: "Peso argentino", perUsd: null, decimals: 0 },
  { label: "CLP$", name: "Peso chileno", perUsd: null, decimals: 0 },
  { label: "Q", name: "Quetzal", perUsd: null, decimals: 2 },
  { label: "₡", name: "Colón costarricense", perUsd: null, decimals: 0 },
  { label: "L", name: "Lempira", perUsd: null, decimals: 2 },
  { label: "C$", name: "Córdoba", perUsd: null, decimals: 2 },
  { label: "₲", name: "Guaraní", perUsd: null, decimals: 0 },
  { label: "$U", name: "Peso uruguayo", perUsd: null, decimals: 2 },
  { label: "Bs", name: "Boliviano", perUsd: null, decimals: 2 },
  { label: "€", name: "Euro", perUsd: 1 / 1.08, decimals: 2 },
  { label: "R$", name: "Real", perUsd: 1 / 0.18, decimals: 2 },
];
export const CURRENCIES = CURRENCY_INFO.map(c => c.label);

/** País de la persona (user_age_country, ISO de 2 letras) → su moneda. Los que usan dólar → US$. */
const COUNTRY_CURRENCY: Record<string, string> = {
  DO: "RD$", MX: "MX$", CO: "COL$", PE: "S/", AR: "ARS$", CL: "CLP$", BR: "R$", GT: "Q", CR: "₡",
  HN: "L", NI: "C$", PY: "₲", UY: "$U", BO: "Bs",
  ES: "€", PT: "€", IT: "€", FR: "€", DE: "€", NL: "€", BE: "€", IE: "€",
};
export const currencyForCountry = (cc: string | null | undefined) =>
  COUNTRY_CURRENCY[String(cc ?? "").toUpperCase()] ?? "US$";

export const currencyInfo = (label: string | null | undefined) =>
  CURRENCY_INFO.find(c => c.label === label) ?? { label: label || "US$", name: label || "Dólar", perUsd: null, decimals: 2 as const };

/** Un valor de ejemplo en dólares pasado a la moneda elegida, redondeado como se pone un precio. */
export function fromUsd(usd: number, label: string): number {
  const rate = currencyInfo(label).perUsd;
  if (!rate || rate === 1) return usd;
  const v = usd * rate;
  const step = v >= 10_000 ? 1000 : v >= 100 ? 10 : v >= 10 ? 1 : 0.01;
  return Math.round(v / step) * step;
}

// ───────────────────────── Números en formato español ─────────────────────────

/**
 * Lee un número escrito a mano en cualquier formato de LATAM: "1.500" (miles), "1,500" (miles),
 * "27,50" y "27.50" (decimales), "1.234,56", "1,234.56", "RD$ 1.500", "-5".
 * Regla: si hay punto y coma, el último es el decimal; si hay un solo separador seguido de
 * exactamente 3 cifras (y antes no hay un 0), son miles. null si no hay número.
 */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw ?? "").trim();
  const m = s.match(/([-−–]\s*)?\d[\d.,]*/);
  if (!m) return null;
  const neg = !!m[1];
  const t = m[0].replace(/^[-−–]\s*/, "").replace(/[.,]+$/, "");
  const lastDot = t.lastIndexOf("."), lastComma = t.lastIndexOf(",");
  let norm: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const i = Math.max(lastDot, lastComma); // el último separador es el decimal
    norm = `${t.slice(0, i).replace(/[.,]/g, "")}.${t.slice(i + 1).replace(/[.,]/g, "")}`;
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const parts = t.split(sep);
    if (parts.length > 2) norm = parts.join("");
    else {
      const [before, after] = parts;
      norm = after.length === 3 && before !== "0" && before.length <= 3 ? `${before}${after}` : `${before}.${after}`;
    }
  } else norm = t;
  const n = Number(norm);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** 2000 → "2.000"; 0,8 → "0,8"; -3 → "−3". toLocaleString("es") no agrupa números de 4 cifras. */
export function fmtNum(n: number, maxDec = 2, minDec = 0): string {
  if (!Number.isFinite(n)) return "—";
  const fixed = Math.abs(n).toFixed(maxDec);
  const [int, decRaw = ""] = fixed.split(".");
  let dec = decRaw.replace(/0+$/, "");
  while (dec.length < minDec) dec += "0";
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const out = dec ? `${grouped},${dec}` : grouped;
  return n < 0 && /[1-9]/.test(out) ? `−${out}` : out;
}

/** Dinero en la moneda elegida: "US$2.000,00", "COL$108.000", "−RD$45,50". */
export function fmtMoney(n: number, currency: string, opts: { short?: boolean } = {}): string {
  if (!Number.isFinite(n)) return "—";
  const d = currencyInfo(currency).decimals;
  // short: sin ",00" cuando es redondo (textos corridos); si no, siempre 2 decimales (tablas).
  const body = fmtNum(Math.abs(n), d, opts.short && Number.isInteger(Math.round(Math.abs(n) * 100) / 100) ? 0 : d);
  const neg = n < 0 && /[1-9]/.test(body);
  return `${neg ? "−" : ""}${currency}${body}`;
}

/** Porcentaje en formato español: 0,8 % · 43 %. */
export const fmtPctEs = (v: number) => `${fmtNum(v, v < 10 ? 1 : 0)} %`;

// ───────────────────────── Cuentas ─────────────────────────

const pos = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const pct = (v: unknown) => Math.min(100, pos(v));

/** Escenario con números válidos: nada negativo, ni NaN, ni porcentajes de más de 100. */
export function cleanScenario(s: PriceScenario): PriceScenario {
  return {
    ...s, price: pos(s.price), salesPerDay: pos(s.salesPerDay), adCostPerSale: pos(s.adCostPerSale),
    feePct: pct(s.feePct), feeFixed: pos(s.feeFixed), refundPct: pct(s.refundPct), taxPct: pct(s.taxPct),
    unitCost: pos(s.unitCost), fixedMonthly: pos(s.fixedMonthly),
  };
}

/**
 * Cuentas de la calculadora de precio (src/pages/PricingPage.tsx). Las comparte la Mándala para
 * juzgar cada anuncio con lo que de verdad le queda al usuario por venta, no solo con el precio.
 */
export function calcScenario(raw: PriceScenario) {
  const s = cleanScenario(raw);
  const fee = s.price > 0 ? s.price * s.feePct / 100 + s.feeFixed : 0;
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

/** El escenario que vale: el elegido con "Usar este precio"; si no eligió, el primero (el que ve al abrir). */
export function currentScenario(pr: Pricing | null | undefined): { scenario: PriceScenario; chosen: boolean } | null {
  const list = pr?.scenarios ?? [];
  const chosen = list.find(x => x.id === pr?.chosen);
  if (chosen) return { scenario: chosen, chosen: true };
  return list[0] ? { scenario: list[0], chosen: false } : null;
}

/**
 * Lo máximo que el usuario puede pagar en anuncios por cada venta sin perder dinero, según la
 * calculadora (el escenario elegido o, si no eligió, el que tiene abierto). null si no hizo números.
 */
export function maxAdCostPerSale(p: BusinessProfile): { max: number; currency: string; chosen: boolean } | null {
  const cur = currentScenario(p.pricing);
  if (!cur || !(cur.scenario.price > 0)) return null;
  const { beforeAds } = calcScenario(cur.scenario);
  return { max: beforeAds, currency: p.pricing?.currency || "US$", chosen: cur.chosen };
}

/**
 * El precio del producto en número: el de la ficha (products.price, texto libre) y, si está vacío,
 * el de la calculadora. null si no hay ninguno.
 */
export function productPrice(p: BusinessProfile): number | null {
  const fromText = parseAmount(p.price);
  if (fromText !== null && fromText > 0) return fromText;
  const cur = currentScenario(p.pricing);
  return cur && cur.scenario.price > 0 ? cur.scenario.price : null;
}
