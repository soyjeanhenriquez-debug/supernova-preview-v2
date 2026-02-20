import { ArrowUpRight, Zap, Clock, AlertCircle } from "lucide-react";

const alerts = [
  {
    type: "success",
    icon: <Zap className="w-4 h-4" />,
    title: "Campaña optimizada",
    desc: "Black Friday 2025 aumentó su ROAS en +18% automáticamente",
    time: "hace 2h",
    color: "text-success",
    bg: "bg-success/10",
  },
  {
    type: "warning",
    icon: <AlertCircle className="w-4 h-4" />,
    title: "Presupuesto al límite",
    desc: "Google Search Brand está al 75% del presupuesto diario",
    time: "hace 4h",
    color: "text-warning",
    bg: "bg-warning/10",
  },
  {
    type: "info",
    icon: <Clock className="w-4 h-4" />,
    title: "Reporte semanal listo",
    desc: "Tu resumen de rendimiento de esta semana está disponible",
    time: "hace 1d",
    color: "text-primary",
    bg: "bg-primary/10",
  },
];

const topCreatives = [
  { name: "Video_Summer_v3.mp4", ctr: "5.2%", platform: "Meta", trend: "+12%" },
  { name: "Banner_300x250_Sale.png", ctr: "3.8%", platform: "Google", trend: "+8%" },
  { name: "Carousel_Products.jpg", ctr: "2.9%", platform: "Meta", trend: "+3%" },
];

export function ActivityPanel() {
  return (
    <div className="flex flex-col gap-4">
      {/* Alerts */}
      <div className="card-surface rounded-xl p-5 animate-fade-up opacity-0 delay-400" style={{ animationFillMode: "forwards" }}>
        <h3 className="font-display font-semibold text-foreground mb-4">Alertas y Notificaciones</h3>
        <div className="space-y-3">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg hover:bg-secondary/60 transition-colors cursor-pointer group">
              <div className={`p-1.5 rounded-lg flex-shrink-0 ${a.bg} ${a.color}`}>
                {a.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">{a.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{a.desc}</div>
                <div className="text-xs text-muted-foreground/60 mt-1">{a.time}</div>
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
            </div>
          ))}
        </div>
      </div>

      {/* Top Creatives */}
      <div className="card-surface rounded-xl p-5 animate-fade-up opacity-0 delay-500" style={{ animationFillMode: "forwards" }}>
        <h3 className="font-display font-semibold text-foreground mb-4">Top Creatividades</h3>
        <div className="space-y-3">
          {topCreatives.map((c, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40 hover:bg-secondary/80 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.platform}</div>
              </div>
              <div className="text-right ml-3">
                <div className="text-sm font-bold text-accent">{c.ctr}</div>
                <div className="text-xs text-success">{c.trend}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="card-surface rounded-xl p-5 animate-fade-up opacity-0 delay-500" style={{ animationFillMode: "forwards" }}>
        <h3 className="font-display font-semibold text-foreground mb-4">Resumen de Canales</h3>
        <div className="space-y-3">
          {[
            { name: "Meta Ads", share: 72, color: "#1877F2" },
            { name: "Google Ads", share: 54, color: "#34A853" },
            { name: "TikTok Ads", share: 38, color: "#FF0050" },
            { name: "LinkedIn Ads", share: 22, color: "#0A66C2" },
          ].map((ch) => (
            <div key={ch.name}>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">{ch.name}</span>
                <span className="font-semibold text-foreground">{ch.share}%</span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${ch.share}%`, background: ch.color }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
