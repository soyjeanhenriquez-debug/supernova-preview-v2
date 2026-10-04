import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Coins, FileText, BookOpen, Orbit, FolderKanban, Lock, PlayCircle, Image as ImageIcon, Video, Search, X, LayoutGrid, List, Sparkles, Send, Gem, Compass } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts } from "@/contexts/ProductContext";
import { supabase } from "@/integrations/supabase/client";
import { useFeatureAccess } from "@/lib/features";
import { TOOLS, ADMIN_EXTRA_TOOLS, HOME_CATEGORIES, MODELS, openTool, useBusinessModel, type Tool } from "@/lib/tools";
import { ToolThumb } from "@/components/dashboard/ToolThumb";
import { ASK_ASSISTANT_EVENT } from "@/components/HelpAssistant";
import { IdeaOfTheDay } from "@/components/create/IdeaOfTheDay";
import { track } from "@/lib/analytics";
import { DailyPicksHero } from "@/components/dashboard/DailyPicksHero";
import { RoiHunterWidget } from "@/components/dashboard/RoiHunterWidget";
import { BusinessJourney } from "@/components/journey/BusinessJourney";
import { OPEN_TOUR_EVENT } from "@/components/OnboardingTour";
import { useVitrina } from "@/contexts/VitrinaContext";
import { useVitrinaSample, SampleOffers } from "@/components/LockedToolPage";
import { TUTORIALS } from "@/lib/tutorials";

/**
 * Inicio = "¿Qué quieres crear hoy?" (navegación por intención, decisión de Jean del 03-oct-2026;
 * panel de herramientas estilo LanzaYa del 04-oct-2026): buscador, pestañas por lo que quieres
 * hacer y tarjetas con miniatura que abren la herramienta de un toque; debajo lo último que creó,
 * "Tu idea de hoy", las herramientas de su negocio y, plegado, el recorrido de 6 etapas. En pantallas
 * grandes, columna derecha con créditos y el asistente.
 */
interface Props { onNavigate: (p: string) => void; }

const JOURNEY_OPEN_KEY = "supernova:home-journey-open";

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

/** Sin tildes ni mayúsculas, para que "pagina" encuentre "Página". */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Preguntas de un toque para el asistente (es gratis, con tope diario en el servidor). */
const ASK_SUGGESTIONS = [
  "Empiezo de cero: ¿qué herramienta uso primero?",
  "¿Cómo hago mi primer anuncio para Meta?",
  "¿Qué negocio digital me conviene vender por WhatsApp?",
];

function CardBadge({ tool, locked }: { tool: Tool; locked?: boolean }) {
  if (locked) return <span className="inline-flex items-center gap-1 rounded-full bg-background/80 border border-border px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground"><Lock className="w-3 h-3" /> PRO</span>;
  if (tool.featured) return <span className="rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-[10px] font-semibold tracking-wide">Empieza aquí</span>;
  return null;
}

/** Tarjeta con miniatura: se toca y se empieza. */
function ToolCard({ tool, onOpen, locked }: { tool: Tool; onOpen: () => void; locked?: boolean }) {
  const Icon = tool.icon;
  return (
    <button
      onClick={onOpen}
      data-tour={`home-${tool.id}`}
      className={`group relative text-left rounded-2xl border overflow-hidden flex flex-col transition-colors ${
        tool.featured ? "border-primary/50 bg-primary/[0.04] hover:border-primary" : "border-border bg-card/40 hover:border-foreground/30 hover:bg-card/70"
      }`}
    >
      <ToolThumb toolId={tool.id} className="aspect-[16/9] border-b border-border/70 transition-transform duration-300 group-hover:scale-[1.03] origin-bottom" />
      <span className="absolute top-2.5 right-2.5"><CardBadge tool={tool} locked={locked} /></span>
      <span className="relative px-3.5 md:px-4 pb-3.5 md:pb-4 flex flex-col flex-1">
        <span className={`-mt-[18px] mb-2.5 w-9 h-9 rounded-xl border bg-background flex items-center justify-center ${tool.featured ? "border-primary/50 text-primary" : "border-border text-foreground"}`}>
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
function ToolRow({ tool, onOpen, locked }: { tool: Tool; onOpen: () => void; locked?: boolean }) {
  const Icon = tool.icon;
  return (
    <button onClick={onOpen} className={`group w-full flex items-center gap-3 text-left rounded-xl border px-2.5 py-2.5 transition-colors ${
      tool.featured ? "border-primary/50 bg-primary/[0.04] hover:border-primary" : "border-border bg-card/40 hover:border-foreground/30"
    }`}>
      <ToolThumb toolId={tool.id} className="w-[72px] h-[44px] rounded-lg border border-border/70 shrink-0" />
      <Icon className={`w-4 h-4 shrink-0 hidden sm:block ${tool.featured ? "text-primary" : "text-muted-foreground"}`} strokeWidth={1.7} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-display font-semibold text-[13.5px] text-foreground truncate">{tool.title}</span>
          <CardBadge tool={tool} locked={locked} />
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
  const { model, setModel, current: modelInfo } = useBusinessModel();
  const recent = useRecentWork(onNavigate);
  const sample = useVitrinaSample(locked);
  const firstName = (user?.user_metadata?.display_name || user?.email?.split("@")[0] || "")
    .toString().split(/[\s.@]/)[0].replace(/^./, (c: string) => c.toUpperCase());

  const [journeyOpen, setJourneyOpen] = useState(() => {
    try { return localStorage.getItem(JOURNEY_OPEN_KEY) === "1"; } catch { return false; }
  });
  const toggleJourney = () => setJourneyOpen(o => {
    try { localStorage.setItem(JOURNEY_OPEN_KEY, o ? "0" : "1"); } catch { /* sin almacenamiento */ }
    return !o;
  });

  // Panel de herramientas: pestaña, cuadrícula o lista y buscador (pestaña y vista se recuerdan aquí).
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

  const visibleAll = useMemo(() => {
    const extra = ADMIN_EXTRA_TOOLS.filter(t => canSee(t.key));
    return [...TOOLS, ...extra].filter(t => canSee(t.key));
  }, [canSee]);
  const tabs = useMemo(() => [
    ...HOME_CATEGORIES.map(c => ({ id: c.id, label: c.label, tools: c.tools.filter(t => t && canSee(t.key)) })),
    { id: "todo", label: "Todo", tools: visibleAll },
  ].filter(t => t.tools.length > 0), [canSee, visibleAll]);
  const q = norm(query.trim());
  const shown = q
    ? visibleAll.filter(t => norm(`${t.title} ${t.nav} ${t.desc} ${t.keywords}`).includes(q))
    : (tabs.find(t => t.id === cat) ?? tabs[0])?.tools ?? [];

  const open = (tool: Tool) => {
    track("home_card_click", { card: tool.id, vitrina: locked, modelo: model, pestana: q ? "busqueda" : cat });
    openTool(tool, onNavigate);
  };
  const ask = (text: string) => {
    track("home_ask_assistant", { text });
    window.dispatchEvent(new CustomEvent(ASK_ASSISTANT_EVENT, { detail: { text } }));
  };
  const usedPct = limit > 0 ? Math.max(0, Math.min(100, Math.round((balance / limit) * 100))) : 0;

  // Recomendaciones al final: plegadas. Si pasan 40 s en el Inicio sin tocar nada (se quedó pensando),
  // aparece un aviso discreto que lleva a ellas. Nunca gasta nada ni cambia de pantalla solo.
  const [recsOpen, setRecsOpen] = useState(false);
  const [nudge, setNudge] = useState(false);
  useEffect(() => {
    if (locked || recsOpen) return;
    let t = window.setTimeout(() => setNudge(true), 40_000);
    const reset = () => { window.clearTimeout(t); setNudge(false); t = window.setTimeout(() => setNudge(true), 40_000); };
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    return () => { window.clearTimeout(t); window.removeEventListener("pointerdown", reset); window.removeEventListener("keydown", reset); };
  }, [locked, recsOpen]);
  const goToRecs = () => {
    setNudge(false); setRecsOpen(true);
    requestAnimationFrame(() => document.getElementById("home-recomendaciones")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="max-w-[1400px] mx-auto py-4">
      {nudge && !recsOpen && (
        <button onClick={goToRecs}
          className="fixed z-30 left-1/2 -translate-x-1/2 bottom-[calc(80px+env(safe-area-inset-bottom))] lg:bottom-6 inline-flex items-center gap-2 h-11 px-4 rounded-full border border-border bg-card shadow-lg text-[13px] text-foreground hover:border-foreground/30">
          <Compass className="w-4 h-4 text-primary" strokeWidth={1.8} /> ¿No sabes qué hacer? Te recomendamos algo
        </button>
      )}
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-8">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              {firstName && <p className="text-sm text-muted-foreground mb-1" data-ph-mask>Hola, {firstName}</p>}
              <h1 className="font-display font-bold text-[26px] md:text-[32px] tracking-[-0.02em] text-foreground">¿Qué quieres hacer hoy?</h1>
              <p className="mt-1 text-[13px] md:text-[14px] text-muted-foreground">Toca una herramienta y empieza ya.</p>
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
          </div>

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

          {/* Panel de herramientas: buscador, pestañas por lo que quieres hacer y tarjetas con miniatura. */}
          <section className="space-y-4" aria-label="Herramientas">
            <div className="flex items-center gap-2">
              <label className="relative flex-1 min-w-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Busca: carrusel, video, página de ventas…"
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

            {q && <p className="text-[12px] text-muted-foreground">{shown.length === 0 ? `Nada con "${query.trim()}". Prueba con otra palabra o pregúntale al asistente.` : `${shown.length} ${shown.length === 1 ? "herramienta" : "herramientas"} para "${query.trim()}"`}</p>}

            {view === "grid" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4 gap-3">
                {shown.map(t => <ToolCard key={t.id} tool={t} locked={locked} onOpen={() => open(t)} />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {shown.map(t => <ToolRow key={t.id} tool={t} locked={locked} onOpen={() => open(t)} />)}
              </div>
            )}

            {!q && cat !== "todo" && (
              <button onClick={() => chooseCat("todo")} className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                Ver todas las herramientas ({visibleAll.length}) <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </section>

          {locked ? (
            sample && sample.length > 0 && (
              <section>
                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <h2 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-foreground">Muestra real de hoy</h2>
                  <span className="text-[12px] text-muted-foreground">Ofertas ganadoras con más días pagando anuncios</span>
                </div>
                <SampleOffers rows={sample} visible={3} onLocked={() => openPlans("Ofertas que venden")} />
              </section>
            )
          ) : (
            <>
            {/* Lo último que creó, para retomarlo. */}
            <section>
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <div className="flex items-baseline gap-2 min-w-0">
                  <h2 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-foreground shrink-0">Tus proyectos recientes</h2>
                  {active?.name && <span className="text-[12px] text-muted-foreground truncate">{active.name}</span>}
                </div>
                <button onClick={() => onNavigate("Proyectos")} className="text-[12px] text-muted-foreground hover:text-foreground shrink-0">Ver todo</button>
              </div>
              {recent === null ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[0, 1, 2].map(i => <div key={i} className="h-[68px] rounded-xl border border-border/60 bg-card/30 animate-pulse" />)}
                </div>
              ) : recent.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-5 text-[13px] text-muted-foreground">
                  Aquí aparecerá lo que crees: tus imágenes, tus videos de hoy, tus anuncios y tu producto.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {recent.map(r => {
                    const Icon = r.icon;
                    return (
                      <button key={r.id} onClick={r.open} className="flex items-center gap-3 text-left rounded-xl border border-border bg-card/40 hover:border-foreground/30 px-4 py-3 transition-colors">
                        <Icon className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.7} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-foreground truncate">{r.title}</span>
                          <span className="block text-[11px] text-muted-foreground">{r.kind} · {ago(r.at)}</span>
                        </span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Atajo a Ofertas ganadoras. */}
            <button onClick={() => onNavigate("Ofertas")} className="w-full rounded-2xl border border-border bg-card/40 hover:border-foreground/30 px-5 py-4 flex items-center gap-4 text-left transition-colors">
              <span className="w-10 h-10 rounded-xl border border-border flex items-center justify-center text-foreground shrink-0"><Gem className="w-5 h-5" strokeWidth={1.7} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-display font-semibold text-[15px] text-foreground">Ofertas que están vendiendo hoy</span>
                <span className="block text-[12px] text-muted-foreground">Negocios digitales que llevan semanas pagando anuncios, con su precio y su embudo. Mirar es gratis.</span>
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>

            {/* 3 · Publica y mide: las herramientas de su negocio (low / high / marca, se recuerda en este navegador). */}
            <section className="space-y-3">
              <div className="flex items-baseline gap-2 min-w-0">
                <h2 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-foreground shrink-0">Para tu negocio · {modelInfo.short}</h2>
                <span className="text-[12px] text-muted-foreground truncate">{modelInfo.line}</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none]" role="group" aria-label="¿Qué estás construyendo?">
                {MODELS.map(m => (
                  <button key={m.id} onClick={() => setModel(m.id)} aria-pressed={model === m.id}
                    className={`shrink-0 h-9 px-4 rounded-full border text-[13px] transition-colors ${model === m.id ? "border-primary/60 text-foreground bg-primary/[0.07]" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {modelInfo.tools.filter(t => canSee(t.key)).map(t => <ToolRow key={t.id} tool={t} onOpen={() => open(t)} />)}
              </div>
            </section>

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

            {/* Ofertas que sigue. */}
            <RoiHunterWidget onNavigate={onNavigate} />

            {/* Recomendaciones al final (05-oct-2026, Jean): para quien no sabe qué elegir o se queda
                pensando. Plegado; si pasa un rato sin tocar nada, aparece un aviso que lo trae aquí. */}
            <section id="home-recomendaciones" className="rounded-2xl border border-border">
              <button onClick={() => setRecsOpen(o => !o)} aria-expanded={recsOpen} className="w-full flex items-center gap-3 px-5 py-4 text-left">
                <span className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-primary shrink-0"><Compass className="w-4 h-4" strokeWidth={1.8} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display font-semibold text-[15px] text-foreground">¿No sabes por dónde empezar?</span>
                  <span className="block text-[12px] text-muted-foreground">Te recomendamos una idea de hoy y 3 negocios que ya están vendiendo. Mirar es gratis.</span>
                </span>
                <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${recsOpen ? "rotate-90" : ""}`} />
              </button>
              {recsOpen && (
                <div className="px-3 md:px-5 pb-5 space-y-6">
                  <IdeaOfTheDay />
                  <DailyPicksHero onNavigate={onNavigate} />
                </div>
              )}
            </section>
            </>
          )}
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
                <p className="mt-3 font-display font-bold text-[28px] tabular-nums text-foreground leading-none">{balance.toLocaleString("es")}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">de {limit.toLocaleString("es")} de tu plan este mes</p>
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
