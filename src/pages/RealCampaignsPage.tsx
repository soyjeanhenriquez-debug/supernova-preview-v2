import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CampaignModal } from "@/components/CampaignModal";
import { Plus, Play, Pause, Pencil, Trash2, Search, Filter, Loader2 } from "lucide-react";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  active: { label: "Activa", dotClass: "status-dot-active", badgeClass: "text-success bg-success/10" },
  paused: { label: "Pausada", dotClass: "status-dot-paused", badgeClass: "text-warning bg-warning/10" },
  draft: { label: "Borrador", dotClass: "status-dot-draft", badgeClass: "text-muted-foreground bg-muted" },
  completed: { label: "Completada", dotClass: "status-dot-draft", badgeClass: "text-accent bg-accent/10" },
};

const platformColor: Record<string, string> = {
  Meta: "#1877F2", Google: "#34A853", TikTok: "#FF0050",
  LinkedIn: "#0A66C2", Twitter: "#1DA1F2", YouTube: "#FF0000", Other: "#6B7280",
};

export function RealCampaignsPage() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editCampaign, setEditCampaign] = useState<any>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const fetchCampaigns = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error("Error al cargar campañas");
    else setCampaigns(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchCampaigns(); }, [user]);

  const toggleStatus = async (campaign: any) => {
    const newStatus = campaign.status === "active" ? "paused" : "active";
    const { error } = await supabase.from("campaigns").update({ status: newStatus }).eq("id", campaign.id);
    if (error) toast.error("Error al actualizar estado");
    else {
      toast.success(`Campaña ${newStatus === "active" ? "activada" : "pausada"}`);
      fetchCampaigns();
    }
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm("¿Eliminar esta campaña? Esta acción no se puede deshacer.")) return;
    const { error } = await supabase.from("campaigns").delete().eq("id", id);
    if (error) toast.error("Error al eliminar");
    else { toast.success("Campaña eliminada"); fetchCampaigns(); }
  };

  const filtered = campaigns.filter((c) => {
    const matchesFilter = filter === "all" || c.status === filter;
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.platform.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const totalBudget = campaigns.reduce((s, c) => s + Number(c.budget), 0);
  const totalSpent = campaigns.reduce((s, c) => s + Number(c.spent), 0);
  const activeCount = campaigns.filter((c) => c.status === "active").length;

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total campañas", value: campaigns.length },
          { label: "Campañas activas", value: activeCount },
          { label: "Presupuesto total", value: `$${totalBudget.toLocaleString()}` },
        ].map((s) => (
          <div key={s.label} className="card-surface rounded-xl p-4">
            <div className="text-2xl font-display font-bold gradient-text">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {["all", "active", "paused", "draft"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filter === f ? "gradient-brand text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground border border-border"
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
              className="bg-secondary border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary w-44"
            />
          </div>
          <button
            onClick={() => { setEditCampaign(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg gradient-brand text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity glow-primary"
          >
            <Plus className="w-4 h-4" /> Nueva
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card-surface rounded-xl">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Campaña", "Estado", "Plataforma", "Presupuesto", "Gastado", "Impresiones", "CTR", "ROAS", "Acciones"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center">
                      <div className="space-y-2">
                        <div className="text-3xl">📢</div>
                        <div className="text-sm font-medium text-foreground">No hay campañas</div>
                        <div className="text-xs text-muted-foreground">Crea tu primera campaña para empezar</div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => {
                    const st = statusConfig[c.status] || statusConfig.draft;
                    return (
                      <tr key={c.id} className="hover:bg-secondary/40 transition-colors group">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ background: platformColor[c.platform] || "#6B7280" }} />
                            <div>
                              <div className="text-sm font-medium text-foreground max-w-[180px] truncate">{c.name}</div>
                              <div className="text-xs text-muted-foreground capitalize">{c.objective}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${st.badgeClass}`}>
                            <div className={st.dotClass} />{st.label}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-foreground">{c.platform}</td>
                        <td className="px-5 py-4 text-sm font-medium text-foreground">${Number(c.budget).toLocaleString()}</td>
                        <td className="px-5 py-4">
                          <div>
                            <div className="text-sm text-foreground">${Number(c.spent).toLocaleString()}</div>
                            {c.budget > 0 && (
                              <div className="mt-1 h-1 w-16 bg-secondary rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min((c.spent / c.budget) * 100, 100)}%` }} />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-foreground">{c.impressions > 0 ? c.impressions.toLocaleString() : "—"}</td>
                        <td className="px-5 py-4 text-sm font-semibold text-accent">{c.ctr > 0 ? `${c.ctr}%` : "—"}</td>
                        <td className="px-5 py-4"><span className={`text-sm font-bold ${c.roas > 0 ? "text-success" : "text-muted-foreground"}`}>{c.roas > 0 ? `${c.roas}x` : "—"}</span></td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => toggleStatus(c)}
                              className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                              title={c.status === "active" ? "Pausar" : "Activar"}
                            >
                              {c.status === "active" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => { setEditCampaign(c); setShowModal(true); }}
                              className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-primary"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteCampaign(c.id)}
                              className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <CampaignModal
          onClose={() => { setShowModal(false); setEditCampaign(null); }}
          onSuccess={() => { setShowModal(false); setEditCampaign(null); fetchCampaigns(); }}
          editCampaign={editCampaign}
        />
      )}
    </div>
  );
}
