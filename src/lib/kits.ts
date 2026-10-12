/**
 * Mini Apps (kits): ayudas puras para mostrar el contenido de un kit sin jerga ni formatos raros.
 * El contenido lo escribe generate-kit (IA) y a veces trae inglés de marketing ("front-end",
 * "low-ticket", "upsell") o números sin formato ("97000 COP", "19.99 USD"). Aquí se limpia al mostrar;
 * el prompt de generate-kit ya pide español simple para los kits nuevos.
 */

/** Mercados con precio en cada kit (claves de `content.pricing`). */
export const KIT_PRICE_MARKETS = ["CO", "MX", "DO", "US", "BR"] as const;

/** Jerga de marketing en inglés → español simple. Orden: lo más largo primero. */
const JARGON: [RegExp, string][] = [
  [/\bimpulse buy\b/gi, "compra por impulso"],
  [/\blow[- ]ticket\b/gi, "precio bajo"],
  [/\bhigh[- ]ticket\b/gi, "precio alto"],
  [/\bfront[- ]end\b/gi, "de entrada"],
  [/\bun back[- ]?end\b/gi, "una venta posterior"],
  [/\bback[- ]?end\b/gi, "venta posterior"],
  [/\bupsells?\b/gi, "venta adicional"],
  [/\bdownsells?\b/gi, "oferta más barata"],
  [/\border bump\b/gi, "extra en el pago"],
  [/\bbump\b/gi, "extra en el pago"],
  [/\btr[aá]fico fr[ií]o\b/gi, "gente que aún no te conoce"],
  [/\bconversi[oó]n fr[ií]a\b/gi, "venta a gente que aún no te conoce"],
  [/\bticket\b/gi, "precio"],
  [/\btraffickers?\b/gi, "gestores de anuncios"],
  [/\bmentoring\b/gi, "mentoría"],
];

/** Cambia la jerga en inglés por palabras simples y limpia lo que queda repetido. */
export function plainSpanish(text: string | null | undefined): string {
  let t = String(text ?? "");
  // Respeta la mayúscula inicial: "Ticket de…" → "Precio de…".
  for (const [re, to] of JARGON) t = t.replace(re, (m) => (/^[A-ZÁÉÍÓÚ]/.test(m) ? to[0].toUpperCase() + to.slice(1) : to));
  // "Precio de impulso (compra por impulso)" → "Precio de impulso"; "precio de entrada (de entrada)" → sin el paréntesis.
  t = t.replace(/\bimpulso \(compra por impulso\)/gi, "impulso");
  t = t.replace(/\(de entrada\)/gi, "de entrada").replace(/\bde entrada de entrada\b/gi, "de entrada");
  t = t.replace(/\bprecio de precio\b/gi, "precio");
  return t.replace(/\s{2,}/g, " ").trim();
}

/** Números en formato español: 97000 → 97.000 · 19.99 → 19,99. No toca lo que ya tiene puntos de miles. */
export function formatKitPrice(price: string | null | undefined): string {
  const p = String(price ?? "").trim();
  if (!p) return "";
  return p
    // Decimales con punto (exactamente 2 cifras): 19.99 → 19,99
    .replace(/(\d)\.(\d{2})(?!\d)/g, "$1,$2")
    // Enteros de 4 o más cifras sin separador: 97000 → 97.000
    .replace(/\d{4,}/g, (n) => n.replace(/\B(?=(\d{3})+(?!\d))/g, "."));
}

export type KitPricing = Record<string, string | undefined>;

/** Precio sugerido para el país de la persona; si su país no está en el kit, el de dólares. */
export function kitPriceFor(pricing: KitPricing | null | undefined, country: string | null | undefined): { market: string; price: string; local: boolean } | null {
  const pr = pricing ?? {};
  const c = String(country ?? "").toUpperCase();
  if (c && pr[c]) return { market: c, price: formatKitPrice(pr[c]), local: true };
  if (pr.US) return { market: "US", price: formatKitPrice(pr.US), local: false };
  const first = KIT_PRICE_MARKETS.find((m) => pr[m]);
  return first ? { market: first, price: formatKitPrice(pr[first]), local: false } : null;
}

/** "Pago único", "Suscripción mensual"… en vez de la clave interna. */
export function pricingModelLabel(model: string | null | undefined): string {
  const m = String(model ?? "").toLowerCase();
  if (m.includes("suscrip")) return "Suscripción (cobro cada mes)";
  if (m.includes("freemium")) return "Gratis para empezar y pago por lo completo";
  if (m.includes("unico") || m.includes("único")) return "Pago único";
  return m ? plainSpanish(m.replace(/_/g, " ")) : "—";
}

/** "hoy", "ayer", "hace 4 días": cuándo salió el kit más nuevo (dato real, sin prometer el próximo). */
export function daysAgoLabel(iso: string | null | undefined, now = Date.now()): string {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return "";
  const days = Math.max(0, Math.floor((now - t) / 86_400_000));
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}

/** Nombre del idioma del anuncio original según el grupo de mercado del kit. */
export const SOURCE_LANG: Record<string, string> = { ES: "español", BR: "portugués", US: "inglés", RU: "ruso" };
