import { useCallback, useEffect, useState } from "react";
import {
  Trophy, Gem, Boxes, Lightbulb, BookOpen, ClipboardCheck, Orbit, Quote, FileText, UserRound, Video,
  ListTodo, CalendarDays, MessageCircle, Calculator, BarChart3, Telescope, Store, Image, LayoutTemplate,
  MonitorPlay, Clapperboard, Send, TrendingUp, Mail, Film, Hash, Youtube, ShoppingBag, Radar,
  Megaphone, Smartphone, Camera, PanelsTopLeft,
  type LucideIcon,
} from "lucide-react";
import { CREDIT_COSTS } from "@/hooks/useCredits";

/**
 * Navegación por intención (decisión de Jean, 03-oct-2026): el Inicio es un ESTUDIO. Arriba, las
 * piezas que la gente quiere producir (creativos, carruseles, personaje IA, copy…); debajo, "Tu
 * negocio" según lo que construye (infoproducto low ticket, mentoría high ticket o marca personal);
 * y "Encontrar", nuestra ventaja: qué ya vende antes de crear nada. Esta lista la usan el Inicio, el
 * menú lateral y el buscador. `key` es la pantalla de Index.tsx; `generator` abre un generador
 * concreto de Generadores. Las pantallas en pausa (src/lib/features.ts) se filtran con canSee().
 */
export type BusinessModel = "low" | "high" | "marca";

export type Tool = {
  id: string;
  key: string;
  icon: LucideIcon;
  /** Título de la tarjeta del Inicio y del buscador. */
  title: string;
  /** Nombre corto en el menú lateral. */
  nav: string;
  /** Una línea: qué consigues ahí. */
  desc: string;
  /** Palabras con las que alguien la buscaría. */
  keywords: string;
  /** Abre ese generador de Generadores (id de GeneradoresPage). */
  generator?: string;
  featured?: boolean;
  /** Lo que cuesta empezar, como lo ve el cliente: "Gratis" o "18 créditos". Solo créditos, nunca dólares. */
  cost?: string;
};

const T = (t: Omit<Tool, "nav"> & { nav?: string }): Tool => ({ nav: t.title, ...t });

// Costos que se muestran en las tarjetas. Salen de CREDIT_COSTS (los mismos que cobra el servidor con
// credit_prices), para que el número de la tarjeta y el del botón nunca se separen.
const C = CREDIT_COSTS;
const cr = (n: number) => `${n.toLocaleString("es-ES", { useGrouping: true })} créditos`;
const FREE = "Gratis";

export const TOOL_BY_ID: Record<string, Tool> = Object.fromEntries([
  // ---------- Estudio IA ----------
  T({ id: "creativos", key: "Creativos", icon: Image, title: "Creativos para anuncios", cost: cr(C.gen_ad_image * 3),
    desc: "3 imágenes listas para Meta, hechas desde tu producto.", keywords: "creativo creativos imagen imagenes anuncio ads banner meta facebook instagram" }),
  T({ id: "videoanuncio", key: "Video anuncio", icon: Megaphone, title: "Anuncio en video", nav: "Video anuncio", cost: cr(C.vid_mini_5 * 3),
    desc: "3 tomas de 5 s: gancho, demostración y llamada. La IA elige la plantilla.", keywords: "video anuncio ads reels tiktok meta gancho demo llamada comercial" }),
  T({ id: "ugc", key: "UGC con IA", icon: Smartphone, title: "UGC con IA", cost: cr(C.vid_mini_10),
    desc: "Un presentador creado con IA habla 10 s a cámara en español.", keywords: "ugc presentador avatar persona habla camara video tiktok reels influencer" }),
  T({ id: "carrusel", key: "Carrusel", icon: LayoutTemplate, title: "Carrusel que vende", cost: cr(C.gen_ad_image * 5),
    desc: "5 láminas con gancho, problema, solución y llamada.", keywords: "carrusel carruseles laminas slides instagram post" }),
  T({ id: "fotosugc", key: "Fotos UGC", icon: Smartphone, title: "Fotos estilo UGC", nav: "Fotos estilo UGC", cost: cr(C.gen_ad_image * 3),
    desc: "Fotos como hechas con el celular: una persona usando tu producto.", keywords: "fotos ugc celular selfie persona producto natural lifestyle" }),
  T({ id: "fotoproducto", key: "Foto de producto", icon: Camera, title: "Foto de producto", cost: cr(C.gen_ad_image * 3),
    desc: "De estudio, en mockup y en uso.", keywords: "foto producto mockup estudio packshot tienda catalogo" }),
  T({ id: "personaje", key: "Sin mostrar tu cara", icon: UserRound, title: "Influencer IA", nav: "Influencer IA (sin tu cara)",
    desc: "Un personaje con IA que da la cara por ti en Reels y TikTok.", keywords: "personaje avatar influencer ia sin cara reels tiktok ugc" }),
  T({ id: "copy", key: "Generadores", icon: FileText, title: "Robot de copy", nav: "Robot de copy", cost: `desde ${cr(C.gen_light)}`,
    desc: "26 generadores: anuncios, VSL, correos, WhatsApp y más.", keywords: "copy copys textos guion guiones correo email pagina de venta landing generador vsl" }),
  T({ id: "anuncios", key: "Mándala", icon: Orbit, title: "Anuncios paso a paso", nav: "Mándala Creativa",
    desc: "Tus primeros 5 anuncios, en el orden que conviene.", keywords: "anuncio anuncios ads mandala campaña" }),
  T({ id: "miniaturas", key: "Miniaturas", icon: MonitorPlay, title: "Miniaturas", cost: cr(C.gen_ad_image * 2),
    desc: "Portadas para YouTube y Reels que se leen en pequeño.", keywords: "miniatura miniaturas thumbnail portada youtube" }),
  T({ id: "ganchos", key: "Hooks", icon: Quote, title: "Ganchos que atrapan", nav: "Ganchos (hooks)",
    desc: "Primeras frases de anuncios reales, listas para adaptar.", keywords: "ganchos hooks frases titulares atencion" }),
  T({ id: "videoia", key: "Video IA", icon: Video, title: "Video con IA", nav: "Video con IA", cost: `desde ${cr(C.vid_mini_5)}`,
    desc: "Describe la escena y la IA la graba, con sonido.", keywords: "video videos ia clip reels tiktok youtube faceless sin cara anuncio ugc" }),
  T({ id: "series", key: "Series", icon: Clapperboard, title: "Series de video", nav: "Series de video", cost: `${C.vid_mini_5} por escena`,
    desc: "Novelas, dibujos animados o anuncios en escenas seguidas.", keywords: "serie series novela novelas dibujos animados anime historia capitulos youtube" }),
  T({ id: "video", key: "Media Studio", icon: Video, title: "Video con presentador IA", nav: "Video con presentador",
    desc: "Videos cortos con un presentador hecho con IA.", keywords: "video videos avatar presentador ugc media studio" }),

  T({ id: "creadoryt", key: "Creador YouTube", icon: Youtube, title: "Videos para YouTube", nav: "Creador de YouTube", cost: `guion ${cr(C.gen_medium)}`,
    desc: "Del guion al video terminado: voz, imágenes y subtítulos, para canales sin cara.", keywords: "youtube faceless sin cara canal video largo guion creador documental animado" }),

  // ---------- Encontrar ----------
  T({ id: "ideas", key: "Ideas", icon: Lightbulb, featured: true, title: "Ideas de side hustle", nav: "Ideas de side hustle", cost: FREE,
    desc: "6 caminos para empezar de cero, con ejemplos reales y la primera acción.", keywords: "ideas side hustle negocio empezar cero emprender caminos faceless ugc low ticket" }),
  T({ id: "radar", key: "Buscar Ofertas Winner", icon: Trophy, title: "Espiar anuncios ganadores", nav: "Radar de anuncios", cost: FREE,
    desc: "Los que llevan más días pagándose: la mejor prueba de que venden.", keywords: "radar anuncios ganadores espiar facebook instagram meta winner" }),
  T({ id: "ofertas", key: "Ofertas", icon: Gem, title: "Ofertas que venden", nav: "Ofertas ganadoras", cost: FREE,
    desc: "Negocios digitales que ya venden, con su precio y su embudo.", keywords: "ofertas negocios productos digitales embudo checkout precio" }),
  T({ id: "nichosyt", key: "Nichos YouTube", icon: Radar, title: "Nichos de YouTube", nav: "Nichos de YouTube", cost: FREE,
    desc: "Los videos que más crecieron este mes y su ingreso estimado.", keywords: "nichos youtube canales virales tendencias shorts largos rpm monetizar" }),
  T({ id: "miniapps", key: "Mini Apps", icon: Boxes, title: "Mini Apps listas", cost: "Ver es gratis",
    desc: "Kits basados en ofertas reales para lanzar tu versión.", keywords: "mini apps kits app saas plantilla" }),
  T({ id: "dolores", key: "Crear", icon: Lightbulb, title: "Descubrir dolores",
    desc: "Problemas que la gente quiere resolver y por los que paga.", keywords: "dolores problemas ideas nicho necesidades" }),

  // ---------- Tu negocio ----------
  T({ id: "producto", key: "Crear producto", icon: BookOpen, title: "Crear mi producto", nav: "Crear producto",
    desc: "Ebook, curso o reto, capítulo por capítulo.", keywords: "producto ebook curso reto libro pdf crear" }),
  T({ id: "validar", key: "Validar", icon: ClipboardCheck, title: "Validar mi idea",
    desc: "14 preguntas con cómo saberlo, para ver si se vende.", keywords: "validar validacion matriz idea" }),
  T({ id: "precio", key: "Precio", icon: Calculator, title: "Precio y ganancia",
    desc: "Cuánto te queda por venta y cuánto pagar en anuncios.", keywords: "precio ganancia margen cpa calculadora cuanto cobrar" }),
  // Pantalla propia (04-oct-2026): antes abría Robot de copy; el generador "order-bump" sigue allí.
  T({ id: "bump", key: "Order bump", icon: ShoppingBag, title: "Order bump", nav: "Order bump", cost: "Ideas gratis",
    desc: "El extra de un clic antes de pagar: ideas gratis y el texto listo aquí mismo.", keywords: "order bump upsell oferta extra ticket promedio" }),
  T({ id: "recuperar", key: "Recuperar", icon: MessageCircle, title: "Recuperar ventas",
    desc: "Mensajes de WhatsApp para quien casi compra.", keywords: "recuperar ventas whatsapp carrito abandonado mensajes" }),
  T({ id: "resultados", key: "Resultados", icon: BarChart3, title: "¿Qué anuncio apago o escalo?", nav: "Resultados de anuncios",
    desc: "Anota gasto y ventas: la app te dice qué hacer.", keywords: "resultados metricas medir escalar apagar ctr gasto ventas" }),
  T({ id: "plan", key: "Plan", icon: ListTodo, title: "Plan de lanzamiento",
    desc: "Tus tareas con fecha para lanzar en unos 14 días.", keywords: "plan lanzamiento tareas checklist" }),
  T({ id: "vsl", key: "Generadores", generator: "vsl-main", icon: Clapperboard, title: "Guion de VSL", nav: "Guion de VSL",
    desc: "El video de ventas que lleva a la llamada o a la compra.", keywords: "vsl video de ventas guion high ticket" }),
  T({ id: "dm", key: "Generadores", generator: "dm-script", icon: Send, title: "Mensajes de setter por DM", nav: "Setter por DM",
    desc: "Conversaciones que califican y agendan llamadas.", keywords: "dm setter mensajes directos agendar llamada instagram high ticket" }),
  T({ id: "ascension", key: "Generadores", generator: "ascension-offer", icon: TrendingUp, title: "Oferta de ascensión", nav: "Oferta de ascensión",
    desc: "El siguiente escalón caro para quien ya te compró.", keywords: "ascension high ticket mentoria escalera oferta" }),
  T({ id: "correos", key: "Generadores", generator: "email-sequence", icon: Mail, title: "Secuencia de correos", nav: "Correos",
    desc: "Correos que calientan y cierran la venta.", keywords: "correos email secuencia nurturing" }),
  T({ id: "reels", key: "Generadores", generator: "reels-script", icon: Film, title: "Guiones de Reels", nav: "Guiones de Reels",
    desc: "Guiones cortos con gancho para crecer tu marca.", keywords: "reels guion tiktok shorts marca personal" }),
  T({ id: "captions", key: "Generadores", generator: "captions-ig", icon: Hash, title: "Textos para publicaciones", nav: "Textos de posts",
    desc: "Descripciones para Instagram que invitan a escribirte.", keywords: "captions descripcion instagram post texto" }),
  T({ id: "youtube", key: "Generadores", generator: "yt-script", icon: Youtube, title: "Guion de YouTube", nav: "Guion de YouTube",
    desc: "Videos largos que posicionan y venden.", keywords: "youtube guion video largo" }),
  T({ id: "paginas", key: "Generadores", generator: "landing-copy", icon: PanelsTopLeft, title: "Página de ventas", nav: "Página de ventas", cost: cr(C.gen_medium),
    desc: "Todo el texto de tu página, del titular al botón de compra.", keywords: "pagina paginas landing pagina de ventas web sitio textos titular" }),
  T({ id: "contenido", key: "Contenido", icon: CalendarDays, title: "Calendario de contenido",
    desc: "Ideas con demanda real para publicar sin pagar anuncios.", keywords: "contenido calendario publicaciones organico posts reels" }),

  // ---------- Solo admin (en pausa) ----------
  T({ id: "mercado", key: "Mercado", icon: Store, title: "Mercado: qué vender",
    desc: "Productos para vender como afiliado.", keywords: "mercado afiliado comision" }),
  T({ id: "oraculo", key: "Oráculo", icon: Telescope, title: "Analizar una página de ventas", nav: "Oráculo",
    desc: "Pega el enlace de una página de ventas y te explica qué vende.", keywords: "oraculo landing pagina analizar revisar" }),
].map(t => [t.id, t]));

const pick = (ids: string[]) => ids.map(id => TOOL_BY_ID[id]);

/** Lo que más se crea (Inicio, menú "Crear" y el botón Crear del teléfono). Plan ATLAS, 04-oct-2026. */
// "UGC con IA" sale de aquí mientras su interruptor del servidor (edge_limits 'video-studio:ugc')
// siga apagado: va en ADMIN_EXTRA_TOOLS y en ADMIN_ONLY_PAGES (src/lib/features.ts). Para lanzarlo,
// devolverlo a esta lista y quitarlo de las otras dos (y de alternativesFor en recommendTarget.ts).
export const STUDIO_TOOLS = pick(["creativos", "videoanuncio", "videoia", "creadoryt", "carrusel", "fotosugc", "miniaturas", "series"]);
/** Más para crear: siguen en el menú y en el buscador, debajo de las 8 principales. */
export const STUDIO_MORE_TOOLS = pick(["fotoproducto", "personaje", "copy"]);
/** Ideas ganadoras: qué ya vende, antes de crear nada. Todo gratis de mirar. */
export const FIND_TOOLS = pick(["radar", "ofertas", "nichosyt", "miniapps"]);
export const ADMIN_EXTRA_TOOLS = pick(["mercado", "oraculo", "video", "ugc"]);

/**
 * Panel de herramientas del Inicio (estructura tomada de LanzaYa, 04-oct-2026): pestañas por lo que
 * quieres hacer. "Lo esencial" son las 12 que abren el panel; "Todo" las muestra todas. Solo
 * herramientas que ya funcionan: nada de tarjetas de cosas que no existen.
 */
export const HOME_CATEGORIES: { id: string; label: string; tools: Tool[] }[] = [
  { id: "esencial", label: "Lo esencial", tools: pick(["creativos", "carrusel", "videoia", "miniaturas", "personaje", "fotoproducto", "copy", "paginas", "producto", "ofertas", "radar", "videoanuncio"]) },
  { id: "ideas", label: "Ideas que venden", tools: pick(["radar", "ofertas", "nichosyt", "miniapps", "ganchos", "dolores"]) },
  { id: "imagenes", label: "Imágenes", tools: pick(["creativos", "carrusel", "miniaturas", "fotosugc", "fotoproducto"]) },
  { id: "video", label: "Video", tools: pick(["videoanuncio", "videoia", "creadoryt", "series", "personaje", "ugc", "video"]) },
  { id: "textos", label: "Textos y anuncios", tools: pick(["copy", "paginas", "anuncios", "ganchos", "vsl", "correos", "reels", "captions", "dm", "youtube", "contenido"]) },
  { id: "negocio", label: "Tu negocio", tools: pick(["producto", "validar", "precio", "plan", "bump", "ascension", "recuperar", "resultados"]) },
];

export const MODELS:{ id: BusinessModel; label: string; short: string; line: string; tools: Tool[] }[] = [
  { id: "low", label: "Infoproducto (low ticket)", short: "Low ticket", line: "Ebook, curso o reto de US$7 a US$47, vendido con anuncios.",
    tools: pick(["producto", "anuncios", "validar", "precio", "bump", "recuperar", "resultados", "ganchos"]) },
  { id: "high", label: "Mentoría o servicio (high ticket)", short: "High ticket", line: "Programas de US$300 o más que se cierran en una llamada.",
    tools: pick(["vsl", "dm", "anuncios", "ascension", "correos", "precio", "resultados"]) },
  { id: "marca", label: "Marca personal", short: "Marca personal", line: "Contenido que te posiciona y atrae clientes sin pagar anuncios.",
    tools: pick(["creadoryt", "nichosyt", "reels", "contenido", "captions", "ganchos"]) },
];

/** Todas las herramientas (Inicio, menú, buscador y la prueba de que cada una abre una pantalla real). */
/**
 * Herramientas ocultas (05-oct-2026, decisión de Jean): no salen en el menú, el Inicio ni el buscador.
 * Su pantalla y sus datos siguen existiendo; Index.tsx redirige su dirección al Inicio.
 */
export const HIDDEN_TOOL_IDS = new Set(["ideas"]);
export const HIDDEN_PAGES = new Set(["Ideas"]);
export const TOOLS: Tool[] = Object.values(TOOL_BY_ID).filter(t => !ADMIN_EXTRA_TOOLS.includes(t) && !HIDDEN_TOOL_IDS.has(t.id));

/**
 * Abre una herramienta. Las que son un generador concreto dejan dicho cuál abrir (GeneradoresPage
 * lo lee al montarse) y piden volver a montar la pantalla aunque ya estuviera abierta.
 */
export function openTool(tool: Tool, onNavigate: (page: string) => void) {
  if (tool.generator) {
    try { localStorage.setItem("supernova_generator_prefill", JSON.stringify({ generator: tool.generator })); } catch { /* sin almacenamiento */ }
  }
  onNavigate(tool.key);
}

// ---------- Qué está construyendo (low / high / marca), recordado en este navegador ----------
const MODEL_KEY = "supernova:business-model";
const MODEL_EVENT = "supernova:business-model-changed";

export function useBusinessModel() {
  const read = (): BusinessModel => {
    try { const v = localStorage.getItem(MODEL_KEY); if (v === "low" || v === "high" || v === "marca") return v; } catch { /* sin almacenamiento */ }
    return "low";
  };
  const [model, setModelState] = useState<BusinessModel>(read);
  useEffect(() => {
    const sync = () => setModelState(read());
    window.addEventListener(MODEL_EVENT, sync);
    return () => window.removeEventListener(MODEL_EVENT, sync);
  }, []);
  const setModel = useCallback((m: BusinessModel) => {
    try { localStorage.setItem(MODEL_KEY, m); } catch { /* sin almacenamiento */ }
    setModelState(m);
    window.dispatchEvent(new Event(MODEL_EVENT));
  }, []);
  return { model, setModel, current: MODELS.find(m => m.id === model)! };
}
