import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, ExternalLink, Heart, Flame, Zap, Trophy, TrendingUp, CheckCircle2, Link as LinkIcon, Search, Filter, Loader2 } from "lucide-react";
import { getDemoAds, MARKETS, KEYWORD_CHIPS, PLACEHOLDERS, OFFER_TYPE_LABEL, GLOBAL_STATS, despeguePercent, classifyOffer, CATEGORY_LABEL, type DemoAd, type Tier } from "@/lib/demo-winning-ads";
import { useElapsedMinutes } from "@/hooks/useElapsedMinutes";
import { useCredits } from "@/hooks/useCredits";
import { SofisticarModal } from "@/components/SofisticarModal";
import { supabase } from "@/integrations/supabase/client";

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

export function WinningAdsPage() {
  const elapsed = useElapsedMinutes();
  const { consume, canAfford } = useCredits();

  const [market, setMarket] = useState<string>("all");
  const [keyword, setKeyword] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [minDays, setMinDays] = useState(7);
  const [minDups, setMinDups] = useState(3);
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [regionFilter, setRegionFilter] = useState("Todos");
  const [minScore, setMinScore] = useState(0);
  const [sort, setSort] = useState("Mayor Score");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [sofisticarAd, setSofisticarAd] = useState<DemoAd | null>(null);

  const allAds = useMemo(() => getDemoAds(), []);

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

  const handleSearch = () => {
    if (!canAfford("search_ads")) { toast.error("Sin créditos suficientes"); return; }
    consume("search_ads", keyword || market);
    toast.success(`✓ Buscando "${keyword || "todos"}" en ${MARKETS.find((m) => m.id === market)?.label}`);
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
      const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="page-heading font-display text-2xl text-foreground">ANUNCIOS GANADORES</h2>
          <p className="text-sm text-muted-foreground mt-3">Anuncios validados con datos reales. Encuentra, analiza, clona.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 pulse-hot">
          <span className="live-dot" />
          <span className="text-[11px] font-bold text-primary tracking-widest">ACTUALIZADO HACE {elapsed} MIN</span>
        </div>
      </div>

      {/* Global stats bar */}
      <div className="card-surface rounded-xl p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="flex items-center gap-2 text-success font-semibold"><span className="live-dot" /> MINER ACTIVO</span>
        <span className="text-muted-foreground"><strong className="text-foreground">{GLOBAL_STATS.total.toLocaleString()}</strong> anuncios</span>
        <span className="text-muted-foreground"><strong className="text-foreground">{GLOBAL_STATS.unique.toLocaleString()}</strong> únicos</span>
        <span className="flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" style={{ color: "hsl(var(--tier-mega))" }} /> <strong>{GLOBAL_STATS.mega}</strong> mega</span>
        <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" style={{ color: "hsl(var(--tier-rising))" }} /> <strong>{GLOBAL_STATS.rising.toLocaleString()}</strong> rising</span>
        <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" style={{ color: "hsl(var(--tier-solid))" }} /> <strong>{GLOBAL_STATS.solid.toLocaleString()}</strong> solid</span>
      </div>

      {/* URL input */}
      <div className="card-surface rounded-xl p-5 flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <LinkIcon className="w-5 h-5 text-primary shrink-0 hidden md:block" />
        <input
          value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
          placeholder="¿Ya tienes un anuncio? Pega la URL del Ads Library y analízalo"
          className="flex-1 bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button onClick={handleAnalyzeUrl} className="btn-primary-nova px-5 py-2.5 rounded-lg text-sm whitespace-nowrap flex items-center gap-2">
          → Analizar Oferta <span className="opacity-70">· 1 crédito</span>
        </button>
      </div>

      {/* Keyword search */}
      <div className="card-surface rounded-xl p-5 space-y-4">
        {/* Market tabs */}
        <div className="flex flex-wrap gap-2">
          {MARKETS.map((m) => (
            <button
              key={m.id} onClick={() => setMarket(m.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                market === m.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{m.flag}</span> {m.label}
            </button>
          ))}
        </div>

        <div className="flex gap-3 flex-col md:flex-row">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={keyword} onChange={(e) => setKeyword(e.target.value)}
              placeholder={PLACEHOLDERS[market]}
              className="w-full bg-secondary border border-border rounded-lg pl-10 pr-4 py-3 text-base focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button onClick={handleSearch} className="btn-primary-nova px-6 py-3 rounded-lg text-sm flex items-center gap-2 whitespace-nowrap">
            <Search className="w-4 h-4" /> Buscar Anuncios <span className="opacity-70">· 1 crédito</span>
          </button>
        </div>

        {/* Keyword chips */}
        <div className="flex flex-wrap gap-2 pt-1">
          {KEYWORD_CHIPS[market].map((k) => (
            <button key={k} onClick={() => setKeyword(k)}
              className="px-2.5 py-1 rounded-full text-xs bg-secondary border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-all">
              {k}
            </button>
          ))}
        </div>
      </div>

      {/* Quality filters (sticky) */}
      <div className="card-surface rounded-xl p-4 sticky top-[80px] z-10 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
          <Filter className="w-3.5 h-3.5" /> Filtros de calidad
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-3 text-xs">
          <FilterGroup label="Días mínimos">
            {DAY_OPTIONS.map((o) => <Chip key={o.v} active={minDays === o.v} onClick={() => setMinDays(o.v)}>{o.l}</Chip>)}
          </FilterGroup>
          <FilterGroup label="Repeticiones">
            {DUP_OPTIONS.map((o) => <Chip key={o.v} active={minDups === o.v} onClick={() => setMinDups(o.v)}>{o.l}</Chip>)}
          </FilterGroup>
          <FilterGroup label="Tipo">
            {TYPE_OPTIONS.map((o) => <Chip key={o} active={typeFilter === o} onClick={() => setTypeFilter(o)}>{o}</Chip>)}
          </FilterGroup>
          <FilterGroup label="Mercado">
            {REGION_OPTIONS.map((o) => <Chip key={o} active={regionFilter === o} onClick={() => setRegionFilter(o)}>{o}</Chip>)}
          </FilterGroup>
          <FilterGroup label="Score">
            {SCORE_OPTIONS.map((o) => <Chip key={o.v} active={minScore === o.v} onClick={() => setMinScore(o.v)}>{o.l}</Chip>)}
          </FilterGroup>
          <FilterGroup label="Ordenar">
            {SORT_OPTIONS.map((o) => <Chip key={o} active={sort === o} onClick={() => setSort(o)}>{o}</Chip>)}
          </FilterGroup>
        </div>
      </div>

      {/* Ofertas escalando */}
      <div>
        <div className="flex items-end justify-between mb-4">
          <div>
            <h3 className="font-display font-bold text-xl text-foreground">OFERTAS ESCALANDO</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Productos validados matemáticamente. Cero opiniones, pura data.</p>
          </div>
          <span className="text-[10px] font-bold tracking-widest text-primary border border-primary/30 bg-primary/10 px-2 py-1 rounded">ACTUALIZADO HOY</span>
        </div>

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
        <span className="text-primary font-bold">{OFFER_TYPE_LABEL[ad.offerType]}</span>
        <span className="text-muted-foreground">· {ad.flag} {ad.marketLabel}</span>
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

      <a href={ad.adUrl} target="_blank" rel="noreferrer" className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 justify-center">
        <ExternalLink className="w-3 h-3" /> Ver en Ads Library
      </a>
    </div>
  );
}
