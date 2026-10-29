import {
  Gem, Trophy, Boxes, Quote, Radar, Clapperboard, LayoutTemplate, Image, Megaphone, Captions, UserRound, FileText,
  CalendarDays, LayoutGrid, BookOpen, Calculator, Fingerprint, FolderKanban, Orbit, BarChart3, ListTodo, MessageCircle,
  Stethoscope, MonitorPlay, Wand2, Youtube, Upload, ScrollText, Eraser, ClipboardCheck, ShoppingBag, Lightbulb, Briefcase,
  type LucideIcon,
} from "lucide-react";

/**
 * El menú de SUPERNOVA (29-oct-2026, Jean: «organiza el menú mejor, más Apple, intuitivo y menos frustrante para buscar y
 * encontrar»). Reemplaza los dos menús que convivían (el árbol de admin y las «vías» con «Más herramientas»).
 *
 * Reglas:
 *  · Cada herramienta a UN toque, con su nombre de siempre. Nada de hojas con pestañas escondidas.
 *  · Cuatro secciones por lo que la persona quiere hacer (manual: navegación por intención), en el orden en que se usan.
 *  · Lo de uso raro va en «Más herramientas», plegado. Nada se borra: las direcciones viejas (#/…) siguen abriendo y el
 *    buscador (⌘K) lo encuentra todo.
 *  · `page` es la pantalla de Index.tsx; `hash` cuando es un paso dentro de una pantalla; `generator` para Textos.
 */
export type MenuItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  page: string;
  hash?: string;
  generator?: string;
  /** Mirar es gratis. */
  free?: boolean;
  /** Solo la cuenta de Jean mientras lo prueba. */
  owner?: boolean;
};
export type MenuSection = { id: string; title: string; items: MenuItem[]; /** Plegada al entrar por primera vez. */ folded?: boolean };

export const MENU: MenuSection[] = [
  { id: "encuentra", title: "Encuentra qué vender", items: [
    { id: "ofertas", label: "Ofertas que venden", icon: Gem, page: "Ofertas", free: true },
    { id: "radar", label: "Radar de anuncios", icon: Trophy, page: "Buscar Ofertas Winner", free: true },
    { id: "miniapps", label: "Mini Apps", icon: Boxes, page: "Mini Apps", free: true },
    { id: "ganchos", label: "Ganchos que atrapan", icon: Quote, page: "Hooks", free: true },
    { id: "nichosyt", label: "Nichos de YouTube", icon: Radar, page: "Nichos YouTube", free: true },
  ] },
  { id: "crea", title: "Crea", items: [
    { id: "reelstudio", label: "Reel Studio", icon: Clapperboard, page: "Con tu cara", hash: "#/con-tu-cara/reel-ia" },
    { id: "carrusel", label: "Carrusel", icon: LayoutTemplate, page: "Carrusel" },
    { id: "creativos", label: "Imágenes para anuncios", icon: Image, page: "Creativos" },
    { id: "videoanuncio", label: "Video con IA", icon: Megaphone, page: "Video anuncio" },
    { id: "analizareel", label: "Analiza un Reel", icon: Captions, page: "Con tu cara", hash: "#/con-tu-cara/reel" },
    { id: "personaje", label: "Influencer IA", icon: UserRound, page: "Sin mostrar tu cara" },
    { id: "copy", label: "Textos que venden", icon: FileText, page: "Generadores" },
    { id: "contenido", label: "Calendario", icon: CalendarDays, page: "Contenido" },
  ] },
  { id: "negocio", title: "Tu negocio", items: [
    { id: "versiones", label: "Mis versiones", icon: LayoutGrid, page: "Productos" },
    { id: "producto", label: "Crear producto", icon: BookOpen, page: "Crear producto" },
    { id: "precio", label: "Precio y números", icon: Calculator, page: "Precio" },
    { id: "adn", label: "Tu ADN", icon: Fingerprint, page: "Tu ADN" },
    { id: "proyectos", label: "Lo que creaste", icon: FolderKanban, page: "Proyectos" },
  ] },
  { id: "vende", title: "Vende y mide", items: [
    { id: "anuncios", label: "Tus anuncios", icon: Orbit, page: "Mándala" },
    { id: "resultados", label: "Resultados", icon: BarChart3, page: "Resultados" },
    { id: "plan", label: "Plan de lanzamiento", icon: ListTodo, page: "Plan" },
    { id: "recuperar", label: "Recuperar ventas", icon: MessageCircle, page: "Recuperar" },
    { id: "diagnostico", label: "Diagnóstico", icon: Stethoscope, page: "Diagnóstico", free: true },
  ] },
  { id: "mas", title: "Más herramientas", folded: true, items: [
    { id: "miniaturas", label: "Miniaturas", icon: MonitorPlay, page: "Miniaturas" },
    { id: "estudioavatar", label: "Estudio de avatar", icon: Wand2, page: "Estudio de avatar" },
    { id: "creadoryt", label: "Videos para YouTube", icon: Youtube, page: "Creador YouTube" },
    { id: "subetuvideo", label: "Sube tu video", icon: Upload, page: "Con tu cara", hash: "#/con-tu-cara/video" },
    { id: "teleprompter", label: "Teleprompter", icon: ScrollText, page: "Con tu cara", hash: "#/con-tu-cara/teleprompter" },
    { id: "historia", label: "Mi historia animada", icon: Clapperboard, page: "Con tu cara", hash: "#/con-tu-cara/historia", owner: true },
    { id: "quitarmarca", label: "Quitar marca de agua", icon: Eraser, page: "Quitar marca", free: true },
    { id: "validar", label: "Validar mi idea", icon: ClipboardCheck, page: "Validar" },
    { id: "bump", label: "Order bump", icon: ShoppingBag, page: "Order bump" },
    { id: "dolores", label: "Descubrir dolores", icon: Lightbulb, page: "Crear" },
    { id: "ficha", label: "Mi ficha", icon: Briefcase, page: "Mi negocio" },
  ] },
];

export const MENU_ITEMS: MenuItem[] = MENU.flatMap(s => s.items);

/** El elemento del menú que corresponde a la pantalla abierta (el paso dentro de ella manda: Reel Studio ≠ Analiza). */
export function menuItemFor(page: string, hash: string): MenuItem | null {
  const dePagina = MENU_ITEMS.filter(i => i.page === page);
  if (!dePagina.length) return null;
  return dePagina.find(i => i.hash && hash.startsWith(i.hash)) ?? dePagina.find(i => !i.hash) ?? dePagina[0];
}

// ---------- Recientes: las 3 últimas herramientas que abriste (solo en este navegador) ----------
const RECENT_KEY = "supernova:menu-recent";
export function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 3) : [];
  } catch { return []; }
}
export function pushRecent(id: string): string[] {
  const next = [id, ...readRecent().filter(x => x !== id)].slice(0, 3);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
  return next;
}

// ---------- Secciones plegadas (se recuerdan) ----------
const FOLD_KEY = "supernova:menu-folded";
export function readFolded(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(FOLD_KEY) ?? "{}") ?? {}; } catch { return {}; }
}
export function saveFolded(v: Record<string, boolean>) {
  try { localStorage.setItem(FOLD_KEY, JSON.stringify(v)); } catch { /* sin almacenamiento */ }
}

/** Abre un elemento del menú: pantalla, paso dentro de ella o generador. */
export function openMenuItem(item: MenuItem, onNavigate: (page: string) => void) {
  if (item.page === "Generadores") {
    try { sessionStorage.removeItem("supernova:tree-generator"); } catch { /* sin almacenamiento */ }
  }
  if (item.hash) {
    if (window.location.hash !== item.hash) window.location.hash = item.hash; // Index escucha hashchange
    window.scrollTo({ top: 0 });
    return;
  }
  onNavigate(item.page);
}
