import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Loader2, Gem, Layers, Globe2, Tag as TagIcon, RefreshCw, Crosshair, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MiniAppModal } from "@/components/MiniAppModal";
import { OfferCard } from "@/components/offers/OfferCard";
import { OfferDetailSheet } from "@/components/offers/OfferDetailSheet";
import { offerBrief } from "@/lib/sellThis";
import { CREDIT_COSTS } from "@/hooks/useCredits";
import { useOfferFollows } from "@/hooks/useOfferFollows";
import { OFFERS_TAB_KEY, type FollowedRow } from "@/components/dashboard/RoiHunterWidget";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { type Offer, NICHE_LABEL, MODEL_LABEL, MARKET_GROUP, offerToDemoAd, openOfferAdsInRadar } from "@/lib/offers";

// La ficha abierta vive en la dirección (#/ofertas/<id>): se puede compartir y,
// sobre todo, el botón "atrás" del teléfono CIERRA la ficha en vez de sacarte de
// la pantalla (en móvil es el gesto natural para salir de algo que se abrió).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const offerIdFromHash = () => {
  const id = window.location.hash.replace(/^#\/?/, "").split("/")[1] ?? "";
  return UUID_RE.test(id) ? id : null;
};

/**
 * Catálogo producto-primero (lo que Escala Ads llama "ofertas" y SwipeSaaS
 * "catálogo"): anuncios agrupados por anunciante y enriquecidos por IA.
 * Se navega GRATIS; "Hacer mi versión" usa el pipeline existente (50 créditos).
 * Diferencial: copy_score — la IA ya filtró qué es replicable por un
 * emprendedor solo, cosa que ningún competidor hace.
 */

// "ganadoras" = lista curada (is_winner, top 300 por winner_index): es lo único
// que se carga al entrar. "todas" = Explorar todo, solo bajo demanda.
type Tab = "ganadoras" | "todas" | "apps" | "info" | "siguiendo";
// 12 ofertas de entrada (antes 24) y 12 más por cada "Ver más": la primera vista carga antes.
const PAGE_SIZE = 12;

const SORTS = [
  { v: "rank", l: "Las mejores primero" },
  { v: "score", l: "Mayor puntaje" },
  { v: "copy", l: "Más fáciles de replicar" },
  { v: "ads", l: "Más anuncios activos" },
  { v: "days", l: "Más días con anuncios" },
  { v: "recent", l: "Las más nuevas" },
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
  const [detail, setDetail] = useState<Offer | null>(null);

  const openDetail = useCallback((o: Offer) => {
    setDetail(o);
    if (offerIdFromHash() !== o.id) window.history.pushState({ offer: o.id }, "", `${window.location.pathname}${window.location.search}#/ofertas/${o.id}`);
  }, []);
  // Cerrar = volver atrás: consume la entrada que abrió la ficha. Si se llegó por
  // un enlace directo no hay entrada previa nuestra: se limpia la dirección.
  const closeDetail = useCallback(() => {
    if (offerIdFromHash() && window.history.state?.offer) window.history.back();
    else {
      setDetail(null);
      if (offerIdFromHash()) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/ofertas`);
    }
  }, []);
  useEffect(() => {
    const sync = () => { if (!offerIdFromHash()) setDetail(null); };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  // Enlace directo a una oferta
  useEffect(() => {
    const id = offerIdFromHash();
    if (!id) return;
    supabase.from("offers").select("*").eq("id", id).is("excluded_reason", null).maybeSingle()
      .then(({ data }) => { if (data) setDetail(data as unknown as Offer); else closeDetail(); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <p className="text-xs uppercase tracking-wider text-primary font-semibold">Mi negocio · Etapa 1 · Elegir</p>
          <h2 className="page-heading font-display text-2xl text-foreground mt-1">OFERTAS GANADORAS</h2>
          <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
            Productos que alguien paga por anunciar hoy. Abre uno que te guste y haz tu versión.
          </p>
          <details className="group mt-2 max-w-2xl">
            <summary className="inline-flex items-center gap-1 cursor-pointer list-none [&::-webkit-details-marker]:hidden select-none text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
              ¿Cómo funciona? <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="mt-2 space-y-1 pl-4 list-disc marker:text-primary text-[12.5px] text-muted-foreground">
              <li>Si alguien paga anuncios durante semanas, normalmente es porque vende.</li>
              <li>La IA ya leyó cada oferta: qué vende, a quién y si tú puedes replicarla.</li>
              <li>Mirar es gratis. "Hacer mi versión" cuesta {CREDIT_COSTS.gen_master_prompt} créditos.</li>
            </ul>
          </details>
        </div>
        {stats?.updated_at && (
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3" /> Lista actualizada el {new Date(stats.updated_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={<Gem className="w-4 h-4" />} label="Ofertas analizadas" value={stats?.offers} />
        <StatTile icon={<Layers className="w-4 h-4" />} label="Anuncios que siguen activos" value={stats?.active_ads} />
        <StatTile icon={<Globe2 className="w-4 h-4" />} label="Países donde se anuncian" value={stats?.markets} />
        <StatTile icon={<TagIcon className="w-4 h-4" />} label="Temas (nichos)" value={stats?.niches} />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {([
          { k: "ganadoras", l: "🏆 Las 300 ganadoras" },
          { k: "todas", l: "🔎 Explorar todo" },
          { k: "info", l: "🎓 Cursos y guías" },
          { k: "apps", l: "🧩 Apps y programas" },
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
            ✓ Solo las que puedes hacer tú solo
          </button>
        )}
      </div>

      {tab === "siguiendo" ? (
        <FollowingList rows={followed} follows={follows} onCreate={setCreating} onOpen={openDetail} />
      ) : (<>
      {/* Filtros */}
      <div className="card-surface rounded-xl p-3 grid grid-cols-1 md:grid-cols-5 gap-2">
        <div className="relative md:col-span-2">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Busca un producto, una marca o un tema (ej: ansiedad, inglés)…"
            className="w-full bg-secondary/50 border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
        </div>
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger className="bg-secondary/50"><SelectValue placeholder="Idioma del mercado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">🌍 Todos los mercados</SelectItem>
            {Object.entries(MARKET_GROUP).map(([k, g]) => <SelectItem key={k} value={k}>{g.flag} {g.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={niche} onValueChange={setNiche}>
          <SelectTrigger className="bg-secondary/50"><SelectValue placeholder="Tema" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los temas</SelectItem>
            {nicheOptions.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="bg-secondary/50"><SelectValue placeholder="Cómo cobran" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Cualquier forma de cobro</SelectItem>
              {Object.entries(MODEL_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
            <SelectContent>{SORTS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="text-[12px] text-muted-foreground">{loading && page === 0 ? "Buscando…" : `${total.toLocaleString("es-ES")} ofertas encontradas`}</div>

      {/* Grid */}
      {loading && page === 0 ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="card-surface rounded-2xl h-[420px] animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="card-surface rounded-2xl py-20 text-center">
          <div className="empty-icon mb-5"><Gem className="w-7 h-7" strokeWidth={1.4} /></div>
          <div className="font-display font-semibold text-base mb-1">No hay ofertas con esos filtros</div>
          <div className="text-sm text-muted-foreground">
            {tab === "ganadoras"
              ? "Ninguna de las ganadoras coincide. Quita algún filtro o busca en Explorar todo."
              : "Prueba quitando \"Solo las que puedes hacer tú solo\" o cambia de mercado."}
          </div>
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {rows.map((o) => <OfferCard key={o.id} o={o} onOpen={() => openDetail(o)} onCreate={() => setCreating(o)} following={follows.isFollowing(o.id)} onToggleFollow={() => follows.toggle(o)} />)}
          </div>
          {rows.length < total && (
            <div className="flex justify-center pt-2">
              <button onClick={() => setPage((p) => p + 1)} disabled={loading}
                className="px-5 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 flex items-center gap-2 disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Ver más ofertas (quedan {(total - rows.length).toLocaleString("es-ES")})
              </button>
            </div>
          )}
        </>
      )}

      </>)}

      {detail && (
        <OfferDetailSheet
          offer={detail}
          following={follows.isFollowing(detail.id)}
          onToggleFollow={() => follows.toggle(detail)}
          onCreate={() => setCreating(detail)}
          onSeeAds={() => openOfferAdsInRadar(detail, onNavigate)}
          onClose={closeDetail}
        />
      )}
      {creating && <MiniAppModal ad={offerToDemoAd(creating)} brief={offerBrief(creating)} onNavigate={onNavigate} onClose={() => setCreating(null)} />}
    </div>
  );
}

function FollowingList({ rows, follows, onCreate, onOpen }: {
  rows: FollowedRow[] | null; follows: ReturnType<typeof useOfferFollows>;
  onCreate: (o: Offer) => void; onOpen: (o: Offer) => void;
}) {
  if (rows === null) {
    return <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <div key={i} className="card-surface rounded-2xl h-[420px] animate-pulse" />)}</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="card-surface rounded-2xl py-16 text-center px-6">
        <div className="empty-icon mb-5"><Crosshair className="w-7 h-7" strokeWidth={1.4} /></div>
        <div className="font-display font-semibold text-base mb-1">Todavía no sigues ninguna oferta</div>
        <div className="text-sm text-muted-foreground max-w-md mx-auto">
          Pulsa el corazón en una oferta para seguirla ({CREDIT_COSTS.follow_offer} créditos). Cada día anotamos cuántos anuncios tiene activos
          y aquí verás cuáles ponen más anuncios (les está funcionando) y cuáles los apagan.
        </div>
      </div>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {rows.map((r) => (
        <OfferCard key={r.offer.id} o={r.offer} onOpen={() => onOpen(r.offer)} onCreate={() => onCreate(r.offer)}
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
