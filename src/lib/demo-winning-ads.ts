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

const ADS: Omit<DemoAd, "score" | "tier">[] = [
  // BR · health · 5 variants
  { id: "br1-1", pageId: "saude_br_1", pageName: "Saúde Natural Brasil", title: "O segredo dos médicos para emagrecer", body: "O segredo que os médicos não querem que você saiba para emagrecer 10kg em 30 dias sem dieta e sem academia. Mais de 47.000 pessoas já transformaram seus corpos com este método natural. Garantia de 60 dias.", daysActive: 45, duplicates: 50, offerType: "infoproducto", market: "BR", marketLabel: "Brasil", flag: "🇧🇷", lang: "pt", checkoutPlatform: "Hotmart", adUrl: "https://facebook.com/ads/library/?id=demo_br1_1" },
  { id: "br1-2", pageId: "saude_br_1", pageName: "Saúde Natural Brasil", title: "Emagreça 10kg em 30 dias", body: "Método natural comprovado: emagrecimento de 10kg em 30 dias sem dieta nem academia. Segredo médico revelado. Garantia 60 dias.", daysActive: 42, duplicates: 50, offerType: "infoproducto", market: "BR", marketLabel: "Brasil", flag: "🇧🇷", lang: "pt", checkoutPlatform: "Hotmart", adUrl: "https://facebook.com/ads/library/?id=demo_br1_2" },

  // BR · digital course
  { id: "br2-1", pageId: "renda_extra_br", pageName: "Renda Extra Online", title: "Ganhe R$ 5.000 por mês trabalhando de casa", body: "Descobri o método que está fazendo donas de casa ganharem R$5.000 por mês trabalhando 2h por dia. Só hoje: acesso ao treinamento completo + bônus. Saiba mais clicando agora.", daysActive: 62, duplicates: 12, offerType: "infoproducto", market: "BR", marketLabel: "Brasil", flag: "🇧🇷", lang: "pt", checkoutPlatform: "Kiwify", adUrl: "https://facebook.com/ads/library/?id=demo_br2_1" },

  // US · ecom skincare mega
  { id: "us1-1", pageId: "skinglow_us", pageName: "SkinGlow Official", title: "Dermatologist Approved Routine", body: "The routine that dermatologists are talking about. 92% of users saw visible results in 14 days. Free shipping worldwide, 90-day money back guarantee. Join 200K+ happy customers.", daysActive: 75, duplicates: 28, offerType: "ecommerce", market: "US", marketLabel: "USA", flag: "🇺🇸", lang: "en", checkoutPlatform: "Shopify", adUrl: "https://facebook.com/ads/library/?id=demo_us1_1" },
  { id: "us1-2", pageId: "skinglow_us", pageName: "SkinGlow Official", title: "92% See Results in 14 Days", body: "Dermatologist-recommended routine. 92% visible results in 14 days. 200K+ customers. Free shipping, 90-day guarantee.", daysActive: 70, duplicates: 28, offerType: "ecommerce", market: "US", marketLabel: "USA", flag: "🇺🇸", lang: "en", checkoutPlatform: "Shopify", adUrl: "https://facebook.com/ads/library/?id=demo_us1_2" },

  // US · make money mega
  { id: "us2-1", pageId: "wealth_lab_us", pageName: "Wealth Lab", title: "How I made $10K/month with AI", body: "What they don't want you to know: this AI tool is making regular people $10K/month. Just pay shipping for your starter kit. Claim yours before it's gone.", daysActive: 38, duplicates: 18, offerType: "infoproducto", market: "US", marketLabel: "USA", flag: "🇺🇸", lang: "en", checkoutPlatform: "Clickbank", adUrl: "https://facebook.com/ads/library/?id=demo_us2_1" },

  // ES · fitness rising
  { id: "es1-1", pageId: "fit_es", pageName: "FitMax España", title: "Pierde 8 kilos en 21 días", body: "El secreto que nadie te dice: pierde 8 kilos en 21 días sin pasar hambre. Método probado por más de 30.000 españoles. Webinar gratuito solo hoy. Accede ahora.", daysActive: 22, duplicates: 9, offerType: "infoproducto", market: "ES", marketLabel: "España", flag: "🇪🇸", lang: "es", checkoutPlatform: "Stripe", adUrl: "https://facebook.com/ads/library/?id=demo_es1_1" },
  { id: "es1-2", pageId: "fit_es", pageName: "FitMax España", title: "¿Cansado de las dietas que no funcionan?", body: "Por fin un método probado: pierde 8 kilos en 21 días. Sin dietas extremas. Webinar gratuito hoy. Garantizado.", daysActive: 18, duplicates: 9, offerType: "infoproducto", market: "ES", marketLabel: "España", flag: "🇪🇸", lang: "es", checkoutPlatform: "Stripe", adUrl: "https://facebook.com/ads/library/?id=demo_es1_2" },

  // MX · ecom
  { id: "mx1-1", pageId: "envio_mx", pageName: "EnvíoShop México", title: "Envío gratis hoy en todo México", body: "Última oportunidad: 50% OFF y envío gratis a todo México. Solo hoy. Más de 12.000 clientes felices este mes. Garantía de devolución.", daysActive: 14, duplicates: 6, offerType: "ecommerce", market: "MX", marketLabel: "México", flag: "🇲🇽", lang: "es", checkoutPlatform: "Shopify", adUrl: "https://facebook.com/ads/library/?id=demo_mx1_1" },

  // LATAM · crypto rising
  { id: "la1-1", pageId: "cripto_lat", pageName: "Cripto Académica LATAM", title: "Cómo gané $3.000 USD con cripto en 30 días", body: "Lo que nadie te cuenta sobre cripto. Método 100% probado por 18.000 latinos. Acceso ahora con garantía total. Webinar gratuito.", daysActive: 30, duplicates: 11, offerType: "infoproducto", market: "LATAM", marketLabel: "LATAM", flag: "🌎", lang: "es", checkoutPlatform: "Hotmart", adUrl: "https://facebook.com/ads/library/?id=demo_la1_1" },

  // RU · education
  { id: "ru1-1", pageId: "rus_edu", pageName: "Мастер-Класс PRO", title: "Узнайте как зарабатывать онлайн", body: "Секрет, который никто не говорит: получите доступ к мастер-классу бесплатно. Только сегодня. Гарантировано результат за 14 дней.", daysActive: 28, duplicates: 7, offerType: "infoproducto", market: "RU", marketLabel: "Rusia", flag: "🇷🇺", lang: "ru", checkoutPlatform: "Stripe", adUrl: "https://facebook.com/ads/library/?id=demo_ru1_1" },

  // SaaS US solid
  { id: "us3-1", pageId: "aitool_us", pageName: "Copybird AI", title: "Write ad copy 10x faster with AI", body: "The AI tool that writes high-converting ad copy in seconds. Free 7-day trial, no credit card. Trusted by 80K marketers.", daysActive: 10, duplicates: 4, offerType: "saas", market: "US", marketLabel: "USA", flag: "🇺🇸", lang: "en", checkoutPlatform: "Stripe", adUrl: "https://facebook.com/ads/library/?id=demo_us3_1" },

  // App MX solid
  { id: "mx2-1", pageId: "app_mx_fin", pageName: "Finanzas Pro App", title: "La app que está ayudando a millones a ahorrar", body: "Descubre la app de finanzas personales que está cambiando vidas en México. Más de 500.000 descargas. Gratis los primeros 30 días.", daysActive: 9, duplicates: 3, offerType: "app", market: "MX", marketLabel: "México", flag: "🇲🇽", lang: "es", adUrl: "https://facebook.com/ads/library/?id=demo_mx2_1" },

  // ===== ClickBank checkouts =====
  { id: "cb1-1", pageId: "cb_keto_us", pageName: "Keto Bliss Official", title: "The 7-second ritual that melts belly fat", body: "Doctors are stunned: this odd 7-second morning ritual is helping thousands drop 30+ lbs. 60-day money back guarantee via ClickBank. Watch the free presentation today.", daysActive: 88, duplicates: 34, offerType: "infoproducto", market: "US", marketLabel: "USA", flag: "🇺🇸", lang: "en", checkoutPlatform: "Clickbank", adUrl: "" },
  { id: "cb1-2", pageId: "cb_keto_us", pageName: "Keto Bliss Official", title: "Lose 30 lbs with this morning trick", body: "The 7-second ritual that's going viral. Backed by 60-day ClickBank guarantee. Free video reveals all.", daysActive: 80, duplicates: 34, offerType: "infoproducto", market: "US", marketLabel: "USA", flag: "🇺🇸", lang: "en", checkoutPlatform: "Clickbank", adUrl: "" },
  { id: "cb2-1", pageId: "cb_manifest_la", pageName: "Manifiesta tu Abundancia", title: "El audio de 60 segundos que activa tu abundancia", body: "Investigación de Harvard confirma: este audio de 60 segundos reprograma tu mente para atraer dinero. Acceso instantáneo vía ClickBank. Garantía 60 días.", daysActive: 55, duplicates: 22, offerType: "infoproducto", market: "LATAM", marketLabel: "LATAM", flag: "🌎", lang: "es", checkoutPlatform: "Clickbank", adUrl: "" },
  { id: "cb3-1", pageId: "cb_prostate_us", pageName: "Prostate Plus Health", title: "Urologist reveals the prostate fix big pharma hides", body: "73,000 men over 50 have used this natural protocol. ClickBank-verified, 60-day refund. Watch the free video before it's taken down.", daysActive: 120, duplicates: 47, offerType: "infoproducto", market: "US", marketLabel: "USA", flag: "🇺🇸", lang: "en", checkoutPlatform: "Clickbank", adUrl: "" },
];

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

// Global demo stats (always visible)
export const GLOBAL_STATS = {
  total: 47832,
  unique: 8241,
  mega: 312,
  rising: 1847,
  solid: 6082,
};
