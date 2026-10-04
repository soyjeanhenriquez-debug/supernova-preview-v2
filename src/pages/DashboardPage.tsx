import { useEffect, useState } from "react";
import { ChevronRight, Coins, FileText, BookOpen, Orbit, FolderKanban, Lock, PlayCircle } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts } from "@/contexts/ProductContext";
import { supabase } from "@/integrations/supabase/client";
import { useFeatureAccess } from "@/lib/features";
import { STUDIO_TOOLS, FIND_TOOLS, MODELS, openTool, useBusinessModel, type Tool } from "@/lib/tools";
import { track } from "@/lib/analytics";
import { DailyPicksHero } from "@/components/dashboard/DailyPicksHero";
import { RoiHunterWidget } from "@/components/dashboard/RoiHunterWidget";
import { BusinessJourney } from "@/components/journey/BusinessJourney";
import { OPEN_TOUR_EVENT } from "@/components/OnboardingTour";
import { useVitrina } from "@/contexts/VitrinaContext";
import { useVitrinaSample, SampleOffers } from "@/components/LockedToolPage";
import { TUTORIALS } from "@/lib/tutorials";

/**
 * Inicio = "¿Qué quieres hacer hoy?" (navegación por intención, decisión de Jean del 03-oct-2026,
 * por lo que pidió Cindy): botones grandes que llevan directo a cada herramienta, lo último que
 * creó para retomarlo y, plegado, el recorrido de 6 etapas como ayuda opcional, nunca obligatorio.
 */
interface Props { onNavigate: (p: string) => void; }

const JOURNEY_OPEN_KEY = "supernova:home-journey-open";

type Recent = { id: string; title: string; kind: string; at: string; icon: typeof FileText; open: () => void };

/** Lo último que creó en el producto activo: 3 lecturas pequeñas (máx. 4 filas cada una), sin textos largos. */
function useRecentWork(onNavigate: (p: string) => void) {
  const { activeId } = useProducts();
  const { canSee } = useFeatureAccess();
  const builderOn = canSee("Crear producto");
  const [items, setItems] = useState<Recent[] | null>(null);

  useEffect(() => {
    if (!activeId) { setItems([]); return; }
    let alive = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const empty = Promise.resolve({ data: [] });
    Promise.all([
      db.from("product_assets").select("id,name,kind,updated_at").eq("product_id", activeId)
        .order("updated_at", { ascending: false }).limit(4),
      db.from("mandala_ads").select("id,angle,stage,updated_at").eq("product_id", activeId)
        .order("updated_at", { ascending: false }).limit(4),
      builderOn
        ? db.from("product_builds").select("id,title,format,updated_at").eq("product_id", activeId)
          .order("updated_at", { ascending: false }).limit(4)
        : empty,
    ]).then(([assets, ads, builds]) => {
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
      ].sort((x, y) => y.at.localeCompare(x.at)).slice(0, 6);
      setItems(list);
    }).catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [activeId, builderOn, onNavigate]);

  return items;
}

function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short" });
}

function ToolCard({ tool, onOpen, locked }: { tool: Tool; onOpen: () => void; locked?: boolean }) {
  const Icon = tool.icon;
  return (
    <button
      onClick={onOpen}
      data-tour={`home-${tool.id}`}
      className={`group relative text-left rounded-2xl border p-4 md:p-5 transition-colors flex flex-col gap-3 min-h-[124px] ${
        tool.featured
          ? "border-primary/50 bg-primary/[0.06] hover:border-primary"
          : "border-border bg-card/40 hover:border-foreground/30 hover:bg-card/70"
      }`}
    >
      {locked ? (
        <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-muted-foreground"><Lock className="w-3 h-3" /> PRO</span>
      ) : tool.featured && (
        <span className="absolute top-3 right-3 text-[10px] font-semibold tracking-wide text-primary">Empieza aquí</span>
      )}
      <span className={`w-9 h-9 rounded-xl border flex items-center justify-center ${tool.featured ? "border-primary/40 text-primary" : "border-border text-foreground"}`}>
        <Icon className="w-[17px] h-[17px]" strokeWidth={1.7} />
      </span>
      <span className="min-w-0">
        <span className="block font-display font-semibold text-[14px] md:text-[15px] leading-snug text-foreground">{tool.title}</span>
        <span className="block mt-1 text-[12px] leading-snug text-muted-foreground line-clamp-2">{tool.desc}</span>
      </span>
    </button>
  );
}

export function DashboardPage({ onNavigate }: Props) {
  const { balance, limit } = useCredits();
  const { user } = useAuth();
  const { active } = useProducts();
  const { canSee } = useFeatureAccess();
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

  const open = (tool: Tool) => {
    track("home_card_click", { card: tool.id, vitrina: locked, modelo: model });
    openTool(tool, onNavigate);
  };

  return (
    <div className="max-w-[1280px] mx-auto space-y-10 py-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          {firstName && <p className="text-sm text-muted-foreground mb-1" data-ph-mask>Hola, {firstName}</p>}
          <h1 className="font-display font-bold text-[26px] md:text-[32px] tracking-[-0.02em] text-foreground">¿Qué quieres crear hoy?</h1>
          <button onClick={() => window.dispatchEvent(new Event(OPEN_TOUR_EVENT))} className="mt-1 text-[12px] text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">Ver cómo funciona (1 minuto)</button>
        </div>
        {locked ? (
          <button onClick={() => openPlans()} className="btn-primary-nova inline-flex items-center gap-2 h-10 px-4 rounded-full text-[13px] font-semibold">
            Empieza tus 3 días gratis
          </button>
        ) : <button onClick={() => onNavigate("Créditos")} className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full border border-border text-[12px] text-muted-foreground hover:text-foreground hover:border-foreground/30">
          <Coins className="w-[13px] h-[13px] text-primary" strokeWidth={1.8} />
          <span className="tabular-nums text-foreground font-semibold">{balance.toLocaleString("es")}</span> de {limit.toLocaleString("es")} créditos
        </button>}
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

      {/* ¿Qué estás construyendo? Reordena "Tu negocio" (se recuerda en este navegador). */}
      <div className="space-y-2">
        <p className="text-[12px] text-muted-foreground">¿Qué estás construyendo?</p>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none]">
          {MODELS.map(m => (
            <button key={m.id} onClick={() => setModel(m.id)} aria-pressed={model === m.id}
              className={`shrink-0 h-9 px-4 rounded-full border text-[13px] transition-colors ${model === m.id ? "border-primary/60 text-foreground bg-primary/[0.07]" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Estudio IA: lo que la gente quiere producir. Luego su negocio, luego qué ya vende. */}
      <div className="space-y-8">
        {[
          { id: "estudio", title: "Estudio IA", sub: "Crea en un clic, desde tu producto", tools: STUDIO_TOOLS },
          { id: "negocio", title: `Tu negocio · ${modelInfo.short}`, sub: modelInfo.line, tools: modelInfo.tools },
          { id: "encontrar", title: "Encontrar qué vender", sub: "Lo que ya vende, antes de crear nada", tools: FIND_TOOLS },
        ].map(g => {
          const tools = g.tools.filter(t => canSee(t.key));
          if (!tools.length) return null;
          return (
            <section key={g.id}>
              <div className="flex items-baseline gap-2 mb-3 min-w-0">
                <h2 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-foreground shrink-0">{g.title}</h2>
                <span className="text-[12px] text-muted-foreground truncate">{g.sub}</span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {tools.map(t => <ToolCard key={t.id} tool={t} locked={locked} onOpen={() => open(t)} />)}
              </div>
            </section>
          );
        })}
      </div>

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
              Aquí aparecerá lo que crees: tus anuncios, tu producto y lo que guardes con "Hacer mi versión".
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

        {/* Ideas del día y ofertas que sigue. */}
        <DailyPicksHero onNavigate={onNavigate} />
        <RoiHunterWidget onNavigate={onNavigate} />
        </>
      )}
    </div>
  );
}
