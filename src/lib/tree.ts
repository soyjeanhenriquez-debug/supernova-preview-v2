import { useCallback, useEffect, useState } from "react";
import { Compass, Wrench, Sparkles, Users, type LucideIcon } from "lucide-react";
import { useFeatureAccess } from "@/lib/features";

/**
 * El árbol de SUPERNOVA (decisión de Jean, 21-oct-2026; boceto aprobado: "Árbol de SUPERNOVA").
 * Un solo mapa para el menú, el Inicio, el teléfono y las migas: Hoy (Tu norte) + 4 ramas numeradas
 * con 14 hojas, en el orden en que se usan. Reemplaza los 4 mapas que convivían (las 2 vías, las 6
 * pestañas del Inicio, las 6 etapas de "Tu camino" y "Más herramientas").
 *
 * Cada hoja agrupa pantallas que YA existen (sus "pestañas"): no se borra ni se mueve ninguna, y cada
 * dirección vieja (#/…) sigue abriendo. Por ahora solo lo ven los admin (useTreeMenu).
 */

export type TreeTab = {
  label: string;
  /** Pantalla de Index.tsx que abre. */
  page: string;
  /** Generador concreto de "Textos que venden" (lo lee GeneradoresPage al montarse). */
  generator?: string;
  /** Dirección completa cuando la pestaña es un paso dentro de una pantalla (#/con-tu-cara/reel). */
  hash?: string;
  desc?: string;
  /** Formato del curso que todavía no está: se ve con "Pronto" y no abre nada. */
  soon?: boolean;
  /** Solo la cuenta de Jean mientras lo prueba (isGenjutsuOwner). */
  owner?: boolean;
  /** Plantilla con la que abre Video UGC paso a paso ("ugc" = sin producto, "producto"). */
  preset?: "ugc" | "producto";
};
export type TreeDoor = { id: string; name: string; tabs: TreeTab[] };
export type TreeLeaf = {
  id: string;
  name: string;
  desc: string;
  /** Mirar es gratis (los mismos que dicen "Gratis" en src/lib/tools.ts). */
  free?: boolean;
  tabs: TreeTab[];
  /** Video: tres puertas (sin tu cara, con tu cara, YouTube). La hoja abre su propia pantalla. */
  doors?: TreeDoor[];
};
export type TreeBranch = { id: string; n: 1 | 2 | 3 | 4; name: string; short: string; q: string; icon: LucideIcon; leaves: TreeLeaf[] };

// 24-oct-2026: primera puerta "Por formato", con los formatos del curso de UGC de Jean (4.1 UGC … 4.7 Ugly Ads).
// Los que aún no tienen herramienta se ven con "Pronto". Las demás puertas quedan como herramientas sueltas.
const VIDEO_DOORS: TreeDoor[] = [
  { id: "formatos", name: "Por formato", tabs: [
    { label: "UGC sin producto", page: "Video anuncio", preset: "ugc", desc: "Solo la persona hablando a cámara: el producto no aparece. 4 pasos guiados." },
    { label: "UGC con producto", page: "Video anuncio", preset: "producto", desc: "La persona lo sostiene o lo señala mientras habla. 4 pasos guiados." },
    { label: "Voz en off", page: "Con tu cara", hash: "#/con-tu-cara/reel-ia", desc: "Tu voz sobre imágenes al ritmo de cada frase, capturas reales y tú al inicio y al final." },
    { label: "Imágenes estáticas", page: "Creativos", desc: "Anuncios en imagen listos para publicar." },
    { label: "Podcast", page: "Video anuncio", soon: true, desc: "Dos personas conversando frente al micrófono." },
    { label: "Dualcast", page: "Video anuncio", soon: true, desc: "Producción y edición en un mismo video." },
    { label: "Trends virales", page: "Video anuncio", soon: true, desc: "Tu versión de lo que se está haciendo viral." },
    { label: "Ugly Ads", page: "Video anuncio", soon: true, desc: "Anuncios simples y crudos que no parecen anuncio." },
  ] },
  { id: "sin-cara", name: "Sin tu cara", tabs: [
    { label: "Video con IA", page: "Video anuncio", desc: "Anuncio de 3 tomas, escena libre, serie o motion graphics." },
    { label: "Influencer IA", page: "Sin mostrar tu cara", desc: "Tu personaje habla por ti en video." },
    { label: "Estudio de avatar", page: "Estudio de avatar", desc: "Fotos y videos de tu avatar: ropa, ángulos, tu producto." },
  ] },
  { id: "con-cara", name: "Con tu cara", tabs: [
    { label: "Analiza un Reel", page: "Con tu cara", hash: "#/con-tu-cara/reel", desc: "Por qué funciona cualquier Reel y tu versión para grabar." },
    { label: "Sube tu video", page: "Con tu cara", hash: "#/con-tu-cara/video", desc: "Subtítulos, gancho y edición de lo que ya grabaste." },
    { label: "Teleprompter", page: "Con tu cara", hash: "#/con-tu-cara/teleprompter", desc: "Lee tu guion mirando a la cámara." },
    { label: "Reel Studio", page: "Con tu cara", hash: "#/con-tu-cara/reel-ia", desc: "Recrea un reel que funciona o créalo desde tu idea: voz, tus looks y tú hablando." },
    { label: "Mi historia animada", page: "Con tu cara", hash: "#/con-tu-cara/historia", owner: true, desc: "Tu historia real con tu personaje en 3D." },
  ] },
  { id: "youtube", name: "YouTube", tabs: [
    { label: "Videos para YouTube", page: "Creador YouTube", desc: "Del guion al video terminado, para canales sin cara." },
    { label: "Guion de YouTube", page: "Generadores", generator: "yt-script", desc: "Videos largos que posicionan y venden." },
    { label: "Quitar marca de agua", page: "Quitar marca", desc: "Tu video de Gemini, Omni Flash o Veo sin la marca. Gratis." },
  ] },
];

export const TREE: TreeBranch[] = [
  { id: "encontrar", n: 1, name: "Encuentra qué vender", short: "Encuentra", q: "¿Qué vendo?", icon: Compass, leaves: [
    { id: "lanzar", name: "Elige qué lanzar", free: true, desc: "Ulises te propone 3 negocios que ya venden y te deja el plan con el equipo.", tabs: [
      { label: "Elige qué lanzar", page: "Lanzar" },
    ] },
    { id: "ofertas", name: "Ofertas que venden", free: true, desc: "Negocios digitales que ya venden, con su precio y su embudo.", tabs: [
      { label: "Ofertas", page: "Ofertas" }, { label: "Mini Apps", page: "Mini Apps" },
    ] },
    { id: "radar", name: "Radar de anuncios", free: true, desc: "Los anuncios que más días llevan pagándose: la mejor prueba de que venden.", tabs: [
      { label: "Radar", page: "Buscar Ofertas Winner" }, { label: "Ganchos", page: "Hooks" }, { label: "Dolores", page: "Crear" },
    ] },
    { id: "nichos", name: "Nichos de YouTube", free: true, desc: "Los videos que más crecieron este mes y su ingreso estimado.", tabs: [
      { label: "Nichos de YouTube", page: "Nichos YouTube" },
    ] },
  ] },
  { id: "armar", n: 2, name: "Arma tu negocio", short: "Arma", q: "¿Qué ofrezco y a cuánto?", icon: Wrench, leaves: [
    { id: "oferta", name: "Tu oferta", desc: "Tu versión, qué vendes y cómo hablas, en un solo lugar.", tabs: [
      { label: "Mis versiones", page: "Productos" }, { label: "Mi ficha", page: "Mi negocio" }, { label: "Tu ADN", page: "Tu ADN" },
      { label: "Lo que creaste", page: "Proyectos" }, { label: "Order bump", page: "Order bump" },
    ] },
    { id: "precio", name: "Tu precio y tus números", desc: "Cuánto te queda por venta y cuánto puedes pagar en anuncios por cada una.", tabs: [
      { label: "Precio y ganancia", page: "Precio" }, { label: "Validar mi idea", page: "Validar" },
    ] },
    { id: "producto", name: "Tu producto", desc: "Ebook, curso o reto, capítulo por capítulo.", tabs: [
      { label: "Crear producto", page: "Crear producto" },
    ] },
  ] },
  { id: "crear", n: 3, name: "Crea tu contenido", short: "Crea", q: "¿Qué publico?", icon: Sparkles, leaves: [
    { id: "imagenes", name: "Imágenes", desc: "Anuncios, fotos y carruseles listos para publicar.", tabs: [
      { label: "Creativos y fotos", page: "Creativos" }, { label: "Carrusel", page: "Carrusel" }, { label: "Miniaturas", page: "Miniaturas" },
    ] },
    { id: "video", name: "Video", desc: "Con IA, con avatar o con tu cara.", tabs: VIDEO_DOORS.flatMap(d => d.tabs), doors: VIDEO_DOORS },
    { id: "textos", name: "Textos", desc: "Lo que se lee y se dice para vender.", tabs: [
      { label: "Todos", page: "Generadores" },
      { label: "Página de ventas", page: "Generadores", generator: "landing-copy" },
      { label: "Guion de VSL", page: "Generadores", generator: "vsl-main" },
      { label: "Correos", page: "Generadores", generator: "email-sequence" },
      { label: "Mensajes por DM", page: "Generadores", generator: "dm-script" },
      { label: "Guiones de Reels", page: "Generadores", generator: "reels-script" },
      { label: "Textos de posts", page: "Generadores", generator: "captions-ig" },
      { label: "Oferta de ascensión", page: "Generadores", generator: "ascension-offer" },
    ] },
    { id: "calendario", name: "Calendario", desc: "Qué publicar cada día, con ideas que tienen demanda real.", tabs: [
      { label: "Calendario de contenido", page: "Contenido" },
    ] },
  ] },
  { id: "clientes", n: 4, name: "Consigue clientes", short: "Clientes", q: "¿Cómo vendo y qué funciona?", icon: Users, leaves: [
    { id: "anuncios", name: "Tus anuncios", desc: "Crea tus anuncios, anota sus números y mira cuál apagar o escalar.", tabs: [
      { label: "La rueda", page: "Mándala" }, { label: "Resultados", page: "Resultados" },
    ] },
    { id: "lanzamiento", name: "Tu lanzamiento", desc: "Tus tareas con fecha para lanzar.", tabs: [
      { label: "Plan de lanzamiento", page: "Plan" },
    ] },
    { id: "recuperar", name: "Recuperar ventas", desc: "Mensajes de WhatsApp para quien casi compra.", tabs: [
      { label: "Recuperar ventas", page: "Recuperar" },
    ] },
    { id: "diagnostico", name: "Diagnóstico", free: true, desc: "Anota tus números y ve qué paso frena las ventas.", tabs: [
      { label: "Diagnóstico del embudo", page: "Diagnóstico" },
    ] },
  ] },
];

export const TREE_PAGE = "Paso";
export const TREE_SLUG = "paso";

/** Dónde vive una pantalla en el árbol (la primera hoja que la nombra). */
export type TreeSpot = { branch: TreeBranch; leaf: TreeLeaf; tab: TreeTab; door?: TreeDoor };

/** La pestaña que coincide con la pantalla, el paso dentro de ella (hash) y el generador abierto. */
export function treeSpot(page: string, hash = "", generator?: string | null): TreeSpot | null {
  let best: TreeSpot | null = null;
  let bestScore = -1;
  for (const branch of TREE) for (const leaf of branch.leaves) {
    for (const tab of leaf.tabs) {
      if (tab.page !== page) continue;
      // Mejor coincidencia: mismo paso (#/con-tu-cara/reel…) o mismo generador; si no, la primera.
      const score = (tab.hash && hash.startsWith(tab.hash) ? 2 : 0) + (tab.generator && tab.generator === generator ? 2 : 0) + (!tab.hash && !tab.generator ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = { branch, leaf, tab, door: leaf.doors?.find(d => d.tabs.includes(tab)) };
      }
    }
  }
  return best;
}

export const branchById = (id: string) => TREE.find(b => b.id === id) ?? null;
export const leafById = (id: string) => {
  for (const branch of TREE) for (const leaf of branch.leaves) if (leaf.id === id) return { branch, leaf };
  return null;
};

/** Dirección de una rama o de una hoja con puertas: #/paso/<rama>[/<hoja>]. */
export const treeHash = (branchId: string, leafId?: string) => `#/${TREE_SLUG}/${branchId}${leafId ? `/${leafId}` : ""}`;

// ---------- Avance por rama (sale de las 6 etapas de src/lib/journey.ts, sin consultas nuevas) ----------
/**
 * Hecho por rama, con las mismas reglas que "Tu camino":
 *  1 Encuentra: tu ficha tiene qué vendes, para quién y qué logra (etapa 1).
 *  2 Arma: precio elegido y producto/cobro listos (etapas 3 y 4; validar es opcional).
 *  3 Crea: tus primeros 5 anuncios (etapa 5).
 *  4 Clientes: anotaste resultados y armaste tu recuperación (etapa 6).
 */
export function branchDone(done: boolean[]): [boolean, boolean, boolean, boolean] {
  return [!!done[0], !!done[2] && !!done[3], !!done[4], !!done[5]];
}

/** La siguiente acción concreta: una sola, para "Tu norte". */
export function nextAction(done: boolean[]): { branch: number; title: string; line: string; page: string; cta: string } {
  if (!done[0]) return { branch: 1, title: "Elige una oferta que ya vende", line: "Mirar es gratis. Toca «Hacer mi versión» en la que te guste y quedará como tu oferta.", page: "Ofertas", cta: "Ver ofertas que venden" };
  if (!done[2]) return { branch: 2, title: "Ponle precio a tu oferta", line: "La calculadora te dice cuánto te queda por venta y cuánto puedes pagar en anuncios.", page: "Precio", cta: "Hacer mis números" };
  if (!done[3]) return { branch: 2, title: "Prepara tu producto y tu cobro", line: "Tus tareas con fecha: el producto, la página y cómo te pagan.", page: "Plan", cta: "Ver mis tareas" };
  if (!done[4]) return { branch: 3, title: "Crea tus primeros anuncios", line: "La rueda te escribe 5, uno por uno, en el orden que conviene con poco presupuesto.", page: "Mándala", cta: "Crear mis anuncios" };
  if (!done[5]) return { branch: 4, title: "Anota los números de tus anuncios", line: "A los 3 días de publicar: gasto, CTR y ventas. Te decimos cuál apagar y cuál escalar.", page: "Resultados", cta: "Anotar números" };
  return { branch: 4, title: "Escala lo que funciona", line: "Pide variaciones de tu ganador y súbele el presupuesto poco a poco.", page: "Resultados", cta: "Ver mis anuncios" };
}

// ---------- Interruptor (solo admin mientras se prueba) ----------
const TREE_KEY = "supernova:tree-menu";
const TREE_EVENT = "supernova:tree-menu-changed";

/** El árbol se ve solo si eres admin y no lo apagaste ("Ver menú anterior"). */
export function useTreeMenu() {
  const { isAdmin } = useFeatureAccess();
  const read = () => { try { return localStorage.getItem(TREE_KEY) !== "0"; } catch { return true; } };
  const [pref, setPref] = useState(read);
  useEffect(() => {
    const sync = () => setPref(read());
    window.addEventListener(TREE_EVENT, sync);
    return () => window.removeEventListener(TREE_EVENT, sync);
  }, []);
  const setTree = useCallback((on: boolean) => {
    try { localStorage.setItem(TREE_KEY, on ? "1" : "0"); } catch { /* sin almacenamiento */ }
    setPref(on);
    window.dispatchEvent(new Event(TREE_EVENT));
  }, []);
  return { enabled: isAdmin && pref, isAdmin, setTree };
}

/** Abre una pestaña del árbol: pantalla, paso dentro de ella o generador concreto. */
export const VIDEO_PRESET_KEY = "supernova:video-preset";

export function openTreeTab(tab: TreeTab, onNavigate: (page: string) => void) {
  if (tab.soon) return;
  if (tab.preset) { try { sessionStorage.setItem(VIDEO_PRESET_KEY, tab.preset); } catch { /* sin almacenamiento */ } }
  if (tab.generator) {
    try { localStorage.setItem("supernova_generator_prefill", JSON.stringify({ generator: tab.generator })); } catch { /* sin almacenamiento */ }
    try { sessionStorage.setItem("supernova:tree-generator", tab.generator); } catch { /* sin almacenamiento */ }
  } else if (tab.page === "Generadores") {
    try { sessionStorage.removeItem("supernova:tree-generator"); } catch { /* sin almacenamiento */ }
  }
  if (tab.hash) {
    if (window.location.hash !== tab.hash) window.location.hash = tab.hash; // Index escucha hashchange
    window.scrollTo({ top: 0 });
    return;
  }
  onNavigate(tab.page);
}

/** La dirección actual, al día con Atrás/Adelante y con los pasos dentro de una pantalla. */
export function useLocationHash() {
  const [hash, setHash] = useState(() => (typeof window === "undefined" ? "" : window.location.hash));
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    // useSubRoute cambia la dirección con pushState (sin evento): se revisa también al tocar la página.
    const t = window.setInterval(sync, 700);
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener("popstate", sync); window.clearInterval(t); };
  }, []);
  return hash;
}

/** El generador abierto desde el árbol (para marcar su pestaña). */
export function currentTreeGenerator(): string | null {
  try { return sessionStorage.getItem("supernova:tree-generator"); } catch { return null; }
}
