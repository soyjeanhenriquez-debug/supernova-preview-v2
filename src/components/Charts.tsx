import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

const areaData = [
  { day: "Lun", impressions: 420000, clicks: 8200, spend: 3100 },
  { day: "Mar", impressions: 680000, clicks: 11400, spend: 4200 },
  { day: "Mié", impressions: 540000, clicks: 9600, spend: 3800 },
  { day: "Jue", impressions: 820000, clicks: 15200, spend: 5900 },
  { day: "Vie", impressions: 760000, clicks: 14100, spend: 5400 },
  { day: "Sáb", impressions: 920000, clicks: 18700, spend: 6800 },
  { day: "Dom", impressions: 680000, clicks: 13200, spend: 4900 },
];

const channelData = [
  { channel: "Meta", spend: 12400, conversions: 3200, roas: 3.8 },
  { channel: "Google", spend: 9800, conversions: 2900, roas: 4.2 },
  { channel: "TikTok", spend: 7200, conversions: 1800, roas: 2.9 },
  { channel: "LinkedIn", spend: 5100, conversions: 900, roas: 2.1 },
  { channel: "Twitter", spend: 3740, conversions: 541, roas: 1.8 },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
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
  }
  return null;
};

export function PerformanceChart() {
  return (
    <div className="card-surface rounded-xl p-6 animate-fade-up opacity-0 delay-300" style={{ animationFillMode: "forwards" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-display font-semibold text-foreground">Rendimiento Semanal</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Impresiones y clics diarios</p>
        </div>
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-muted-foreground">Impresiones</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-accent" />
            <span className="text-muted-foreground">Clics</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={areaData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="impressionGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(210, 100%, 56%)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(210, 100%, 56%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="clickGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(185, 85%, 50%)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(185, 85%, 50%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" />
          <XAxis dataKey="day" tick={{ fill: "hsl(215, 20%, 52%)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "hsl(215, 20%, 52%)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="impressions" stroke="hsl(210, 100%, 56%)" strokeWidth={2} fill="url(#impressionGrad)" />
          <Area type="monotone" dataKey="clicks" stroke="hsl(185, 85%, 50%)" strokeWidth={2} fill="url(#clickGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChannelChart() {
  return (
    <div className="card-surface rounded-xl p-6 animate-fade-up opacity-0 delay-400" style={{ animationFillMode: "forwards" }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-display font-semibold text-foreground">Gasto por Canal</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Distribución del presupuesto</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={channelData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 30%, 18%)" vertical={false} />
          <XAxis dataKey="channel" tick={{ fill: "hsl(215, 20%, 52%)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "hsl(215, 20%, 52%)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="spend" fill="url(#barGrad)" radius={[4, 4, 0, 0]}>
            <defs>
              <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(210, 100%, 56%)" />
                <stop offset="100%" stopColor="hsl(185, 85%, 50%)" />
              </linearGradient>
            </defs>
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
