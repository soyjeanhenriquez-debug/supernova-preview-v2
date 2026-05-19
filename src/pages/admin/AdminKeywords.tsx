import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Search, Plus, Trash2, Sparkles, Play, TrendingUp, Activity,
  Globe, Flame, RefreshCw, Check, Languages,
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

  useEffect(() => { load(); }, []);

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
