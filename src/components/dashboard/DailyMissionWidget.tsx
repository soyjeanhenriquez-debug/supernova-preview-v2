import { Check, Zap } from "lucide-react";
import { useDailyMission } from "@/hooks/useDailyMission";

export function DailyMissionWidget() {
  const { set, progress, completedTasks, totalTasks, allDone } = useDailyMission();
  const pct = (completedTasks / totalTasks) * 100;
  const today = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  return (
    <section className="card-surface rounded-2xl p-7">
      <div className="flex items-end justify-between mb-1 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-[12px] font-bold uppercase tracking-wider text-foreground">Misión de hoy</span>
        </div>
        <span className="text-[11px] text-muted-foreground capitalize">{today}</span>
      </div>
      <p className="text-[13px] text-muted-foreground mb-5">
        Completa las {totalTasks} misiones y gana <span className="text-primary font-semibold">+50 créditos bonus</span>
      </p>

      <div className="space-y-2.5 mb-5">
        {set.tasks.map((t, i) => {
          const cur = progress.counts[t.action] ?? 0;
          const done = cur >= t.count;
          return (
            <div key={i} className={`flex items-center gap-3 px-3.5 py-3 rounded-lg border transition-all ${done ? "border-primary/30 bg-primary/5" : "border-border bg-card/40"}`}>
              <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${done ? "bg-primary text-primary-foreground" : "border border-border bg-background"}`}>
                {done && <Check className="w-3 h-3" strokeWidth={3} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-[13px] font-medium ${done ? "text-foreground" : "text-foreground/90"}`}>{t.label}</div>
                <div className="text-[10px] text-muted-foreground tabular-nums">{Math.min(cur, t.count)}/{t.count}</div>
              </div>
              <span className="text-[11px] font-semibold text-primary whitespace-nowrap">+{t.xp} XP</span>
            </div>
          );
        })}
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Progreso</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">{completedTasks}/{totalTasks}</span>
        </div>
        <div className="w-full h-[3px] bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {allDone && progress.claimed ? (
        <div className="text-[12px] text-primary font-medium">⚡ Misión completada · +50 créditos otorgados</div>
      ) : (
        <p className="text-[12px] text-muted-foreground italic">"Los ganadores no esperan inspiración. Crean hábitos."</p>
      )}
    </section>
  );
}
