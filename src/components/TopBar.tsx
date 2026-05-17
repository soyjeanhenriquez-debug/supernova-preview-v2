import { Coins } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";
import { CountUp } from "@/components/CountUp";

interface TopBarProps { activePage: string }

export function TopBar({ activePage }: TopBarProps) {
  const { balance, limit } = useCredits();
  const low = balance < 100;
  return (
    <header className="flex items-center justify-between px-8 py-4 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div>
        <h1 className="font-display font-bold text-xl text-foreground">{activePage}</h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${low ? "border-destructive/40 bg-destructive/10" : "border-primary/30 bg-primary/10"}`}>
          <Coins className={`w-4 h-4 ${low ? "text-destructive" : "text-primary"}`} />
          <span className={`text-sm font-bold ${low ? "text-destructive" : "text-primary"}`}>
            <CountUp value={balance} />
          </span>
          <span className="text-xs text-muted-foreground">/ {limit.toLocaleString()} créditos</span>
        </div>
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 border border-success/30 text-xs font-bold tracking-widest text-success">
          <span className="live-dot" />
          MINER ACTIVO
        </div>
      </div>
    </header>
  );
}
