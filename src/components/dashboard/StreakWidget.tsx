import { Flame } from "lucide-react";

const DAYS = ["L", "M", "X", "J", "V", "S", "D"];

interface Props { streak: number; lastLoginDate: string | null; }

export function StreakWidget({ streak, lastLoginDate }: Props) {
  // Build week status: Monday..Sunday of current ISO week
  const today = new Date();
  const dayIdx = (today.getDay() + 6) % 7; // 0=Mon
  const monday = new Date(today); monday.setDate(today.getDate() - dayIdx); monday.setHours(0,0,0,0);

  // Estimate active days: last `streak` days are active (going back from today)
  const activeSet = new Set<string>();
  for (let i = 0; i < streak; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    activeSet.add(d.toISOString().slice(0, 10));
  }
  if (lastLoginDate) activeSet.add(lastLoginDate);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    return {
      label: DAYS[i],
      iso: d.toISOString().slice(0, 10),
      future: d > today,
      active: activeSet.has(d.toISOString().slice(0, 10)),
    };
  });

  const weeklyProgress = Math.min(7, streak);
  const pct = (weeklyProgress / 7) * 100;

  return (
    <section className="card-surface rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-primary" />
          <span className="text-[12px] font-bold uppercase tracking-wider text-foreground">Racha JARVIS</span>
        </div>
        <div className="text-[12px] text-muted-foreground">
          {streak === 0 ? "Empieza tu racha hoy" : streak === 1 ? "1 día" : `${streak} días consecutivos`}
        </div>
      </div>

      <div className="flex items-baseline gap-3 mb-4">
        <span className="font-display text-[48px] font-semibold tabular-nums leading-none text-foreground">{streak}</span>
        <span className="text-[13px] text-muted-foreground">{streak === 1 ? "día" : "días"}</span>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-muted-foreground">{weeklyProgress}/7 días para badge semanal</span>
        </div>
        <div className="w-full h-[3px] bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 mt-4">
        {weekDays.map((d) => (
          <div key={d.iso} className="flex flex-col items-center gap-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{d.label}</div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold transition-all
              ${d.active ? "bg-primary text-primary-foreground" : d.future ? "bg-secondary/30 text-muted-foreground/60" : "bg-secondary text-muted-foreground"}`}>
              {d.active ? "✓" : ""}
            </div>
          </div>
        ))}
      </div>

      {streak > 0 && (
        <p className="text-[12px] text-muted-foreground mt-4 italic">
          Llevas {streak} {streak === 1 ? "día" : "días"} seguidos. ¡No rompas la racha!
        </p>
      )}
    </section>
  );
}
