import { CountUp } from "@/components/CountUp";
import { Sparkline } from "./Sparkline";
import { ArrowUp, ArrowDown } from "lucide-react";

interface Props {
  label: string;
  sub?: string;
  value: number;
  format?: (n: number) => string;
  series?: number[];
  delta?: number;
  alert?: boolean;
  footer?: React.ReactNode;
  accent?: "primary" | "default";
}

export function StatCardSparkline({ label, sub, value, format, series, delta, alert, footer, accent }: Props) {
  const valueClass = accent === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className={`card-surface rounded-2xl p-5 flex flex-col gap-4 transition-all hover:-translate-y-0.5 ${alert ? "border-primary/60 animate-pulse-amber" : ""}`}>
      <div className="space-y-1">
        {sub && <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">{sub}</div>}
        <div className="text-[12px] text-foreground/80">{label}</div>
      </div>
      <div className={`font-display text-[32px] font-semibold tabular-nums leading-none ${valueClass}`}>
        <CountUp value={value} format={format} />
      </div>
      {series && series.length > 0 && (
        <div className="-mx-1">
          <Sparkline values={series} height={28} />
        </div>
      )}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        {typeof delta === "number" && (
          <span className={`inline-flex items-center gap-1 font-medium ${delta > 0 ? "text-green-500" : delta < 0 ? "text-destructive" : ""}`}>
            {delta > 0 ? <ArrowUp className="w-3 h-3" /> : delta < 0 ? <ArrowDown className="w-3 h-3" /> : null}
            {delta > 0 ? `+${delta}` : delta} vs ayer
          </span>
        )}
        <span className="ml-auto">{footer}</span>
      </div>
    </div>
  );
}
