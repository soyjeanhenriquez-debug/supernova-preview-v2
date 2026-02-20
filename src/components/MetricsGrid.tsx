import { TrendingUp, TrendingDown, MousePointer, Eye, DollarSign, Target } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  change: number;
  icon: React.ReactNode;
  prefix?: string;
  delay?: string;
  highlight?: boolean;
}

function MetricCard({ label, value, change, icon, prefix = "", delay = "", highlight = false }: MetricCardProps) {
  const isPositive = change >= 0;
  return (
    <div
      className={`card-surface rounded-xl p-5 animate-fade-up opacity-0 transition-all hover:border-primary/30 group ${delay}`}
      style={{ animationFillMode: "forwards" }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2.5 rounded-lg transition-all ${highlight ? "gradient-brand" : "bg-secondary group-hover:bg-secondary/80"}`}>
          <div className={highlight ? "text-primary-foreground" : "text-primary"}>
            {icon}
          </div>
        </div>
        <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
          isPositive ? "text-success bg-success/10" : "text-destructive bg-destructive/10"
        }`}>
          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {isPositive ? "+" : ""}{change}%
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-2xl font-display font-bold text-foreground">
          {prefix}{value}
        </div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export function MetricsGrid() {
  const metrics = [
    { label: "Impresiones totales", value: "4.82M", change: 12.4, icon: <Eye className="w-4 h-4" />, delay: "delay-100", highlight: true },
    { label: "Clics totales", value: "128,490", change: 8.1, icon: <MousePointer className="w-4 h-4" />, delay: "delay-200" },
    { label: "Gasto total", value: "38,240", change: -3.2, icon: <DollarSign className="w-4 h-4" />, prefix: "$", delay: "delay-300" },
    { label: "Conversiones", value: "9,341", change: 21.7, icon: <Target className="w-4 h-4" />, delay: "delay-400" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {metrics.map((m) => (
        <MetricCard key={m.label} {...m} />
      ))}
    </div>
  );
}
