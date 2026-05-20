import { useMemo } from "react";
import { Activity } from "lucide-react";
import { useCredits, ACTION_HOURS, ACTION_LABEL, type CreditAction } from "@/hooks/useCredits";

export function WeeklySummary() {
  const { history } = useCredits();

  const data = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const week = history.filter((h) => new Date(h.date).getTime() > sevenDaysAgo);
    const credits = week.reduce((s, h) => s + h.cost, 0);
    const hours = week.reduce((s, h) => s + (ACTION_HOURS[h.action] ?? 0), 0);
    const counts = new Map<CreditAction, number>();
    week.forEach((h) => counts.set(h.action, (counts.get(h.action) ?? 0) + 1));
    let topAction: CreditAction | null = null;
    let topN = 0;
    counts.forEach((n, a) => { if (n > topN) { topN = n; topAction = a; } });
    return { credits, hours, actions: week.length, topAction };
  }, [history]);

  if (data.actions === 0) return null;

  return (
    <section className="card-surface rounded-2xl p-7">
      <div className="flex items-center gap-2 mb-5">
        <Activity className="w-4 h-4 text-primary" strokeWidth={1.6} />
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">Tu semana en SUPERNOVA</div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Metric label="Créditos usados" value={data.credits.toLocaleString()} />
        <Metric label="Acciones realizadas" value={data.actions.toString()} />
        <Metric label="Módulo favorito" value={data.topAction ? ACTION_LABEL[data.topAction] : "—"} small />
        <Metric label="Equivale a" value={`~${Math.round(data.hours)} h`} sub="de trabajo manual" highlight />
      </div>
    </section>
  );
}

function Metric({ label, value, sub, small, highlight }: { label: string; value: string; sub?: string; small?: boolean; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-2">{label}</div>
      <div className={`font-display font-semibold leading-tight ${highlight ? "text-primary" : "text-foreground"} ${small ? "text-[15px]" : "text-[22px]"} tabular-nums`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}
