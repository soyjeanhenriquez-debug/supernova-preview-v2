// Realistic demo data for Anuncios Ganadores
export type OfferType = "infoproducto" | "ecommerce" | "saas" | "app" | "servicio";
export type AdMarket = "BR" | "US" | "ES" | "MX" | "RU" | "LATAM";
export type AdLang = "en" | "es" | "pt" | "ru";
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
    if (!u.hostname.endsWith("facebook.com")) return false;
    if (!u.pathname.startsWith("/ads/library")) return false;
    return u.searchParams.has("view_all_page_id") || u.searchParams.has("q") || u.searchParams.has("id");
  } catch {
    return false;
  }
}

export function normalizeAdsLibraryUrl(url: string, fallbackQuery = "", fallbackMarket: AdMarket = "LATAM"): string {
  if (isValidAdsLibraryUrl(url)) return url;
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
  { id: "ru",  label: "Русский", flag: "🇷🇺" },
] as const;

export const KEYWORD_CHIPS: Record<string, string[]> = {
  all: ["Learn more", "El secreto", "O segredo", "Free shipping", "Envío gratis", "Só hoje", "Solo hoy", "Shop now", "Comprar ahora", "Секрет", "Claim your", "Just pay shipping"],
  en:  ["Learn more", "Free shipping", "Shop now", "Limited time", "Just pay shipping", "The secret", "Claim your", "Order now", "Act now", "Are you tired of", "Finally revealed", "Free trial", "No credit card", "Back in stock", "Free masterclass", "Clickbank", "Shopify"],
  es:  ["El secreto", "Más información", "Envío gratis", "Solo hoy", "Lo que nadie te dice", "¿Cansado de", "Método probado", "Garantizado", "Accede ahora", "Webinar gratuito", "Por fin", "Cupos limitados", "Acceso inmediato", "Sin tarjeta", "Hotmart", "Masterclass gratuita"],
  pt:  ["O segredo", "Saiba mais", "Frete grátis", "Só hoje", "O que ninguém te conta", "Você sabia que", "Método comprovado", "Garantido", "Acesse agora", "Webinar gratuito", "Vagas limitadas", "Acesso imediato", "Hotmart", "Kiwify", "Eduzz"],
  ru:  ["Секрет", "Узнать больше", "Бесплатно", "Только сегодня", "Метод", "Гарантировано", "Получить доступ", "Мастер-класс", "Никто не говорит", "Узнайте как"],
};

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
