import type { DemoAd } from "@/lib/demo-winning-ads";
import { type Offer, NICHE_LABEL, OFFER_TYPE_LABEL, MODEL_LABEL, MARKET_NAME } from "@/lib/offers";
import { type OfferIntel, FUNNEL_LABEL } from "@/lib/offerIntel";
import { COUNTRIES, cpaMaxUsd, fmtNumber, originalPrice, toLocal, type CountryCode } from "@/lib/gemelo";
import { CREDIT_COSTS } from "@/hooks/useCredits";

/**
 * "Hacer mi versión" dentro de la app (R2-12, 12-oct-2026). Un solo recibo: la oferta en español, el precio
 * en tu moneda con el CPA máximo, 1 anuncio de texto, 1 imagen y el mensaje de WhatsApp para cerrar.
 * Aquí viven las cuentas (sin React); la pantalla es MiniAppModal + MiVersionReceipt.
 *
 * Precio: NUNCA lo escribe la IA. Sale del checkout real de la oferta (originalPrice), o lo pone la persona.
 * La IA deja {PRECIO} en el WhatsApp y aquí se reemplaza.
 */

/** Lo que devuelve oraculo-generate (kind "mi_version"). Mismo contrato que supabase/functions/oraculo-generate/miVersion.ts. */
export interface MiVersionData {
  name: string;
  promise: string;
  who: string;
  includes: string[];
  why_it_sells: string[];
  ad: { hook: string; primary_text: string; headline: string; cta: string };
  image: { prompt: string; text: string };
  whatsapp: string;
}

export const PRICE_TOKEN = "{PRECIO}";

/* ─────────────────────────────── País y moneda ─────────────────────────────── */

export interface SellCountry {
  /** Código ISO de user_age_country (DO, CO, MX, US…); "OTRO" si no lo sabemos. */
  iso: string;
  /** País con moneda propia que sabemos convertir (lib/gemelo); null = se cobra en dólares. */
  code: CountryCode | null;
  name: string;
  /** Símbolo con el que se escribe el precio: RD$, COL$, MX$ o US$. */
  symbol: string;
}

const ISO_TO_CODE: Record<string, CountryCode> = { DO: "RD", CO: "CO", MX: "MX" };

/** Países que se ofrecen en el selector (los que más venden + "otro"). */
export const SELL_COUNTRIES: { iso: string; label: string }[] = [
  { iso: "DO", label: "🇩🇴 Rep. Dominicana · pesos dominicanos" },
  { iso: "CO", label: "🇨🇴 Colombia · pesos colombianos" },
  { iso: "MX", label: "🇲🇽 México · pesos mexicanos" },
  { iso: "US", label: "🇺🇸 Estados Unidos · dólares" },
  { iso: "OTRO", label: "🌎 Otro país · dólares" },
];

export function sellCountry(iso: string | null | undefined): SellCountry {
  const up = (iso ?? "").toUpperCase();
  const code = ISO_TO_CODE[up] ?? null;
  if (code) return { iso: up, code, name: COUNTRIES[code].name, symbol: COUNTRIES[code].symbol };
  const name = up && up !== "OTRO" ? (MARKET_NAME[up] ?? "tu país") : "tu país";
  return { iso: up || "OTRO", code: null, name, symbol: "US$" };
}

/** Moneda de un selector: el ISO de la persona si está en la lista; si no, "OTRO" (dólares). */
export function selectorIso(iso: string | null | undefined): string {
  const up = (iso ?? "").toUpperCase();
  return SELL_COUNTRIES.some((c) => c.iso === up) ? up : "OTRO";
}

/** Dólares con formato español: US$17 · US$27,90. */
export function fmtUsd(usd: number): string {
  const r = Math.round(usd * 100) / 100;
  return Number.isInteger(r) ? `US$${fmtNumber(r)}` : `US$${fmtNumber(Math.floor(r))},${String(Math.round((r % 1) * 100)).padStart(2, "0")}`;
}

/** Dólares → moneda de la persona (redondeado como se pone un precio). */
export function usdToLocal(usd: number, c: SellCountry): string {
  return c.code ? toLocal(usd, c.code) : fmtUsd(usd);
}

/** Un monto que la persona escribió en SU moneda → dólares (para el CPA). */
export function localToUsd(amount: number, c: SellCountry): number {
  return c.code ? amount / COUNTRIES[c.code].perUsd : amount;
}

/** Lee lo que la persona escribe como precio: "1.500", "1500", "27,90", "RD$ 1.200". */
export function parseAmount(raw: string): number | null {
  const t = raw.replace(/[^\d.,]/g, "");
  if (!t) return null;
  // "1.500" / "68.000" = miles; "27,90" / "27.9" = decimales.
  const normalized = /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t.replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ──────────────────────────────── Precio ──────────────────────────────── */

export type PriceInfo =
  | {
    kind: "ready";
    /** original = el de la oferta que se modela (checkout leído); tuyo = el que escribió la persona. */
    source: "original" | "tuyo";
    local: string;
    usd: number;
    /** Lo máximo que se puede pagar en anuncios por venta sin perder, en su moneda. */
    cpaLocal: string;
    originalText: string | null;
  }
  | {
    kind: "missing";
    /** La original muestra un precio pero en una moneda que no sabemos convertir. */
    originalText: string | null;
    /** Precio para probar que sugiere el veredicto (IA): se enseña como sugerencia, nunca como dato. */
    suggestion: string | null;
  };

export function receiptPrice(offer: Offer | null | undefined, intel: OfferIntel | null | undefined, c: SellCountry, userAmount?: number | null): PriceInfo {
  const orig = offer ? originalPrice(offer, intel ?? null) : null;
  const ready = (usd: number, source: "original" | "tuyo", local: string): PriceInfo => ({
    kind: "ready", source, usd, local, cpaLocal: usdToLocal(Math.max(0, cpaMaxUsd(usd)), c), originalText: orig?.text ?? null,
  });
  if (userAmount && userAmount > 0) {
    const local = c.code ? `${c.symbol}${fmtNumber(userAmount)}` : fmtUsd(userAmount);
    return ready(localToUsd(userAmount, c), "tuyo", local);
  }
  if (orig?.usd != null && orig.usd > 0) return ready(orig.usd, "original", usdToLocal(orig.usd, c));
  return { kind: "missing", originalText: orig?.text ?? null, suggestion: intel?.verdict?.suggested_ticket?.trim() || null };
}

/** Pone el precio donde la IA dejó {PRECIO}. Sin precio todavía: un hueco visible para llenar. */
export function fillPrice(text: string, price: PriceInfo): string {
  return text.split(PRICE_TOKEN).join(price.kind === "ready" ? price.local : "[tu precio]");
}

/* ─────────────────────────────── Datos para la IA ─────────────────────────────── */

/**
 * Los datos REALES de la oferta en texto, para que la IA modele UNA referencia sin inventar. Va como
 * `analysis` a oraculo-generate (mínimo 80 caracteres; siempre los pasa).
 */
export function buildOfferFacts(ad: DemoAd, offer?: Offer | null, intel?: OfferIntel | null): string {
  const v = intel?.verdict ?? null;
  const lines: (string | false | null | undefined)[] = [
    `Producto: ${ad.title}`,
    `Anunciante (no usar su nombre): ${ad.pageName}`,
    `Texto del anuncio: ${(ad.body || "").replace(/\s+/g, " ").slice(0, 1200)}`,
    `Días pagando anuncios: ${ad.daysActive}`,
    ad.duplicates ? `Anuncios activos ahora: ${ad.duplicates}` : null,
    `Se anuncia en: ${MARKET_NAME[ad.marketLabel] ?? ad.marketLabel}`,
    offer?.language && `Idioma original: ${offer.language}`,
    offer?.niche && `Tema: ${NICHE_LABEL[offer.niche] ?? offer.niche}`,
    offer?.offer_type && `Tipo de producto: ${OFFER_TYPE_LABEL[offer.offer_type] ?? offer.offer_type}`,
    offer?.business_model && offer.business_model !== "otro" && `Cómo cobra: ${MODEL_LABEL[offer.business_model] ?? offer.business_model}`,
    offer?.mechanism && `Qué vende y cómo: ${offer.mechanism}`,
    offer?.why_wins && `Por qué convierte: ${offer.why_wins}`,
    offer?.target_audience && `Público: ${offer.target_audience}`,
    intel?.funnel_type && `Camino de venta: ${FUNNEL_LABEL[intel.funnel_type] ?? intel.funnel_type}`,
    intel?.landing_title && `Título de su página de ventas: ${intel.landing_title}`,
    v?.copy_this?.length ? `Qué tomar tal cual: ${v.copy_this.slice(0, 4).join(" · ")}` : null,
    v?.latam_adaptation && `Adaptación a Latinoamérica: ${v.latam_adaptation}`,
  ];
  return lines.filter(Boolean).join("\n").slice(0, 6000);
}

/* ─────────────────────────────── Siguiente paso ─────────────────────────────── */

export interface NextStep {
  id: "carrusel" | "video" | "pagina" | "contenido";
  label: string;
  hint: string;
  /** Pantalla de la app (PAGE_SLUG). */
  page: string;
  cost: string;
  /** Generador que se abre ya elegido (Página de ventas). */
  generator?: string;
}

export const NEXT_STEPS: NextStep[] = [
  { id: "carrusel", label: "Carrusel para Instagram", hint: "Las mismas ideas en láminas", page: "Carrusel", cost: `${CREDIT_COSTS.gen_light} créditos` },
  { id: "video", label: "Video del anuncio", hint: "Tu anuncio en video corto", page: "Video anuncio", cost: `desde ${CREDIT_COSTS.vid_mini_5} créditos` },
  { id: "pagina", label: "Página de ventas", hint: "El texto completo de tu página", page: "Generadores", cost: `${CREDIT_COSTS.gen_medium} créditos`, generator: "landing-copy" },
  { id: "contenido", label: "Mes de contenido", hint: "30 días de publicaciones", page: "Contenido", cost: `${CREDIT_COSTS.content_month} créditos` },
];

/* ─────────────────────────────── Texto para copiar ─────────────────────────────── */

/** Todo el recibo en texto plano (botón "Copiar todo" y lo que se guarda en Lo que creaste). */
export function receiptToText(v: MiVersionData, price: PriceInfo, c: SellCountry): string {
  const out = [
    `MI VERSIÓN: ${v.name}`,
    "",
    `Promesa: ${v.promise}`,
    `Para quién: ${v.who}`,
    v.includes.length ? `Qué incluye:\n${v.includes.map((x) => `- ${x}`).join("\n")}` : "",
    price.kind === "ready"
      ? `Precio: ${price.local} (${price.source === "original" ? "el de la original, en tu moneda, aprox." : "tu precio"}) · En anuncios puedes pagar hasta ${price.cpaLocal} por venta sin perder (CPA máximo).`
      : `Precio: lo pones tú (vendes en ${c.name}).`,
    "",
    "ANUNCIO",
    v.ad.hook,
    "",
    fillPrice(v.ad.primary_text, price),
    "",
    `Titular: ${v.ad.headline}`,
    `Botón: ${v.ad.cta}`,
    "",
    "WHATSAPP PARA CERRAR",
    fillPrice(v.whatsapp, price),
  ];
  return out.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
}

/** Enlace para abrir WhatsApp con el mensaje escrito (la persona elige a quién mandarlo). */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text.slice(0, 1500))}`;
}
