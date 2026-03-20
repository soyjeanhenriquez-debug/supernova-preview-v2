import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { TrendingUp, TrendingDown, MousePointer, Eye, DollarSign, Target, Loader2, Megaphone, Zap } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

interface Campaign {
  id: string;
  name: string;
  platform: string;
  status: string;
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number | null;
  roas: number | null;
}

const platformColor: Record<string, string> = {
  Meta: "#1877F2", Google: "#34A853", TikTok: "#FF0050",
  LinkedIn: "#0A66C2", Twitter: "#1DA1F2", YouTube: "#FF0000", Other: "#6B7280",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card-surface rounded-lg p-3 text-xs space-y-1 min-w-[140px]">
      <div className="font-semibold text-foreground mb-2">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span className="text-muted-foreground capitalize">{p.name}</span>
          <span className="font-semibold" style={{ color: p.color }}>
            {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

export function DashboardPage() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setCampaigns((data as Campaign[]) || []);
      setLoading(false);
    };
    fetch();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const totalSpent = campaigns.reduce((s, c) => s + Number(c.spent), 0);
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const activeCount = campaigns.filter((c) => c.status === "active").length;

  const formatNum = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  // Group by platform for chart
  const platformData = Object.entries(
    campaigns.reduce<Record<string, { spent: number; conversions: number }>>((acc, c) => {
      if (!acc[c.platform]) acc[c.platform] = { spent: 0, conversions: 0 };
      acc[c.platform].spent += Number(c.spent);
      acc[c.platform].conversions += c.conversions;
      return acc;
    }, {})
  ).map(([platform, data]) => ({ platform, ...data }));

  const metrics = [
    { label: "Impresiones totales", value: formatNum(totalImpressions), icon: <Eye className="w-4 h-4" />, highlight: true },
    { label: "Clics totales", value: formatNum(totalClicks), icon: <MousePointer className="w-4 h-4" /> },
    { label: "Gasto total", value: `$${formatNum(totalSpent)}`, icon: <DollarSign className="w-4 h-4" /> },
    { label: "Conversiones", value: formatNum(totalConversions), icon: <Target className="w-4 h-4" /> },
  ];

  const isEmpty = campaigns.length === 0;

  return (
    <div className="space-y-6">
      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="card-surface rounded-xl p-5 hover:border-primary/30 transition-all group">
            <div className="flex items-start justify-between mb-4">
              <div className={`p-2.5 rounded-lg transition-all ${m.highlight ? "gradient-brand" : "bg-secondary group-hover:bg-secondary/80"}`}>
                <div className={m.highlight ? "text-primary-foreground" : "text-primary"}>{m.icon}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <Megaphone className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{activeCount} activas</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl font-display font-bold text-foreground">{m.value}</div>
              <div className="text-sm text-muted-foreground">{m.label}</div>
            </div>
          </div>
        ))}
      </div>

      {isEmpty ? (
        <div className="card-surface rounded-xl py-20 text-center">
          <div className="text-5xl mb-4">📢</div>
          <div className="font-display font-semibold text-foreground mb-2">Sin campañas todavía</div>
          <div className="text-sm text-muted-foreground max-w-md mx-auto">
            Ve a la sección de Campañas para crear tu primera campaña y empezar a ver métricas reales aquí
          </div>
        </div>
      ) : (
        <>
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Spending by platform */}
            <div className="card-surface rounded-xl p-6">
              <h3 className="font-display font-semibold text-foreground mb-5 flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Gasto por Plataforma
              </h3>
              {platformData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={platformData} barSize={28}>
                    <XAxis dataKey="platform" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="spent" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Gasto" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">Sin datos</div>
              )}
            </div>

            {/* Conversions by platform */}
            <div className="card-surface rounded-xl p-6">
              <h3 className="font-display font-semibold text-foreground mb-5 flex items-center gap-2">
                <Target className="w-4 h-4 text-accent" />
                Conversiones por Plataforma
              </h3>
              {platformData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={platformData} barSize={28}>
                    <XAxis dataKey="platform" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="conversions" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} name="Conversiones" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">Sin datos</div>
              )}
            </div>
          </div>

          {/* Campaigns summary */}
          <div className="card-surface rounded-xl">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="font-display font-semibold text-foreground">Resumen de Campañas</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {["Campaña", "Estado", "Presupuesto", "Gastado", "Impresiones", "CTR", "ROAS"].map((h) => (
                      <th key={h} className="text-left px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {campaigns.slice(0, 5).map((c) => (
                    <tr key={c.id} className="hover:bg-secondary/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ background: platformColor[c.platform] || "#6B7280" }} />
                          <div>
                            <div className="text-sm font-medium text-foreground max-w-[180px] truncate">{c.name}</div>
                            <div className="text-xs text-muted-foreground">{c.platform}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          c.status === "active" ? "text-success bg-success/10" :
                          c.status === "paused" ? "text-warning bg-warning/10" :
                          "text-muted-foreground bg-muted"
                        }`}>
                          {c.status === "active" ? "Activa" : c.status === "paused" ? "Pausada" : c.status === "completed" ? "Completada" : "Borrador"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-foreground">${Number(c.budget).toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm text-foreground">${Number(c.spent).toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm text-foreground">{c.impressions > 0 ? formatNum(c.impressions) : "—"}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-accent">{c.ctr && c.ctr > 0 ? `${c.ctr}%` : "—"}</td>
                      <td className="px-6 py-4"><span className={`text-sm font-bold ${c.roas && c.roas > 0 ? "text-success" : "text-muted-foreground"}`}>{c.roas && c.roas > 0 ? `${c.roas}x` : "—"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
