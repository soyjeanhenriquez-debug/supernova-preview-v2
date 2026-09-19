import { useEffect, useMemo, useState } from "react";
import { Search, Flame, ExternalLink, Zap, Radar, Loader2, Gem, Layers, Globe2, Tag as TagIcon, RefreshCw, Heart, Crosshair } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MiniAppModal } from "@/components/MiniAppModal";
import { AdMediaPreview } from "@/components/AdMediaPreview";
import { CREDIT_COSTS } from "@/hooks/useCredits";
import { useOfferFollows } from "@/hooks/useOfferFollows";
import { Delta, OFFERS_TAB_KEY, type FollowedRow } from "@/components/dashboard/RoiHunterWidget";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { buildAdsLibraryPageUrl, type AdMarket } from "@/lib/demo-winning-ads";
import {
  type Offer, NICHE_LABEL, OFFER_TYPE_LABEL, MODEL_LABEL, MARKET_GROUP, MARKET_NAME,
  flagFor, copyLabel, scaleLabel, offerToDemoAd, openOfferAdsInRadar,
} from "@/lib/offers";

/**
 * Catálogo producto-primero (lo que Escala Ads llama "ofertas" y SwipeSaaS
 * "catálogo"): anuncios agrupados por anunciante y enriquecidos por IA.
 * Se navega GRATIS; "Crear mi versión" usa el pipeline existente (50 créditos).
 * Diferencial: copy_score — la IA ya filtró qué es replicable por un
 * emprendedor solo, cosa que ningún competidor hace.
 */

// "ganadoras" = lista curada (is_winner, top 300 por winner_index): es lo único
// que se carga al entrar. "todas" = Explorar todo, solo bajo demanda.
type Tab = "ganadoras" | "todas" | "apps" | "info" | "siguiendo";
const PAGE_SIZE = 24;

const SORTS = [
  { v: "rank", l: "Mejor ranking" },
  { v: "score", l: "Mayor score" },
  { v: "copy", l: "Más copiable" },
  { v: "ads", l: "Más anuncios activos" },
  { v: "days", l: "Más días pagando" },
  { v: "recent", l: "Detectadas recientemente" },
];

interface Stats { offers: number; active_ads: number; markets: number; niches: number; updated_at: string | null; }

export function OfertasPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  // Tab inicial: el dashboard puede mandarnos directo a "Siguiendo" y Mini Apps a "Apps & SaaS"
  const [tab, setTab] = useState<Tab>(() => {
    const t = localStorage.getItem(OFFERS_TAB_KEY);
    if (t) localStorage.removeItem(OFFERS_TAB_KEY);
    return t === "siguiendo" || t === "apps" ? t : "ganadoras";
  });
  const follows = useOfferFollows();
  const [followed, setFollowed] = useState<FollowedRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [niche, setNiche] = useState("all");
  const [group, setGroup] = useState("all");
  const [model, setModel] = useState("all");
  const [onlyCopiable, setOnlyCopiable] = useState(true);
  const [sort, setSort] = useState("rank");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Offer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [creating, setCreating] = useState<Offer | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(0); }, [tab, debounced, niche, group, model, onlyCopiable, sort]);

  useEffect(() => {
    supabase.rpc("get_offers_stats").then(({ data }) => { if (data) setStats(data as unknown as Stats); });
  }, []);

  // Cazador de ROI: ofertas seguidas + insights (deltas de 7 días)
  useEffect(() => {
    if (tab !== "siguiendo") return;
    setFollowed(null);
    supabase.rpc("get_followed_offers").then(({ data }) => setFollowed((data ?? []) as unknown as FollowedRow[]));
  }, [tab, follows.followingIds]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    if (tab === "siguiendo") { setLoading(false); return; }
    (async () => {
      // excluded_reason (flag_excluded_offers): contenido adulto y apps de
      // dramas/novelas no se muestran NUNCA en el catálogo, con ningún filtro.
      let q = supabase.from("offers").select("*", { count: "exact" }).eq("enrich_failed", false).is("excluded_reason", null);
      // Ganadoras: la lista curada (curate_offers → top 300 por winner_index).
      // El resto de pestañas son "explorar": una tarjeta por ANUNCIANTE
      // (is_primary), no una por país. Ambas columnas las mantiene curate_offers.
      if (tab === "ganadoras") q = q.eq("is_winner", true);
      else q = q.eq("is_primary", true);
      if (tab === "apps") q = q.eq("offer_type", "saas_app");
      if (tab === "info") q = q.eq("offer_type", "infoproducto");
      if (niche !== "all") q = q.eq("niche", niche);
      if (group !== "all") {
        const g = MARKET_GROUP[group];
        if (g) q = q.in("market", g.markets).or(`language.eq.${g.lang},language.is.null`);
      }
      if (model !== "all") q = q.eq("business_model", model);
      // En Ganadoras el botón está oculto (la lista ya exige copiabilidad): un
      // filtro que el usuario no ve no debe recortarla.
      if (onlyCopiable && tab !== "ganadoras") q = q.gte("copy_score", 4);
      if (debounced) {
        const k = debounced.replace(/[,()%]/g, " ");
        q = q.or(`product_name.ilike.%${k}%,page_name.ilike.%${k}%,mechanism.ilike.%${k}%,target_audience.ilike.%${k}%`);
      }
      switch (sort) {
        // Índice 50/50 (prueba de dinero + copiabilidad). Fuera de Ganadoras
        // casi nada tiene índice: los NULL van al final, ordenados por score.
        case "rank": q = q.order("winner_index", { ascending: false, nullsFirst: false }).order("winner_score", { ascending: false }).order("active_ads", { ascending: false }); break;
        case "copy": q = q.order("copy_score", { ascending: false, nullsFirst: false }).order("winner_score", { ascending: false }); break;
        case "ads": q = q.order("active_ads", { ascending: false }); break;
        case "days": q = q.order("days_active", { ascending: false }); break;
        case "recent": q = q.order("first_seen", { ascending: false, nullsFirst: false }); break;
        default: q = q.order("winner_score", { ascending: false }).order("active_ads", { ascending: false });
      }
      const from = page * PAGE_SIZE;
      const { data, count } = await q.range(from, from + PAGE_SIZE - 1);
      if (!alive) return;
      setRows((prev) => (page === 0 ? (data ?? []) as Offer[] : [...prev, ...((data ?? []) as Offer[])]));
      setTotal(count ?? 0);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [tab, debounced, niche, group, model, onlyCopiable, sort, page]);

  const nicheOptions = useMemo(() => Object.entries(NICHE_LABEL), []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="page-heading font-display text-2xl text-foreground">OFERTAS GANADORAS</h2>
          <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
            Productos que están <span className="text-foreground font-medium">pagando anuncios ahora mismo</span>, agrupados por anunciante y
            leídos por IA: qué venden, a quién, por qué convierten y si TÚ puedes copiarlo. Navegar es gratis.
          </p>
        </div>
        {stats?.updated_at && (
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3" /> Actualizado {new Date(stats.updated_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={<Gem className="w-4 h-4" />} label="Ofertas en el radar" value={stats?.offers} />
        <StatTile icon={<Layers className="w-4 h-4" />} label="Anuncios activos" value={stats?.active_ads} />
        <StatTile icon={<Globe2 className="w-4 h-4" />} label="Países" value={stats?.markets} />
        <StatTile icon={<TagIcon className="w-4 h-4" />} label="Nichos" value={stats?.niches} />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {([
          { k: "ganadoras", l: "🏆 Ganadoras" },
          { k: "todas", l: "🔎 Explorar todo" },
          { k: "info", l: "🎓 Infoproductos" },
          { k: "apps", l: "🧩 Apps & SaaS" },
          { k: "siguiendo", l: `⭐ Siguiendo${follows.followingIds.size ? ` · ${follows.followingIds.size}` : ""}` },
        ] as { k: Tab; l: string }[]).map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              tab === t.k ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/40 text-muted-foreground border-border hover:text-foreground"}`}>
            {t.l}
          </button>
        ))}
        {/* Solo en las pestañas de exploración: en Ganadoras la lista ya exige
            copiabilidad y en Siguiendo no aplica — un botón que no hace nada confunde. */}
        {tab !== "ganadoras" && tab !== "siguiendo" && (
          <button onClick={() => setOnlyCopiable((v) => !v)}
            className={`ml-auto px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              onlyCopiable ? "bg-success/15 text-success border-success/40" : "bg-secondary/40 text-muted-foreground border-border hover:text-foreground"}`}>
            ✓ Solo copiables por un emprendedor
          </button>
        )}
      </div>

      {tab === "siguiendo" ? (
        <FollowingList rows={followed} follows={follows} onCreate={setCreating} onNavigate={onNavigate} />
      ) : (<>
      {/* Filtros */}
      <div className="card-surface rounded-xl p-3 grid grid-cols-1 md:grid-cols-5 gap-2">
        <div className="relative md:col-span-2">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto, anunciante, mecanismo…"
            className="w-full bg-secondary/50 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
        </div>
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger className="bg-secondary/50"><SelectValue placeholder="Mercado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">🌍 Todos los mercados</SelectItem>
            {Object.entries(MARKET_GROUP).map(([k, g]) => <SelectItem key={k} value={k}>{g.flag} {g.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={niche} onValueChange={setNiche}>
          <SelectTrigger className="bg-secondary/50"><SelectValue placeholder="Nicho" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los nichos</SelectItem>
            {nicheOptions.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="bg-secondary/50"><SelectValue placeholder="Modelo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Modelo</SelectItem>
              {Object.entries(MODEL_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
            <SelectContent>{SORTS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="text-[12px] text-muted-foreground">{loading && page === 0 ? "Buscando…" : `${total.toLocaleString("es-ES")} ofertas`}</div>

      {/* Grid */}
      {loading && page === 0 ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="card-surface rounded-2xl h-[420px] animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="card-surface rounded-2xl py-20 text-center">
          <div className="empty-icon mb-5"><Gem className="w-7 h-7" strokeWidth={1.4} /></div>
          <div className="font-display font-semibold text-base mb-1">Sin ofertas con esos filtros</div>
          <div className="text-sm text-muted-foreground">
            {tab === "ganadoras"
              ? "Ninguna ganadora coincide. Quita algún filtro o mira en Explorar todo."
              : "Prueba quitando \"solo copiables\" o cambiando de mercado."}
          </div>
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {rows.map((o) => <OfferCard key={o.id} o={o} onCreate={() => setCreating(o)} onNavigate={onNavigate} following={follows.isFollowing(o.id)} onToggleFollow={() => follows.toggle(o)} />)}
          </div>
          {rows.length < total && (
            <div className="flex justify-center pt-2">
              <button onClick={() => setPage((p) => p + 1)} disabled={loading}
                className="px-5 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 flex items-center gap-2 disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Cargar más ({(total - rows.length).toLocaleString("es-ES")} restantes)
              </button>
            </div>
          )}
        </>
      )}

      </>)}

      {creating && <MiniAppModal ad={offerToDemoAd(creating)} onClose={() => setCreating(null)} />}
    </div>
  );
}

function FollowingList({ rows, follows, onCreate, onNavigate }: {
  rows: FollowedRow[] | null; follows: ReturnType<typeof useOfferFollows>;
  onCreate: (o: Offer) => void; onNavigate?: (p: string) => void;
}) {
  if (rows === null) {
    return <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <div key={i} className="card-surface rounded-2xl h-[420px] animate-pulse" />)}</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="card-surface rounded-2xl py-16 text-center px-6">
        <div className="empty-icon mb-5"><Crosshair className="w-7 h-7" strokeWidth={1.4} /></div>
        <div className="font-display font-semibold text-base mb-1">Tu Cazador de ROI está vacío</div>
        <div className="text-sm text-muted-foreground max-w-md mx-auto">
          Pulsa el corazón en cualquier oferta para seguirla ({CREDIT_COSTS.follow_offer} ⚡). Cada día guardamos sus anuncios activos y su score,
          y aquí verás cuáles están escalando y cuáles se apagan — antes que todos.
        </div>
      </div>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {rows.map((r) => (
        <OfferCard key={r.offer.id} o={r.offer} onCreate={() => onCreate(r.offer)} onNavigate={onNavigate}
          following={follows.isFollowing(r.offer.id)} onToggleFollow={() => follows.toggle(r.offer)}
          insight={r} />
      ))}
    </div>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | undefined }) {
  return (
    <div className="card-surface rounded-xl px-4 py-3 flex items-center gap-3">
      <span className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">{icon}</span>
      <div>
        <div className="font-display font-bold text-xl text-foreground tabular-nums leading-none">{value == null ? "—" : value.toLocaleString("es-ES")}</div>
        <div className="text-[11px] text-muted-foreground mt-1">{label}</div>
      </div>
    </div>
  );
}

function OfferCard({ o, onCreate, onNavigate, following, onToggleFollow, insight }: {
  o: Offer; onCreate: () => void; onNavigate?: (p: string) => void;
  following: boolean; onToggleFollow: () => void; insight?: FollowedRow;
}) {
  const copy = copyLabel(o.copy_score);
  const name = o.product_name || o.sample_title || o.page_name || "Oferta";
  const market = (["BR", "US", "ES", "MX", "RU"].includes(o.market) ? o.market : "LATAM") as AdMarket;
  const metaUrl = buildAdsLibraryPageUrl(o.page_id, market);
  const score = Math.max(0, Math.min(100, o.winner_score));

  return (
    <article className="card-surface rounded-2xl overflow-hidden flex flex-col ad-card-hover">
      {/* Creativo del anuncio representativo (lazy, se cachea vía meta-ad-proxy) */}
      <div className="relative h-44 bg-secondary/40 overflow-hidden">
        <AdMediaPreview adUrl={o.sample_ad_url ?? undefined} pageId={o.page_id} pageName={o.page_name ?? name} title={name} />
        <div className="absolute top-2 left-2 flex gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1 bg-background/80 backdrop-blur text-foreground border border-border">
            {flagFor(o.market)} {MARKET_NAME[o.market] ?? o.market}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1 bg-primary text-primary-foreground">
            🔥 {scaleLabel(o)}
          </span>
        </div>
        <span className={`absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1 backdrop-blur ${copy.cls}`}>{copy.label}</span>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h4 className="font-display font-semibold text-[15px] leading-snug text-foreground line-clamp-2">{name}</h4>
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{o.page_name}</p>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {o.niche && <Tag>{NICHE_LABEL[o.niche] ?? o.niche}</Tag>}
          {o.offer_type && <Tag>{OFFER_TYPE_LABEL[o.offer_type] ?? o.offer_type}</Tag>}
          {o.business_model && o.business_model !== "otro" && <Tag>{MODEL_LABEL[o.business_model]}</Tag>}
          {o.price_hint && <Tag accent>{o.price_hint}</Tag>}
        </div>

        {insight && (
          <div className="mt-3 rounded-lg bg-secondary/40 px-3 py-2 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{insight.days_tracked > 0 ? `Últimos ${insight.days_tracked} días` : "Seguimiento desde hoy"}</span>
            <span className="flex items-center gap-3"><Delta value={insight.ads_delta} suffix="ads" /><Delta value={insight.score_delta} suffix="score" /></span>
          </div>
        )}
        {o.mechanism && <p className="text-[12.5px] text-foreground/85 mt-3 leading-relaxed line-clamp-2">{o.mechanism}</p>}
        {o.target_audience && <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-1">Para: {o.target_audience}</p>}

        {/* Performance score */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            <span>Performance score</span><span className="text-success font-bold">{score}%</span>
          </div>
          <div className="w-full h-[3px] bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-success" style={{ width: `${score}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <Metric label="Anuncios activos" value={<><Flame className="w-3 h-3 inline text-primary" /> {o.active_ads}</>} />
          <Metric label="Días pagando" value={o.days_active} />
        </div>

        <div className="mt-4 pt-3 border-t border-border/60 flex items-center gap-2">
          <button onClick={onToggleFollow} title={following ? "Dejar de seguir" : `Seguir en el Cazador de ROI · ${CREDIT_COSTS.follow_offer} ⚡`}
            className={`px-2.5 py-2 rounded-lg border transition-colors ${following ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-primary hover:border-primary/40"}`}>
            <Heart className="w-4 h-4" fill={following ? "currentColor" : "none"} />
          </button>
          <button onClick={onCreate} className="flex-1 btn-primary-nova py-2 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5">
            <Zap className="w-3.5 h-3.5" /> Crear mi versión <span className="opacity-70">· {CREDIT_COSTS.gen_master_prompt}⚡</span>
          </button>
          <button onClick={() => openOfferAdsInRadar(o, onNavigate)} title="Ver todos sus anuncios en el radar"
            className="px-2.5 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40">
            <Radar className="w-4 h-4" />
          </button>
          <a href={metaUrl} target="_blank" rel="noopener noreferrer" title="Ver en Meta Ads Library"
            className="px-2.5 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40">
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-secondary/40 px-3 py-2 text-center">
      <div className="font-display font-bold text-[15px] text-foreground tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Tag({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span className={`text-[10px] font-semibold rounded-md px-2 py-0.5 ${accent ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
      {children}
    </span>
  );
}
