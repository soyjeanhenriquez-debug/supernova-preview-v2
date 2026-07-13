import { useMemo } from "react";
import { Brain, ArrowRight, ArrowUpRight, Search, Sparkles, Wand2 } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";
import { useProjects, PILLARS } from "@/hooks/useProjects";
import { useAuth } from "@/contexts/AuthContext";
import { useGamification } from "@/hooks/useGamification";
import { useActivitySeries } from "@/hooks/useActivitySeries";
import { ProjectThumb } from "@/components/ProjectThumb";
import { WeeklySummary } from "@/components/WeeklySummary";
import { HeatMap } from "@/components/HeatMap";
import { RisingTemperatureWidget } from "@/components/RisingTemperatureWidget";
import { CountUp } from "@/components/CountUp";
import { HeroJarvis } from "@/components/dashboard/HeroJarvis";
import { DailyWinnerWidget } from "@/components/dashboard/DailyWinnerWidget";
import { StreakWidget } from "@/components/dashboard/StreakWidget";
import { StatCardSparkline } from "@/components/dashboard/StatCardSparkline";
import { DailyMissionWidget } from "@/components/dashboard/DailyMissionWidget";
import { LevelXPWidget } from "@/components/dashboard/LevelXPWidget";
import { DailyQuoteWidget } from "@/components/dashboard/DailyQuoteWidget";
import { LevelUpModal } from "@/components/dashboard/LevelUpModal";

interface Props { onNavigate: (p: string) => void; }

function formatRenewal(d: Date) {
  const days = Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400000));
  const formatted = d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
  return { days, formatted };
}

export function DashboardPage({ onNavigate }: Props) {
  const { balance, limit, history, renewalDate } = useCredits();
  const { projects } = useProjects();
  const { user } = useAuth();
  const { xp, streak, lastLoginDate, badges, levelUpTo, dismissLevelUp } = useGamification();

  const firstName = (user?.user_metadata?.display_name || user?.email?.split("@")[0] || "")
    .toString().split(/[\s.@]/)[0].replace(/^./, (c) => c.toUpperCase());

  // Activity series for sparklines
  const { series: analyzedSeries } = useActivitySeries(["analyze_url","sofisticar","blueprint","landing_intelligence","adaptar"]);
  const { series: searchSeries } = useActivitySeries(["search_ads"]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const yKey = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const stats = useMemo(() => {
    const today = history.filter((h) => h.date.slice(0, 10) === todayKey);
    const yest = history.filter((h) => h.date.slice(0, 10) === yKey);
    const analyzed = today.filter((h) => h.action === "analyze_url" || h.action === "sofisticar" || h.action === "blueprint" || h.action === "landing_intelligence").length;
    const analyzedYest = yest.filter((h) => h.action === "analyze_url" || h.action === "sofisticar" || h.action === "blueprint" || h.action === "landing_intelligence").length;
    const searches = today.filter((h) => h.action === "search_ads").length;
    const searchesYest = yest.filter((h) => h.action === "search_ads").length;
    // hours saved (rough estimate based on action types)
    const HOURS: Record<string, number> = { search_ads:0.5, analyze_url:0.5, sofisticar:2, blueprint:4, landing_intelligence:4, gen_funnel:8, gen_landing:4, gen_avatar:2, gen_ad_copies:2 };
    const totalHours = history.reduce((acc, h) => acc + (HOURS[h.action] ?? 0.5), 0);
    return { analyzed, searches, analyzedDelta: analyzed - analyzedYest, searchesDelta: searches - searchesYest, totalHours: Math.round(totalHours) };
  }, [history, todayKey, yKey]);

  const renewal = formatRenewal(renewalDate);
  const recent = projects.slice(0, 3);

  return (
    <div className="max-w-[1280px] mx-auto space-y-10 py-4 animate-jarvis-fade">
      {/* 1. Hero */}
      <HeroJarvis firstName={firstName} />

      {/* 2. Racha */}
      <StreakWidget streak={streak} lastLoginDate={lastLoginDate} />

      {/* El Ganador del Día: hábito diario → crear tu Mini App */}
      <DailyWinnerWidget />

      {/* 3. Stats cards con sparklines */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCardSparkline
          sub="Hoy"
          label="Anuncios procesados"
          value={stats.analyzed}
          series={analyzedSeries.map(s => s.count)}
          delta={stats.analyzedDelta}
        />
        <StatCardSparkline
          sub="Hoy"
          label="Búsquedas realizadas"
          value={stats.searches}
          series={searchSeries.map(s => s.count)}
          delta={stats.searchesDelta}
        />
        <StatCardSparkline
          sub={balance < 300 ? "Saldo bajo" : "Disponibles"}
          label="Créditos JARVIS"
          value={balance}
          alert={balance < 300}
          accent="primary"
          footer={`Renueva en ${renewal.days}d`}
        />
        <StatCardSparkline
          sub="Acumulado"
          label="Horas ahorradas"
          value={stats.totalHours}
          format={(n) => `${n}h`}
          accent="primary"
          footer="desde tu registro"
        />
      </section>

      {/* 4 + 5. Misión y XP en 2 cols */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DailyMissionWidget />
        <LevelXPWidget xp={xp} badges={badges} />
      </section>

      {/* 6. Frase motivacional */}
      <DailyQuoteWidget />

      {/* 7. Heat map */}
      <HeatMap onSelectNiche={() => onNavigate("Buscar Ofertas Winner")} />

      {/* 7b. Rising temperature */}
      <RisingTemperatureWidget onSeeAll={() => onNavigate("Buscar Ofertas Winner")} />

      {/* Weekly summary */}
      <WeeklySummary />

      {/* 8. Acciones rápidas */}
      <section className="grid md:grid-cols-3 gap-4">
        <QuickAction
          icon={<Search className="w-5 h-5" strokeWidth={1.8} />}
          tint="primary"
          title="Buscar Ofertas Winner"
          subtitle="Encuentra lo que está escalando ahora"
          cost="10c"
          onClick={() => onNavigate("Buscar Ofertas Winner")}
        />
        <QuickAction
          icon={<Sparkles className="w-5 h-5" strokeWidth={1.8} />}
          tint="purple"
          title="Oráculo"
          subtitle="Disecciona cualquier landing en segundos"
          cost="80c"
          onClick={() => onNavigate("Oráculo")}
        />
        <QuickAction
          icon={<Wand2 className="w-5 h-5" strokeWidth={1.8} />}
          tint="green"
          title="Sofisticar oferta"
          subtitle="Convierte un winner en tu versión superior"
          cost="30c"
          onClick={() => onNavigate("Buscar Ofertas Winner")}
        />
      </section>

      {/* 10. Proyectos recientes */}
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
                <div key={p.id} className="card-surface rounded-2xl p-4 ad-card-hover group cursor-pointer" onClick={() => onNavigate("Proyectos")}>
                  <ProjectThumb seed={p.name} className="mb-4" />
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">{p.mode === "sofisticar" ? "Sofisticar" : p.mode === "crear" ? "Crear" : "Blueprint"}</div>
                  <div className="font-display font-semibold text-[15px] mt-1 truncate">{p.name}</div>
                  <div className="text-[12px] text-muted-foreground mt-1">
                    Pilar {p.pillar} · {PILLARS[p.pillar - 1]?.name} · {Math.round(pct)}% completado
                  </div>
                  <div className="w-full h-[3px] bg-secondary rounded-full overflow-hidden mt-4">
                    <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[11px] text-primary opacity-0 group-hover:opacity-100 transition-opacity mt-3 flex items-center gap-1">
                    Continuar <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Créditos */}
      <section className="card-surface rounded-2xl p-7">
        <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
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
          <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${Math.min(100, (balance / limit) * 100)}%` }} />
        </div>
      </section>

      <LevelUpModal open={levelUpTo !== null} level={levelUpTo} onClose={dismissLevelUp} />
    </div>
  );
}

function QuickAction({ icon, tint, title, subtitle, cost, onClick }: {
  icon: React.ReactNode; tint: "primary" | "purple" | "green"; title: string; subtitle: string; cost: string; onClick: () => void;
}) {
  const tintClass =
    tint === "primary" ? "bg-primary/15 text-primary border-primary/25" :
    tint === "purple"  ? "bg-purple-500/15 text-purple-300 border-purple-500/25" :
                         "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
  return (
    <button onClick={onClick} className="card-surface rounded-2xl p-6 text-left ad-card-hover group">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${tintClass}`}>
          {icon}
        </div>
        <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" strokeWidth={1.6} />
      </div>
      <div className="font-display font-semibold text-[16px] text-foreground tracking-tight">{title}</div>
      <div className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">{subtitle}</div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mt-4">{cost} por uso</div>
    </button>
  );
}
