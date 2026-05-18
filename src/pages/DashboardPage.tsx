import { useMemo } from "react";
import { Brain, ArrowRight, ArrowUpRight, Info, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useCredits, type CreditHistoryEntry } from "@/hooks/useCredits";
import { useProjects, PILLARS } from "@/hooks/useProjects";
import { CountUp } from "@/components/CountUp";
import { ProjectThumb } from "@/components/ProjectThumb";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props { onNavigate: (p: string) => void; }

function renewalInfo() {
  const renewDate = new Date();
  renewDate.setDate(renewDate.getDate() + 30);
  return {
    days: 30,
    formatted: renewDate.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }),
  };
}

function dayKey(d: Date) { return d.toISOString().slice(0, 10); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d); }

// Build last-N-days bucket counts for a filter
function bucketByDay(history: CreditHistoryEntry[], n: number, match: (h: CreditHistoryEntry) => boolean) {
  const keys = Array.from({ length: n }, (_, i) => daysAgo(n - 1 - i));
  const counts = Object.fromEntries(keys.map((k) => [k, 0])) as Record<string, number>;
  history.forEach((h) => {
    const k = h.date.slice(0, 10);
    if (k in counts && match(h)) counts[k] += 1;
  });
  return keys.map((k) => counts[k]);
}

export function DashboardPage({ onNavigate }: Props) {
  const { balance, limit, history } = useCredits();
  const { projects } = useProjects();

  const todayKey = dayKey(new Date());
  const yKey = daysAgo(1);

  const stats = useMemo(() => {
    const todayAnalyzed = history.filter((h) => h.date.slice(0, 10) === todayKey && (h.action === "analyze_url" || h.action === "sofisticar" || h.action === "blueprint")).length;
    const yAnalyzed = history.filter((h) => h.date.slice(0, 10) === yKey && (h.action === "analyze_url" || h.action === "sofisticar" || h.action === "blueprint")).length;
    const todaySearches = history.filter((h) => h.date.slice(0, 10) === todayKey && h.action === "search_ads").length;
    const ySearches = history.filter((h) => h.date.slice(0, 10) === yKey && h.action === "search_ads").length;
    return { todayAnalyzed, yAnalyzed, todaySearches, ySearches };
  }, [history, todayKey, yKey]);

  const creditsSpark = useMemo(
    () => bucketByDay(history, 7, () => true),
    [history],
  );

  const recent = projects.slice(0, 3);
  const low = balance < 100;
  const renewal = renewalInfo();
  const usagePct = Math.min(100, (balance / limit) * 100);
  const usedThisCycle = limit - balance;

  return (
    <div className="max-w-[1200px] mx-auto space-y-14 py-4">
      {/* Header */}
      <header className="space-y-3">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">Overview</div>
        <h2 className="page-heading font-display text-[34px] leading-[1.1] text-foreground">Intelligence Hub</h2>
        <p className="text-[15px] text-muted-foreground max-w-xl">Tu motor de descubrimiento de ofertas ganadoras.</p>
      </header>

      {/* KPI grid — hairline tiles with tooltips + delta */}
      <section>
        <SectionKicker eyebrow="Métricas" title="Actividad" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border rounded-2xl overflow-hidden border border-border">
          <StatTile
            label="Anuncios analizados"
            sub="Hoy"
            value={stats.todayAnalyzed}
            delta={stats.todayAnalyzed - stats.yAnalyzed}
            tip="Suma de URLs analizadas, sofisticaciones y blueprints generados durante el día de hoy. La variación compara con ayer."
          />
          <StatTile
            label="Búsquedas"
            sub="Hoy"
            value={stats.todaySearches}
            delta={stats.todaySearches - stats.ySearches}
            tip="Búsquedas a la Facebook Ads Library realizadas hoy. Cada búsqueda consume 1 crédito."
          />
          <StatTile
            label="Proyectos"
            sub="En BRAIN"
            value={projects.length}
            tip="Proyectos activos guardados en tu BRAIN. Incluye los modos Sofisticar, Crear y Blueprint."
          />
          <StatTile
            label="Créditos"
            sub={low ? "Saldo bajo" : "Disponibles"}
            value={balance}
            accent={low ? "destructive" : undefined}
            tip={low
              ? `Tu saldo está por debajo del umbral seguro (100). Quedan ${balance} de ${limit}. Renovación en ${renewal.days} días.`
              : `Te quedan ${balance} créditos de un ciclo mensual de ${limit}. Renovación el ${renewal.formatted}.`}
          />
        </div>
      </section>

      {/* Quick actions */}
      <section>
        <SectionKicker eyebrow="Acciones rápidas" title="Empieza un flujo" />
        <div className="grid md:grid-cols-2 gap-4">
          <ActionCard title="Buscar Ofertas Winner" subtitle="Encuentra lo que está escalando ahora mismo" onClick={() => onNavigate("Buscar Ofertas Winner")} />
          <ActionCard title="Iniciar SOFISTICAR" subtitle="Convierte una oferta ganadora en tu producto" onClick={() => onNavigate("Buscar Ofertas Winner")} />
        </div>
      </section>

      {/* Recent projects */}
      <section>
        <div className="flex items-end justify-between mb-6">
          <SectionKicker eyebrow="Recientes" title="Proyectos" icon={<Brain className="w-4 h-4 text-primary" strokeWidth={1.6} />} />
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

      {/* Credits — quiet hairline panel with mini sparkline */}
      <section>
        <SectionKicker eyebrow="Plan mensual" title="Créditos" />
        <div className="card-surface rounded-2xl p-7">
          <div className="grid md:grid-cols-[1fr_auto] gap-8 items-start">
            <div>
              <div className="text-[11px] text-muted-foreground">Disponibles · renovación en {renewal.days} días · {renewal.formatted}</div>
              <div className="flex items-baseline gap-2 mt-3 mb-5">
                <span className="font-display text-[44px] font-semibold tabular-nums leading-none text-foreground">
                  <CountUp value={balance} />
                </span>
                <span className="text-[13px] text-muted-foreground">/ <CountUp value={limit} /></span>
              </div>
              <div className="w-full h-[3px] bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-700" style={{ width: `${usagePct}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground mt-2 tabular-nums">
                <span>Usado este ciclo · {usedThisCycle}</span>
                <span>{Math.round(usagePct)}% restante</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-3 min-w-[160px]">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Últimos 7 días</div>
              <Sparkline values={creditsSpark} />
              <button onClick={() => onNavigate("Créditos")} className="btn-primary-nova px-4 py-2 rounded-lg text-[13px] mt-2">Conseguir más</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionKicker({ eyebrow, title, icon }: { eyebrow: string; title: string; icon?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium mb-1.5">{eyebrow}</div>
      <h3 className="font-display font-semibold text-xl text-foreground flex items-center gap-2 tracking-tight">
        {icon}{title}
      </h3>
    </div>
  );
}

function StatTile({ label, sub, value, accent, tip, delta }: { label: string; sub: string; value: number; accent?: "destructive"; tip?: string; delta?: number }) {
  const valueColor = accent === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="bg-card p-7 flex flex-col gap-5 transition-colors hover:bg-card/70 group">
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">
          {sub}
          {tip && (
            <Tooltip delayDuration={120}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`Información: ${label}`}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/70 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-full"
                >
                  <Info className="w-3 h-3" strokeWidth={1.6} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[240px] text-[12px] leading-relaxed bg-popover border-border text-popover-foreground">
                {tip}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="text-[12px] text-foreground/80">{label}</div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className={`font-display text-[36px] font-semibold tabular-nums leading-none ${valueColor}`}>
          <CountUp value={value} />
        </div>
        {typeof delta === "number" && <DeltaPill delta={delta} />}
      </div>
    </div>
  );
}

function DeltaPill({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground tabular-nums">
        <Minus className="w-3 h-3" strokeWidth={1.8} /> 0
      </span>
    );
  }
  const positive = delta > 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1 text-[10px] tabular-nums font-medium ${positive ? "text-primary" : "text-muted-foreground"}`}>
          <Icon className="w-3 h-3" strokeWidth={1.8} />
          {positive ? "+" : ""}{delta}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[12px] bg-popover border-border text-popover-foreground">
        Variación vs ayer
      </TooltipContent>
    </Tooltip>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 140, h = 36, pad = 2;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const pts = values.map((v, i) => [pad + i * step, h - pad - (v / max) * (h - pad * 2)] as const);
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const hasData = values.some((v) => v > 0);
  return (
    <svg width={w} height={h} className="overflow-visible">
      {hasData ? (
        <>
          <path d={d} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
          {last && <circle cx={last[0]} cy={last[1]} r={2} fill="hsl(var(--primary))" />}
        </>
      ) : (
        <line x1={pad} y1={h / 2} x2={w - pad} y2={h / 2} stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray="3 3" />
      )}
    </svg>
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
