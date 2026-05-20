import type { CreditAction } from "@/hooks/useCredits";

export interface Level { n: number; name: string; min: number; max: number; }

export const LEVELS: Level[] = [
  { n: 1, name: "Explorador",            min: 0,     max: 100 },
  { n: 2, name: "Investigador",          min: 101,   max: 300 },
  { n: 3, name: "Cazador de Winners",    min: 301,   max: 600 },
  { n: 4, name: "Estratega DR",          min: 601,   max: 1000 },
  { n: 5, name: "Operador",              min: 1001,  max: 2000 },
  { n: 6, name: "Experto en Escala",     min: 2001,  max: 5000 },
  { n: 7, name: "Maestro del Mercado",   min: 5001,  max: 10000 },
  { n: 8, name: "Elite DR",              min: 10001, max: 25000 },
  { n: 9, name: "JARVIS Commander",      min: 25001, max: Infinity },
];

export function levelOf(xp: number): Level {
  return LEVELS.find(l => xp >= l.min && xp <= l.max) ?? LEVELS[0];
}

export function nextLevel(xp: number): Level | null {
  const cur = levelOf(xp);
  return LEVELS.find(l => l.n === cur.n + 1) ?? null;
}

export const XP_BY_ACTION: Partial<Record<CreditAction, number>> = {
  search_ads: 5, analyze_url: 5, chat_message: 3,
  sofisticar: 15, adaptar: 10, pain_discovery: 10,
  landing_intelligence: 25, ai_intel: 10,
  blueprint: 30, gen_funnel: 30, gen_master_prompt: 25,
  gen_landing: 20, gen_ad_copies: 12, gen_avatar: 12,
  pillar_assist: 8, gen_light: 4, gen_medium: 8, gen_heavy: 15,
};

export interface Badge { id: string; label: string; icon: string; }

export const BADGES: Badge[] = [
  { id: "first_search",    label: "Primera búsqueda",  icon: "🔍" },
  { id: "first_offer",     label: "Primera oferta",    icon: "⚡" },
  { id: "streak_3",        label: "Racha 3 días",       icon: "🔥" },
  { id: "streak_7",        label: "Racha 7 días",       icon: "⚡" },
  { id: "ten_oracles",     label: "10 oráculos",        icon: "🔮" },
  { id: "fifty_searches",  label: "50 búsquedas",       icon: "🎯" },
  { id: "level_5",         label: "Nivel 5",            icon: "🏆" },
  { id: "first_funnel",    label: "Primer funnel",      icon: "🚀" },
];

export const MISSION_SETS: { id: string; tasks: { action: CreditAction; label: string; count: number; xp: number }[] }[] = [
  { id: "A", tasks: [
    { action: "search_ads", label: "Haz 1 búsqueda de anuncios", count: 1, xp: 10 },
    { action: "sofisticar", label: "Sofistiza 1 oferta",         count: 1, xp: 20 },
    { action: "landing_intelligence", label: "Analiza 1 URL en el Oráculo", count: 1, xp: 20 },
  ]},
  { id: "B", tasks: [
    { action: "search_ads",  label: "Haz 3 búsquedas",        count: 3, xp: 15 },
    { action: "chat_message",label: "1 consulta en Chat IA",  count: 1, xp: 10 },
    { action: "adaptar",     label: "Adapta 1 anuncio",       count: 1, xp: 15 },
  ]},
  { id: "C", tasks: [
    { action: "search_ads",  label: "1 búsqueda",              count: 1, xp: 10 },
    { action: "gen_avatar",  label: "1 avatar del comprador",  count: 1, xp: 15 },
    { action: "gen_ad_copies", label: "1 tanda de ad copies",   count: 1, xp: 15 },
  ]},
  { id: "D", tasks: [
    { action: "search_ads",  label: "Haz 5 búsquedas",          count: 5, xp: 20 },
    { action: "blueprint",   label: "1 blueprint completo",     count: 1, xp: 20 },
    { action: "landing_intelligence", label: "1 análisis Oráculo", count: 1, xp: 10 },
  ]},
  { id: "E", tasks: [
    { action: "landing_intelligence", label: "1 análisis Oráculo", count: 1, xp: 15 },
    { action: "gen_funnel",  label: "1 funnel completo",        count: 1, xp: 25 },
    { action: "sofisticar",  label: "1 oferta sofisticada",     count: 1, xp: 10 },
  ]},
];

export function todayMissionSet(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((+date - +start) / 86400000);
  return MISSION_SETS[day % MISSION_SETS.length];
}

export const DAILY_QUOTES = [
  "El mercado premia a quien actúa hoy, no al que planea para mañana.",
  "Un ganador no crea demanda. Se monta en la que ya existe.",
  "Los datos no mienten. Las opiniones, sí.",
  "El mejor anuncio que puedes hacer es el que ya está convirtiendo.",
  "Velocidad de ejecución es tu ventaja competitiva más real.",
  "El mercado te paga por resolver dolores urgentes, no problemas interesantes.",
  "Encuentra lo que ya funciona. Hazlo tuyo. Escala. Repite.",
  "No necesitas la idea perfecta. Necesitas la oferta que el mercado ya validó.",
  "El dinero sigue al duplicado. Si alguien lo escala, está funcionando.",
  "Tu competidor más peligroso no es el más creativo. Es el más consistente.",
  "Un funnel no se inventa. Se descubre en los datos del mercado.",
  "La diferencia entre un marketer amateur y uno profesional: el amateur adivina.",
  "No copies el anuncio. Entiende por qué convierte. Eso no lo puedes copiar.",
  "El mejor momento para lanzar era ayer. El segundo mejor es hoy.",
  "Los ganadores en DR tienen un rasgo común: actúan antes de estar listos.",
  "Si el mercado ya lo está comprando, tu trabajo es llegar primero.",
  "No hay secreto. Hay sistemas. Y los sistemas se copian y mejoran.",
  "La oferta que más vende no es la mejor. Es la más específica.",
  "Un anuncio con 200 duplicados es una carta de amor del mercado al ángulo.",
  "La consistencia en el análisis crea ventajas que el talento no puede comprar.",
  "JARVIS trabaja. Tú decides. Esa es la combinación ganadora.",
  "El mercado siempre tiene razón. Aprende a escucharlo antes que tu competencia.",
  "Tu próxima oferta ganadora ya está corriendo en algún lugar del mundo.",
  "Los datos fríos de hoy son el dinero caliente de mañana.",
  "No busques inspiración. Busca señales. El mercado ya habló.",
  "La oferta perfecta no existe. La oferta con demanda probada, sí.",
  "Cada día que no analizas el mercado, tu competidor sí lo hace.",
  "El ángulo lo es todo. El mismo producto con diferente ángulo = resultados diferentes.",
  "En DR no hay suerte. Hay sistemas probados y personas que los siguen.",
  "SUPERNOVA no te da ideas. Te da certeza. Eso vale más.",
];

export function todayQuote(date = new Date()) {
  return DAILY_QUOTES[date.getDate() % DAILY_QUOTES.length];
}

export const STREAK_MILESTONES: Record<number, string> = {
  3:  "🔥 3 días de racha. Vas bien.",
  7:  "⚡ Una semana completa. Eres constante.",
  14: "🏆 Dos semanas. Los ganadores son consistentes.",
  30: "☢️ Un mes. Estás en el 1% de los marketers.",
};
