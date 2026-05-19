import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Search, Plus, Trash2, Sparkles, Play, TrendingUp, Activity,
  Globe, Flame, RefreshCw, Check, Languages, Users, Crown, Brain, Loader2,
  Zap, Pause, PlayCircle, Clock, Target,
} from "lucide-react";
import { DR_KEYWORDS, HIGH_YIELD_KEYWORDS } from "@/lib/dr-keywords";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

type KW = {
  id: string;
  keyword: string;
  is_active: boolean;
  last_searched_at: string | null;
  created_at: string;
  ads_count: number;
  winners_count: number;
  last_scraped_at: string | null;
};
type TopRow = {
  keyword: string;
  user_count: number;
  total_uses: number;
  active_count: number;
  last_used_at: string | null;
  first_seen_at: string;
};

type EliteSug = { keyword: string; reason: string; category: string };

type MasterState = {
  id: string; keyword: string; source_tier: string | null;
  is_paused: boolean; last_run_at: string | null;
  last_found_count: number; total_found: number; total_winners: number; total_runs: number;
};
type MasterRun = {
  id: string; started_at: string; finished_at: string | null;
  keywords_used: string[]; ads_found: number; winners_found: number;
  success: boolean; triggered_by: string;
};
type EngineKpis = {
  total_keywords: number; active_keywords: number; paused_keywords: number;
  total_ingested: number; total_winners: number; winner_pct: number;
  total_runs: number; last_run_at: string | null; active_this_hour: string[];
};



const LANGS = [
  { code: "all", label: "Todos", icon: "🌐" },
  { code: "en", label: "Inglés", icon: "🇺🇸" },
  { code: "es", label: "Español", icon: "🇪🇸" },
  { code: "pt", label: "Português", icon: "🇧🇷" },
];

function detectLang(k: string): "en" | "es" | "pt" {
  const s = k.toLowerCase();
  if (/[ãõçáâê]|ção|você|grátis|saiba|comprar agora|emagrec|gratuito|segredo|treinamento/i.test(s)) return "pt";
  if (/[ñáéíóú¿¡]|gratis|ahora|comprar|curso|método|secreto|aprende|cómo|ganar|dinero|desde casa|garantía/i.test(s)) return "es";
  return "en";
}

// Curated bank of fresh DR suggestions per language
const SUGGESTION_BANK: Record<"en" | "es" | "pt", string[]> = {
  en: [
    ...DR_KEYWORDS.tier4_hooks,
    ...DR_KEYWORDS.tier5_niches,
    ...DR_KEYWORDS.tier6_funnels,
    ...HIGH_YIELD_KEYWORDS,
  ].filter((k) => detectLang(k) === "en"),
  es: [
    ...DR_KEYWORDS.tier1_disclaimers,
    ...DR_KEYWORDS.tier3_ctas,
    ...DR_KEYWORDS.tier4_hooks,
    ...DR_KEYWORDS.tier5_niches,
    ...DR_KEYWORDS.tier6_funnels,
  ].filter((k) => detectLang(k) === "es"),
  pt: [
    ...DR_KEYWORDS.tier1_disclaimers,
    ...DR_KEYWORDS.tier3_ctas,
    ...DR_KEYWORDS.tier4_hooks,
    ...DR_KEYWORDS.tier5_niches,
    ...DR_KEYWORDS.tier6_funnels,
  ].filter((k) => detectLang(k) === "pt"),
};

function dailySuggestions(existing: Set<string>) {
  // Deterministic "of the day" so it changes daily but is stable within the day
  const day = Math.floor(Date.now() / 86400000);
  const pick = (arr: string[], n: number) => {
    const fresh = arr.filter((k) => !existing.has(k.toLowerCase()));
    const out: string[] = [];
    for (let i = 0; i < fresh.length && out.length < n; i++) {
      out.push(fresh[(day * 7 + i * 13) % fresh.length]);
    }
    return Array.from(new Set(out));
  };
  return {
    en: pick(SUGGESTION_BANK.en, 6),
    es: pick(SUGGESTION_BANK.es, 6),
    pt: pick(SUGGESTION_BANK.pt, 6),
  };
}

async function invoke(action: string, payload: any = {}) {
  const { data, error } = await supabase.functions.invoke("admin-keywords", { body: { action, ...payload } });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

export default function AdminKeywords() {
  const [keywords, setKeywords] = useState<KW[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [lang, setLang] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive" | "winners" | "dead">("all");
  const [newKw, setNewKw] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [topRows, setTopRows] = useState<TopRow[]>([]);
  const [topLoading, setTopLoading] = useState(true);
  const [elite, setElite] = useState<EliteSug[]>([]);
  const [eliteLoading, setEliteLoading] = useState(false);
  const [eliteLang, setEliteLang] = useState<"en" | "es" | "pt">("es");
  const [eliteNiche, setEliteNiche] = useState("");
  const [engineStates, setEngineStates] = useState<MasterState[]>([]);
  const [engineRuns, setEngineRuns] = useState<MasterRun[]>([]);
  const [engineKpis, setEngineKpis] = useState<EngineKpis | null>(null);
  const [engineLoading, setEngineLoading] = useState(true);
  const [engineRunning, setEngineRunning] = useState(false);
  const [engineSearch, setEngineSearch] = useState("");
  const [engineTier, setEngineTier] = useState<string>("all");
  const [engineFilter, setEngineFilter] = useState<"all" | "paused" | "productive" | "dead">("all");
  const [engineBusyId, setEngineBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const d: any = await invoke("list");
      setKeywords(d.keywords);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(); loadTop(); loadEngine();
    const i = setInterval(loadEngine, 30000); // refresh engine status every 30s
    return () => clearInterval(i);
  }, []);

  const loadEngine = async () => {
    try {
      const d: any = await invoke("engine_status");
      setEngineStates(d.states || []);
      setEngineRuns(d.runs || []);
      setEngineKpis(d.kpis || null);
    } catch (e: any) { toast.error(e.message); }
    finally { setEngineLoading(false); }
  };

  const runEngineNow = async () => {
    setEngineRunning(true);
    toast.info("Disparando motor…");
    try {
      const r: any = await invoke("engine_run_now", { batch_size: 5 });
      const res = r.result || {};
      toast.success(`Motor: ${res.ads_found ?? 0} ads, ${res.winners_found ?? 0} winners`);
      loadEngine();
    } catch (e: any) { toast.error(e.message); }
    finally { setEngineRunning(false); }
  };

  const toggleMaster = async (s: MasterState) => {
    setEngineBusyId(s.id);
    try {
      await invoke("master_toggle", { id: s.id, is_paused: !s.is_paused });
      setEngineStates((arr) => arr.map((x) => (x.id === s.id ? { ...x, is_paused: !s.is_paused } : x)));
    } catch (e: any) { toast.error(e.message); }
    finally { setEngineBusyId(null); }
  };

  const loadTop = async () => {
    setTopLoading(true);
    try {
      const d: any = await invoke("user_top");
      setTopRows(d.top || []);
    } catch (e: any) { toast.error(e.message); }
    finally { setTopLoading(false); }
  };

  const loadElite = async () => {
    setEliteLoading(true);
    try {
      const d: any = await invoke("elite_suggestions", { lang: eliteLang, niche: eliteNiche });
      setElite(d.suggestions || []);
      if (!d.suggestions?.length) toast.warning("La IA no devolvió sugerencias. Reintenta.");
    } catch (e: any) { toast.error(e.message); }
    finally { setEliteLoading(false); }
  };

  const existingSet = useMemo(() => new Set(keywords.map((k) => k.keyword.toLowerCase())), [keywords]);
  const suggestions = useMemo(() => dailySuggestions(existingSet), [existingSet]);

  const filtered = useMemo(() => {
    return keywords.filter((k) => {
      if (search && !k.keyword.toLowerCase().includes(search.toLowerCase())) return false;
      if (lang !== "all" && detectLang(k.keyword) !== lang) return false;
      if (filterStatus === "active" && !k.is_active) return false;
      if (filterStatus === "inactive" && k.is_active) return false;
      if (filterStatus === "winners" && k.winners_count === 0) return false;
      if (filterStatus === "dead" && k.ads_count > 0) return false;
      return true;
    });
  }, [keywords, search, lang, filterStatus]);

  const stats = useMemo(() => {
    const total = keywords.length;
    const active = keywords.filter((k) => k.is_active).length;
    const productive = keywords.filter((k) => k.winners_count > 0).length;
    const totalAds = keywords.reduce((a, k) => a + k.ads_count, 0);
    return { total, active, productive, totalAds };
  }, [keywords]);

  const handleAdd = async (k?: string) => {
    const kw = (k ?? newKw).trim();
    if (!kw) return;
    try {
      await invoke("add", { keyword: kw });
      toast.success(`"${kw}" añadida`);
      if (!k) setNewKw("");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleToggle = async (kw: KW) => {
    setBusyId(kw.id);
    try {
      await invoke("toggle", { id: kw.id, is_active: !kw.is_active });
      setKeywords((arr) => arr.map((k) => (k.id === kw.id ? { ...k, is_active: !k.is_active } : k)));
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const handleDelete = async (kw: KW) => {
    if (!confirm(`¿Eliminar "${kw.keyword}"?`)) return;
    setBusyId(kw.id);
    try {
      await invoke("delete", { id: kw.id });
      setKeywords((arr) => arr.filter((k) => k.id !== kw.id));
      toast.success("Eliminada");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  const handleTest = async (kw: KW) => {
    setBusyId(kw.id);
    toast.info(`Probando "${kw.keyword}"…`);
    try {
      const r: any = await invoke("test_now", { keyword: kw.keyword });
      toast.success(`Scraping: ${r.result?.found ?? 0} anuncios encontrados`);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-tight">Keywords & Fuentes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Control del corazón del sistema: qué buscamos, qué funciona y qué no.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-2" /> Actualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total keywords", value: stats.total, icon: Languages },
          { label: "Activas", value: stats.active, icon: Activity, accent: true },
          { label: "Productivas", value: stats.productive, icon: TrendingUp },
          { label: "Anuncios totales", value: stats.totalAds.toLocaleString(), icon: Flame },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.label}</span>
              <s.icon className={`w-3.5 h-3.5 ${s.accent ? "text-[#f7a93d]" : "text-muted-foreground"}`} strokeWidth={1.5} />
            </div>
            <div className="font-display text-2xl tracking-tight">{s.value}</div>
          </div>
        ))}
      </div>

      {/* ⚡ Motor de fondo */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-[#f7a93d]/[0.04] via-card to-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#f7a93d]/15 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-[#f7a93d]" strokeWidth={1.8} fill="currentColor" />
            </div>
            <div>
              <h3 className="font-display text-base flex items-center gap-2">
                Motor de fondo
                <Badge className="bg-emerald-500/15 text-emerald-400 border-0 text-[10px] h-4 px-1.5 uppercase tracking-wider">
                  <Activity className="w-2.5 h-2.5 mr-0.5" /> Live
                </Badge>
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Cron horario rotando keywords maestras DR → ingesta de anuncios sin que el usuario haga nada.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={loadEngine}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              onClick={runEngineNow}
              disabled={engineRunning}
              className="bg-[#f7a93d] hover:bg-[#f7a93d]/90 text-black"
            >
              {engineRunning ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Disparando…</>
                : <><Play className="w-3.5 h-3.5 mr-1.5" /> Ejecutar ahora</>}
            </Button>
          </div>
        </div>

        {/* Engine KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border">
          {[
            { label: "Keywords totales", value: engineKpis?.total_keywords ?? "—", icon: Target },
            { label: "Activas", value: engineKpis?.active_keywords ?? "—", icon: Activity, accent: true },
            { label: "Ingesta total", value: (engineKpis?.total_ingested ?? 0).toLocaleString(), icon: Flame },
            { label: "Winners", value: (engineKpis?.total_winners ?? 0).toLocaleString(), icon: Crown },
            { label: "% Winners", value: `${engineKpis?.winner_pct ?? 0}%`, icon: TrendingUp },
          ].map((k) => (
            <div key={k.label} className="bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</span>
                <k.icon className={`w-3 h-3 ${k.accent ? "text-[#f7a93d]" : "text-muted-foreground"}`} strokeWidth={1.5} />
              </div>
              <div className="font-display text-xl tracking-tight">{k.value}</div>
            </div>
          ))}
        </div>

        {/* Live status: this hour + next run */}
        <div className="px-5 py-4 border-t border-border bg-card/40 flex items-start justify-between gap-6 flex-wrap">
          <div className="flex-1 min-w-[280px]">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              <Activity className="w-3 h-3" /> Activas esta hora ({engineKpis?.active_this_hour?.length || 0})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(engineKpis?.active_this_hour || []).slice(0, 8).map((k) => (
                <span key={k} className="px-2 h-6 inline-flex items-center rounded-md bg-[#f7a93d]/10 text-[#f7a93d] text-[11px] border border-[#f7a93d]/20">
                  {k}
                </span>
              ))}
              {(engineKpis?.active_this_hour?.length ?? 0) > 8 && (
                <span className="px-2 h-6 inline-flex items-center rounded-md bg-secondary text-muted-foreground text-[11px]">
                  +{(engineKpis!.active_this_hour.length - 8)} más
                </span>
              )}
              {(!engineKpis || engineKpis.active_this_hour.length === 0) && (
                <span className="text-[11px] text-muted-foreground">Esperando primera corrida…</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 justify-end">
              <Clock className="w-3 h-3" /> Última corrida
            </div>
            <div className="text-sm mt-1">
              {engineKpis?.last_run_at
                ? formatDistanceToNow(new Date(engineKpis.last_run_at), { addSuffix: true, locale: es })
                : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground mt-2">Próxima al minuto 7 de cada hora</div>
          </div>
        </div>

        {/* Engine controls + table */}
        <div className="px-5 py-3 border-t border-border bg-card flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={engineSearch}
              onChange={(e) => setEngineSearch(e.target.value)}
              placeholder="Buscar en keywords maestras…"
              className="pl-8 h-8 rounded-lg text-xs"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
            {["all","tier1_disclaimers","tier2_platforms","tier3_ctas","tier4_hooks","tier5_niches","tier6_funnels"].map((t) => (
              <button
                key={t}
                onClick={() => setEngineTier(t)}
                className={`px-2 h-6 rounded-md text-[10px] font-medium transition ${
                  engineTier === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "all" ? "Todos" : t.replace("tier", "T").split("_")[0]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
            {[{v:"all",l:"Todas"},{v:"productive",l:"Productivas"},{v:"dead",l:"Sin resultados"},{v:"paused",l:"Pausadas"}].map((f) => (
              <button
                key={f.v}
                onClick={() => setEngineFilter(f.v as any)}
                className={`px-2 h-6 rounded-md text-[10px] font-medium transition ${
                  engineFilter === f.v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.l}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[440px] overflow-auto">
          {engineLoading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Cargando motor…</div>
          ) : engineStates.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Motor sin sembrar todavía. Pulsa "Ejecutar ahora".
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card border-b border-border z-10">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-5 py-2 font-medium">Keyword</th>
                  <th className="text-left px-2 py-2 font-medium">Tier</th>
                  <th className="text-right px-2 py-2 font-medium">Ads</th>
                  <th className="text-right px-2 py-2 font-medium">Winners</th>
                  <th className="text-right px-2 py-2 font-medium">Corridas</th>
                  <th className="text-left px-2 py-2 font-medium">Última</th>
                  <th className="text-right px-5 py-2 font-medium">Kill</th>
                </tr>
              </thead>
              <tbody>
                {engineStates
                  .filter((s) => {
                    if (engineSearch && !s.keyword.toLowerCase().includes(engineSearch.toLowerCase())) return false;
                    if (engineTier !== "all" && s.source_tier !== engineTier) return false;
                    if (engineFilter === "paused" && !s.is_paused) return false;
                    if (engineFilter === "productive" && s.total_winners === 0) return false;
                    if (engineFilter === "dead" && s.total_found > 0) return false;
                    return true;
                  })
                  .map((s) => {
                    const productive = s.total_winners > 0;
                    return (
                      <tr
                        key={s.id}
                        className={`border-b border-border/40 hover:bg-foreground/[0.02] transition ${s.is_paused ? "opacity-40" : ""}`}
                      >
                        <td className="px-5 py-2.5">
                          <span className="font-medium">{s.keyword}</span>
                        </td>
                        <td className="px-2 py-2.5">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {s.source_tier?.replace("tier", "T").split("_")[0] || "—"}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{s.total_found}</td>
                        <td className={`px-2 py-2.5 text-right tabular-nums ${productive ? "text-[#f7a93d] font-medium" : "text-muted-foreground"}`}>
                          {s.total_winners}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground text-xs">{s.total_runs}</td>
                        <td className="px-2 py-2.5 text-[11px] text-muted-foreground">
                          {s.last_run_at ? formatDistanceToNow(new Date(s.last_run_at), { addSuffix: true, locale: es }) : "—"}
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          <button
                            onClick={() => toggleMaster(s)}
                            disabled={engineBusyId === s.id}
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition ${
                              s.is_paused
                                ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                                : "bg-secondary text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            }`}
                            title={s.is_paused ? "Reactivar" : "Pausar (kill-switch)"}
                          >
                            {s.is_paused ? <PlayCircle className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent runs */}
        {engineRuns.length > 0 && (
          <div className="px-5 py-3 border-t border-border bg-card/40">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Últimas corridas</div>
            <div className="space-y-1">
              {engineRuns.slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-center gap-3 text-[11px]">
                  <span className={`w-1.5 h-1.5 rounded-full ${r.success ? "bg-emerald-500" : "bg-destructive"}`} />
                  <span className="text-muted-foreground tabular-nums w-32">
                    {formatDistanceToNow(new Date(r.started_at), { addSuffix: true, locale: es })}
                  </span>
                  <span className="text-muted-foreground">{r.triggered_by}</span>
                  <span className="text-muted-foreground">·</span>
                  <span>{r.keywords_used.length} keywords</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-foreground">{r.ads_found} ads</span>
                  <span className="text-[#f7a93d]">{r.winners_found} winners</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Add new */}

      <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
        <Plus className="w-4 h-4 text-muted-foreground" />
        <Input
          value={newKw}
          onChange={(e) => setNewKw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Añadir nueva keyword (ej: weight loss, curso digital, emagrecer)…"
          className="border-0 bg-transparent focus-visible:ring-0 px-0 h-9"
        />
        <Button size="sm" onClick={() => handleAdd()} disabled={!newKw.trim()}>Añadir</Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar keyword…"
            className="pl-9 h-9 rounded-xl"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
          {LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className={`px-3 h-7 rounded-lg text-xs font-medium transition ${
                lang === l.code ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {l.icon} {l.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
          {[
            { v: "all", l: "Todas" },
            { v: "active", l: "Activas" },
            { v: "inactive", l: "Pausadas" },
            { v: "winners", l: "Con winners" },
            { v: "dead", l: "Sin resultados" },
          ].map((f) => (
            <button
              key={f.v}
              onClick={() => setFilterStatus(f.v as any)}
              className={`px-3 h-7 rounded-lg text-xs font-medium transition ${
                filterStatus === f.v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.l}
            </button>
          ))}
        </div>
      </div>

      {/* Suggestions */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-card to-card/50 p-5">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-[#f7a93d]" strokeWidth={1.5} />
          <h3 className="font-display text-base">Sugerencias del día</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Keywords frescas de Direct Response para cada idioma. Click para añadir al instante.
        </p>
        <div className="space-y-3">
          {(["en", "es", "pt"] as const).map((code) => {
            const meta = LANGS.find((l) => l.code === code)!;
            const sugs = suggestions[code];
            if (!sugs.length) return null;
            return (
              <div key={code}>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                  {meta.icon} {meta.label}
                </div>
                <div className="flex flex-wrap gap-2">
                  {sugs.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleAdd(s)}
                      className="group inline-flex items-center gap-1.5 px-3 h-8 rounded-full border border-border bg-background hover:bg-[#f7a93d]/10 hover:border-[#f7a93d]/40 transition text-xs"
                    >
                      <Plus className="w-3 h-3 text-muted-foreground group-hover:text-[#f7a93d]" />
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top usuarios — qué buscan los usuarios reales */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" strokeWidth={1.6} />
            <div>
              <h3 className="font-display text-base">Top búsquedas de usuarios</h3>
              <p className="text-[11px] text-muted-foreground">Las keywords que más usuarios están añadiendo en la app</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={loadTop}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refrescar
          </Button>
        </div>
        {topLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Cargando…</div>
        ) : topRows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Ningún usuario ha añadido keywords todavía.</div>
        ) : (
          <ul className="divide-y divide-border max-h-[460px] overflow-auto">
            {topRows.slice(0, 50).map((r, i) => {
              const l = detectLang(r.keyword);
              const langMeta = LANGS.find((x) => x.code === l)!;
              const alreadyMine = existingSet.has(r.keyword.toLowerCase());
              return (
                <li key={r.keyword + i} className="group px-5 py-3 flex items-center gap-4 hover:bg-foreground/[0.02] transition">
                  <div className="w-6 text-[11px] text-muted-foreground tabular-nums">#{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{r.keyword}</span>
                      <span className="text-[10px]">{langMeta.icon}</span>
                      {alreadyMine && (
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">en mi panel</Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {r.last_used_at
                        ? `Último uso ${formatDistanceToNow(new Date(r.last_used_at), { addSuffix: true, locale: es })}`
                        : "Aún no buscada"}
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-center">
                    <div className="w-16">
                      <div className="font-display text-base">{r.user_count}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Usuarios</div>
                    </div>
                    <div className="w-16">
                      <div className="font-display text-base">{r.total_uses}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Veces</div>
                    </div>
                  </div>
                  {!alreadyMine && (
                    <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => handleAdd(r.keyword)}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Añadir
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Sugerencias Elite — IA pensando como un media buyer de 9 cifras */}
      <div className="rounded-2xl border border-[#f7a93d]/30 bg-gradient-to-br from-[#f7a93d]/[0.06] via-card to-card p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#f7a93d]/15 flex items-center justify-center shrink-0">
              <Crown className="w-4 h-4 text-[#f7a93d]" strokeWidth={1.8} />
            </div>
            <div>
              <h3 className="font-display text-base flex items-center gap-2">
                Sugerencias Elite <Brain className="w-3.5 h-3.5 text-[#f7a93d]" />
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
                IA pensando como media buyer de 9 cifras en Facebook & TikTok Ads. Ángulos, hooks y frases que un copywriter normal jamás se le ocurrirían.
              </p>
            </div>
          </div>
          <Button
            onClick={loadElite}
            disabled={eliteLoading}
            className="bg-[#f7a93d] hover:bg-[#f7a93d]/90 text-black"
            size="sm"
          >
            {eliteLoading ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Pensando…</>
            ) : (
              <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generar</>
            )}
          </Button>
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1">
            {(["en", "es", "pt"] as const).map((l) => {
              const meta = LANGS.find((x) => x.code === l)!;
              return (
                <button
                  key={l}
                  onClick={() => setEliteLang(l)}
                  className={`px-3 h-7 rounded-lg text-xs font-medium transition ${
                    eliteLang === l ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {meta.icon} {meta.label}
                </button>
              );
            })}
          </div>
          <Input
            value={eliteNiche}
            onChange={(e) => setEliteNiche(e.target.value)}
            placeholder="Nicho opcional (ej: ED, manifestación, AI tools, diabetes)…"
            className="h-8 max-w-sm rounded-xl text-xs"
          />
        </div>

        {elite.length === 0 && !eliteLoading ? (
          <div className="text-center py-10 text-xs text-muted-foreground border border-dashed border-border rounded-xl">
            Pulsa <span className="text-[#f7a93d] font-medium">Generar</span> para recibir 25 sugerencias de nivel millonario.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {elite.map((s, i) => {
              const mine = existingSet.has(s.keyword.toLowerCase());
              return (
                <div
                  key={s.keyword + i}
                  className="group rounded-xl border border-border bg-background/60 p-3 flex items-start gap-3 hover:border-[#f7a93d]/50 transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{s.keyword}</span>
                      <Badge variant="outline" className="h-4 px-1.5 text-[9px] uppercase tracking-wider border-[#f7a93d]/30 text-[#f7a93d]">
                        {s.category}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{s.reason}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={mine ? "ghost" : "secondary"}
                    disabled={mine}
                    onClick={() => handleAdd(s.keyword)}
                    className="shrink-0"
                  >
                    {mine ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* List */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="font-display text-sm">
            {filtered.length} {filtered.length === 1 ? "keyword" : "keywords"}
          </div>
          <div className="text-[11px] text-muted-foreground">Ordenadas por rendimiento</div>
        </div>
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No hay keywords con esos filtros.</div>
        ) : (
          <ul className="divide-y divide-border">
            {[...filtered]
              .sort((a, b) => b.winners_count - a.winners_count || b.ads_count - a.ads_count)
              .map((k) => {
                const l = detectLang(k.keyword);
                const langMeta = LANGS.find((x) => x.code === l)!;
                const productive = k.winners_count > 0;
                return (
                  <li
                    key={k.id}
                    className={`group px-5 py-3.5 flex items-center gap-4 transition hover:bg-foreground/[0.02] ${
                      !k.is_active ? "opacity-50" : ""
                    }`}
                  >
                    <Switch
                      checked={k.is_active}
                      onCheckedChange={() => handleToggle(k)}
                      disabled={busyId === k.id}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{k.keyword}</span>
                        <span className="text-[10px]" title={langMeta.label}>{langMeta.icon}</span>
                        {productive && (
                          <Badge className="bg-[#f7a93d]/15 text-[#f7a93d] border-0 text-[10px] h-4 px-1.5">
                            <Flame className="w-2.5 h-2.5 mr-0.5" /> winner
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {k.last_searched_at
                          ? `Última búsqueda ${formatDistanceToNow(new Date(k.last_searched_at), { addSuffix: true, locale: es })}`
                          : "Nunca buscada"}
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-center">
                      <div className="w-16">
                        <div className="font-display text-base">{k.ads_count}</div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Ads</div>
                      </div>
                      <div className="w-16">
                        <div className={`font-display text-base ${productive ? "text-[#f7a93d]" : ""}`}>
                          {k.winners_count}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Winners</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <Button size="sm" variant="ghost" onClick={() => handleTest(k)} disabled={busyId === k.id}>
                        <Play className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(k)} disabled={busyId === k.id}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </div>
  );
}
