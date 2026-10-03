import {
  Trophy, Gem, Boxes, Lightbulb, BookOpen, ClipboardCheck, Orbit, Quote, FileText, UserRound, Video,
  ListTodo, CalendarDays, MessageCircle, Calculator, BarChart3, Telescope, Store,
  type LucideIcon,
} from "lucide-react";

/**
 * Navegación por intención (decisión de Jean, 03-oct-2026, por lo que pidió Cindy): la app se
 * organiza por lo que la persona quiere hacer, no por etapas. Esta lista la usan el Inicio
 * ("¿Qué quieres hacer hoy?"), el menú lateral y el buscador, para que los tres digan lo mismo.
 * `key` es la clave de pantalla de Index.tsx. Las pantallas en pausa (src/lib/features.ts) se
 * filtran con canSee() donde se muestran: un cliente no las ve.
 */
export type ToolGroup = "encontrar" | "crear" | "vender" | "ganar";

export type Tool = {
  key: string;
  group: ToolGroup;
  icon: LucideIcon;
  /** Título de la tarjeta del Inicio y del buscador. */
  title: string;
  /** Nombre corto en el menú lateral. */
  nav: string;
  /** Una línea: qué consigues ahí. */
  desc: string;
  /** Palabras con las que alguien la buscaría. */
  keywords: string;
  featured?: boolean;
};

export const TOOL_GROUPS: { id: ToolGroup; title: string; sub: string }[] = [
  { id: "encontrar", title: "Encontrar", sub: "Qué vender" },
  { id: "crear", title: "Crear", sub: "Tu producto y tus anuncios" },
  { id: "vender", title: "Vender", sub: "Llegar a más gente" },
  { id: "ganar", title: "Ganar", sub: "Tus números" },
];

export const TOOLS: Tool[] = [
  // Encontrar
  { key: "Buscar Ofertas Winner", group: "encontrar", icon: Trophy, featured: true,
    title: "Espiar anuncios ganadores", nav: "Radar de anuncios",
    desc: "Los anuncios con más días pagándose: la mejor prueba de que venden.",
    keywords: "radar anuncios ganadores espiar facebook instagram meta winner" },
  { key: "Ofertas", group: "encontrar", icon: Gem,
    title: "Ofertas que venden", nav: "Ofertas ganadoras",
    desc: "Negocios digitales que ya venden, con su precio y su embudo.",
    keywords: "ofertas negocios productos digitales embudo checkout precio" },
  { key: "Mini Apps", group: "encontrar", icon: Boxes,
    title: "Mini Apps listas", nav: "Mini Apps",
    desc: "Kits basados en ofertas reales para lanzar tu versión.",
    keywords: "mini apps kits app saas plantilla" },
  { key: "Crear", group: "encontrar", icon: Lightbulb,
    title: "Descubrir dolores", nav: "Descubrir dolores",
    desc: "Problemas que la gente quiere resolver y por los que paga.",
    keywords: "dolores problemas ideas nicho necesidades" },
  // Crear
  { key: "Crear producto", group: "crear", icon: BookOpen,
    title: "Crear mi producto", nav: "Crear producto",
    desc: "Ebook, curso o reto, capítulo por capítulo.",
    keywords: "producto ebook curso reto libro pdf crear" },
  { key: "Mándala", group: "crear", icon: Orbit,
    title: "Crear anuncios", nav: "Mándala Creativa",
    desc: "Tus primeros 5 anuncios, en el orden que conviene.",
    keywords: "anuncio anuncios ads mandala creativo campaña" },
  { key: "Hooks", group: "crear", icon: Quote,
    title: "Ganchos que atrapan", nav: "Ganchos (hooks)",
    desc: "Primeras frases de anuncios reales, listas para adaptar.",
    keywords: "ganchos hooks frases titulares atencion" },
  { key: "Generadores", group: "crear", icon: FileText,
    title: "Copys y textos", nav: "Generadores de textos",
    desc: "Textos de anuncios, guiones, correos y páginas de venta.",
    keywords: "copy copys textos guion guiones correo email pagina de venta landing generador" },
  { key: "Sin mostrar tu cara", group: "crear", icon: UserRound,
    title: "Vende sin mostrar tu cara", nav: "Sin mostrar tu cara",
    desc: "Un personaje hecho con IA y sus guiones para Reels y TikTok.",
    keywords: "personaje avatar sin cara reels tiktok guiones ia" },
  { key: "Media Studio", group: "crear", icon: Video,
    title: "Video con presentador IA", nav: "Media Studio (videos)",
    desc: "Videos cortos con un presentador hecho con IA.",
    keywords: "video videos avatar presentador media studio" },
  { key: "Validar", group: "crear", icon: ClipboardCheck,
    title: "Validar mi idea", nav: "Validar mi idea",
    desc: "Preguntas de sí o no para saber si tu producto se vende.",
    keywords: "validar validacion matriz idea" },
  { key: "Plan", group: "crear", icon: ListTodo,
    title: "Plan de lanzamiento", nav: "Plan de lanzamiento",
    desc: "Tus tareas con fecha para lanzar en unos 14 días.",
    keywords: "plan lanzamiento tareas checklist" },
  // Vender
  { key: "Contenido", group: "vender", icon: CalendarDays,
    title: "Calendario de contenido", nav: "Calendario de contenido",
    desc: "Ideas con demanda real para publicar sin pagar anuncios.",
    keywords: "contenido calendario publicaciones organico posts reels" },
  { key: "Recuperar", group: "vender", icon: MessageCircle,
    title: "Recuperar ventas", nav: "Recuperar ventas",
    desc: "Mensajes de WhatsApp para quien casi compra.",
    keywords: "recuperar ventas whatsapp carrito abandonado mensajes" },
  // Ganar
  { key: "Precio", group: "ganar", icon: Calculator,
    title: "Precio y ganancia", nav: "Precio y ganancia",
    desc: "Cuánto te queda por venta y cuánto puedes pagar en anuncios.",
    keywords: "precio ganancia margen cpa calculadora cuanto cobrar" },
  { key: "Resultados", group: "ganar", icon: BarChart3,
    title: "¿Qué anuncio apago o escalo?", nav: "Resultados de anuncios",
    desc: "Anota gasto y ventas: la app te dice qué hacer.",
    keywords: "resultados metricas medir escalar apagar ctr gasto ventas" },
];

/** Pantallas en pausa que no son de ningún grupo: solo las ve un admin, al final del menú. */
export const ADMIN_EXTRA_TOOLS: Tool[] = [
  { key: "Mercado", group: "encontrar", icon: Store, title: "Mercado: qué vender", nav: "Mercado: qué vender",
    desc: "Productos para vender como afiliado.", keywords: "mercado afiliado comision" },
  { key: "Oráculo", group: "encontrar", icon: Telescope, title: "Analizar una página de ventas", nav: "Oráculo",
    desc: "Pega el enlace de una página de ventas y te explica qué vende.", keywords: "oraculo landing pagina analizar revisar" },
];
