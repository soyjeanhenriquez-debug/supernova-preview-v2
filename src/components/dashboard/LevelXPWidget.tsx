import { BADGES, LEVELS, levelOf, nextLevel } from "@/lib/gamification";
import { Lock } from "lucide-react";

interface Props { xp: number; badges: string[]; }

export function LevelXPWidget({ xp, badges }: Props) {
  const cur = levelOf(xp);
  const nxt = nextLevel(xp);
  const max = nxt ? nxt.min : cur.max;
  const rangeStart = cur.min;
  const pct = nxt ? Math.min(100, ((xp - rangeStart) / (max - rangeStart)) * 100) : 100;
  const toNext = nxt ? Math.max(0, nxt.min - xp) : 0;

  return (
    <section className="card-surface rounded-2xl p-7">
      <div className="flex items-end justify-between mb-1 flex-wrap gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium mb-1">Nivel {cur.n}</div>
          <h3 className="font-display font-semibold text-lg text-foreground">{cur.name}</h3>
        </div>
        <span className="font-display text-[28px] font-semibold tabular-nums text-primary">
          {xp.toLocaleString()} <span className="text-[12px] text-muted-foreground font-sans font-normal">XP</span>
        </span>
      </div>

      <div className="mt-5 mb-2">
        <div className="w-full h-[6px] bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground">
        {nxt
          ? <>{toNext.toLocaleString()} XP para <span className="text-foreground font-medium">Nivel {nxt.n} — {nxt.name}</span></>
          : "Nivel máximo alcanzado"}
      </div>

      <div className="mt-6">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium mb-3">Insignias</div>
        <div className="flex flex-wrap gap-2">
          {BADGES.map(b => {
            const unlocked = badges.includes(b.id);
            return (
              <div key={b.id}
                title={b.label}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-medium transition-all
                  ${unlocked ? "bg-primary/10 border-primary/30 text-foreground" : "bg-secondary/30 border-border text-muted-foreground/70"}`}>
                <span className="text-sm leading-none">{unlocked ? b.icon : <Lock className="w-3 h-3 inline" />}</span>
                <span>{b.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
