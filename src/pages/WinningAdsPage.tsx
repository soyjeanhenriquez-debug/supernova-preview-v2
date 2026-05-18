import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, ExternalLink, Heart, Flame, Zap, Trophy, TrendingUp, CheckCircle2, Link as LinkIcon, Search, Filter, Loader2, Bookmark, Plus, X, Check } from "lucide-react";
import { MARKETS, KEYWORD_CHIPS, PLACEHOLDERS, OFFER_TYPE_LABEL, despeguePercent, classifyOffer, CATEGORY_LABEL, buildAdsLibraryPageUrl, buildAdsLibrarySearchUrl, normalizeAdsLibraryUrl, type AdLang, type AdMarket, type DemoAd, type Tier } from "@/lib/demo-winning-ads";
import { useElapsedMinutes } from "@/hooks/useElapsedMinutes";
import { useCredits } from "@/hooks/useCredits";
import { SofisticarModal } from "@/components/SofisticarModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { IntelligenceAnalyzer } from "@/components/IntelligenceAnalyzer";
import { getAutoSearchKeywords, TOTAL_DR_KEYWORDS } from "@/lib/dr-keywords";

const COUNTRY_OPTIONS: { code: string; label: string; flag: string }[] = [
  { code: "ES", label: "España", flag: "🇪🇸" },
  { code: "US", label: "Estados Unidos", flag: "🇺🇸" },
  { code: "BR", label: "Brasil", flag: "🇧🇷" },
  { code: "MX", label: "México", flag: "🇲🇽" },
  { code: "AR", label: "Argentina", flag: "🇦🇷" },
  { code: "CO", label: "Colombia", flag: "🇨🇴" },
  { code: "PE", label: "Perú", flag: "🇵🇪" },
  { code: "CL", label: "Chile", flag: "🇨🇱" },
  { code: "PT", label: "Portugal", flag: "🇵🇹" },
  { code: "FR", label: "Francia", flag: "🇫🇷" },
  { code: "DE", label: "Alemania", flag: "🇩🇪" },
  { code: "IT", label: "Italia", flag: "🇮🇹" },
  { code: "GB", label: "Reino Unido", flag: "🇬🇧" },
  { code: "RU", label: "Rusia", flag: "🇷🇺" },
  { code: "ALL", label: "Global", flag: "🌍" },
];

const STATUS_OPTIONS: { value: "ACTIVE" | "INACTIVE" | "ALL"; label: string; dot: string }[] = [
  { value: "ACTIVE", label: "Activos", dot: "bg-success" },
  { value: "INACTIVE", label: "Pausados", dot: "bg-warning" },
  { value: "ALL", label: "Todos", dot: "bg-muted-foreground" },
];

const ADMIN_EMAIL = "soyjeanhenriquez@gmail.com";

const TIERS: Record<Tier, { label: string; cls: string; icon: string }> = {
  mega:   { label: "MEGA WINNER",  cls: "tier-mega",  icon: "🏆" },
  rising: { label: "RISING STAR",  cls: "tier-rising", icon: "📈" },
  solid:  { label: "SOLID",        cls: "tier-solid",  icon: "✅" },
};

const DAY_OPTIONS = [{ v: 0, l: "Todos" }, { v: 7, l: "7+" }, { v: 14, l: "14+" }, { v: 30, l: "30+" }, { v: 60, l: "60+" }];
const DUP_OPTIONS = [{ v: 0, l: "Todos" }, { v: 3, l: "3+" }, { v: 5, l: "5+" }, { v: 10, l: "10+" }];
const TYPE_OPTIONS = ["Todos", "Infoproducto", "Ecommerce", "App", "Saas", "Servicio"];
const REGION_OPTIONS = ["Todos", "LATAM", "USA", "Brasil", "España"];
const SCORE_OPTIONS = [{ v: 0, l: "Todos" }, { v: 40, l: "40+" }, { v: 60, l: "60+" }, { v: 80, l: "80+" }];
const SORT_OPTIONS = ["Mayor Score", "Más Recientes", "Más Duplicados", "Más Días"];

interface FacebookAdLibraryItem {
  id?: string | number;
  page_id?: string;
  page_name?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_delivery_start_time?: string;
  total_count?: number | string;
}

interface FacebookAdsResponse {
  data?: FacebookAdLibraryItem[];
}

// Agrupa anuncios por page_id quedándose con el de mejor score por anunciante.
// Añade activeCount (anuncios activos en esta búsqueda) e historicalCount
// (total_count de la API si está disponible).
function groupByAdvertiser(ads: DemoAd[], items: FacebookAdLibraryItem[]): DemoAd[] {
  // Mapear historicalCount máximo por page_id desde la respuesta cruda
  const historicalByPage = new Map<string, number>();
  items.forEach((it) => {
    const k = (it.page_id ?? it.page_name ?? "").toString();
    if (!k) return;
    const tc = typeof it.total_count === "string" ? parseInt(it.total_count) : it.total_count;
    if (typeof tc === "number" && !isNaN(tc)) {
      historicalByPage.set(k, Math.max(historicalByPage.get(k) ?? 0, tc));
    }
  });
  const byPage = new Map<string, DemoAd[]>();
  ads.forEach((a) => {
    const k = (a.pageId || a.pageName || a.id).toString();
    if (!byPage.has(k)) byPage.set(k, []);
    byPage.get(k)!.push(a);
  });
  const grouped: DemoAd[] = [];
  byPage.forEach((group, key) => {
    const top = group.slice().sort((x, y) => y.score - x.score)[0];
    grouped.push({
      ...top,
      activeCount: group.length,
      historicalCount: historicalByPage.get(key),
    });
  });
  return grouped;
}

// Nota: usamos <a target="_blank" rel="noopener noreferrer"> en vez de window.open()
// porque el preview de Lovable corre dentro de un iframe sandbox que bloquea popups programáticos.

export function WinningAdsPage() {
  const elapsed = useElapsedMinutes();
  const { consume, canAfford } = useCredits();
  const { user } = useAuth();
  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL;

  const [market, setMarket] = useState<string>("all");
  const [keyword, setKeyword] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [minDays, setMinDays] = useState(0);
  const [minDups, setMinDups] = useState(0);
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [regionFilter, setRegionFilter] = useState("Todos");
  const [minScore, setMinScore] = useState(0);
  const [sort, setSort] = useState("Mayor Score");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [sofisticarAd, setSofisticarAd] = useState<DemoAd | null>(null);
  const [realAds, setRealAds] = useState<DemoAd[]>([]);
  const [loadingReal, setLoadingReal] = useState(false);
  const [liveStats, setLiveStats] = useState({ total: 0, unique: 0, mega: 0, rising: 0, solid: 0 });
  const [autoKeywords, setAutoKeywords] = useState<string[]>([]);
  const [autoLoading, setAutoLoading] = useState(false);
  const [lastAutoRun, setLastAutoRun] = useState<Date | null>(null);
  // Selectores para la edge function
  const [searchCountry, setSearchCountry] = useState("ES");
  const [searchLimit, setSearchLimit] = useState(25);
  const [searchStatus, setSearchStatus] = useState<"ACTIVE" | "INACTIVE" | "ALL">("ACTIVE");
  // Presets de filtros (País/Estado/Límite) — persistidos en localStorage
  type FilterPreset = { id: string; name: string; country: string; status: "ACTIVE" | "INACTIVE" | "ALL"; limit: number };
  const PRESETS_KEY = "supernova:fb-filter-presets";
  const [presets, setPresets] = useState<FilterPreset[]>(() => {
    try { return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? "[]"); } catch { return []; }
  });
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  useEffect(() => { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); }, [presets]);

  // Cargar estadísticas reales desde la tabla `winning_ads` (sin datos demo)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("winning_ads")
        .select("page_id, page_name, tier", { count: "exact" });
      if (cancelled || error || !data) return;
      const unique = new Set(data.map((r) => r.page_id ?? r.page_name ?? "").filter(Boolean)).size;
      const mega = data.filter((r) => r.tier === "mega").length;
      const rising = data.filter((r) => r.tier === "rising").length;
      const solid = data.filter((r) => r.tier === "solid").length;
      setLiveStats({ total: data.length, unique, mega, rising, solid });
    })();
    return () => { cancelled = true; };
  }, []);

  // === Auto-discovery: rota keywords DR y busca en background (multi-país) ===
  const runAutoDiscovery = async () => {
    if (autoLoading) return;
    const kws = getAutoSearchKeywords(4);
    setAutoKeywords(kws);
    setAutoLoading(true);
    try {
      // Multi-país para conseguir MÁS volumen y duplicados reales
      const countries = ["US", "ES", "BR", "MX"];
      const jobs: { kw: string; country: string }[] = [];
      kws.forEach((kw, idx) => jobs.push({ kw, country: countries[idx % countries.length] }));
      const results = await Promise.all(
        jobs.map(({ kw, country }) =>
          supabase.functions
            .invoke<FacebookAdsResponse>("facebook-ads", {
              body: { search_terms: kw, country, limit: 25, ad_active_status: "ACTIVE" },
            })
            .then((r) => ({ kw, country, items: r.data?.data ?? [] }))
            .catch(() => ({ kw, country, items: [] as FacebookAdLibraryItem[] })),
        ),
      );
      const marketTyped = (market === "all" ? "en" : market) as AdLang;
      const allWithCountry = results.flatMap((r) =>
        r.items.map((it) => ({ it, country: r.country })),
      );
      // Duplicados por page_id a través de TODAS las búsquedas (señal real de escala)
      const dupByPage = new Map<string, number>();
      allWithCountry.forEach(({ it }) => {
        const k = (it.page_id ?? it.page_name ?? "").toString();
        if (k) dupByPage.set(k, (dupByPage.get(k) ?? 0) + 1);
      });
      const mapped: DemoAd[] = allWithCountry.map(({ it, country }, i) => {
        const adMarket = country as AdMarket;
        const body = (it.ad_creative_bodies?.[0] ?? "").toString();
        const title = (it.ad_creative_link_titles?.[0] ?? it.page_name ?? "Anuncio").toString();
        const start = it.ad_delivery_start_time ? new Date(it.ad_delivery_start_time) : new Date();
        const days = Math.max(1, Math.floor((Date.now() - start.getTime()) / 86400000));
        const pageKey = (it.page_id ?? it.page_name ?? "").toString();
        const dups = dupByPage.get(pageKey) ?? 1;
        const rawUrl = it.page_id
          ? buildAdsLibraryPageUrl(String(it.page_id), adMarket)
          : buildAdsLibrarySearchUrl(it.page_name ?? title, adMarket);
        const adUrl = normalizeAdsLibraryUrl(rawUrl, it.page_name ?? title, adMarket);
        // Scoring: días activo + duplicados + bonus por copy largo (señal de VSL/lead magnet)
        const copyBonus = body.length > 500 ? 10 : body.length > 200 ? 5 : 0;
        const score = Math.min(100, 30 + Math.min(days, 90) / 2 + dups * 5 + copyBonus);
        const tier: Tier =
          score >= 75 || dups >= 5 || days >= 60 ? "mega"
          : score >= 55 || dups >= 2 || days >= 14 ? "rising"
          : "solid";
        // Detección de tipo de oferta básica
        const lower = (title + " " + body).toLowerCase();
        const offerType: DemoAd["offerType"] =
          /webinar|masterclass|curso|método|secret|training|treinamento/.test(lower) ? "infoproducto"
          : /\b(ai|app|saas|software|tool|platform|crm|automation)\b/.test(lower) ? "saas"
          : /\b(agency|agencia|consulting|consultoría|service|servicio)\b/.test(lower) ? "servicio"
          : /shipping|envío|frete|free \+ shipping/.test(lower) ? "ecommerce"
          : "infoproducto";
        return {
          id: `auto-${it.id ?? `${pageKey}-${i}`}`,
          pageId: it.page_id ?? "",
          pageName: it.page_name ?? "Facebook Ad",
          title,
          body: body || title,
          daysActive: days,
          duplicates: dups,
          score: Math.round(score),
          tier,
          offerType,
          market: adMarket,
          marketLabel: country,
          flag: "🌐",
          lang: marketTyped,
          adUrl,
        };
      });
      // Prepend nuevos, dedupe por id, mantener historial
      setRealAds((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        const fresh = mapped.filter((a) => !seen.has(a.id));
        return [...fresh, ...prev];
      });
      setLastAutoRun(new Date());
    } finally {
      setAutoLoading(false);
    }
  };

  // Dispara al montar (si no hay ads) + cada 5 min
  useEffect(() => {
    if (realAds.length === 0) runAutoDiscovery();
    const t = setInterval(runAutoDiscovery, 5 * 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = (p: FilterPreset) => {
    setSearchCountry(p.country); setSearchStatus(p.status); setSearchLimit(p.limit);
    setActivePresetId(p.id); toast.success(`Preset "${p.name}" aplicado`);
  };
  const savePreset = () => {
    const name = presetName.trim(); if (!name) { toast.error("Dale un nombre al preset"); return; }
    const p: FilterPreset = { id: crypto.randomUUID(), name, country: searchCountry, status: searchStatus, limit: searchLimit };
    setPresets((prev) => [...prev, p]); setActivePresetId(p.id); setPresetName(""); setSavingPreset(false);
    toast.success(`✓ Preset "${name}" guardado`);
  };
  const deletePreset = (id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
    if (activePresetId === id) setActivePresetId(null);
  };
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugResult, setDebugResult] = useState<{
    ok: boolean;
    status?: number;
    summary?: { count: number; uniquePages: number; sampleNames: string[]; errorMessage?: string };
    payload: unknown;
  } | null>(null);

  const runDebugTest = async () => {
    setDebugLoading(true);
    setDebugResult(null);
    setDebugOpen(true);
    const requestBody = {
      search_terms: keyword || "ver más",
      country: searchCountry,
      limit: searchLimit,
      ad_active_status: searchStatus,
    };
    try {
      const { data, error } = await supabase.functions.invoke<FacebookAdsResponse & { error?: string; detail?: unknown }>("facebook-ads", { body: requestBody });
      if (error) {
        setDebugResult({ ok: false, summary: { count: 0, uniquePages: 0, sampleNames: [], errorMessage: error.message }, payload: { request: requestBody, invokeError: error.message } });
        toast.error(`Edge function error: ${error.message}`);
      } else {
        const items = data?.data ?? [];
        const uniquePages = new Set(items.map((i) => i.page_id ?? i.page_name)).size;
        const sampleNames = items.slice(0, 5).map((i) => i.page_name ?? "—");
        setDebugResult({ ok: true, status: 200, summary: { count: items.length, uniquePages, sampleNames }, payload: { request: requestBody, response: data } });
        toast.success(`✓ ${items.length} anuncios · ${uniquePages} anunciantes únicos`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setDebugResult({ ok: false, summary: { count: 0, uniquePages: 0, sampleNames: [], errorMessage: msg }, payload: { request: requestBody, exception: msg } });
      toast.error("Excepción al invocar edge function");
    } finally {
      setDebugLoading(false);
    }
  };

  const allAds = useMemo(() => realAds.slice(), [realAds]);

  const filtered = useMemo(() => {
    let list = allAds.slice();
    if (market !== "all") list = list.filter((a) => a.lang === market);
    if (minDays > 0) list = list.filter((a) => a.daysActive >= minDays);
    if (minDups > 0) list = list.filter((a) => a.duplicates >= minDups);
    if (typeFilter !== "Todos") list = list.filter((a) => OFFER_TYPE_LABEL[a.offerType].toLowerCase().startsWith(typeFilter.toLowerCase().slice(0, 4)));
    if (regionFilter !== "Todos") {
      const map: Record<string, string[]> = { LATAM: ["MX", "LATAM"], USA: ["US"], Brasil: ["BR"], España: ["ES"] };
      list = list.filter((a) => map[regionFilter]?.includes(a.market));
    }
    if (minScore > 0) list = list.filter((a) => a.score >= minScore);
    if (keyword.trim()) {
      const q = keyword.toLowerCase();
      list = list.filter((a) => a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q));
    }
    switch (sort) {
      case "Más Duplicados": list.sort((a, b) => b.duplicates - a.duplicates); break;
      case "Más Días": list.sort((a, b) => b.daysActive - a.daysActive); break;
      case "Más Recientes": list.sort((a, b) => a.daysActive - b.daysActive); break;
      default: list.sort((a, b) => b.score - a.score);
    }
    return list;
  }, [allAds, market, minDays, minDups, typeFilter, regionFilter, minScore, sort, keyword]);

  const handleSearch = async () => {
    if (!canAfford("search_ads")) { toast.error("Sin créditos suficientes"); return; }
    consume("search_ads", keyword || market);
    setLoadingReal(true);
    toast.info(`Buscando "${keyword || "todos"}" en ${searchCountry} (${searchStatus}, límite ${searchLimit})...`);
    try {
      const { data, error } = await supabase.functions.invoke<FacebookAdsResponse>("facebook-ads", {
        body: { search_terms: keyword || "ad", country: searchCountry, limit: searchLimit, ad_active_status: searchStatus },
      });
      if (error) throw error;
      const items = data?.data ?? [];
      // Agrupar por page_id para contar duplicados reales por anunciante
      const dupByPage = new Map<string, number>();
      items.forEach((it) => {
        const k = (it.page_id ?? it.page_name ?? "").toString();
        if (k) dupByPage.set(k, (dupByPage.get(k) ?? 0) + 1);
      });
      const marketTyped = (market === "all" ? "en" : market) as AdLang;
      const adMarket = (searchCountry as AdMarket);
      const mapped: DemoAd[] = items.map((it, i) => {
        const body = (it.ad_creative_bodies?.[0] ?? "").toString();
        const title = (it.ad_creative_link_titles?.[0] ?? it.page_name ?? "Anuncio").toString();
        const start = it.ad_delivery_start_time ? new Date(it.ad_delivery_start_time) : new Date();
        const days = Math.max(1, Math.floor((Date.now() - start.getTime()) / 86400000));
        const pageKey = (it.page_id ?? it.page_name ?? "").toString();
        const dups = dupByPage.get(pageKey) ?? 1;
        const rawUrl = it.page_id
          ? buildAdsLibraryPageUrl(String(it.page_id), adMarket)
          : buildAdsLibrarySearchUrl(it.page_name ?? title, adMarket);
        const adUrl = normalizeAdsLibraryUrl(rawUrl, it.page_name ?? title, adMarket);
        return {
          id: `fb-${it.id ?? i}`,
          pageId: it.page_id ?? "",
          pageName: it.page_name ?? "Facebook Ad",
          title,
          body: body || title,
          daysActive: days,
          duplicates: dups,
          score: Math.min(100, 40 + Math.floor(days / 2) + dups * 2),
          tier: days >= 60 || dups >= 10 ? "mega" : days >= 14 || dups >= 3 ? "rising" : "solid",
          offerType: "infoproducto",
          market: adMarket,
          marketLabel: searchCountry,
          flag: "🌐",
          lang: marketTyped,
          adUrl,
        };
      });
      setRealAds(mapped);
      toast.success(`✓ ${mapped.length} anuncios reales encontrados`);
    } catch (e: unknown) {
      console.error(e);
      toast.error(`Error Facebook: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setLoadingReal(false);
    }
  };

  const handleAnalyzeUrl = () => {
    if (!urlInput.trim()) { toast.error("Pega una URL del Ads Library"); return; }
    if (!canAfford("analyze_url")) { toast.error("Sin créditos suficientes"); return; }
    consume("analyze_url", urlInput);
    toast.success("✓ URL en análisis...");
    setUrlInput("");
  };

  const toggleSave = (id: string) => {
    setSaved((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="page-heading font-display text-2xl text-foreground">BUSCAR OFERTAS WINNER</h2>
          <p className="text-sm text-muted-foreground mt-3">Anuncios validados con datos reales. Encuentra, analiza, clona.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 pulse-hot">
          <span className="live-dot" />
          <span className="text-[11px] font-bold text-primary tracking-widest">ACTUALIZADO HACE {elapsed} MIN</span>
        </div>
      </div>

      {/* Selectores Edge Function + Debug panel (solo admin) */}
      {isAdmin && (
      <div className="card-surface rounded-xl p-4 space-y-3 border border-primary/30">
        <div className="text-[10px] uppercase tracking-widest text-primary/80 font-bold">🔒 Panel Admin · {user?.email}</div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
            <Zap className="w-3.5 h-3.5" /> Parámetros de búsqueda real
          </div>
          <div className="text-[10px] text-muted-foreground">Se aplican a "Buscar Anuncios" y "Probar Edge Function"</div>
        </div>
        {/* Presets bar */}
        <div className="flex items-center gap-2 flex-wrap p-2 rounded-xl bg-background/30 border border-border/40">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold pl-1">
            <Bookmark className="w-3 h-3" /> Presets
          </div>
          {presets.length === 0 && !savingPreset && (
            <span className="text-[11px] text-muted-foreground/60 italic">Sin presets guardados</span>
          )}
          {presets.map((p) => {
            const active = activePresetId === p.id;
            return (
              <div key={p.id} className={`group/preset inline-flex items-center gap-1 rounded-full pl-3 pr-1 py-1 text-xs font-semibold border transition-all animate-in fade-in slide-in-from-left-1 ${active ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/30" : "bg-secondary/60 text-foreground border-border/60 hover:border-primary/40 hover:bg-secondary"}`}>
                <button onClick={() => applyPreset(p)} className="flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-full px-1">
                  {active && <Check className="w-3 h-3" />}
                  {p.name}
                  <span className={`text-[9px] font-normal ${active ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{p.country}·{p.status[0]}·{p.limit}</span>
                </button>
                <button onClick={() => deletePreset(p.id)} className="opacity-0 group-hover/preset:opacity-100 transition-opacity rounded-full p-0.5 hover:bg-destructive/30" aria-label={`Eliminar preset ${p.name}`}>
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
          {savingPreset ? (
            <div className="inline-flex items-center gap-1 animate-in fade-in zoom-in-95">
              <input
                autoFocus
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") savePreset(); if (e.key === "Escape") { setSavingPreset(false); setPresetName(""); } }}
                placeholder="Nombre del preset…"
                className="h-7 px-3 rounded-full bg-background/60 border border-primary/40 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50 w-44"
              />
              <button onClick={savePreset} className="rounded-full p-1.5 bg-primary text-primary-foreground hover:scale-110 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60" aria-label="Confirmar"><Check className="w-3 h-3" /></button>
              <button onClick={() => { setSavingPreset(false); setPresetName(""); }} className="rounded-full p-1.5 bg-secondary text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Cancelar"><X className="w-3 h-3" /></button>
            </div>
          ) : (
            <button onClick={() => setSavingPreset(true)} className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider border border-dashed border-primary/40 text-primary hover:bg-primary/10 hover:border-primary transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              <Plus className="w-3 h-3" /> Guardar actual
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* País */}
          <div className="group relative rounded-2xl bg-gradient-to-br from-secondary/80 to-secondary/30 border border-border/60 backdrop-blur-xl p-3 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary/60">
            <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5 font-semibold">País</div>
            <Select value={searchCountry} onValueChange={(v) => { setSearchCountry(v); setActivePresetId(null); }}>
              <SelectTrigger className="h-9 bg-background/40 border-border/40 rounded-xl text-sm font-medium hover:bg-background/70 focus:ring-2 focus:ring-primary/50 focus:ring-offset-0 transition-all">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/60 bg-popover/95 backdrop-blur-xl">
                {COUNTRY_OPTIONS.map((c) => (
                  <SelectItem key={c.code} value={c.code} className="rounded-lg my-0.5 cursor-pointer focus:bg-primary/15">
                    <span className="flex items-center gap-2"><span className="text-base">{c.flag}</span><span className="font-medium">{c.label}</span><span className="text-[10px] text-muted-foreground ml-1">{c.code}</span></span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Estado */}
          <div className="group relative rounded-2xl bg-gradient-to-br from-secondary/80 to-secondary/30 border border-border/60 backdrop-blur-xl p-3 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary/60">
            <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5 font-semibold">Estado</div>
            <div role="radiogroup" aria-label="Estado del anuncio" className="flex gap-1 bg-background/40 p-1 rounded-xl border border-border/40">
              {STATUS_OPTIONS.map((s) => {
                const isActive = searchStatus === s.value;
                return (
                  <button
                    key={s.value}
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => { setSearchStatus(s.value); setActivePresetId(null); }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                        e.preventDefault();
                        const idx = STATUS_OPTIONS.findIndex((o) => o.value === searchStatus);
                        const next = e.key === "ArrowRight" ? (idx + 1) % STATUS_OPTIONS.length : (idx - 1 + STATUS_OPTIONS.length) % STATUS_OPTIONS.length;
                        setSearchStatus(STATUS_OPTIONS[next].value); setActivePresetId(null);
                      }
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02]"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/40 active:scale-95"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full transition-all ${isActive ? "bg-primary-foreground animate-pulse" : s.dot}`} />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Límite */}
          <div className="group relative rounded-2xl bg-gradient-to-br from-secondary/80 to-secondary/30 border border-border/60 backdrop-blur-xl p-3 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary/60">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">Límite</div>
              <div className="text-sm font-bold tabular-nums text-primary transition-all duration-200" key={searchLimit}>{searchLimit}</div>
            </div>
            <div className="px-1 pt-2">
              <Slider aria-label="Límite de anuncios" value={[searchLimit]} onValueChange={(v) => { setSearchLimit(v[0]); setActivePresetId(null); }} min={5} max={100} step={5} />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground/60 mt-1 px-0.5 font-medium">
              <span>5</span><span>50</span><span>100</span>
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={runDebugTest}
            disabled={debugLoading}
            aria-busy={debugLoading}
            className="group relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary to-primary/70 hover:from-primary hover:to-primary text-primary-foreground p-3 flex flex-col items-center justify-center gap-1 font-bold transition-all disabled:opacity-60 shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {debugLoading && <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity" />
            {debugLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5 group-hover:rotate-12 transition-transform" />}
            <span className="text-[11px] uppercase tracking-wider">{debugLoading ? "Probando..." : "Probar Edge"}</span>
          </button>
        </div>

        {debugOpen && (
          <div className={`rounded-lg p-3 border ${debugResult?.ok ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                <span className={debugResult?.ok ? "text-success" : "text-destructive"}>
                  {debugLoading ? "⏳ Llamando facebook-ads..." : debugResult?.ok ? "✓ Respuesta OK" : "✗ Error"}
                </span>
              </div>
              <button onClick={() => setDebugOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">✕ Cerrar</button>
            </div>

            {/* Resumen legible */}
            {debugResult?.summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 text-xs">
                <Stat label="Anuncios" value={String(debugResult.summary.count)} />
                <Stat label="Anunciantes únicos" value={String(debugResult.summary.uniquePages)} />
                <Stat label="Status HTTP" value={String(debugResult.status ?? "—")} />
                <Stat label="OK" value={debugResult.ok ? "Sí" : "No"} />
                {debugResult.summary.errorMessage && (
                  <div className="col-span-full text-[11px] text-destructive font-mono break-all bg-destructive/10 border border-destructive/30 rounded p-2">
                    ⚠ {debugResult.summary.errorMessage}
                  </div>
                )}
                {debugResult.summary.sampleNames.length > 0 && (
                  <div className="col-span-full">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Primeros anunciantes</div>
                    <div className="flex flex-wrap gap-1">
                      {debugResult.summary.sampleNames.map((n, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-secondary text-foreground text-[10px]">{n}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Payload completo */}
            <details className="text-[10px]">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-semibold mb-1">Ver payload completo (request + response)</summary>
              <pre className="leading-relaxed bg-background/60 border border-border rounded p-3 overflow-auto max-h-96 text-muted-foreground font-mono mt-2">
{JSON.stringify(debugResult?.payload, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
      )}

      {/* Global stats bar */}
      <div className="card-surface rounded-xl p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="flex items-center gap-2 text-success font-semibold"><span className="live-dot" /> MINER ACTIVO</span>
        <span className="text-muted-foreground"><strong className="text-foreground">{liveStats.total.toLocaleString()}</strong> anuncios</span>
        <span className="text-muted-foreground"><strong className="text-foreground">{liveStats.unique.toLocaleString()}</strong> únicos</span>
        <span className="flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" style={{ color: "hsl(var(--tier-mega))" }} /> <strong>{liveStats.mega}</strong> mega</span>
        <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" style={{ color: "hsl(var(--tier-rising))" }} /> <strong>{liveStats.rising.toLocaleString()}</strong> rising</span>
        <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" style={{ color: "hsl(var(--tier-solid))" }} /> <strong>{liveStats.solid.toLocaleString()}</strong> solid</span>
      </div>

      {/* Intelligence Analyzer */}
      <IntelligenceAnalyzer />

      {/* Keyword search */}
      <div className="card-surface rounded-xl p-5 space-y-4">
        <div className="flex gap-3 flex-col md:flex-row">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={keyword} onChange={(e) => setKeyword(e.target.value)}
              placeholder={PLACEHOLDERS[market]}
              className="w-full bg-secondary border border-border rounded-lg pl-10 pr-4 py-3 text-base focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button onClick={handleSearch} disabled={loadingReal} className="btn-primary-nova px-6 py-3 rounded-lg text-sm flex items-center gap-2 whitespace-nowrap disabled:opacity-60">
            {loadingReal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} {loadingReal ? "Buscando..." : "Buscar Anuncios"} <span className="opacity-70">· 1 crédito</span>
          </button>
        </div>

        {/* Keyword chips · solo admin (uso interno) */}
        {isAdmin && (
          <div className="space-y-1.5 pt-1">
            <div className="text-[10px] uppercase tracking-widest text-primary/80 font-bold">🔒 Keywords sugeridas (admin)</div>
            <div className="flex flex-wrap gap-2">
              {KEYWORD_CHIPS[market].map((k) => (
                <button key={k} onClick={() => setKeyword(k)}
                  className="px-2.5 py-1 rounded-full text-xs bg-secondary border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-all">
                  {k}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quality filters — hairline Apple style */}
      <div className="rounded-2xl p-5 sticky top-[80px] z-10 border border-border bg-card/80 backdrop-blur-xl">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.18em] mb-4">
          <Filter className="w-3.5 h-3.5" /> Filtros de calidad
        </div>
        <div className="flex flex-wrap gap-2">
          <PillSelect label="Idioma" value={market} onChange={setMarket} options={MARKETS.map((m) => ({ value: m.id, label: `${m.flag} ${m.label}` }))} />
          <PillSelect label="Días mínimos" value={String(minDays)} onChange={(v) => setMinDays(Number(v))} options={DAY_OPTIONS.map((o) => ({ value: String(o.v), label: o.l }))} />
          <PillSelect label="Repeticiones" value={String(minDups)} onChange={(v) => setMinDups(Number(v))} options={DUP_OPTIONS.map((o) => ({ value: String(o.v), label: o.l }))} />
          <PillSelect label="Tipo" value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS.map((o) => ({ value: o, label: o }))} />
          <PillSelect label="Mercado" value={regionFilter} onChange={setRegionFilter} options={REGION_OPTIONS.map((o) => ({ value: o, label: o }))} />
          <PillSelect label="Score mínimo" value={String(minScore)} onChange={(v) => setMinScore(Number(v))} options={SCORE_OPTIONS.map((o) => ({ value: String(o.v), label: o.l }))} />
          <PillSelect label="Ordenar" value={sort} onChange={setSort} options={SORT_OPTIONS.map((o) => ({ value: o, label: o }))} />
        </div>
      </div>

      {/* Ofertas escalando */}
      <div>
        <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
          <div>
            <h3 className="font-display font-bold text-xl text-foreground">OFERTAS ESCALANDO AHORA</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Detectadas automáticamente con {TOTAL_DR_KEYWORDS} keywords de DR activas. Cero opiniones, pura data.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {autoLoading && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> ESCANEANDO…
              </span>
            )}
            <span className="text-[10px] font-bold tracking-widest text-primary border border-primary/30 bg-primary/10 px-2 py-1 rounded">
              {lastAutoRun
                ? `ACTUALIZADO HACE ${Math.max(0, Math.floor((Date.now() - lastAutoRun.getTime()) / 60_000))} MIN`
                : "INICIANDO…"}
            </span>
          </div>
        </div>

        {autoKeywords.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mb-4 text-[11px]">
            <span className="text-muted-foreground">Detectados con:</span>
            {autoKeywords.map((k) => (
              <span key={k} className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary font-mono text-[10px]">
                {k}
              </span>
            ))}
            <span className="text-muted-foreground/60">+{TOTAL_DR_KEYWORDS - autoKeywords.length} más rotando</span>
          </div>
        )}


        {filtered.length === 0 ? (
          <div className="card-surface rounded-xl py-16 text-center">
            <div className="empty-icon mb-4"><Trophy className="w-9 h-9" /></div>
            <div className="font-display font-bold text-lg mb-1">Aún no hay ganadores en este filtro</div>
            <div className="text-sm text-muted-foreground max-w-sm mx-auto">Ajusta días, repeticiones o cambia de mercado para descubrir más oportunidades</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((ad) => (
              <AdCard key={ad.id} ad={ad} saved={saved.has(ad.id)} onSave={() => toggleSave(ad.id)} onSofisticar={() => setSofisticarAd(ad)} />
            ))}
          </div>
        )}
      </div>

      {sofisticarAd && (
        <SofisticarModal ad={sofisticarAd} onClose={() => setSofisticarAd(null)} />
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
        active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
      }`}>{children}</button>
  );
}

function PillSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const current = options.find((o) => o.value === value)?.label ?? value;
  const isDefault = options[0]?.value === value;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className={`group h-9 w-auto min-w-[140px] gap-2 rounded-full border px-3.5 text-xs font-medium transition-all duration-200 hover:border-foreground/30 focus:ring-2 focus:ring-primary/40 focus:ring-offset-0 data-[state=open]:border-foreground/40 ${
          isDefault
            ? "bg-transparent border-border text-foreground/85"
            : "bg-primary/10 border-primary/40 text-primary"
        }`}
      >
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium mr-1">{label}</span>
        <SelectValue>{current}</SelectValue>
      </SelectTrigger>
      <SelectContent className="rounded-2xl border-border/60 bg-popover/95 backdrop-blur-xl shadow-2xl animate-in fade-in-0 zoom-in-95">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="rounded-lg my-0.5 cursor-pointer focus:bg-primary/15 transition-colors">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-bold text-foreground">{value}</div>
    </div>
  );
}


function AdCard({ ad, saved, onSave, onSofisticar }: { ad: DemoAd; saved: boolean; onSave: () => void; onSofisticar: () => void }) {
  const tier = TIERS[ad.tier];
  const desp = despeguePercent(ad.daysActive, ad.duplicates);

  const daysBadgeCls =
    ad.daysActive >= 60 ? "bg-amber-500/90 text-black pulse-hot" :
    ad.daysActive >= 30 ? "bg-amber-500 text-black" :
    ad.daysActive >= 15 ? "bg-orange-500/90 text-black" :
    ad.daysActive >= 7  ? "bg-blue-500 text-white" :
    "bg-neutral-700 text-neutral-300";

  const dupsBadgeCls =
    ad.duplicates >= 50 ? "bg-red-500 text-white pulse-hot" :
    ad.duplicates >= 10 ? "bg-red-500/90 text-white" :
    ad.duplicates >= 3  ? "bg-orange-500 text-black" :
    "bg-neutral-700 text-neutral-300";

  return (
    <div className="card-surface rounded-xl p-5 flex flex-col gap-3 ad-card-hover">
      <div className="flex items-start justify-between">
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded ${tier.cls}`}>{tier.icon} {tier.label}</span>
        <div className="flex items-center gap-2">
          <button onClick={onSave} className="text-muted-foreground hover:text-primary transition-colors">
            <Heart className={`w-4 h-4 ${saved ? "fill-primary text-primary" : ""}`} />
          </button>
          <span className="text-2xl font-display font-extrabold text-foreground">{ad.score}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider flex-wrap">
        <span className="text-primary font-bold">{CATEGORY_LABEL[classifyOffer(`${ad.title} ${ad.body}`)]}</span>
        <span className="text-muted-foreground">· {ad.flag} {ad.marketLabel}</span>
        <span className="text-muted-foreground">· {ad.lang.toUpperCase()}</span>
        {ad.checkoutPlatform && <span className="text-muted-foreground">· via {ad.checkoutPlatform}</span>}
      </div>

      <p className="text-sm text-foreground/90 line-clamp-4 italic leading-relaxed">"{ad.body}"</p>

      <div className="flex flex-wrap gap-1.5">
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${daysBadgeCls}`}>
          <Flame className="w-3 h-3" /> {ad.daysActive} Días Activo
        </span>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${dupsBadgeCls}`}>
          <Zap className="w-3 h-3" /> {ad.duplicates} Duplicados
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="font-bold uppercase tracking-wider" style={{ color: desp.color }}>→ {desp.label}</span>
          <span className="text-muted-foreground">{desp.value}%</span>
        </div>
        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
          <div className="h-full transition-all" style={{ width: `${desp.value}%`, background: desp.color }} />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-border/50">
        <div className="w-7 h-7 rounded-full btn-primary-nova flex items-center justify-center text-[11px] font-bold">
          {ad.pageName.charAt(0)}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Anunciante</div>
          <div className="text-xs font-semibold text-foreground truncate">{ad.pageName}</div>
        </div>
      </div>

      <button onClick={onSofisticar} className="btn-primary-nova w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 mt-1">
        <Sparkles className="w-4 h-4" /> SOFISTICAR → <span className="opacity-70 text-xs">· 1 crédito</span>
      </button>

      <a href={ad.adUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 justify-center group">
        <ExternalLink className="w-3 h-3" /> Ver todos los anuncios de <span className="font-semibold text-foreground group-hover:text-primary truncate max-w-[160px]">{ad.pageName}</span> en Ads Library
      </a>
    </div>
  );
}
