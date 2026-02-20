import { Play, Pause, MoreHorizontal, Filter, Search, Plus } from "lucide-react";
import { useState } from "react";

const allCampaigns = [
  { id: 1, name: "Black Friday 2025 – Conversiones", platform: "Meta", status: "active", budget: 4200, spent: 3841, impressions: "1.2M", ctr: "3.8%", roas: "4.2x", color: "#1877F2", start: "01/11/2025", end: "30/11/2025" },
  { id: 2, name: "Google Search – Brand Awareness", platform: "Google", status: "active", budget: 2800, spent: 2100, impressions: "840K", ctr: "5.1%", roas: "3.9x", color: "#34A853", start: "15/10/2025", end: "15/01/2026" },
  { id: 3, name: "TikTok Reels – Gen Z Reach", platform: "TikTok", status: "paused", budget: 1500, spent: 980, impressions: "2.4M", ctr: "1.2%", roas: "2.1x", color: "#FF0050", start: "01/09/2025", end: "31/12/2025" },
  { id: 4, name: "LinkedIn B2B – Lead Gen Q1", platform: "LinkedIn", status: "active", budget: 3600, spent: 2290, impressions: "320K", ctr: "0.9%", roas: "5.7x", color: "#0A66C2", start: "01/01/2026", end: "31/03/2026" },
  { id: 5, name: "Retargeting – Carrito Abandonado", platform: "Meta", status: "draft", budget: 1000, spent: 0, impressions: "—", ctr: "—", roas: "—", color: "#1877F2", start: "—", end: "—" },
  { id: 6, name: "YouTube Pre-roll – Verano", platform: "Google", status: "active", budget: 5000, spent: 1200, impressions: "3.1M", ctr: "2.4%", roas: "3.1x", color: "#FF0000", start: "01/12/2025", end: "28/02/2026" },
];

const statusConfig: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  active: { label: "Activa", dotClass: "status-dot-active", badgeClass: "text-success bg-success/10" },
  paused: { label: "Pausada", dotClass: "status-dot-paused", badgeClass: "text-warning bg-warning/10" },
  draft: { label: "Borrador", dotClass: "status-dot-draft", badgeClass: "text-muted-foreground bg-muted" },
};

export function CampaignsPage() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = allCampaigns.filter((c) => {
    const matchesFilter = filter === "all" || c.status === filter;
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.platform.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {["all", "active", "paused", "draft"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filter === f
                  ? "gradient-brand text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground border border-border"
              }`}
            >
              {f === "all" ? "Todas" : f === "active" ? "Activas" : f === "paused" ? "Pausadas" : "Borradores"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-secondary border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary w-48"
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
            <Filter className="w-4 h-4" /> Filtros
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-brand text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" /> Nueva
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card-surface rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {["Campaña", "Estado", "Presupuesto", "Gastado", "Impresiones", "CTR", "ROAS", "Periodo", ""].map((h) => (
                  <th key={h} className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => {
                const st = statusConfig[c.status];
                return (
                  <tr key={c.id} className="hover:bg-secondary/40 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ background: c.color }} />
                        <div>
                          <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors max-w-[180px] truncate">{c.name}</div>
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
                    <td className="px-6 py-4 text-sm font-medium text-foreground">${c.budget.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm text-foreground">${c.spent.toLocaleString()}</div>
                        {c.budget > 0 && (
                          <div className="mt-1 h-1 w-20 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min((c.spent / c.budget) * 100, 100)}%` }} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground">{c.impressions}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-accent">{c.ctr}</td>
                    <td className="px-6 py-4"><span className={`text-sm font-bold ${c.roas === "—" ? "text-muted-foreground" : "text-success"}`}>{c.roas}</span></td>
                    <td className="px-6 py-4 text-xs text-muted-foreground">{c.start} – {c.end}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                          {c.status === "active" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
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
          {filtered.length === 0 && (
            <div className="py-16 text-center text-muted-foreground text-sm">No se encontraron campañas</div>
          )}
        </div>
      </div>
    </div>
  );
}
