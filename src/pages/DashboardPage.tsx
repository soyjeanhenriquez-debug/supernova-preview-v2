import { useEffect, useMemo, useState } from "react";
import { IntentBox } from "@/components/create/IntentBox";
import { ChevronRight, Coins, FileText, BookOpen, Orbit, FolderKanban, Lock, PlayCircle, Image as ImageIcon, Video, Search, X, LayoutGrid, List, Sparkles, Send } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts } from "@/contexts/ProductContext";
import { supabase } from "@/integrations/supabase/client";
import { useFeatureAccess } from "@/lib/features";
import { TOOLS, ADMIN_EXTRA_TOOLS, HOME_CATEGORIES, MERGED_INTO, NEXT_STEP_TOOLS, VIAS, openTool, useVia, searchTools, normText, type Tool } from "@/lib/tools";
import { ToolThumb } from "@/components/dashboard/ToolThumb";
import { ASK_ASSISTANT_EVENT } from "@/components/HelpAssistant";
import { track } from "@/lib/analytics";
import { TodayOffers } from "@/components/dashboard/TodayOffers";
import { RoiHunterWidget } from "@/components/dashboard/RoiHunterWidget";
import { BusinessJourney } from "@/components/journey/BusinessJourney";
import { OPEN_TOUR_EVENT } from "@/components/OnboardingTour";
import { useVitrina } from "@/contexts/VitrinaContext";
import { useVitrinaSample, SampleOffers } from "@/components/LockedToolPage";
import { TUTORIALS } from "@/lib/tutorials";
import { ResultsCheckIn } from "@/components/dashboard/ResultsCheckIn";

/**
 * Inicio = "Hoy" (una sola puerta, decisión de Jean del 12-oct-2026): arriba la frase de la app; debajo
 * 3 ofertas que llevan más de 90 días pagando anuncios, con su creativo y el botón «Hacer mi versión»;
 * luego "Siguiente paso" (Creativos, Carrusel, Video, Textos que venden) y "Tus creaciones". Todo lo
 * demás (las pestañas de herramientas, los modelos de negocio, el camino de 6 etapas y las ofertas que
 * sigues) queda plegado en "Más herramientas y tu camino": nada se borró. En pantallas grandes, columna
 * derecha con créditos y el asistente.
 */
const HOME_PHRASE = "Elige un negocio digital que lleva más de 90 días pagando anuncios y haz tu versión en español.";
interface Props { onNavigate: (p: string) => void; }

const JOURNEY_OPEN_KEY = "supernova:home-journey-open";
const MORE_OPEN_KEY = "supernova:home-more-open";

type Recent = { id: string; title: string; kind: string; at: string; icon: typeof FileText; open: () => void };

/** Pantalla del estudio de video según el tipo de trabajo (columna video_jobs.kind). */
const VIDEO_PAGE: Record<string, { page: string; label: string }> = {
  anuncio: { page: "Video anuncio", label: "Video anuncio" },
  ugc: { page: "UGC con IA", label: "UGC con IA" },
  serie: { page: "Series", label: "Escena de serie" },
  clip: { page: "Video IA", label: "Video con IA" },
};

/**
 * Lo último que creó en el producto activo: lecturas pequeñas (máx. 4 filas cada una), sin textos
 * largos. Las imágenes salen del bucket "creativos" (<uid>/<producto>, solo nombres y fechas, sin
 * firmar URLs) y los videos de las últimas 24 h de video_jobs (sus enlaces caducan: hay que bajarlos).
 */
function useRecentWork(onNavigate: (p: string) => void) {
  const { activeId } = useProducts();
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const { canSee } = useFeatureAccess();
  const builderOn = canSee("Crear producto");
  const [items, setItems] = useState<Recent[] | null>(null);

  useEffect(() => {
    if (!activeId) { setItems([]); return; }
    let alive = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const empty = Promise.resolve({ data: [] });
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const videoQuery = (cols: string) => db.from("video_jobs").select(cols)
      .eq("user_id", uid).eq("status", "done").gte("created_at", since)
      .order("created_at", { ascending: false }).limit(4);
    Promise.all([
      db.from("product_assets").select("id,name,kind,updated_at").eq("product_id", activeId)
        .order("updated_at", { ascending: false }).limit(4),
      db.from("mandala_ads").select("id,angle,stage,updated_at").eq("product_id", activeId)
        .order("updated_at", { ascending: false }).limit(4),
      builderOn
        ? db.from("product_builds").select("id,title,format,updated_at").eq("product_id", activeId)
          .order("updated_at", { ascending: false }).limit(4)
        : empty,
      uid
        ? supabase.storage.from("creativos").list(`${uid}/${activeId}`, { limit: 4, sortBy: { column: "created_at", order: "desc" } })
          .then(r => ({ data: r.data ?? [] }), () => ({ data: [] }))
        : empty,
      uid
        // Sin la columna "kind" (migración 20261004040000 sin aplicar) se reintenta sin ella.
        // Las escenas de "Producir video" (kind yt_scene, varias por video) no van aquí: viven dentro
        // de su producción en el Creador de YouTube y llenarían los espacios.
        ? videoQuery("id,prompt,kind,created_at").neq("kind", "yt_scene")
          .then((r: { data: unknown; error: unknown }) => (r.error ? videoQuery("id,prompt,created_at") : r))
        : empty,
    ]).then(([assets, ads, builds, images, videos]) => {
      if (!alive) return;
      const list: Recent[] = [
        ...((assets.data ?? []) as { id: string; name: string; updated_at: string }[]).map(r => ({
          id: `a-${r.id}`, title: r.name || "Proyecto guardado", kind: "Proyecto", at: r.updated_at, icon: FolderKanban,
          open: () => onNavigate("Proyectos"),
        })),
        ...((ads.data ?? []) as { id: string; angle: string; stage: string; updated_at: string }[]).map(r => ({
          id: `m-${r.id}`, title: r.angle || "Anuncio", kind: `Anuncio · ${r.stage}`, at: r.updated_at, icon: Orbit,
          open: () => onNavigate("Mándala"),
        })),
        ...((builds.data ?? []) as { id: string; title: string; format: string; updated_at: string }[]).map(r => ({
          id: `b-${r.id}`, title: r.title || "Mi producto", kind: r.format === "curso" ? "Curso" : r.format === "reto" ? "Reto" : "Ebook",
          at: r.updated_at, icon: BookOpen,
          open: () => { try { sessionStorage.setItem("supernova.openBuild", r.id); } catch { /* sin almacenamiento */ } onNavigate("Crear producto"); },
        })),
        ...((images.data ?? []) as { name: string; created_at?: string | null }[])
          .filter(f => f.name.endsWith(".webp") && f.created_at)
          .map(f => ({
            id: `i-${f.name}`, title: "Imagen creada con IA", kind: "Imagen", at: f.created_at as string, icon: ImageIcon,
            open: () => onNavigate("Creativos"),
          })),
        ...((videos.data ?? []) as { id: string; prompt: string | null; kind?: string | null; created_at: string }[]).map(r => {
          const v = VIDEO_PAGE[r.kind ?? "clip"] ?? VIDEO_PAGE.clip;
          return {
            id: `v-${r.id}`, title: (r.prompt || v.label).split("\n")[0].slice(0, 80), kind: `${v.label} · descárgalo hoy`, at: r.created_at, icon: Video,
            open: () => onNavigate(v.page),
          };
        }),
      ].sort((x, y) => y.at.localeCompare(x.at)).slice(0, 6);
      setItems(list);
    }).catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [activeId, builderOn, onNavigate, uid]);

  return items;
}

function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short" });
}

const VIEW_KEY = "supernova:home-view";
const CAT_KEY = "supernova:home-cat";

const norm = normText;

/** Preguntas de un toque para el asistente (es gratis, con tope diario en el servidor). */
const ASK_SUGGESTIONS = [
  "Empiezo de cero: ¿qué herramienta uso primero?",
  "¿Cómo hago mi primer anuncio para Meta?",
  "¿Qué negocio digital me conviene vender por WhatsApp?",
];

function CardBadge({ tool, locked, featured }: { tool: Tool; locked?: boolean; featured?: boolean }) {
  if (locked) return <span className="inline-flex items-center gap-1 rounded-full bg-background/80 border border-border px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground"><Lock className="w-3 h-3" /> PRO</span>;
  if (featured ?? tool.featured) return <span className="rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-[10px] font-semibold tracking-wide">Empieza aquí</span>;
  return null;
}

/**
 * Tarjeta con miniatura: se toca y se empieza. `featured` fuerza el "Empieza aquí". `tour` = false
 * cuando la misma herramienta sale dos veces (el recorrido de 1 minuto apunta a la de "Siguiente paso").
 */
function ToolCard({ tool, onOpen, locked, featured, tour = true }: { tool: Tool; onOpen: () => void; locked?: boolean; featured?: boolean; tour?: boolean }) {
  const Icon = tool.icon;
  const hot = featured || tool.featured;
  return (
    <button
      onClick={onOpen}
      data-tour={tour ? `home-${tool.id}` : undefined}
      className={`group relative text-left rounded-2xl border overflow-hidden flex flex-col transition-colors ${
        hot ? "border-primary/50 bg-primary/[0.04] hover:border-primary" : "border-border bg-card/40 hover:border-foreground/30 hover:bg-card/70"
      }`}
    >
      <ToolThumb toolId={tool.id} className="aspect-[16/9] border-b border-border/70 transition-transform duration-300 group-hover:scale-[1.03] origin-bottom" />
      <span className="absolute top-2.5 right-2.5"><CardBadge tool={tool} locked={locked} featured={hot} /></span>
      <span className="relative px-3.5 md:px-4 pb-3.5 md:pb-4 flex flex-col flex-1">
        <span className={`-mt-[18px] mb-2.5 w-9 h-9 rounded-xl border bg-background flex items-center justify-center ${hot ? "border-primary/50 text-primary" : "border-border text-foreground"}`}>
          <Icon className="w-[17px] h-[17px]" strokeWidth={1.7} />
        </span>
        <span className="block font-display font-semibold text-[13.5px] md:text-[15px] leading-snug text-foreground">{tool.title}</span>
        <span className="block mt-1 text-[11.5px] md:text-[12px] leading-snug text-muted-foreground line-clamp-2">{tool.desc}</span>
        <span className="mt-auto pt-3 flex items-center justify-between gap-2">
          <span className="text-[11px] tabular-nums text-muted-foreground/80 truncate">{tool.cost ?? ""}</span>
          <span className="shrink-0 inline-flex items-center gap-0.5 text-[12px] font-semibold text-foreground opacity-70 group-hover:opacity-100 group-hover:text-primary transition-colors">
            Empezar <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </span>
      </span>
    </button>
  );
}

/** La misma herramienta en modo lista (más compacto, cómodo en el teléfono). */
function ToolRow({ tool, onOpen, locked, featured }: { tool: Tool; onOpen: () => void; locked?: boolean; featured?: boolean }) {
  const Icon = tool.icon;
  const hot = featured || tool.featured;
  return (
    <button onClick={onOpen} className={`group w-full flex items-center gap-3 text-left rounded-xl border px-2.5 py-2.5 transition-colors ${
      hot ? "border-primary/50 bg-primary/[0.04] hover:border-primary" : "border-border bg-card/40 hover:border-foreground/30"
    }`}>
      <ToolThumb toolId={tool.id} className="w-[72px] h-[44px] rounded-lg border border-border/70 shrink-0" />
      <Icon className={`w-4 h-4 shrink-0 hidden sm:block ${hot ? "text-primary" : "text-muted-foreground"}`} strokeWidth={1.7} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-display font-semibold text-[13.5px] text-foreground truncate">{tool.title}</span>
          <CardBadge tool={tool} locked={locked} featured={hot} />
        </span>
        <span className="block text-[11.5px] text-muted-foreground truncate">{tool.desc}</span>
      </span>
      {tool.cost && <span className="hidden md:block text-[11px] tabular-nums text-muted-foreground/80 shrink-0">{tool.cost}</span>}
      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
    </button>
  );
}

export function DashboardPage({ onNavigate }: Props) {
  const { balance, limit } = useCredits();
  const { user } = useAuth();
  const { active } = useProducts();
  const { canSee, isAdmin } = useFeatureAccess();
  const { locked, openPlans } = useVitrina();
  // Las 2 vías (12-oct-2026): "Creador con marca" o "Marketer sin rostro" (reemplaza low/high/marca).
  const { via, chosen: viaChosen, setVia, current: viaInfo } = useVia();
  const viaTools = useMemo(() => [...new Map([...viaInfo.find, ...viaInfo.create, ...viaInfo.sell].map(t => [t.id, t])).values()], [viaInfo]);
  const recent = useRecentWork(onNavigate);
  const sample = useVitrinaSample(locked);
  const firstName = (user?.user_metadata?.display_name || user?.email?.split("@")[0] || "")
    .toString().split(/[\s.@]/)[0].replace(/^./, (c: string) => c.toUpperCase());

  // "Más herramientas y tu camino": plegado por defecto (se recuerda en este navegador). Dentro, el
  // camino de 6 etapas también va plegado: nunca un camino obligatorio.
  const [moreOpen, setMoreOpen] = useState(() => {
    try { return localStorage.getItem(MORE_OPEN_KEY) === "1"; } catch { return false; }
  });
  const toggleMore = () => setMoreOpen(o => {
    try { localStorage.setItem(MORE_OPEN_KEY, o ? "0" : "1"); } catch { /* sin almacenamiento */ }
    return !o;
  });
  const [journeyOpen, setJourneyOpen] = useState(() => {
    try { return localStorage.getItem(JOURNEY_OPEN_KEY) === "1"; } catch { return false; }
  });
  const toggleJourney = () => setJourneyOpen(o => {
    try { localStorage.setItem(JOURNEY_OPEN_KEY, o ? "0" : "1"); } catch { /* sin almacenamiento */ }
    return !o;
  });

  // Panel de herramientas (dentro de "Más"): pestaña, cuadrícula o lista y buscador.
  const [view, setView] = useState<"grid" | "list">(() => {
    try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid"; } catch { return "grid"; }
  });
  const [cat, setCat] = useState(() => {
    try { const v = localStorage.getItem(CAT_KEY); if (v && (v === "todo" || HOME_CATEGORIES.some(c => c.id === v))) return v; } catch { /* sin almacenamiento */ }
    return "esencial";
  });
  const [query, setQuery] = useState("");
  const chooseView = (v: "grid" | "list") => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* sin almacenamiento */ } };
  const chooseCat = (c: string) => { setCat(c); setQuery(""); try { localStorage.setItem(CAT_KEY, c); } catch { /* sin almacenamiento */ } };

  // El buscador encuentra todas (también las que viven dentro de otra); "Todo" muestra solo las tarjetas.
  const visibleAll = useMemo(() => {
    const extra = ADMIN_EXTRA_TOOLS.filter(t => canSee(t.key));
    // "Lo esencial" va primero: en una búsqueda con empate (p. ej. "vender") gana Ofertas, no una
    // herramienta que cuesta créditos.
    const rank = new Map(HOME_CATEGORIES[0].tools.map((t, i) => [t.id, i]));
    return [...TOOLS, ...extra].filter(t => canSee(t.key))
      .map((t, i) => ({ t, k: (rank.get(t.id) ?? 999) * 1000 + i }))
      .sort((a, b) => a.k - b.k).map(x => x.t);
  }, [canSee]);
  const gridAll = useMemo(() => visibleAll.filter(t => !MERGED_INTO[t.id]), [visibleAll]);
  const tabs = useMemo(() => [
    ...HOME_CATEGORIES.map(c => c.id === "esencial"
      ? { id: c.id, label: `Tu vía · ${viaInfo.short}`, tools: viaTools.filter(t => canSee(t.key)) }
      : { id: c.id, label: c.label, tools: c.tools.filter(t => t && canSee(t.key)) }),
    { id: "todo", label: "Todo", tools: gridAll },
  ].filter(t => t.tools.length > 0), [canSee, gridAll, viaInfo, viaTools]);
  const q = norm(query.trim());
  const shown = q
    ? searchTools(query, visibleAll)
    : (tabs.find(t => t.id === cat) ?? tabs[0])?.tools ?? [];
  const nextSteps = NEXT_STEP_TOOLS.filter(t => canSee(t.key));

  const open = (tool: Tool, from: string) => {
    track("home_card_click", { card: tool.id, vitrina: locked, via, pestana: from });
    openTool(tool, onNavigate);
  };
  const ask = (text: string) => {
    track("home_ask_assistant", { text });
    window.dispatchEvent(new CustomEvent(ASK_ASSISTANT_EVENT, { detail: { text } }));
  };
  const usedPct = limit > 0 ? Math.max(0, Math.min(100, Math.round((balance / limit) * 100))) : 0;

  return (
    <div className="max-w-[1400px] mx-auto py-4">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-8">
          {/* La frase de la app: se entiende en 5 segundos qué hacer aquí. */}
          <header className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 max-w-[760px]">
              {firstName && <p className="text-sm text-muted-foreground mb-1" data-ph-mask>Hola, {firstName}</p>}
              <h1 className="font-display font-bold text-[24px] md:text-[30px] leading-[1.15] tracking-[-0.02em] text-foreground">{HOME_PHRASE}</h1>
              <p className="mt-2 text-[13px] md:text-[14px] text-muted-foreground">Mirar es gratis. Elige uno de abajo, toca «Hacer mi versión» y la armamos en 1 o 2 minutos.</p>
              <button onClick={() => window.dispatchEvent(new Event(OPEN_TOUR_EVENT))} className="xl:hidden mt-1 text-[12px] text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">Ver cómo funciona (1 minuto)</button>
            </div>
            {locked ? (
              <button onClick={() => openPlans()} className="btn-primary-nova inline-flex items-center gap-2 h-10 px-4 rounded-full text-[13px] font-semibold">
                Empieza tus 3 días gratis
              </button>
            ) : (
              <button onClick={() => onNavigate("Créditos")} className="xl:hidden inline-flex items-center gap-2 h-9 px-3.5 rounded-full border border-border text-[12px] text-muted-foreground hover:text-foreground hover:border-foreground/30">
                <Coins className="w-[13px] h-[13px] text-primary" strokeWidth={1.8} />
                {isAdmin ? <span className="text-foreground font-semibold">Créditos ilimitados</span> : <><span className="tabular-nums text-foreground font-semibold">{balance.toLocaleString("es")}</span> de {limit.toLocaleString("es")} créditos</>}
              </button>
            )}
          </header>

          {locked && (
            <div className="rounded-2xl border border-primary/40 bg-primary/[0.05] px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="text-[13px] text-foreground flex-1">
                <b>Estás viendo SUPERNOVA sin plan.</b> Mira todo lo que puedes hacer; lo que tiene candado se abre con PRO. Los primeros 3 días son gratis y, si no terminas tu producto en 30 días, te devolvemos el 100 %.
              </p>
              {TUTORIALS.length > 0 && (
                <button onClick={() => onNavigate("Aprende")} className="shrink-0 inline-flex items-center gap-1.5 text-[12px] text-foreground hover:underline"><PlayCircle className="w-4 h-4" /> Ver cómo funciona</button>
              )}
            </div>
          )}

          {/* Primera vez: elegir una de las 2 vías (12-oct-2026). Un toque; se cambia cuando quiera en el menú. */}
          {!viaChosen && (
            <section aria-labelledby="via-titulo" className="rounded-2xl border border-primary/40 bg-primary/[0.04] p-5 space-y-3">
              <div>
                <h2 id="via-titulo" className="font-display font-semibold text-[18px] text-foreground">¿Cuál es tu vía?</h2>
                <p className="text-[12.5px] text-muted-foreground">Elige una y te dejamos a mano solo lo que necesitas. Puedes cambiarla cuando quieras en el menú.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {VIAS.map(v => (
                  <button key={v.id} onClick={() => { setVia(v.id); track("via_elegida", { via: v.id }); }}
                    className="text-left rounded-xl border border-border bg-card/60 p-4 hover:border-primary/50 transition-colors space-y-1.5">
                    <span className="block font-display font-semibold text-[15px] text-foreground">{v.label}</span>
                    <span className="block text-[12.5px] text-muted-foreground leading-relaxed">{v.line}</span>
                    <span className="block text-[11.5px] text-muted-foreground/80">{v.create.slice(0, 4).map(t => t.nav).join(" · ")}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* HOY: 3 ofertas con creativo, días pagando y un solo botón. Sin plan: la muestra real con candado. */}
          {locked ? (
            sample && sample.length > 0 && (
              <section aria-labelledby="hoy-titulo">
                <div className="mb-3">
                  <h2 id="hoy-titulo" className="font-display font-semibold text-[18px] text-foreground">Hoy</h2>
                  <p className="text-[12.5px] text-muted-foreground">Ofertas ganadoras con más días pagando anuncios. Con PRO haces tu versión de cualquiera.</p>
                </div>
                <SampleOffers rows={sample} visible={3} onLocked={() => openPlans("Ofertas que venden")} />
              </section>
            )
          ) : (
            <TodayOffers onNavigate={onNavigate} />
          )}

          {/* ¿QUÉ QUIERES CREAR HOY? Una frase y te lleva a la herramienta con tu idea (abrir es gratis). */}
          <IntentBox onNavigate={onNavigate} />

          {/* SIGUIENTE PASO: lo que se hace con tu versión (ahí se usan los créditos). */}
          <section aria-labelledby="siguiente-titulo">
            <div className="mb-3">
              <h2 id="siguiente-titulo" className="font-display font-semibold text-[18px] text-foreground">Siguiente paso</h2>
              <p className="text-[12.5px] text-muted-foreground">Con tu versión lista, crea lo que la vende. Cada pieza usa los datos de tu versión.</p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {nextSteps.map(t => <ToolCard key={t.id} tool={t} locked={locked} onOpen={() => open(t, "siguiente")} />)}
            </div>
          </section>

          {/* TUS CREACIONES: lo último que hizo, en una fila que se desliza. */}
          {!locked && (
            <section aria-labelledby="creaciones-titulo">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <div className="flex items-baseline gap-2 min-w-0">
                  <h2 id="creaciones-titulo" className="font-display font-semibold text-[18px] text-foreground shrink-0">Tus creaciones</h2>
                  {active?.name && <span className="text-[12px] text-muted-foreground truncate">{active.name}</span>}
                </div>
                <button onClick={() => onNavigate("Proyectos")} className="text-[12px] text-muted-foreground hover:text-foreground shrink-0">Ver todo</button>
              </div>
              {recent === null ? (
                <div className="flex gap-3 overflow-hidden">
                  {[0, 1, 2].map(i => <div key={i} className="shrink-0 w-[220px] h-[68px] rounded-xl border border-border/60 bg-card/30 animate-pulse" />)}
                </div>
              ) : recent.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-5 text-[13px] text-muted-foreground">
                  Todavía no has creado nada. Empieza arriba con «Hacer mi versión»: aquí aparecerán tu versión, tus imágenes, tus videos y tus anuncios.
                </div>
              ) : (
                <div className="-mx-4 px-4 md:mx-0 md:px-0 flex gap-3 overflow-x-auto pb-1 snap-x [scrollbar-width:none]" role="list">
                  {recent.map(r => {
                    const Icon = r.icon;
                    return (
                      <button key={r.id} role="listitem" onClick={r.open} className="shrink-0 w-[240px] snap-start flex items-center gap-3 text-left rounded-xl border border-border bg-card/40 hover:border-foreground/30 px-4 py-3 transition-colors">
                        <Icon className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.7} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-foreground truncate">{r.title}</span>
                          <span className="block text-[11px] text-muted-foreground truncate">{r.kind} · {ago(r.at)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Una pregunta corta sobre lo que hizo, como mucho una vez por semana (feedback real, sin agobiar). */}
          {!locked && <ResultsCheckIn />}

          {/* MÁS: todo lo que antes llenaba el Inicio, plegado. Nada se borró. */}
          <section className="rounded-2xl border border-border">
            <button onClick={toggleMore} aria-expanded={moreOpen} className="w-full flex items-center gap-3 px-5 py-4 text-left">
              <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${moreOpen ? "rotate-90" : ""}`} />
              <span className="min-w-0">
                <span className="block font-display font-semibold text-[15px] text-foreground">Más herramientas y tu camino</span>
                <span className="block text-[12px] text-muted-foreground">Todas las herramientas, las de tu tipo de negocio, las ofertas que sigues y las 6 etapas (opcional).</span>
              </span>
            </button>
            {moreOpen && (
              <div className="px-3 md:px-5 pb-5 space-y-8">
                {/* Panel de herramientas: buscador, pestañas y tarjetas. */}
                <section className="space-y-4" aria-label="Herramientas">
                  <div className="flex items-center gap-2">
                    <label className="relative flex-1 min-w-0">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Busca: carrusel, video, quiero vender un curso…"
                        aria-label="Buscar herramienta"
                        className="w-full h-11 rounded-xl border border-border bg-card/40 pl-10 pr-9 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/30"
                      />
                      {query && (
                        <button onClick={() => setQuery("")} aria-label="Borrar búsqueda" className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </label>
                    <div className="hidden sm:flex items-center rounded-xl border border-border p-1" role="group" aria-label="Vista">
                      {([["grid", LayoutGrid, "Cuadrícula"], ["list", List, "Lista"]] as const).map(([v, Icon, label]) => (
                        <button key={v} onClick={() => chooseView(v)} aria-pressed={view === v} aria-label={label} title={label}
                          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${view === v ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                          <Icon className="w-4 h-4" strokeWidth={1.8} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {!q && (
                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none]" role="tablist" aria-label="Qué quieres hacer">
                      {tabs.map(t => (
                        <button key={t.id} role="tab" aria-selected={cat === t.id} onClick={() => chooseCat(t.id)}
                          className={`shrink-0 h-9 px-3.5 rounded-full border text-[13px] inline-flex items-center gap-1.5 transition-colors ${
                            cat === t.id ? "border-primary/60 text-foreground bg-primary/[0.07]" : "border-border text-muted-foreground hover:text-foreground"
                          }`}>
                          {t.label}
                          <span className={`tabular-nums text-[11px] ${cat === t.id ? "text-primary" : "text-muted-foreground/70"}`}>{t.tools.length}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {q && (shown.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border px-4 py-4 text-[13px] text-muted-foreground space-y-2">
                      <p>Nada con "{query.trim()}". Prueba con una palabra más corta (carrusel, anuncio, video, precio) o pregúntale a la IA: es gratis.</p>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => ask(query.trim())} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-primary/50 text-[12.5px] font-semibold text-foreground hover:bg-primary/[0.07]">
                          <Sparkles className="w-3.5 h-3.5 text-primary" strokeWidth={1.8} /> Preguntarle a la IA
                        </button>
                        <button onClick={() => setQuery("")} className="h-9 px-3.5 rounded-full border border-border text-[12.5px] text-muted-foreground hover:text-foreground">Ver todas las herramientas</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[12px] text-muted-foreground">{shown.length} {shown.length === 1 ? "herramienta" : "herramientas"} para "{query.trim()}"</p>
                  ))}

                  {view === "grid" ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4 gap-3">
                      {shown.map(t => <ToolCard key={t.id} tool={t} locked={locked} tour={false} onOpen={() => open(t, q ? "busqueda" : cat)} />)}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                      {shown.map(t => <ToolRow key={t.id} tool={t} locked={locked} onOpen={() => open(t, q ? "busqueda" : cat)} />)}
                    </div>
                  )}

                  {!q && cat !== "todo" && (
                    <button onClick={() => chooseCat("todo")} className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                      Ver todas las herramientas ({gridAll.length}) <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </section>

                {!locked && (<>
                  {/* Tu vía (12-oct-2026): las dos únicas vías, separadas, cada una con sus herramientas. */}
                  <section className="space-y-3">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <h2 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-foreground shrink-0">Tu vía · {viaInfo.label}</h2>
                      <span className="text-[12px] text-muted-foreground truncate">{viaInfo.line}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 max-w-md" role="group" aria-label="Tu vía">
                      {VIAS.map(v => (
                        <button key={v.id} onClick={() => setVia(v.id)} aria-pressed={via === v.id}
                          className={`h-10 rounded-xl border text-[13px] font-medium transition-colors ${via === v.id ? "border-primary/60 text-foreground bg-primary/[0.07]" : "border-border text-muted-foreground hover:text-foreground"}`}>
                          {v.label}
                        </button>
                      ))}
                    </div>
                    {([["find", via === "creador" ? "Ideas para tu contenido" : "Lo que ya vende"], ["create", "Crear"], ["sell", via === "creador" ? "Publicar y cobrar" : "Vender y medir"]] as const).map(([k, title]) => (
                      <div key={k} className="space-y-1.5">
                        <p className="text-[11px] text-muted-foreground">{title}</p>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                          {viaInfo[k].filter(t => canSee(t.key)).map(t => <ToolRow key={t.id} tool={t} onOpen={() => open(t, "via")} />)}
                        </div>
                      </div>
                    ))}
                  </section>

                  {/* Ofertas que sigue. */}
                  <RoiHunterWidget onNavigate={onNavigate} />

                  {/* El recorrido de 6 etapas y Tu semana: ayuda opcional, plegada; nunca un camino obligatorio. */}
                  <section className="rounded-2xl border border-border">
                    <button onClick={toggleJourney} aria-expanded={journeyOpen} className="w-full flex items-center gap-3 px-5 py-4 text-left">
                      <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${journeyOpen ? "rotate-90" : ""}`} />
                      <span className="min-w-0">
                        <span className="block font-display font-semibold text-[15px] text-foreground">Tu camino <span className="text-muted-foreground font-normal">(opcional)</span></span>
                        <span className="block text-[12px] text-muted-foreground">Si quieres que te guiemos, aquí están las 6 etapas de tu negocio y tus tareas de la semana.</span>
                      </span>
                    </button>
                    {journeyOpen && <div className="px-3 md:px-5 pb-5"><BusinessJourney onNavigate={onNavigate} /></div>}
                  </section>
                </>)}
              </div>
            )}
          </section>
        </div>

        {/* Columna derecha (pantallas grandes): créditos, asistente y cómo funciona. En el teléfono,
            los créditos van arriba y el asistente es el botón flotante de siempre. */}
        <aside className="hidden xl:flex flex-col gap-4 xl:sticky xl:top-4 self-start">
          {!locked && (
            <div className="rounded-2xl border border-border bg-card/40 p-5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-foreground">Tus créditos</p>
                <Coins className="w-4 h-4 text-primary" strokeWidth={1.8} />
              </div>
              {isAdmin ? (
                <p className="mt-3 font-display font-bold text-[28px] text-foreground leading-none">Ilimitado</p>
              ) : (<>
                <p className="mt-3 font-display font-bold text-[28px] tabular-nums text-foreground leading-none">{balance.toLocaleString("de-DE")}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">{balance > limit ? `créditos disponibles (tu plan trae ${limit.toLocaleString("de-DE")} al mes; el resto los recargaste)` : `créditos disponibles de ${limit.toLocaleString("de-DE")} de tu plan este mes`}</p>
                <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${usedPct}%` }} />
                </div>
              </>)}
              <p className="mt-3 text-[11.5px] text-muted-foreground leading-snug">Mirar ofertas, el radar y los ganchos no gasta créditos.</p>
              <button onClick={() => onNavigate("Créditos")} className="mt-4 w-full h-10 rounded-xl border border-border text-[13px] font-semibold text-foreground hover:border-foreground/30">
                Ver mis créditos
              </button>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card/40 p-5">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl border border-border flex items-center justify-center text-primary"><Sparkles className="w-4 h-4" strokeWidth={1.8} /></span>
              <span className="min-w-0">
                <span className="block font-display font-semibold text-[14px] text-foreground">Pregúntale a la IA</span>
                <span className="block text-[11px] text-muted-foreground">Te dice qué herramienta usar. Gratis.</span>
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {ASK_SUGGESTIONS.map(s => (
                <button key={s} onClick={() => ask(s)} className="w-full text-left rounded-xl border border-border px-3 py-2.5 text-[12.5px] text-foreground/90 hover:border-foreground/30 hover:text-foreground leading-snug">
                  {s}
                </button>
              ))}
            </div>
            <button onClick={() => ask("")} className="mt-3 w-full h-10 rounded-xl bg-secondary text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center justify-between px-3">
              Escribe tu pregunta… <Send className="w-4 h-4" strokeWidth={1.8} />
            </button>
          </div>

          <button onClick={() => window.dispatchEvent(new Event(OPEN_TOUR_EVENT))} className="rounded-2xl border border-border bg-card/40 p-4 text-left hover:border-foreground/30 flex items-center gap-3">
            <PlayCircle className="w-5 h-5 text-muted-foreground shrink-0" strokeWidth={1.7} />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-foreground">Ver cómo funciona</span>
              <span className="block text-[11.5px] text-muted-foreground">Un recorrido de 1 minuto por la app.</span>
            </span>
          </button>
        </aside>
      </div>
    </div>
  );
}
