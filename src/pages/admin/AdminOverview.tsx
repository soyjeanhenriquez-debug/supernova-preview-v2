import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, Activity, Coins, Search } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

interface Kpi { totalUsers: number; activeToday: number; creditsToday: number; searchesToday: number; }
interface FeedItem { ts: string; who: string; what: string; }

const startOfDay = () => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); };
const hoursAgo = (h: number) => new Date(Date.now() - h*3600_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d*86400_000).toISOString();

function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime())/1000;
  if (diff < 60) return "hace unos segundos";
  if (diff < 3600) return `hace ${Math.floor(diff/60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff/3600)} h`;
  return `hace ${Math.floor(diff/86400)} d`;
}

export default function AdminOverview() {
  const [kpi, setKpi] = useState<Kpi>({ totalUsers: 0, activeToday: 0, creditsToday: 0, searchesToday: 0 });
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [activityChart, setActivityChart] = useState<{day:string;users:number}[]>([]);
  const [creditsByModule, setCreditsByModule] = useState<{module:string;cost:number}[]>([]);
  const [topKeywords, setTopKeywords] = useState<{keyword:string;count:number}[]>([]);
  const [topUsers, setTopUsers] = useState<{user_id:string;total:number}[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    const sod = startOfDay();
    const since2h = hoursAgo(2);
    const since30d = daysAgo(30);

    const [
      profiles, history, credits, landings, kwAll, allCredits,
    ] = await Promise.all([
      supabase.from("profiles").select("user_id", { count: "exact", head: true }),
      supabase.from("ad_history").select("user_id, visited_at, title, page_name").gte("visited_at", since2h).order("visited_at", { ascending: false }).limit(50),
      supabase.from("credit_transactions").select("user_id, cost, action, label, created_at, meta").gte("created_at", sod),
      supabase.from("landing_analyses").select("user_id, url, brand_name, created_at").gte("created_at", sod).order("created_at", { ascending: false }).limit(50),
      supabase.from("winning_ads").select("keyword").gte("scraped_at", sod),
      supabase.from("credit_transactions").select("user_id, cost, action, created_at").gte("created_at", since30d),
    ]);

    const activeIds = new Set<string>();
    (history.data || []).forEach(r => r.user_id && activeIds.add(r.user_id));
    (credits.data || []).forEach(r => r.user_id && activeIds.add(r.user_id));
    (landings.data || []).forEach(r => r.user_id && activeIds.add(r.user_id));

    const creditsTodaySum = (credits.data || []).reduce((s, r) => s + (r.cost || 0), 0);
    const searchesToday = (kwAll.data?.length || 0) + (landings.data?.length || 0);

    setKpi({
      totalUsers: profiles.count || 0,
      activeToday: activeIds.size,
      creditsToday: creditsTodaySum,
      searchesToday,
    });

    // Live feed (merge events)
    const events: FeedItem[] = [];
    (history.data || []).slice(0, 15).forEach(r => events.push({
      ts: r.visited_at, who: r.user_id?.slice(0, 8) || "?", what: `visitó ad "${r.title || r.page_name || "—"}"`,
    }));
    (credits.data || []).slice(0, 15).forEach(r => events.push({
      ts: r.created_at, who: r.user_id?.slice(0, 8) || "?", what: `gastó ${r.cost} créditos en ${r.label || r.action}`,
    }));
    (landings.data || []).slice(0, 15).forEach(r => events.push({
      ts: r.created_at, who: r.user_id?.slice(0, 8) || "?", what: `analizó ${r.brand_name || r.url} en el Oráculo`,
    }));
    events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    setFeed(events.slice(0, 20));

    // Activity 30d (active users per day)
    const byDay = new Map<string, Set<string>>();
    (allCredits.data || []).forEach(r => {
      const d = new Date(r.created_at).toISOString().slice(0, 10);
      if (!byDay.has(d)) byDay.set(d, new Set());
      byDay.get(d)!.add(r.user_id);
    });
    const days: {day:string;users:number}[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i*86400_000).toISOString().slice(0, 10);
      days.push({ day: d.slice(5), users: byDay.get(d)?.size || 0 });
    }
    setActivityChart(days);

    // Credits by module this week
    const sinceWeek = daysAgo(7);
    const { data: weekCredits } = await supabase.from("credit_transactions")
      .select("action, label, cost").gte("created_at", sinceWeek);
    const moduleMap = new Map<string, number>();
    (weekCredits || []).forEach(r => {
      const key = r.label || r.action || "otro";
      moduleMap.set(key, (moduleMap.get(key) || 0) + (r.cost || 0));
    });
    setCreditsByModule(
      Array.from(moduleMap.entries()).map(([module, cost]) => ({ module, cost })).sort((a, b) => b.cost - a.cost).slice(0, 8)
    );

    // Top keywords (all-time, top 10)
    const { data: allKw } = await supabase.from("winning_ads").select("keyword").limit(1000);
    const kwMap = new Map<string, number>();
    (allKw || []).forEach(r => { if (r.keyword) kwMap.set(r.keyword, (kwMap.get(r.keyword) || 0) + 1); });
    setTopKeywords(
      Array.from(kwMap.entries()).map(([keyword, count]) => ({ keyword, count })).sort((a, b) => b.count - a.count).slice(0, 10)
    );

    // Top users by credits (30d)
    const userMap = new Map<string, number>();
    (allCredits.data || []).forEach(r => userMap.set(r.user_id, (userMap.get(r.user_id) || 0) + (r.cost || 0)));
    setTopUsers(
      Array.from(userMap.entries()).map(([user_id, total]) => ({ user_id, total })).sort((a, b) => b.total - a.total).slice(0, 10)
    );

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 30_000);
    return () => clearInterval(id);
  }, []);

  const kpis = [
    { label: "Usuarios totales", value: kpi.totalUsers, icon: Users },
    { label: "Activos hoy", value: kpi.activeToday, icon: Activity },
    { label: "Créditos hoy", value: kpi.creditsToday, icon: Coins },
    { label: "Búsquedas hoy", value: kpi.searchesToday, icon: Search },
  ];

  const pieColors = ["hsl(35 92% 60%)", "hsl(240 4% 56%)", "hsl(211 100% 50%)", "hsl(142 70% 45%)"];

  return (
    <div className="space-y-8 max-w-[1400px]">
      <header>
        <h1 className="font-display text-2xl tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Métricas en tiempo real del sistema · actualiza cada 30s
        </p>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">{label}</div>
              <Icon className="w-4 h-4 text-muted-foreground" strokeWidth={1.6} />
            </div>
            <div className="mt-3 font-display text-3xl tracking-tight">
              {loading ? "—" : value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Live feed */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-sm tracking-tight">Actividad en tiempo real · últimas 2h</h2>
          <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> LIVE
          </span>
        </div>
        {feed.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Sin actividad reciente</p>
        ) : (
          <ul className="space-y-2 max-h-[320px] overflow-auto">
            {feed.map((e, i) => (
              <li key={i} className="flex items-center gap-3 text-[13px] py-1.5 border-b border-border/40 last:border-0">
                <span className="font-mono text-[11px] text-muted-foreground w-20 shrink-0">{e.who}…</span>
                <span className="flex-1 truncate">{e.what}</span>
                <span className="text-[11px] text-muted-foreground shrink-0">{relTime(e.ts)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
          <h3 className="font-display text-sm tracking-tight mb-4">Usuarios activos · últimos 30 días</h3>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activityChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(240 4% 18%)" />
                <XAxis dataKey="day" stroke="hsl(240 4% 56%)" fontSize={10} />
                <YAxis stroke="hsl(240 4% 56%)" fontSize={10} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(240 4% 11%)", border: "1px solid hsl(240 4% 18%)", borderRadius: 8 }} />
                <Line type="monotone" dataKey="users" stroke="hsl(35 92% 60%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-display text-sm tracking-tight mb-4">Créditos por módulo · semana</h3>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={creditsByModule} layout="vertical">
                <XAxis type="number" stroke="hsl(240 4% 56%)" fontSize={10} />
                <YAxis type="category" dataKey="module" stroke="hsl(240 4% 56%)" fontSize={10} width={90} />
                <Tooltip contentStyle={{ background: "hsl(240 4% 11%)", border: "1px solid hsl(240 4% 18%)", borderRadius: 8 }} />
                <Bar dataKey="cost" fill="hsl(35 92% 60%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top performers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-display text-sm tracking-tight mb-4">Top keywords · histórico</h3>
          {topKeywords.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin datos</p>
          ) : (
            <ul className="space-y-2">
              {topKeywords.map((k, i) => (
                <li key={k.keyword} className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-3">
                    <span className="text-muted-foreground w-5">{i+1}</span>
                    <span>{k.keyword}</span>
                  </span>
                  <span className="text-muted-foreground">{k.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-display text-sm tracking-tight mb-4">Top usuarios · créditos 30d</h3>
          {topUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin transacciones aún. Empieza a usar la app para verlas aquí.</p>
          ) : (
            <ul className="space-y-2">
              {topUsers.map((u, i) => (
                <li key={u.user_id} className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-3">
                    <span className="text-muted-foreground w-5">{i+1}</span>
                    <span className="font-mono text-[12px]">{u.user_id.slice(0,12)}…</span>
                  </span>
                  <span className="text-primary font-medium">{u.total}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
