import type { DemoAd, AdMarket, AdLang, Tier } from "@/lib/demo-winning-ads";
import { normalizeAdsLibraryUrl, buildAdsLibrarySearchUrl } from "@/lib/demo-winning-ads";

/**
 * Capa "producto-primero": una OFERTA = anuncios de un anunciante en un
 * mercado, enriquecida por IA (tabla `offers`, edge function enrich-offers).
 * Todo lo nuevo (picks del día, catálogo, Cazador de ROI, kits) vive aquí.
 */
export interface Offer {
  id: string;
  page_id: string;
  market: string;
  page_name: string | null;
  ads_count: number;
  active_ads: number;
  /** Anuncios activos hoy en la Biblioteca de Meta (offer-live-count, 29-oct-2026). null = aún no contado. */
  live_active_ads?: number | null;
  live_capped?: boolean;
  days_active: number;
  duplicate_count: number;
  winner_score: number;
  tier: string | null;
  sample_ad_id: string | null;
  sample_title: string | null;
  sample_body: string | null;
  sample_ad_url: string | null;
  first_seen: string | null;
  last_seen: string | null;
  product_name: string | null;
  niche: string | null;
  offer_type: string | null;
  business_model: string | null;
  language: string | null;
  price_hint: string | null;
  mechanism: string | null;
  why_wins: string | null;
  target_audience: string | null;
  copy_score: number | null;
  enriched_at: string | null;
  /** Índice 0-100 de la curaduría (mitad prueba de dinero, mitad copiabilidad). Solo lo tienen las ganadoras. */
  winner_index?: number | null;
  is_winner?: boolean;
  /** Otros países donde el mismo anunciante corre la oferta. */
  markets?: string[] | null;
  /** Plataforma de cobro detectada (tabla offer_platform; ficha completa o detección liviana). */
  offer_platform?: { platform: string | null } | null;
  /** Cómo vende (refresh_offer_canal, 28-oct-2026): whatsapp, pagina o mensajes. null = sin revisar. */
  canal?: Canal | null;
  /** Si vende por página: su enlace. */
  canal_url?: string | null;
  /** Anuncios que ve la persona: el conteo en vivo de Meta o, si no lo da, el que trae la oferta (para ordenar por escala). */
  escala?: number;
  /** Dónde cobra, un nombre por plataforma. Si vende por WhatsApp, es WhatsApp (refresh_offer_checkout, 29-oct-2026). */
  checkout?: string | null;
  /** Camino de venta (FUNNEL_LABEL); "whatsapp" si vende por WhatsApp. */
  embudo?: string | null;
  tags?: string[] | null;
  /** Portada fija (bucket ofertas-portadas). La de Cazador Swipe, por ejemplo. */
  cover_url?: string | null;
  /** null = nuestro recolector; "cazador" = catálogo de Cazador Swipe (de Jean, 29-oct-2026). */
  source?: string | null;
  source_data?: OfferSourceData | null;
}

/** Lo que trae la oferta de Cazador Swipe y no tiene columna propia. */
export interface OfferSourceData {
  codigo?: string;
  nivel?: string;
  anuncios?: number | null;
  links?: { biblioteca?: string | null; pagina_ventas?: string | null; checkout?: string | null; drive?: string | null; vsl?: string | null };
  hero_url?: string | null;
  radar?: { nota?: number | null; porque_llamo_atencion?: string | null; que_funciona?: string | null; que_modelaria?: string | null;
    que_cambiaria?: string | null; como_adaptar_latam?: string | null; paises_testaria?: string[]; ticket_testaria?: string | null; conclusion?: string | null } | null;
}

/** Días pagando anuncios. 0 = sin dato: llegó de Cazador sin la fecha del anuncio más viejo y la API de Meta no la da
 *  para anuncios que solo corren en Brasil (offer-live-count la llena cuando sí la da). */
export const diasPagando = (o: Pick<Offer, "days_active">) => (o.days_active > 0 ? o.days_active.toLocaleString("es") : "Sin dato");

export type Canal = "whatsapp" | "pagina" | "mensajes";
/** Cómo vende cada oferta, en palabras de la persona (Cindy, 28-oct-2026: "¿están mezcladas?"). */
export const CANAL_LABEL: Record<Canal, string> = { pagina: "Página de ventas", whatsapp: "WhatsApp", mensajes: "Mensajes (Messenger o Instagram)" };
export const CANAL_CORTO: Record<Canal, string> = { pagina: "🔗 Página de ventas", whatsapp: "💬 WhatsApp", mensajes: "💬 Mensajes" };

/** El enlace para ver cómo vende: su página de ventas o, si vende por mensajes, el anuncio (con su botón). */
export function enlaceCanal(o: Pick<Offer, "canal" | "canal_url" | "sample_ad_url">): { href: string; texto: string } | null {
  const safe = (u?: string | null) => (u && /^https:\/\//i.test(u) ? u : null);
  if (o.canal === "pagina" && safe(o.canal_url)) return { href: safe(o.canal_url)!, texto: "Ver su página de ventas" };
  const ad = safe(o.sample_ad_url);
  if (!ad) return null;
  if (o.canal === "whatsapp") return { href: ad, texto: "Ver el anuncio y su botón de WhatsApp" };
  if (o.canal === "mensajes") return { href: ad, texto: "Ver el anuncio y su botón de mensaje" };
  return { href: ad, texto: "Ver el anuncio original" };
}

/** El número que se enseña como "índice ganador": el curado si existe, si no el score de anuncios. */
export function winnerPct(o: Pick<Offer, "winner_index" | "winner_score">): number {
  const v = o.winner_index != null ? Number(o.winner_index) : o.winner_score;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export const NICHE_LABEL: Record<string, string> = {
  salud_fitness: "Salud & Fitness",
  dinero_negocios: "Dinero & Negocios",
  marketing_ventas: "Marketing & Ventas",
  desarrollo_personal: "Desarrollo personal",
  relaciones: "Relaciones",
  educacion_idiomas: "Educación & Idiomas",
  tecnologia_ia: "Tecnología & IA",
  belleza_moda: "Belleza & Moda",
  hogar_mascotas: "Hogar & Mascotas",
  espiritualidad: "Espiritualidad",
  infantil_familia: "Infantil & Familia",
  gastronomia_recetas: "Gastronomía & Recetas",
  inmobiliaria: "Inmobiliaria",
  finanzas_trading: "Finanzas & Trading",
  software_saas: "Software & Apps",
  servicios_locales: "Servicios locales",
  entretenimiento: "Entretenimiento",
  viajes: "Viajes",
  otro: "Otro",
};

export const OFFER_TYPE_LABEL: Record<string, string> = {
  infoproducto: "Producto digital (curso, guía)",
  ecommerce: "Producto físico (tienda online)",
  saas_app: "App o programa",
  servicio: "Servicio",
  comunidad: "Comunidad o membresía",
  evento: "Evento",
  otro: "Otro",
};

export const MODEL_LABEL: Record<string, string> = {
  pago_unico: "Pago único",
  suscripcion: "Suscripción",
  freemium: "Gratis con versión de pago",
  lead_gratis: "Regalo gratis para captar contactos",
  otro: "Otro",
};

/** Grupos de mercado por IDIOMA (no por país aislado): así "español" incluye LATAM. */
export const MARKET_GROUP: Record<string, { label: string; flag: string; markets: string[]; lang: AdLang }> = {
  ES: { label: "Mercado español", flag: "🇪🇸", markets: ["ES", "MX", "AR", "CO"], lang: "es" },
  BR: { label: "Mercado brasileño", flag: "🇧🇷", markets: ["BR", "PT"], lang: "pt" },
  US: { label: "Mercado americano", flag: "🇺🇸", markets: ["US", "GB"], lang: "en" },
  RU: { label: "Mercado ruso", flag: "🇷🇺", markets: ["RU", "KZ"], lang: "ru" },
};

/**
 * Filtro "En español": por IDIOMA del anuncio, en cualquier país (12-oct-2026). Con MARKET_GROUP.ES solo
 * entraban ES/MX/AR/CO (50 ganadoras); por idioma son 85, incluidas las que se anuncian en Brasil o EE. UU.
 * en español. Es un filtro que la persona ve y quita en un toque: no cambia el orden ni el puntaje.
 */
export const LANG_ES_FILTER = "lang:es";

/** Países donde se vende en español (código ISO de user_age_country). EE. UU. entra: el público es hispano. */
export const SPANISH_COUNTRIES = new Set([
  "AR", "BO", "CL", "CO", "CR", "CU", "DO", "EC", "ES", "GQ", "GT", "HN", "MX", "NI", "PA", "PE", "PR", "PY", "SV", "US", "UY", "VE",
]);

/**
 * Filtro de mercado con el que abre Ofertas según el país de la persona (la app no pregunta lo que ya
 * sabe). Español → ofertas en español; Brasil/Portugal → mercado brasileño; el resto, todas.
 */
export function defaultOfferFilter(countryIso: string | null | undefined): string {
  const c = (countryIso ?? "").toUpperCase();
  if (SPANISH_COUNTRIES.has(c)) return LANG_ES_FILTER;
  if (c === "BR" || c === "PT") return "BR";
  return "all";
}

export const MARKET_FLAG: Record<string, string> = {
  US: "🇺🇸", GB: "🇬🇧", ES: "🇪🇸", MX: "🇲🇽", AR: "🇦🇷", CO: "🇨🇴", PE: "🇵🇪", CL: "🇨🇱",
  BR: "🇧🇷", PT: "🇵🇹", DE: "🇩🇪", AT: "🇦🇹", CH: "🇨🇭", RU: "🇷🇺", KZ: "🇰🇿", FR: "🇫🇷", IT: "🇮🇹",
  EC: "🇪🇨", DO: "🇩🇴", GT: "🇬🇹", CR: "🇨🇷", PA: "🇵🇦", UY: "🇺🇾", PY: "🇵🇾", BO: "🇧🇴", VE: "🇻🇪",
  SV: "🇸🇻", HN: "🇭🇳", NI: "🇳🇮", PR: "🇵🇷",
};

export const MARKET_NAME: Record<string, string> = {
  US: "Estados Unidos", GB: "Reino Unido", ES: "España", MX: "México", AR: "Argentina", CO: "Colombia",
  PE: "Perú", CL: "Chile", BR: "Brasil", PT: "Portugal", DE: "Alemania", AT: "Austria", CH: "Suiza",
  RU: "Rusia", KZ: "Kazajistán", FR: "Francia", IT: "Italia",
  EC: "Ecuador", DO: "Rep. Dominicana", GT: "Guatemala", CR: "Costa Rica", PA: "Panamá", UY: "Uruguay",
  PY: "Paraguay", BO: "Bolivia", VE: "Venezuela", SV: "El Salvador", HN: "Honduras", NI: "Nicaragua", PR: "Puerto Rico",
};

export function flagFor(market: string | null | undefined) {
  return MARKET_FLAG[(market ?? "").toUpperCase()] ?? "🌍";
}

/**
 * Qué tan FÁCIL es replicar la oferta (copy_score 1-5 del enriquecimiento). No dice si
 * conviene: eso es el veredicto. Por eso habla de esfuerzo ("fácil de replicar") y no de
 * recomendación: antes decía "Muy copiable" al lado de un veredicto "No la copiaría".
 * `label` se entiende solo (insignias sueltas); `short` va junto al rótulo "Replicarla".
 */
export function copyLabel(score: number | null | undefined): { label: string; short: string; cls: string } {
  if (score == null) return { label: "Sin evaluar", short: "Sin evaluar", cls: "bg-secondary text-muted-foreground" };
  if (score >= 5) return { label: "Muy fácil de replicar", short: "Muy fácil", cls: "bg-success/15 text-success" };
  if (score >= 4) return { label: "Fácil de replicar", short: "Fácil", cls: "bg-success/10 text-success" };
  if (score >= 3) return { label: "Necesita inversión para replicar", short: "Con inversión", cls: "bg-warning/15 text-warning" };
  return { label: "Difícil de replicar", short: "Difícil", cls: "bg-destructive/10 text-destructive" };
}

/** Etiqueta DR de escala: qué tan fuerte está pagando el anunciante ahora mismo. */
/** Anuncios activos: el conteo en vivo de Meta si ya está; si no, los que vimos nosotros (una muestra). */
export function anunciosActivos(o: Pick<Offer, "active_ads" | "live_active_ads" | "live_capped">): { n: number; texto: string; vivo: boolean } {
  const vivo = typeof o.live_active_ads === "number" && o.live_active_ads > 0;
  const n = vivo ? Math.max(o.live_active_ads as number, o.active_ads) : o.active_ads;
  return { n, texto: `${n.toLocaleString("es")}${vivo && o.live_capped ? "+" : ""}`, vivo };
}

// Niveles de Cazador Swipe → los nuestros. Solo se usan cuando no tenemos los días (sus ofertas de Brasil: Meta no da la
// fecha); Cazador sí los midió. Sin esto, una oferta de 480 anuncios salía como «Despegando».
const NIVEL_CAZADOR: Record<string, string> = { Dominando: "Dominando", Escalando: "Creciendo", Validando: "Despegando", Testeando: "En prueba" };

export function scaleLabel(o: Pick<Offer, "active_ads" | "days_active"> & Partial<Pick<Offer, "live_active_ads" | "live_capped" | "source_data">>): string {
  if (!(o.days_active > 0) && o.source_data?.nivel && NIVEL_CAZADOR[o.source_data.nivel]) return NIVEL_CAZADOR[o.source_data.nivel];
  o = { ...o, active_ads: anunciosActivos({ live_active_ads: null, live_capped: false, ...o }).n };
  if (o.active_ads >= 30 && o.days_active >= 60) return "Dominando";
  if (o.active_ads >= 10 && o.days_active >= 30) return "Creciendo";
  if (o.active_ads >= 5) return "Despegando";
  return "En prueba";
}

const DEMO_MARKETS: AdMarket[] = ["BR", "US", "ES", "MX", "RU"];
const DEMO_LANGS: AdLang[] = ["en", "es", "pt", "de", "ru"];

/** Puente al pipeline existente (MiniAppModal / Sofisticar) que trabaja con DemoAd. */
export function offerToDemoAd(o: Offer): DemoAd {
  const market = (DEMO_MARKETS as string[]).includes(o.market) ? (o.market as AdMarket) : "LATAM";
  const lang = (DEMO_LANGS as string[]).includes(o.language ?? "") ? (o.language as AdLang) : "es";
  const offerType = o.offer_type === "saas_app" ? "saas"
    : o.offer_type === "ecommerce" ? "ecommerce"
    : o.offer_type === "servicio" ? "servicio"
    : "infoproducto";
  const title = o.product_name || o.sample_title || o.page_name || "Oferta";
  const rawUrl = o.sample_ad_url ?? buildAdsLibrarySearchUrl(o.page_name ?? title, market);
  return {
    id: `offer-${o.id}`,
    pageId: o.page_id,
    pageName: o.page_name ?? title,
    title,
    body: o.sample_body ?? o.mechanism ?? title,
    daysActive: o.days_active,
    duplicates: o.active_ads || o.duplicate_count,
    score: o.winner_score,
    tier: (o.tier ?? "mega") as Tier,
    offerType,
    market,
    marketLabel: o.market,
    flag: flagFor(o.market),
    lang,
    adUrl: normalizeAdsLibraryUrl(rawUrl, o.page_name ?? title, market),
    vertical: undefined,
  };
}

/** Prefill entre páginas por localStorage (patrón existente en la app). */
export const RADAR_PREFILL_KEY = "supernova_radar_prefill";

export function openOfferAdsInRadar(o: Offer, onNavigate?: (page: string) => void) {
  const q = (o.page_name ?? o.product_name ?? "").trim();
  if (q) localStorage.setItem(RADAR_PREFILL_KEY, q);
  onNavigate?.("Buscar Ofertas Winner");
}
