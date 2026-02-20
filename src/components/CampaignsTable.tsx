import { Play, Pause, MoreHorizontal, ExternalLink } from "lucide-react";

const campaigns = [
  {
    id: 1,
    name: "Black Friday 2025 – Conversiones",
    platform: "Meta",
    status: "active",
    budget: "$4,200",
    spent: "$3,841",
    impressions: "1.2M",
    ctr: "3.8%",
    roas: "4.2x",
    color: "#1877F2",
  },
  {
    id: 2,
    name: "Google Search – Brand Awareness",
    platform: "Google",
    status: "active",
    budget: "$2,800",
    spent: "$2,100",
    impressions: "840K",
    ctr: "5.1%",
    roas: "3.9x",
    color: "#34A853",
  },
  {
    id: 3,
    name: "TikTok Reels – Gen Z Reach",
    platform: "TikTok",
    status: "paused",
    budget: "$1,500",
    spent: "$980",
    impressions: "2.4M",
    ctr: "1.2%",
    roas: "2.1x",
    color: "#FF0050",
  },
  {
    id: 4,
    name: "LinkedIn B2B – Lead Gen Q1",
    platform: "LinkedIn",
    status: "active",
    budget: "$3,600",
    spent: "$2,290",
    impressions: "320K",
    ctr: "0.9%",
    roas: "5.7x",
    color: "#0A66C2",
  },
  {
    id: 5,
    name: "Retargeting – Carrito Abandonado",
    platform: "Meta",
    status: "draft",
    budget: "$1,000",
    spent: "$0",
    impressions: "—",
    ctr: "—",
    roas: "—",
    color: "#1877F2",
  },
];

const statusConfig: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  active: {
    label: "Activa",
    dotClass: "status-dot-active",
    badgeClass: "text-success bg-success/10",
  },
  paused: {
    label: "Pausada",
    dotClass: "status-dot-paused",
    badgeClass: "text-warning bg-warning/10",
  },
  draft: {
    label: "Borrador",
    dotClass: "status-dot-draft",
    badgeClass: "text-muted-foreground bg-muted",
  },
};

export function CampaignsTable() {
  return (
    <div className="card-surface rounded-xl animate-fade-up opacity-0 delay-500" style={{ animationFillMode: "forwards" }}>
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h3 className="font-display font-semibold text-foreground">Campañas Activas</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{campaigns.length} campañas en total</p>
        </div>
        <button className="text-xs px-4 py-2 gradient-brand text-primary-foreground rounded-lg font-semibold hover:opacity-90 transition-opacity">
          + Nueva Campaña
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Campaña", "Estado", "Presupuesto", "Gastado", "Impresiones", "CTR", "ROAS", ""].map((h) => (
                <th key={h} className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {campaigns.map((c, i) => {
              const st = statusConfig[c.status];
              return (
                <tr
                  key={c.id}
                  className="hover:bg-secondary/40 transition-colors group"
                  style={{ animationDelay: `${i * 0.06}s` }}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-2 h-8 rounded-full flex-shrink-0"
                        style={{ background: c.color }}
                      />
                      <div>
                        <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors max-w-[200px] truncate">
                          {c.name}
                        </div>
                        <div className="text-xs text-muted-foreground">{c.platform}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${st.badgeClass}`}>
                      <div className={st.dotClass} />
                      {st.label}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground font-medium">{c.budget}</td>
                  <td className="px-6 py-4 text-sm text-foreground">{c.spent}</td>
                  <td className="px-6 py-4 text-sm text-foreground">{c.impressions}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-accent">{c.ctr}</td>
                  <td className="px-6 py-4">
                    <span className={`text-sm font-bold ${c.roas === "—" ? "text-muted-foreground" : "text-success"}`}>
                      {c.roas}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {c.status === "active" ? (
                        <button className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-warning">
                          <Pause className="w-3.5 h-3.5" />
                        </button>
                      ) : c.status === "paused" ? (
                        <button className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-success">
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                      <button className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
