import { useEffect, useState } from "react";
import { Lock, PlayCircle, Flame, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useVitrina } from "@/contexts/VitrinaContext";
import { TOOLS, ADMIN_EXTRA_TOOLS } from "@/lib/tools";
import { tutorialFor } from "@/lib/tutorials";
import { TutorialDialog } from "@/components/TutorialButton";
import { MARKET_NAME, NICHE_LABEL, flagFor } from "@/lib/offers";

/**
 * Lo que ve en una herramienta quien tiene cuenta pero no plan (vitrina). Dice qué hace la
 * herramienta, enseña su video si ya existe y, en Radar y Ofertas, una MUESTRA REAL del catálogo
 * (vitrina_sample: 12 ofertas ganadoras, las de más días anunciando). Nada de esto gasta IA.
 */
type Sample = { name: string | null; niche: string | null; market: string | null; offer_type: string | null; days_active: number | null; active_ads: number | null };

const EXTRA_PAGES: Record<string, { title: string; desc: string }> = {
  "Productos": { title: "Mis productos", desc: "Todos tus productos y cuánto avanzó cada uno." },
  "Proyectos": { title: "Lo que creaste", desc: "Todo lo que creas y guardas queda aquí para retomarlo." },
  "Mi negocio": { title: "Mi ficha", desc: "Qué vendes, para quién y qué logra. La usan todas las herramientas." },
  "Créditos": { title: "Mis créditos", desc: "PRO trae 2.000 créditos al mes para lo que hace la IA. Mirar ofertas, el radar y los ganchos es gratis." },
};

/** Una muestra compartida por la sesión: se pide una vez. */
let sampleCache: Promise<Sample[]> | null = null;
function loadSample() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sampleCache ??= Promise.resolve((supabase as any).rpc("vitrina_sample")).then(({ data }: { data: Sample[] | null }) => data ?? []).catch(() => []);
  return sampleCache;
}

export function useVitrinaSample(enabled = true) {
  const [rows, setRows] = useState<Sample[] | null>(null);
  useEffect(() => { if (enabled) loadSample().then(setRows); }, [enabled]);
  return rows;
}

export function SampleOffers({ rows, visible = 6, onLocked }: { rows: Sample[]; visible?: number; onLocked: () => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {rows.map((r, i) => {
        const blurred = i >= visible;
        return (
          <button key={i} onClick={onLocked}
            className="relative text-left rounded-xl border border-border bg-card/40 p-4 hover:border-foreground/30 transition-colors overflow-hidden">
            <div className={blurred ? "blur-[5px] select-none" : ""} aria-hidden={blurred}>
              <p className="text-[11px] text-muted-foreground truncate">
                {r.market ? `${flagFor(r.market)} ${MARKET_NAME[r.market] ?? r.market}` : ""}{r.niche ? ` · ${NICHE_LABEL[r.niche] ?? r.niche}` : ""}
              </p>
              <p className="mt-1 font-display font-semibold text-[14px] text-foreground leading-snug line-clamp-2">{r.name || "Oferta"}</p>
              <div className="mt-3 flex items-center gap-3 text-[12px] text-muted-foreground">
                {r.days_active != null && <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {r.days_active.toLocaleString("es")} días anunciando</span>}
                {r.active_ads != null && <span className="inline-flex items-center gap-1"><Flame className="w-3.5 h-3.5" /> {r.active_ads.toLocaleString("es")} anuncios</span>}
              </div>
            </div>
            {blurred && <Lock className="absolute inset-0 m-auto w-5 h-5 text-muted-foreground" />}
          </button>
        );
      })}
    </div>
  );
}

export function LockedToolPage({ page }: { page: string }) {
  const { openPlans } = useVitrina();
  const tool = [...TOOLS, ...ADMIN_EXTRA_TOOLS].find(t => t.key === page);
  const info = tool ? { title: tool.title, desc: tool.desc } : EXTRA_PAGES[page] ?? { title: page, desc: "" };
  const Icon = tool?.icon ?? Lock;
  const showSample = page === "Buscar Ofertas Winner" || page === "Ofertas" || page === "Anuncios Ganadores";
  const rows = useVitrinaSample(showSample);
  const tutorial = tutorialFor(page);
  const [playing, setPlaying] = useState(false);
  const unlock = () => openPlans(info.title);

  return (
    <div className="max-w-[1100px] mx-auto space-y-6 py-4">
      <div className="rounded-2xl border border-border p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-5">
        <span className="w-12 h-12 rounded-2xl border border-border flex items-center justify-center text-foreground shrink-0">
          <Icon className="w-6 h-6" strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground inline-flex items-center gap-1.5"><Lock className="w-3 h-3" /> Incluido en PRO</p>
          <h1 className="mt-1 font-display font-bold text-[22px] md:text-[26px] text-foreground leading-tight">{info.title}</h1>
          {info.desc && <p className="mt-1 text-sm text-muted-foreground">{info.desc}</p>}
        </div>
        <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0">
          <button onClick={unlock} className="btn-primary-nova rounded-xl px-5 py-3 text-[14px] font-semibold">Empezar mis 3 días gratis</button>
          {tutorial && (
            <button onClick={() => setPlaying(true)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-[13px] text-foreground hover:border-foreground/30">
              <PlayCircle className="w-4 h-4" /> Ver cómo se usa · {tutorial.minutes} min
            </button>
          )}
        </div>
      </div>

      {showSample && (
        <section>
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-foreground">Muestra real de hoy</h2>
            <span className="text-[12px] text-muted-foreground">Ofertas ganadoras con más días pagando anuncios</span>
          </div>
          {rows === null ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[0, 1, 2].map(i => <div key={i} className="h-[100px] rounded-xl border border-border/60 bg-card/30 animate-pulse" />)}
            </div>
          ) : rows.length > 0 ? (
            <SampleOffers rows={rows} visible={3} onLocked={unlock} />
          ) : null}
          <p className="mt-3 text-[12px] text-muted-foreground">Con PRO ves el catálogo completo, el detalle de cada oferta, su checkout y cuánto vale un cliente.</p>
        </section>
      )}

      {tutorial && <TutorialDialog tutorial={tutorial} open={playing} onOpenChange={setPlaying} />}
    </div>
  );
}
