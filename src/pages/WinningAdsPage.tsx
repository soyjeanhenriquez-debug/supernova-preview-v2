import { memo, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, ExternalLink, Heart, Flame, Zap, Trophy, TrendingUp, CheckCircle2, Link as LinkIcon, Search, Filter, Loader2, Bookmark, Plus, X, Check, Copy, Languages, Eye, LayoutGrid, List, Star, Info, Columns3 } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { MARKETS, KEYWORD_CHIPS, PLACEHOLDERS, OFFER_TYPE_LABEL, despeguePercent, classifyOffer, CATEGORY_LABEL, buildAdsLibraryPageUrl, buildAdsLibrarySearchUrl, normalizeAdsLibraryUrl, type AdLang, type AdMarket, type DemoAd, type Tier } from "@/lib/demo-winning-ads";
import { useElapsedMinutes } from "@/hooks/useElapsedMinutes";
import { useCredits } from "@/hooks/useCredits";
import { SofisticarModal } from "@/components/SofisticarModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

import { AdMediaPreview } from "@/components/AdMediaPreview";
import { getAutoSearchKeywords, TOTAL_DR_KEYWORDS } from "@/lib/dr-keywords";

// Mapa estático → Tailwind necesita clases completas en el bundle
const GRID_COLS_CLASS: Record<number, string> = {
  1: "grid grid-cols-1 gap-4",
  2: "grid grid-cols-1 sm:grid-cols-2 gap-4",
  3: "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4",
  4: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3",
  5: "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3",
  6: "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3",
};

// Cache de ads en sessionStorage para carga instantánea entre navegaciones
const ADS_CACHE_KEY = "supernova:ads-cache-v2";
const ADS_CACHE_TTL = 5 * 60_000; // 5 min
type AdsCache = { ads: DemoAd[]; stats: { total: number; unique: number; mega: number; rising: number; solid: number }; ts: number };
function readAdsCache(): AdsCache | null {
  try {
    const raw = sessionStorage.getItem(ADS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdsCache;
    if (Date.now() - parsed.ts > ADS_CACHE_TTL) return null;
    return parsed;
  } catch { return null; }
}
function writeAdsCache(ads: DemoAd[], stats: AdsCache["stats"]) {
  try {
    // Limitar para no saturar sessionStorage (~5MB típico)
    const slim = ads.slice(0, 1500);
    sessionStorage.setItem(ADS_CACHE_KEY, JSON.stringify({ ads: slim, stats, ts: Date.now() }));
  } catch { /* quota */ }
}

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
  ad_creative_link_descriptions?: string[];
  ad_creative_link_captions?: string[];
  ad_snapshot_url?: string;
  ad_delivery_start_time?: string;
  publisher_platforms?: string[];
  languages?: string[];
  total_count?: number | string;
}

interface FacebookAdsResponse {
  data?: FacebookAdLibraryItem[];
}

// Extrae el dominio limpio (sin "www.") de una URL.
function extractDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Convierte código ISO de país (US, ES, BR...) a emoji bandera.
function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return "🌐";
  const cc = code.toUpperCase();
  return String.fromCodePoint(...cc.split("").map((c) => 127397 + c.charCodeAt(0)));
}

// Mapea cada plataforma a su icono Lucide y color.
const PLATFORM_META: Record<string, { label: string; cls: string }> = {
  facebook: { label: "FB", cls: "bg-[#1877F2] text-white" },
  instagram: { label: "IG", cls: "bg-gradient-to-br from-[#feda75] via-[#fa7e1e] to-[#d62976] text-white" },
  messenger: { label: "MSG", cls: "bg-[#0084FF] text-white" },
  audience_network: { label: "AN", cls: "bg-neutral-700 text-neutral-200" },
  threads: { label: "TH", cls: "bg-black text-white border border-neutral-700" },
};

// Agrupa anuncios por page_id quedándose con el de mejor score por anunciante.
// Añade activeCount (anuncios activos en esta búsqueda), historicalCount
// (total_count de la API si está disponible) y countries (unión de países donde corre).
function groupByAdvertiser(
  ads: DemoAd[],
  items: FacebookAdLibraryItem[],
  countriesByPage?: Map<string, Set<string>>,
): DemoAd[] {
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
    const countries = countriesByPage?.get(key);
    grouped.push({
      ...top,
      activeCount: group.length,
      historicalCount: historicalByPage.get(key),
      countries: countries ? Array.from(countries) : top.countries,
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
  // Hidratar desde sessionStorage para render instantáneo (Apple-style: no spinners en navegación)
  const _cachedInit = readAdsCache();
  const [realAds, setRealAds] = useState<DemoAd[]>(_cachedInit?.ads ?? []);
  const [loadingReal, setLoadingReal] = useState(false);
  const [liveStats, setLiveStats] = useState(_cachedInit?.stats ?? { total: 0, unique: 0, mega: 0, rising: 0, solid: 0 });
  const [autoKeywords, setAutoKeywords] = useState<string[]>([]);
  const [autoLoading, setAutoLoading] = useState(false);
  const [lastAutoRun, setLastAutoRun] = useState<Date | null>(null);
  // Selectores para la edge function
  const [searchCountry, setSearchCountry] = useState("ES");
  const [searchLimit, setSearchLimit] = useState(25);
  const [searchStatus, setSearchStatus] = useState<"ACTIVE" | "INACTIVE" | "ALL">("ACTIVE");
  const [verticalFilter, setVerticalFilter] = useState<string>("Todas");
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => (localStorage.getItem("supernova:ads-view") as "grid" | "list") ?? "grid");
  useEffect(() => { localStorage.setItem("supernova:ads-view", viewMode); }, [viewMode]);
  // Nº de columnas en grid (2/3/4/5/6) — persistido
  const [cols, setCols] = useState<number>(() => {
    const n = parseInt(localStorage.getItem("supernova:ads-cols") ?? "3", 10);
    return [2, 3, 4, 5, 6].includes(n) ? n : 3;
  });
  useEffect(() => { localStorage.setItem("supernova:ads-cols", String(cols)); }, [cols]);
  const [bannerDismissed, setBannerDismissed] = useState(() => localStorage.getItem("supernova:winner-banner-v1") === "1");
  const dismissBanner = () => { setBannerDismissed(true); localStorage.setItem("supernova:winner-banner-v1", "1"); };
  // Búsquedas guardadas por usuario (keyword + país + estado)
  type UserSearch = { id: string; name: string; keyword: string; country: string; status: "ACTIVE" | "INACTIVE" | "ALL" };
  const USER_SEARCHES_KEY = "supernova:user-saved-searches";
  const [userSearches, setUserSearches] = useState<UserSearch[]>(() => {
    try { return JSON.parse(localStorage.getItem(USER_SEARCHES_KEY) ?? "[]"); } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(USER_SEARCHES_KEY, JSON.stringify(userSearches)); }, [userSearches]);
  const saveCurrentSearch = () => {
    const name = (keyword.trim() || "Búsqueda sin nombre").slice(0, 40);
    const s: UserSearch = { id: crypto.randomUUID(), name, keyword: keyword.trim(), country: searchCountry, status: searchStatus };
    setUserSearches((p) => [s, ...p].slice(0, 20));
    toast.success(`Guardado: ${name}`);
  };
  const applyUserSearch = (s: UserSearch) => {
    setKeyword(s.keyword); setSearchCountry(s.country); setSearchStatus(s.status);
    toast.success(`Aplicado: ${s.name}`);
  };
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

  // Persistir cache en sessionStorage cada vez que cambian ads/stats
  useEffect(() => {
    if (realAds.length > 0) writeAdsCache(realAds, liveStats);
  }, [realAds, liveStats]);

  // Cargar histórico real desde `winning_ads` — stats con COUNT exactos + paginación
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) Stats reales sin tope de 1000: count(head:true) por tier
      const [{ count: total }, { count: mega }, { count: rising }, { count: solid }] = await Promise.all([
        supabase.from("winning_ads").select("*", { count: "exact", head: true }),
        supabase.from("winning_ads").select("*", { count: "exact", head: true }).eq("tier", "mega"),
        supabase.from("winning_ads").select("*", { count: "exact", head: true }).eq("tier", "rising"),
        supabase.from("winning_ads").select("*", { count: "exact", head: true }).eq("tier", "solid"),
      ]);
      const { data: pages } = await supabase
        .from("winning_ads")
        .select("page_id")
        .not("page_id", "is", null)
        .limit(10000);
      const unique = new Set((pages ?? []).map((r: any) => r.page_id)).size;
      if (!cancelled) {
        setLiveStats({
          total: total ?? 0,
          unique,
          mega: mega ?? 0,
          rising: rising ?? 0,
          solid: solid ?? 0,
        });
      }

      // 2) Cargar hasta 5000 filas paginadas (Supabase limita a 1000 por request)
      const PAGE = 1000;
      const TARGET = 5000;
      const all: any[] = [];
      for (let offset = 0; offset < TARGET; offset += PAGE) {
        const { data, error } = await supabase
          .from("winning_ads")
          .select("*")
          .order("scraped_at", { ascending: false })
          .range(offset, offset + PAGE - 1);
        if (error || !data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE) break;
      }
      if (cancelled || all.length === 0) return;

      const mappedDb: DemoAd[] = all.map((r: any, i: number) => {
        const adMarket = (r.market ?? "US") as AdMarket;
        const title = r.ad_title ?? r.page_name ?? "Anuncio";
        const body = r.ad_body ?? r.ad_description ?? "";
        const days = r.days_active ?? 1;
        const rawUrl = r.ad_url ?? (r.page_id
          ? buildAdsLibraryPageUrl(String(r.page_id), adMarket)
          : buildAdsLibrarySearchUrl(r.page_name ?? title, adMarket));
        const adUrl = normalizeAdsLibraryUrl(rawUrl, r.page_name ?? title, adMarket);
        return {
          id: `db-${r.id ?? i}`,
          pageId: r.page_id ?? "",
          pageName: r.page_name ?? r.advertiser ?? "Facebook Ad",
          title,
          body: body || title,
          daysActive: days,
          duplicates: r.duplicate_count ?? 1,
          score: r.winner_score ?? 50,
          tier: (r.tier ?? "solid") as Tier,
          offerType: (r.offer_type ?? "infoproducto") as DemoAd["offerType"],
          market: adMarket,
          marketLabel: r.market ?? "",
          flag: flagEmoji(r.market ?? "US"),
          lang: "en" as AdLang,
          adUrl,
          platforms: Array.isArray(r.publisher_platforms) ? r.publisher_platforms : ["facebook"],
          countries: [r.market ?? "US"],
          vertical: classifyOffer(`${title} ${body}`),
        };
      });
      setRealAds((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        const fresh = mappedDb.filter((a) => !seen.has(a.id));
        return [...prev, ...fresh];
      });
    })();
    return () => { cancelled = true; };
  }, []);

  // Admin: siembra masiva desde FB Ads Library
  const [seeding, setSeeding] = useState(false);
  const runBulkSeed = async () => {
    if (seeding) return;
    setSeeding(true);
    toast.info("Sembrando catálogo desde FB Ads Library… 1-3 min");
    try {
      const { data, error } = await supabase.functions.invoke("bulk-seed-ads", {
        body: { max_jobs: 200, limit: 100 },
      });
      if (error) throw error;
      const d = data as { inserted?: number; fetched?: number; jobs_run?: number };
      toast.success(`✓ ${d.inserted ?? 0} nuevos · ${d.fetched ?? 0} fetched · ${d.jobs_run ?? 0} jobs`);
      setTimeout(() => window.location.reload(), 1000);
    } catch (e) {
      toast.error(`Error siembra: ${e instanceof Error ? e.message : "desconocido"}`);
    } finally {
      setSeeding(false);
    }
  };

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
      const countriesByPage = new Map<string, Set<string>>();
      allWithCountry.forEach(({ it, country }) => {
        const k = (it.page_id ?? it.page_name ?? "").toString();
        if (!k) return;
        dupByPage.set(k, (dupByPage.get(k) ?? 0) + 1);
        if (!countriesByPage.has(k)) countriesByPage.set(k, new Set());
        countriesByPage.get(k)!.add(country);
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
        const copyBonus = body.length > 500 ? 10 : body.length > 200 ? 5 : 0;
        const score = Math.min(100, 30 + Math.min(days, 90) / 2 + dups * 5 + copyBonus);
        const tier: Tier =
          score >= 75 || dups >= 5 || days >= 60 ? "mega"
          : score >= 55 || dups >= 2 || days >= 14 ? "rising"
          : "solid";
        const lower = (title + " " + body).toLowerCase();
        const offerType: DemoAd["offerType"] =
          /webinar|masterclass|curso|método|secret|training|treinamento/.test(lower) ? "infoproducto"
          : /\b(ai|app|saas|software|tool|platform|crm|automation)\b/.test(lower) ? "saas"
          : /\b(agency|agencia|consulting|consultoría|service|servicio)\b/.test(lower) ? "servicio"
          : /shipping|envío|frete|free \+ shipping/.test(lower) ? "ecommerce"
          : "infoproducto";
        const landingCaption = it.ad_creative_link_captions?.[0];
        const landingUrl = landingCaption?.startsWith("http") ? landingCaption : undefined;
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
          flag: flagEmoji(country),
          lang: marketTyped,
          adUrl,
          platforms: it.publisher_platforms,
          countries: [country],
          ctaText: undefined,
          landingUrl,
          snapshotUrl: it.ad_snapshot_url,
          vertical: classifyOffer(`${title} ${body}`),
        };
      });
      // Agrupar por anunciante (1 tarjeta por page_id, el de mayor score)
      const groupedMapped = groupByAdvertiser(mapped, allWithCountry.map((x) => x.it), countriesByPage);
      // Prepend nuevos, dedupe por id, mantener historial
      setRealAds((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        const fresh = groupedMapped.filter((a) => !seen.has(a.id));
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
    if (verticalFilter !== "Todas") {
      list = list.filter((a) => {
        const v = a.vertical ?? classifyOffer(`${a.title} ${a.body}`);
        return v === verticalFilter;
      });
    }
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
  }, [allAds, market, minDays, minDups, typeFilter, regionFilter, minScore, verticalFilter, sort, keyword]);

  // Paginación: el usuario elige 25/50/100/200 ads por página
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem("supernova:ads-page-size") ?? "50", 10);
    return [25, 50, 100, 200].includes(saved) ? saved : 50;
  });
  const [page, setPage] = useState(1);
  useEffect(() => { localStorage.setItem("supernova:ads-page-size", String(pageSize)); }, [pageSize]);
  useEffect(() => { setPage(1); }, [pageSize, market, minDays, minDups, typeFilter, regionFilter, minScore, verticalFilter, sort, keyword]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize],
  );

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
        const landingCaption = it.ad_creative_link_captions?.[0];
        const landingUrl = landingCaption?.startsWith("http") ? landingCaption : undefined;
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
          flag: flagEmoji(searchCountry),
          lang: marketTyped,
          adUrl,
          platforms: it.publisher_platforms,
          countries: [searchCountry],
          landingUrl,
          snapshotUrl: it.ad_snapshot_url,
          vertical: classifyOffer(`${title} ${body}`),
        };
      });
      const grouped = groupByAdvertiser(mapped, items);
      setRealAds(grouped);
      toast.success(`✓ ${grouped.length} anunciantes únicos (${mapped.length} anuncios)`);
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
      {/* Release banner */}
      {!bannerDismissed && (
        <div className="rounded-xl border border-primary/40 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-2.5 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-base">🚀</span>
            <span className="font-semibold text-foreground">Nuevo:</span>
            <span className="text-muted-foreground">filtros por vertical, búsquedas guardadas y vista lista. <span className="text-primary font-semibold">TikTok Ads</span> próximamente.</span>
          </div>
          <button onClick={dismissBanner} className="text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-secondary transition-colors" aria-label="Cerrar">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

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

          {isAdmin && (
            <button
              onClick={runBulkSeed}
              disabled={seeding}
              className="group relative rounded-2xl overflow-hidden bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-500 text-white p-3 flex flex-col items-center justify-center gap-1 font-bold transition-all disabled:opacity-60 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 hover:scale-[1.02] active:scale-[0.98] col-span-2"
              title="Sembrar catálogo masivo desde FB Ads Library"
            >
              {seeding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Flame className="w-5 h-5 group-hover:rotate-12 transition-transform" />}
              <span className="text-[11px] uppercase tracking-wider">{seeding ? "Sembrando…" : "Sembrar +1000 ads"}</span>
            </button>
          )}
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
          <button onClick={saveCurrentSearch} className="px-4 py-3 rounded-lg text-sm flex items-center gap-2 whitespace-nowrap border border-border bg-secondary/60 text-foreground hover:border-primary/40 hover:text-primary transition-colors" title="Guardar esta búsqueda">
            <Star className="w-4 h-4" />
          </button>
          <button onClick={handleSearch} disabled={loadingReal} className="btn-primary-nova px-6 py-3 rounded-lg text-sm flex items-center gap-2 whitespace-nowrap disabled:opacity-60">
            {loadingReal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} {loadingReal ? "Buscando..." : "Buscar Anuncios"} <span className="opacity-70">· 1 crédito</span>
          </button>
        </div>

        {/* Búsquedas guardadas del usuario */}
        {userSearches.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1.5">
              <Star className="w-3 h-3" /> Tus búsquedas guardadas
            </div>
            <div className="flex flex-wrap gap-2">
              {userSearches.map((s) => (
                <div key={s.id} className="group/search inline-flex items-center gap-1 rounded-full pl-3 pr-1 py-1 text-xs font-medium bg-secondary/60 border border-border/60 hover:border-primary/40 transition-all">
                  <button onClick={() => applyUserSearch(s)} className="flex items-center gap-1.5">
                    <span className="text-foreground">{s.name}</span>
                    <span className="text-[9px] text-muted-foreground">{s.country}·{s.status[0]}</span>
                  </button>
                  <button onClick={() => setUserSearches((p) => p.filter((x) => x.id !== s.id))} className="opacity-0 group-hover/search:opacity-100 transition-opacity rounded-full p-0.5 hover:bg-destructive/30" aria-label="Eliminar">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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
      <div className="rounded-2xl p-5 sticky top-[80px] z-10 border border-border bg-card/80 backdrop-blur-xl space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">
            <Filter className="w-3.5 h-3.5" /> Filtros de calidad
          </div>
          {/* Toggle vista grid/list + selector de columnas */}
          <div className="flex items-center gap-2">
            {viewMode === "grid" && (
              <div className="inline-flex items-center gap-1 bg-secondary/60 rounded-full p-1 border border-border/60" title="Columnas">
                <Columns3 className="w-3 h-3 text-muted-foreground ml-1.5" />
                {[2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    onClick={() => setCols(n)}
                    aria-label={`${n} columnas`}
                    className={`w-7 h-6 rounded-full text-[11px] font-semibold tabular-nums transition-all ${cols === n ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
                  >{n}</button>
                ))}
              </div>
            )}
            <div className="inline-flex bg-secondary/60 rounded-full p-1 border border-border/60">
              <button onClick={() => setViewMode("grid")} aria-label="Vista grid" className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${viewMode === "grid" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
                <LayoutGrid className="w-3 h-3" /> Grid
              </button>
              <button onClick={() => setViewMode("list")} aria-label="Vista lista" className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${viewMode === "list" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>
                <List className="w-3 h-3" /> Lista
              </button>
            </div>
          </div>
        </div>

        {/* Chips por vertical */}
        <div className="flex flex-wrap gap-1.5">
          {(["Todas", "infoproducto", "ecommerce", "app_saas", "servicio", "salud", "crypto", "otro"] as const).map((v) => {
            const active = verticalFilter === v;
            const label = v === "Todas" ? "Todas" : (CATEGORY_LABEL as Record<string, string>)[v] ?? v;
            return (
              <button
                key={v}
                onClick={() => setVerticalFilter(v)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow shadow-primary/20"
                    : "bg-secondary/40 text-muted-foreground border-border/60 hover:text-foreground hover:border-primary/40"
                }`}
              >
                {label}
              </button>
            );
          })}
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
        {(() => {
          const isAdmin = user?.email === "demo@supernova.test" || (user?.user_metadata as { role?: string } | undefined)?.role === "admin";
          return (
            <>
              <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
                <div>
                  <h3 className="font-display font-bold text-xl text-foreground">OFERTAS ESCALANDO AHORA</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Infoproductos y ofertas en escalada detectadas en tiempo real desde Ads Library.
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

              {isAdmin && autoKeywords.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mb-4 text-[11px] p-2 rounded-lg border border-dashed border-border bg-secondary/30">
                  <span className="text-[9px] font-bold tracking-widest text-muted-foreground uppercase">Admin · {TOTAL_DR_KEYWORDS} keywords DR:</span>
                  {autoKeywords.map((k) => (
                    <span key={k} className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary font-mono text-[10px]">
                      {k}
                    </span>
                  ))}
                  <span className="text-muted-foreground/60">+{TOTAL_DR_KEYWORDS - autoKeywords.length} más rotando</span>
                </div>
              )}
            </>
          );
        })()}


        {filtered.length === 0 ? (
          <div className="card-surface rounded-xl py-16 text-center">
            <div className="empty-icon mb-4"><Trophy className="w-9 h-9" /></div>
            <div className="font-display font-bold text-lg mb-1">Aún no hay ganadores en este filtro</div>
            <div className="text-sm text-muted-foreground max-w-sm mx-auto">Ajusta días, repeticiones o cambia de mercado para descubrir más oportunidades</div>
          </div>
        ) : (
          <>
            <PaginationBar
              total={filtered.length}
              page={currentPage}
              pageSize={pageSize}
              totalPages={totalPages}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
            <div className={viewMode === "grid" ? GRID_COLS_CLASS[cols] ?? GRID_COLS_CLASS[3] : "flex flex-col gap-3"}>
              {paginated.map((ad) => (
                <AdCard key={ad.id} ad={ad} saved={saved.has(ad.id)} onSave={() => toggleSave(ad.id)} onSofisticar={() => setSofisticarAd(ad)} compact={viewMode === "list"} />
              ))}
            </div>
            <PaginationBar
              total={filtered.length}
              page={currentPage}
              pageSize={pageSize}
              totalPages={totalPages}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </div>

      {sofisticarAd && (
        <SofisticarModal ad={sofisticarAd} onClose={() => setSofisticarAd(null)} />
      )}
    </div>
  );
}

function PaginationBar({
  total, page, pageSize, totalPages, onPageChange, onPageSizeChange,
}: {
  total: number; page: number; pageSize: number; totalPages: number;
  onPageChange: (p: number) => void; onPageSizeChange: (s: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 px-1">
      <div className="text-xs text-muted-foreground">
        Mostrando <span className="text-foreground font-medium">{from.toLocaleString()}–{to.toLocaleString()}</span> de{" "}
        <span className="text-foreground font-medium">{total.toLocaleString()}</span> ads
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Por página</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-8 w-[80px] rounded-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[25, 50, 100, 200].map((n) => (
              <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
            className="h-8 px-2 rounded-md text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >««</button>
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="h-8 px-3 rounded-md text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >‹ Anterior</button>
          <span className="px-3 text-xs text-foreground/80">
            Página <span className="font-semibold text-foreground">{page}</span> / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="h-8 px-3 rounded-md text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >Siguiente ›</button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
            className="h-8 px-2 rounded-md text-xs font-medium bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >»»</button>
        </div>
      </div>
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


function AdCard({ ad, saved, onSave, onSofisticar, compact = false }: { ad: DemoAd; saved: boolean; onSave: () => void; onSofisticar: () => void; compact?: boolean }) {
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

  // (preview ahora va inline en la card; no necesita estado de dialog)
  const copyToClipboard = () => {
    navigator.clipboard.writeText(ad.body).then(() => toast.success("Copy copiado")).catch(() => toast.error("No se pudo copiar"));
  };
  const translateUrl = `https://translate.google.com/?sl=auto&tl=es&text=${encodeURIComponent(ad.body)}&op=translate`;
  const landingDomain = ad.landingUrl ? extractDomain(ad.landingUrl) : "";

  // Razones por las que es ganador — derivadas de métricas reales
  const winnerReasons: { icon: string; title: string; detail: string }[] = [];
  if (ad.daysActive >= 90) winnerReasons.push({ icon: "🔥", title: "Always-on +90 días", detail: "Lleva más de 3 meses corriendo sin parar. Si no rentara, lo habrían pausado hace semanas." });
  else if (ad.daysActive >= 30) winnerReasons.push({ icon: "📅", title: `Evergreen ${ad.daysActive}d`, detail: "Más de 30 días activos = el anunciante validó CPA rentable y está escalando." });
  else if (ad.daysActive >= 14) winnerReasons.push({ icon: "✅", title: `Validado ${ad.daysActive}d`, detail: "Pasó el periodo de aprendizaje de Meta y sigue activo." });

  if ((ad.activeCount ?? 1) >= 20) winnerReasons.push({ icon: "🧪", title: `Split-test ×${ad.activeCount}`, detail: "Tantas variantes activas indican presupuesto serio y proceso de optimización agresivo." });
  else if ((ad.activeCount ?? 1) >= 5) winnerReasons.push({ icon: "🔬", title: `${ad.activeCount} variantes A/B`, detail: "Está testeando ángulos en paralelo — señal de equipo profesional buscando winner." });

  if (ad.duplicates >= 10) winnerReasons.push({ icon: "♻️", title: `${ad.duplicates} duplicados`, detail: "Duplica el creativo para escalar presupuesto sin reiniciar el aprendizaje. Clásico de escala." });
  else if (ad.duplicates >= 3) winnerReasons.push({ icon: "📈", title: `${ad.duplicates}× duplicado`, detail: "Empezó a duplicarse — early signal de que está rindiendo." });

  if ((ad.historicalCount ?? 0) >= 1000) winnerReasons.push({ icon: "🏆", title: `Anunciante veterano ${Math.floor((ad.historicalCount ?? 0) / 1000)}K+ ads`, detail: "Página con historial masivo — saben lo que hacen y este ad sobrevivió a su filtro interno." });
  else if ((ad.historicalCount ?? 0) >= 100) winnerReasons.push({ icon: "👤", title: `${ad.historicalCount}+ ads históricos`, detail: "Anunciante experimentado, no es su primer rodeo." });

  if ((ad.platforms?.length ?? 0) >= 3) winnerReasons.push({ icon: "📡", title: `${ad.platforms!.length} plataformas`, detail: "Corre en FB + IG + más → Meta está distribuyendo bien y el ROAS lo aguanta." });
  if ((ad.countries?.length ?? 0) >= 3) winnerReasons.push({ icon: "🌍", title: `${ad.countries!.length} países`, detail: "Escalando geo — oferta validada en múltiples mercados." });
  if (ad.checkoutPlatform) winnerReasons.push({ icon: "💳", title: `Checkout: ${ad.checkoutPlatform}`, detail: "Plataforma de venta detectada — confirma que es oferta real, no branding." });
  if (ad.score >= 80) winnerReasons.push({ icon: "⭐", title: `Score ${ad.score}/100 — MEGA`, detail: "Combinación de antigüedad + duplicados + plataformas en el top de detección." });

  if (winnerReasons.length === 0) winnerReasons.push({ icon: "👀", title: "En observación", detail: "Aún pocos datos. Vuelve a revisar en 24-48h para ver si despega." });

  return (
    <div className="card-surface rounded-xl p-5 flex flex-col gap-3 ad-card-hover">
      {compact && null}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded ${tier.cls}`}>{tier.icon} {tier.label}</span>
          {/* Plataformas reales */}
          {ad.platforms?.slice(0, 4).map((p) => {
            const meta = PLATFORM_META[p.toLowerCase()];
            if (!meta) return null;
            return <span key={p} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${meta.cls}`}>{meta.label}</span>;
          })}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onSave} className="text-muted-foreground hover:text-primary transition-colors">
            <Heart className={`w-4 h-4 ${saved ? "fill-primary text-primary" : ""}`} />
          </button>
          <span className="text-2xl font-display font-extrabold text-foreground">{ad.score}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider flex-wrap">
        <span className="text-primary font-bold">{CATEGORY_LABEL[ad.vertical ?? classifyOffer(`${ad.title} ${ad.body}`)]}</span>
        {/* Banderas de países */}
        {ad.countries && ad.countries.length > 0 ? (
          <span className="text-muted-foreground">
            · {ad.countries.slice(0, 4).map(flagEmoji).join(" ")} {ad.countries.length > 4 && `+${ad.countries.length - 4}`}
          </span>
        ) : (
          <span className="text-muted-foreground">· {ad.flag} {ad.marketLabel}</span>
        )}
        <span className="text-muted-foreground">· {ad.lang.toUpperCase()}</span>
        {ad.checkoutPlatform && <span className="text-muted-foreground">· via {ad.checkoutPlatform}</span>}
      </div>

      {/* Preview real (screenshot/video del Ad Library renderizado server-side) */}
      <AdMediaPreview
        snapshotUrl={ad.snapshotUrl}
        adUrl={ad.adUrl}
        pageId={ad.pageId}
        pageName={ad.pageName}
        title={ad.title}
      />

      <p className="text-sm text-foreground/90 line-clamp-4 italic leading-relaxed">"{ad.body}"</p>

      {/* Landing URL */}
      {landingDomain && (
        <a href={ad.landingUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline flex items-center gap-1 truncate">
          <LinkIcon className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{landingDomain}</span>
        </a>
      )}


      <div className="flex flex-wrap gap-1.5">
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${daysBadgeCls}`}>
          <Flame className="w-3 h-3" /> {ad.daysActive} Días Activo
        </span>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${dupsBadgeCls}`}>
          <Zap className="w-3 h-3" /> {ad.duplicates} Duplicados
        </span>
        {typeof ad.activeCount === "number" && ad.activeCount > 1 && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 bg-primary/15 text-primary border border-primary/30">
            {ad.activeCount} anuncios activos
          </span>
        )}
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

      <div className="flex items-start gap-2 pt-1 border-t border-border/50">
        {ad.pageId ? (
          <img
            src={`https://graph.facebook.com/${ad.pageId}/picture?type=square`}
            alt={ad.pageName}
            loading="lazy"
            onError={(e) => {
              const target = e.currentTarget;
              target.style.display = "none";
              target.nextElementSibling?.classList.remove("hidden");
            }}
            className="w-9 h-9 rounded-full object-cover border border-border bg-secondary flex-shrink-0"
          />
        ) : null}
        <div className={`w-9 h-9 rounded-full btn-primary-nova flex items-center justify-center text-sm font-bold flex-shrink-0 ${ad.pageId ? "hidden" : ""}`}>
          {ad.pageName.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Anunciante</div>
          <div className="text-xs font-semibold text-foreground truncate">{ad.pageName}</div>
          {(() => {
            const active = ad.activeCount ?? 1;
            const historical = ad.historicalCount ?? 0;
            const days = Math.max(ad.daysActive, 1);
            const adsPerWeek = (active / days) * 7;
            const iterationRatio = active > 0 && historical > 0 ? historical / active : 0;

            const intel: { label: string; tone: "amber" | "neutral" | "danger" }[] = [];

            if (ad.daysActive >= 90) intel.push({ label: "Always-on 90d+", tone: "amber" });
            else if (ad.daysActive >= 30) intel.push({ label: "Evergreen 30d+", tone: "amber" });

            if (active >= 20) intel.push({ label: `Split-test ×${active}`, tone: "danger" });
            else if (active >= 5) intel.push({ label: `${active} variantes A/B`, tone: "neutral" });

            if (adsPerWeek >= 3) intel.push({ label: `${adsPerWeek.toFixed(1)} ads/sem`, tone: "amber" });

            if (historical >= 1000) intel.push({ label: `Veterano ${Math.floor(historical / 1000)}K+ ads`, tone: "danger" });
            else if (historical >= 100) intel.push({ label: `${historical}+ ads históricos`, tone: "neutral" });

            if (iterationRatio >= 20) intel.push({ label: `Itera ×${Math.round(iterationRatio)}`, tone: "amber" });

            if (ad.checkoutPlatform) intel.push({ label: `Checkout: ${ad.checkoutPlatform}`, tone: "neutral" });

            const toneCls = {
              amber: "bg-primary/15 text-primary border-primary/30",
              danger: "bg-red-500/15 text-red-400 border-red-500/30",
              neutral: "bg-secondary text-muted-foreground border-border",
            } as const;

            return (
              <>
                <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                  {active.toLocaleString()} activos
                  {historical > 0 && <> · {historical.toLocaleString()}+ históricos</>}
                </div>
                {intel.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {intel.slice(0, 4).map((chip) => (
                      <span
                        key={chip.label}
                        className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${toneCls[chip.tone]}`}
                      >
                        {chip.label}
                      </span>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>


      <Popover>
        <PopoverTrigger asChild>
          <button
            className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary transition-all mt-1"
          >
            <Info className="w-3.5 h-3.5" /> ¿Por qué gana este ad?
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="w-80 p-0 border-border bg-popover/95 backdrop-blur-xl">
          <div className="p-3 border-b border-border/60 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" />
            <div>
              <div className="text-xs font-display font-bold text-foreground">Diagnóstico ganador</div>
              <div className="text-[10px] text-muted-foreground">Score {ad.score}/100 · {winnerReasons.length} señales detectadas</div>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto p-2 space-y-1.5">
            {winnerReasons.map((r) => (
              <div key={r.title} className="flex gap-2 p-2 rounded-md hover:bg-secondary/40 transition-colors">
                <span className="text-base leading-none mt-0.5">{r.icon}</span>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-foreground">{r.title}</div>
                  <div className="text-[10px] text-muted-foreground leading-snug">{r.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <button onClick={onSofisticar} className="btn-primary-nova w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 mt-1">
        <Sparkles className="w-4 h-4" /> SOFISTICAR → <span className="opacity-70 text-xs">· 1 crédito</span>
      </button>

      <a href={ad.adUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 justify-center group">
        <ExternalLink className="w-3 h-3" /> Ver todos los anuncios de <span className="font-semibold text-foreground group-hover:text-primary truncate max-w-[200px]">{ad.pageName}</span>
      </a>
    </div>
  );
}
