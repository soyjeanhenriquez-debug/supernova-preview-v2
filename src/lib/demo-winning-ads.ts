// Realistic demo data for Anuncios Ganadores
export type OfferType = "infoproducto" | "ecommerce" | "saas" | "app" | "servicio";
export type AdMarket = "BR" | "US" | "ES" | "MX" | "RU" | "LATAM";
export type AdLang = "en" | "es" | "pt" | "de" | "ru" | "otro";
export type Tier = "mega" | "rising" | "solid";

export interface DemoAd {
  id: string;
  pageId: string;
  pageName: string;
  title: string;
  body: string;
  daysActive: number;
  duplicates: number;
  score: number;
  tier: Tier;
  offerType: OfferType;
  market: AdMarket;
  marketLabel: string;
  flag: string;
  lang: AdLang;
  checkoutPlatform?: string;
  adUrl: string;
  /** Total de anuncios activos del mismo anunciante en esta búsqueda */
  activeCount?: number;
  /** Total histórico de anuncios del anunciante (si lo devuelve la API) */
  historicalCount?: number;
  /** Plataformas donde corre el anuncio (facebook, instagram, messenger, audience_network) */
  platforms?: string[];
  /** Códigos ISO de países donde corre */
  countries?: string[];
  /** Texto del botón CTA real del anuncio */
  ctaText?: string;
  /** URL de la landing del anuncio */
  landingUrl?: string;
  /** Snapshot URL del Ads Library (ver creatividad en HD) */
  snapshotUrl?: string;
  /** Vertical/categoría detectada automáticamente */
  vertical?: AdCategory;
}

function calcScore(days: number, dups: number, impHint: number) {
  let s = 0;
  if (days >= 60) s += 35; else if (days >= 30) s += 28; else if (days >= 14) s += 20; else if (days >= 7) s += 12;
  if (dups >= 50) s += 30; else if (dups >= 10) s += 22; else if (dups >= 5) s += 14; else if (dups >= 3) s += 8;
  s += Math.min(20, impHint);
  s += 10; // platform spread
  return Math.min(100, s);
}

function tierFromScore(s: number): Tier {
  if (s >= 80) return "mega";
  if (s >= 60) return "rising";
  return "solid";
}

// Sin datos demo — todos los anuncios mostrados provienen de búsquedas reales
// a la Facebook Ads Library (edge function `facebook-ads`) o del scraper
// (`winning_ads` en la base de datos).
const ADS: Omit<DemoAd, "score" | "tier">[] = [];

// Valida que una URL de Ads Library tenga los parámetros mínimos.
export function isValidAdsLibraryUrl(url: string): boolean {
  try {
    const u = new URL(url);
    // Solo https y el dominio exacto: "javascript://facebook.com/..." o "evilfacebook.com" no pasan.
    if (u.protocol !== "https:") return false;
    if (u.hostname !== "facebook.com" && !u.hostname.endsWith(".facebook.com")) return false;
    if (!u.pathname.startsWith("/ads/library")) return false;
    return u.searchParams.has("view_all_page_id") || u.searchParams.has("q") || u.searchParams.has("id");
  } catch {
    return false;
  }
}

export function normalizeAdsLibraryUrl(url: string, fallbackQuery = "", fallbackMarket: AdMarket = "LATAM"): string {
  if (isValidAdsLibraryUrl(url)) return url;
  // Los anuncios sembrados guardan /ads/archive/render_ad/?id=…: se pasa a la ficha pública con el MISMO id.
  // Antes se cambiaba por una búsqueda sin id y la tarjeta del Radar nunca mostraba el creativo (11-oct-2026).
  try {
    const u = new URL(url);
    const id = u.searchParams.get("id");
    if (u.protocol === "https:" && (u.hostname === "facebook.com" || u.hostname.endsWith(".facebook.com"))
      && u.pathname.startsWith("/ads/archive/render_ad") && id && /^\d{5,25}$/.test(id)) {
      return `https://www.facebook.com/ads/library/?id=${id}`;
    }
  } catch { /* no es URL: búsqueda */ }
  return buildAdsLibrarySearchUrl(fallbackQuery || "ads", fallbackMarket);
}

const COUNTRY_MAP: Record<AdMarket, string> = { BR: "BR", US: "US", ES: "ES", MX: "MX", RU: "RU", LATAM: "ALL" };

export function buildAdsLibrarySearchUrl(query: string, market: AdMarket) {
  // Búsqueda por nombre de anunciante — más fiable que keyword_unordered.
  // country=ALL evita que anuncios de otros mercados no aparezcan.
  const params = new URLSearchParams({
    active_status: "all",
    ad_type: "all",
    country: COUNTRY_MAP[market] ?? "ALL",
    q: query,
    search_type: "page",
    media_type: "all",
  });
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

// Enlace directo a TODOS los anuncios de una página por su page_id real.
// Es el formato canónico de Ads Library y siempre resuelve.
export function buildAdsLibraryPageUrl(pageId: string, market: AdMarket = "LATAM") {
  const params = new URLSearchParams({
    active_status: "all",
    ad_type: "all",
    country: COUNTRY_MAP[market] ?? "ALL",
    view_all_page_id: pageId,
  });
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

export function getDemoAds(): DemoAd[] {
  return ADS.map((a) => {
    const impHint = Math.min(20, Math.floor(a.duplicates * 0.4));
    const score = calcScore(a.daysActive, a.duplicates, impHint);
    const adUrl = normalizeAdsLibraryUrl(a.adUrl, a.pageName, a.market);
    return { ...a, score, tier: tierFromScore(score), adUrl };
  });
}

export const MARKETS = [
  { id: "all", label: "Todos", flag: "🌍" },
  { id: "en",  label: "English", flag: "🇺🇸" },
  { id: "es",  label: "Español", flag: "🇪🇸" },
  { id: "pt",  label: "Português", flag: "🇧🇷" },
  { id: "de",  label: "Deutsch", flag: "🇩🇪" },
  { id: "ru",  label: "Русский", flag: "🇷🇺" },
] as const;

export const KEYWORD_CHIPS: Record<string, string[]> = {
  all: ["Learn more", "El secreto", "O segredo", "Free shipping", "Envío gratis", "Só hoje", "Solo hoy", "Shop now", "Comprar ahora", "Секрет", "Claim your", "Just pay shipping"],
  en:  ["Learn more", "Free shipping", "Shop now", "Limited time", "Just pay shipping", "The secret", "Claim your", "Order now", "Act now", "Are you tired of", "Finally revealed", "Free trial", "No credit card", "Back in stock", "Free masterclass", "Clickbank", "Shopify"],
  es:  ["El secreto", "Más información", "Envío gratis", "Solo hoy", "Lo que nadie te dice", "¿Cansado de", "Método probado", "Garantizado", "Accede ahora", "Webinar gratuito", "Por fin", "Cupos limitados", "Acceso inmediato", "Sin tarjeta", "Hotmart", "Masterclass gratuita"],
  pt:  ["O segredo", "Saiba mais", "Frete grátis", "Só hoje", "O que ninguém te conta", "Você sabia que", "Método comprovado", "Garantido", "Acesse agora", "Webinar gratuito", "Vagas limitadas", "Acesso imediato", "Hotmart", "Kiwify", "Eduzz"],
  de:  ["Das Geheimnis", "Mehr erfahren", "Jetzt kaufen", "Kostenloser Versand", "Nur heute", "Geld zurück Garantie", "Kostenlos testen", "Gratis Webinar", "Endlich enthüllt", "Digistore24"],
  ru:  ["Секрет", "Узнать больше", "Бесплатно", "Только сегодня", "Метод", "Гарантировано", "Получить доступ", "Мастер-класс", "Никто не говорит", "Узнайте как"],
};


// Países de cada idioma. Inglés = todo lo demás (no tiene lista propia).
// Lo usan langFromCountry y la consulta del radar: si el filtro de idioma se
// aplicara solo en el navegador, la primera página (ordenada por score, casi
// toda US/GB) quedaría vacía para quien entra con el navegador en español.
export const LANG_COUNTRIES: Record<Exclude<AdLang, "en" | "otro">, string[]> = {
  es: ["ES","MX","AR","CO","CL","PE","LATAM"],
  pt: ["BR","PT"],
  de: ["DE","AT","CH"],
  ru: ["RU","KZ","BY"],
};
export const NON_ENGLISH_COUNTRIES = Object.values(LANG_COUNTRIES).flat();

// Idioma probable según el país del anuncio (para el filtro de idioma)
/**
 * Idioma por el TEXTO del anuncio (11-oct-2026): el país dice a quién se le muestra, no en qué idioma
 * está (había anuncios en vietnamita o inglés dirigidos a México marcados "ES"). Cuenta palabras
 * frecuentes de cada idioma; si el texto es corto o no hay una ganadora clara, se usa el país.
 */
const LANG_WORDS: Record<"es" | "en" | "pt" | "fr" | "de", string[]> = {
  es: ["el", "la", "los", "las", "de", "que", "y", "en", "un", "una", "para", "con", "por", "tu", "es", "más", "cómo", "aprende", "sin"],
  en: ["the", "and", "you", "your", "to", "of", "for", "with", "is", "this", "how", "get", "now", "in", "it", "on"],
  pt: ["você", "não", "para", "com", "uma", "seu", "sua", "de", "que", "em", "os", "as", "mais", "como", "aprenda"],
  fr: ["le", "les", "des", "vous", "votre", "pour", "avec", "est", "et", "une", "dans", "pas", "qui"],
  de: ["der", "die", "das", "und", "ist", "mit", "für", "nicht", "sie", "ein", "eine", "auf"],
};
export function langFromText(text: string, fallback: AdLang): AdLang {
  const t = (text || "").toLowerCase();
  // Alfabetos no latinos o vietnamita (letras con dos acentos): no es ninguno de los nuestros.
  if (/[\u0400-\u04ff]/.test(t)) return "ru";
  if (/[\u0590-\u06ff\u0e00-\u0e7f\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]|[ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđ]/.test(t)) return "otro";
  const words = t.match(/\p{L}+/gu) ?? [];
  if (words.length < 6) return fallback;
  const score = (Object.keys(LANG_WORDS) as (keyof typeof LANG_WORDS)[]).map(l => {
    const set = new Set(LANG_WORDS[l]);
    return [l, words.filter(w => set.has(w)).length] as const;
  }).sort((a, b) => b[1] - a[1]);
  const [best, n] = score[0];
  if (n < 2 || n < score[1][1] * 1.5) return fallback;
  return best === "fr" ? "otro" : best;
}

export function langFromCountry(country?: string | null): AdLang {
  const c = (country ?? "").toUpperCase();
  for (const [lang, list] of Object.entries(LANG_COUNTRIES)) {
    if (list.includes(c)) return lang as AdLang;
  }
  return "en";
}

// Auto-classify ad based on creative text keywords
export type AdCategory = "ecommerce" | "infoproducto" | "app_saas" | "servicio" | "crypto" | "salud" | "otro";

export const CATEGORY_LABEL: Record<AdCategory, string> = {
  ecommerce: "ECOMMERCE",
  infoproducto: "INFOPRODUCTO",
  app_saas: "APP / SAAS",
  servicio: "SERVICIO",
  crypto: "CRYPTO / TRADING",
  salud: "SALUD",
  otro: "OTRO",
};

const CATEGORY_KEYWORDS: { cat: AdCategory; words: string[] }[] = [
  { cat: "salud",        words: ["perder peso", "adelgazar", "emagrecer", "suplemento", "dieta", "keto", "salud", "saúde", "weight loss"] },
  { cat: "crypto",       words: ["trading", "forex", "crypto", "cripto", "bitcoin", "binance", "inversión", "señales", "signals", "trader"] },
  { cat: "app_saas",     words: ["app", "software", "plataforma", "tool", "herramienta", "dashboard", "prueba gratis", "free trial", "suscripción", "assinatura", "no credit card", "sin tarjeta"] },
  { cat: "infoproducto", words: ["webinar", "masterclass", "curso", "course", "método", "metodo", "secreto", "ebook", "aula", "clase", "acceso inmediato", "cupos", "vagas", "hotmart", "kiwify", "eduzz", "clickbank"] },
  { cat: "ecommerce",    words: ["shipping", "envío", "envio", "frete", "tienda", "store", "compra", "buy", "stock", "unidades", "deliver", "talla", "back in stock", "sold out", "edición limitada"] },
  { cat: "servicio",     words: ["agencia", "consultoría", "consultoria", "coaching", "servicio", "gestión", "sesión", "consulting"] },
];

export function classifyOffer(text: string): AdCategory {
  const t = (text || "").toLowerCase();
  for (const { cat, words } of CATEGORY_KEYWORDS) {
    if (words.some((w) => t.includes(w))) return cat;
  }
  return "otro";
}

export const PLACEHOLDERS: Record<string, string> = {
  all: "Busca en todos los mercados...",
  en:  "Learn more, free shipping, the secret...",
  es:  "El secreto, más información, solo hoy...",
  pt:  "O segredo, saiba mais, só hoje...",
  ru:  "Секрет, узнать больше, только сегодня...",
};

export const OFFER_TYPE_LABEL: Record<OfferType, string> = {
  infoproducto: "INFOPRODUCTO",
  ecommerce: "ECOMMERCE",
  saas: "SAAS",
  app: "APP",
  servicio: "SERVICIO",
};

export function despeguePercent(daysActive: number, duplicates: number) {
  const v = Math.min(100, Math.round((duplicates * daysActive) / 30));
  let label = "Estable";
  if (v >= 80) label = "Dominando";
  else if (v >= 60) label = "Escalando";
  else if (v >= 30) label = "Despegando";
  else if (v >= 10) label = "Iniciando";
  let color = "#22c55e";
  if (v < 30) color = "#f59e0b";
  return { value: v, label, color };
}

// Stats globales — vacíos por defecto; el frontend rellena con datos reales
// desde la tabla `winning_ads`.
export const GLOBAL_STATS = {
  total: 0,
  unique: 0,
  mega: 0,
  rising: 0,
  solid: 0,
};
