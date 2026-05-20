import { useMemo } from "react";
import { Brain, ArrowRight, ArrowUpRight } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";
import { useProjects, PILLARS } from "@/hooks/useProjects";
import { CountUp } from "@/components/CountUp";
import { ProjectThumb } from "@/components/ProjectThumb";
import { WeeklySummary } from "@/components/WeeklySummary";
import { RisingTemperatureWidget } from "@/components/RisingTemperatureWidget";

interface Props { onNavigate: (p: string) => void; }

function formatRenewal(d: Date) {
  const days = Math.max(0, Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  const formatted = d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
  return { days, formatted };
}

export function DashboardPage({ onNavigate }: Props) {
  const { balance, limit, history, renewalDate } = useCredits();
  const { projects } = useProjects();

  const todayKey = new Date().toISOString().slice(0, 10);
  const stats = useMemo(() => {
    const today = history.filter((h) => h.date.slice(0, 10) === todayKey);
    const analyzed = today.filter((h) => h.action === "analyze_url" || h.action === "sofisticar" || h.action === "blueprint").length;
    const searches = today.filter((h) => h.action === "search_ads").length;
    return { analyzed, searches };
  }, [history, todayKey]);

  const recent = projects.slice(0, 3);
  const low = balance < 100;
  const renewal = formatRenewal(renewalDate);
  const usagePct = Math.min(100, (balance / limit) * 100);

  return (
    <div className="max-w-[1200px] mx-auto space-y-14 py-4">
      {/* Header */}
      <header className="space-y-3">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">Overview</div>
        <h2 className="page-heading font-display text-[34px] leading-[1.1] text-foreground">Intelligence Hub</h2>
        <p className="text-[15px] text-muted-foreground max-w-xl">Tu motor de descubrimiento de ofertas ganadoras.</p>
      </header>

      {/* KPI grid — generous spacing, hairline cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border rounded-2xl overflow-hidden border border-border">
        <StatTile label="Anuncios analizados" sub="Hoy" value={stats.analyzed} />
        <StatTile label="Búsquedas" sub="Hoy" value={stats.searches} />
        <StatTile label="Proyectos" sub="En BRAIN" value={projects.length} />
        <StatTile label="Créditos" sub={low ? "Saldo bajo" : "Disponibles"} value={balance} accent={low ? "destructive" : "primary"} />
      </section>

      {/* Quick actions */}
      <section className="grid md:grid-cols-2 gap-4">
        <ActionCard title="Buscar Ofertas Winner" subtitle="Encuentra lo que está escalando ahora mismo" onClick={() => onNavigate("Buscar Ofertas Winner")} />
        <ActionCard title="Iniciar SOFISTICAR" subtitle="Convierte una oferta ganadora en tu producto" onClick={() => onNavigate("Buscar Ofertas Winner")} />
      </section>

      {/* Resumen semanal */}
      <WeeklySummary />

      {/* Recent projects */}
      <section>
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium mb-1">Recientes</div>
            <h3 className="font-display font-semibold text-xl text-foreground flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" strokeWidth={1.6} /> Proyectos
            </h3>
          </div>
          <button onClick={() => onNavigate("Proyectos")} className="text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            Ver todos <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {recent.length === 0 ? (
          <div className="card-surface rounded-2xl py-20 text-center">
            <div className="empty-icon mb-5"><Brain className="w-7 h-7" strokeWidth={1.4} /></div>
            <div className="font-display font-semibold text-base mb-1">Tu primer proyecto está a un click</div>
            <div className="text-sm text-muted-foreground">Crea uno desde Buscar Ofertas Winner</div>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            {recent.map((p) => {
              const pct = (p.completedPillars.length / 6) * 100;
              return (
                <div key={p.id} className="card-surface rounded-2xl p-4 ad-card-hover">
                  <ProjectThumb seed={p.name} className="mb-4" />
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">{p.mode === "sofisticar" ? "Sofisticar" : p.mode === "crear" ? "Crear" : "Blueprint"}</div>
                  <div className="font-display font-semibold text-[15px] mt-1 truncate">{p.name}</div>
                  <div className="text-[12px] text-muted-foreground mt-1">Pilar {p.pillar} · {PILLARS[p.pillar - 1]?.name}</div>
                  <div className="w-full h-[3px] bg-secondary rounded-full overflow-hidden mt-4">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Credits — quiet hairline panel */}
      <section className="card-surface rounded-2xl p-7">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium mb-1">Plan mensual</div>
            <div className="font-display font-semibold text-lg text-foreground">Créditos disponibles</div>
            <div className="text-[12px] text-muted-foreground mt-1">Se renuevan en {renewal.days} días · {renewal.formatted}</div>
          </div>
          <button onClick={() => onNavigate("Créditos")} className="btn-primary-nova px-4 py-2 rounded-lg text-[13px]">Conseguir más</button>
        </div>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="font-display text-[40px] font-semibold tabular-nums leading-none text-foreground">
            <CountUp value={balance} />
          </span>
          <span className="text-[13px] text-muted-foreground">/ <CountUp value={limit} /></span>
        </div>
        <div className="w-full h-[3px] bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-700" style={{ width: `${usagePct}%` }} />
        </div>
      </section>
    </div>
  );
}

function StatTile({ label, sub, value, accent }: { label: string; sub: string; value: number; accent?: "primary" | "destructive" }) {
  const valueColor = accent === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="bg-card p-7 flex flex-col gap-5 transition-colors hover:bg-card/70">
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">{sub}</div>
        <div className="text-[12px] text-foreground/80">{label}</div>
      </div>
      <div className={`font-display text-[36px] font-semibold tabular-nums leading-none ${valueColor}`}>
        <CountUp value={value} />
      </div>
    </div>
  );
}

function ActionCard({ title, subtitle, onClick }: { title: string; subtitle: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card-surface rounded-2xl p-7 text-left ad-card-hover group">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-display font-semibold text-lg text-foreground tracking-tight">{title}</div>
          <div className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">{subtitle}</div>
        </div>
        <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" strokeWidth={1.6} />
      </div>
    </button>
  );
}
