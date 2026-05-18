// SUPERNOVA — Keywords de DR Expert
// El secreto: buscar por el lenguaje legal/técnico que TODOS los anuncios DR usan.

export const DR_KEYWORDS = {
  // TIER 1 — Disclaimers obligatorios (FTC / plataformas). Oro puro.
  tier1_disclaimers: [
    "results not typical",
    "individual results may vary",
    "results may vary",
    "this is an advertisement",
    "paid advertisement",
    "sponsored",
    "affiliate disclosure",
    "these statements have not been evaluated",
    "not evaluated by the FDA",
    "results are not guaranteed",
    "income disclaimer",
    "earnings disclaimer",
    "typical results",
    "see income disclosure",
    "los resultados pueden variar",
    "los resultados no son típicos",
    "esto es publicidad pagada",
    "aviso de afiliado",
    "declaración de ingresos",
    "resultados no garantizados",
  ],

  // TIER 2 — Plataformas (infoproductos, ecommerce, webinars)
  tier2_platforms: [
    "hotmart", "kiwify", "eduzz", "monetizze", "braip", "ticto", "lastlink",
    "greenn", "perfectpay", "payt",
    "clickbank", "digistore24", "digistore", "warriorplus", "warrior plus",
    "jvzoo", "paykickstart", "thrivecart", "samcart", "kajabi", "teachable",
    "thinkific", "gumroad", "podia", "kartra",
    "shopify", "woocommerce", "tiendanube", "vtex", "bigcommerce", "wix store",
    "zoom webinar", "gotowebinar", "demio", "webinarjam", "easywebinar",
  ],

  // TIER 3 — CTAs universales de DR
  tier3_ctas: [
    "learn more", "shop now", "get started", "claim your", "get instant access",
    "order now", "start today", "download now", "sign up free", "get yours",
    "buy now", "act now", "limited time", "while supplies last", "free shipping",
    "free + shipping", "just pay shipping", "risk free", "money back guarantee",
    "30 day guarantee", "60 day guarantee", "90 day guarantee",
    "más información", "comprar ahora", "obtén acceso", "accede ahora",
    "descárgalo gratis", "envío gratis", "garantía de devolución", "sin riesgo",
    "empieza hoy", "únete ahora",
    "saiba mais", "compre agora", "acesse agora", "baixe grátis", "frete grátis",
    "garantia de devolução", "sem risco", "comece hoje",
  ],

  // TIER 4 — Hooks psicológicos
  tier4_hooks: [
    "the secret", "el secreto", "o segredo",
    "what they don't want you to know", "lo que no quieren que sepas",
    "o que não querem que você saiba",
    "discovered", "descubierto", "finally revealed", "por fin revelado",
    "nobody talks about this", "nadie habla de esto",
    "weird trick", "strange method", "underground method",
    "banned", "exposed", "controversial",
    "they lied to you", "te mintieron",
    "are you tired of", "¿cansado de", "struggling with",
    "stop wasting", "deja de perder", "frustrated with",
    "sick and tired", "nothing works", "nada funciona",
    "have you tried everything", "¿has probado todo",
    "doctors don't want", "médicos no quieren", "médicos não querem",
    "clinical study", "estudio clínico", "estudo clínico",
    "scientists discovered", "harvard study", "ancient remedy", "ancient secret",
    "used by celebrities",
    "how i went from", "cómo pasé de", "como eu saí de",
    "before and after", "antes y después", "my story", "mi historia",
    "changed my life", "cambió mi vida", "mudou minha vida",
  ],

  // TIER 5 — Nichos de alto volumen
  tier5_niches: [
    "work from home", "trabaja desde casa", "trabalhe de casa",
    "passive income", "ingresos pasivos", "renda passiva",
    "financial freedom", "libertad financiera", "liberdade financeira",
    "side hustle", "six figures", "seis cifras",
    "make money online", "ganar dinero online", "ganhar dinheiro online",
    "dropshipping", "affiliate marketing", "marketing de afiliados",
    "amazon fba", "print on demand",
    "lose weight", "perder peso", "emagrecer",
    "burn fat", "quemar grasa", "queimar gordura",
    "keto", "intermittent fasting", "ayuno intermitente",
    "diabetes", "blood sugar", "azúcar en sangre",
    "joint pain", "dolor de articulaciones", "gut health", "salud intestinal",
    "forex", "trading signals", "señales de trading",
    "crypto", "bitcoin", "binary options", "opciones binarias",
    "stock market", "bolsa de valores", "day trading", "swing trading",
    "get your ex back", "recupera tu ex", "reconquistar",
    "make him obsessed", "law of attraction", "ley de atracción",
    "manifesting", "manifestar", "twin flame", "soulmate",
    "learn spanish", "learn english", "aprender inglés",
    "public speaking", "hablar en público",
    "survival", "shtf", "prepper", "off grid", "food storage",
    "real estate", "bienes raíces", "imóveis",
    "wholesaling", "house flipping", "rental income",
  ],

  // TIER 6 — Estructura técnica de funnels
  tier6_funnels: [
    "one time offer", "oferta única", "oferta especial",
    "upsell", "order bump",
    "free webinar", "webinar gratuito", "masterclass gratuita",
    "free training", "entrenamiento gratuito", "treinamento gratuito",
    "free challenge", "reto gratuito", "desafio gratuito",
    "vsl", "video sales letter", "sales page", "página de ventas",
    "landing page", "squeeze page", "opt in", "lead magnet", "freebie",
    "cart closes", "carrito cierra", "offer expires", "oferta expira",
    "countdown", "cuenta regresiva", "registration closes", "registro cierra",
    "doors closing", "last chance", "última oportunidad",
    "as seen on", "featured in", "award winning", "bestseller",
    "número 1", "number 1",
  ],
};

export const TOTAL_DR_KEYWORDS =
  DR_KEYWORDS.tier1_disclaimers.length +
  DR_KEYWORDS.tier2_platforms.length +
  DR_KEYWORDS.tier3_ctas.length +
  DR_KEYWORDS.tier4_hooks.length +
  DR_KEYWORDS.tier5_niches.length +
  DR_KEYWORDS.tier6_funnels.length;

function sample<T>(arr: T[], n: number): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/**
 * Devuelve 3 keywords aleatorias: 1 del Tier 1 (disclaimer GOLD) + 2 mezcladas
 * de los demás tiers para máxima cobertura DR.
 */
export function getAutoSearchKeywords(count = 3): string[] {
  const tier1 = sample(DR_KEYWORDS.tier1_disclaimers, 1);
  const pool = [
    ...DR_KEYWORDS.tier2_platforms,
    ...DR_KEYWORDS.tier3_ctas,
    ...DR_KEYWORDS.tier4_hooks,
    ...DR_KEYWORDS.tier5_niches,
  ];
  const rest = sample(pool, Math.max(0, count - 1));
  return [...tier1, ...rest];
}
