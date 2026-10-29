import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Gem, Crosshair, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MiniAppModal } from "@/components/MiniAppModal";
import { OfferCard } from "@/components/offers/OfferCard";
import { OfferDetailSheet } from "@/components/offers/OfferDetailSheet";
import { OfferQuickView } from "@/components/offers/OfferQuickView";
import { OfferFilters, type FiltroOferta } from "@/components/offers/OfferFilters";
import { NIVELES } from "@/components/offers/offerUi";
import { offerBrief } from "@/lib/sellThis";
import { CREDIT_COSTS } from "@/hooks/useCredits";
import { useOfferFollows } from "@/hooks/useOfferFollows";
import { OFFERS_TAB_KEY, type FollowedRow } from "@/components/dashboard/RoiHunterWidget";
import { type Offer, NICHE_LABEL, MODEL_LABEL, MARKET_GROUP, LANG_ES_FILTER, offerToDemoAd, openOfferAdsInRadar } from "@/lib/offers";
import { type OfferWatch, parseWatch } from "@/lib/offerWatch";
import { CreateFromIdeaSheet } from "@/components/create/CreateFromIdeaSheet";
import { ideaFromOffer } from "@/lib/recommendTarget";

const OFFER_INPUT = { source: "oferta" } as const;

// La ficha abierta vive en la dirección (#/ofertas/<id>): se puede compartir y,
// sobre todo, el botón "atrás" del teléfono CIERRA la ficha en vez de sacarte de
// la pantalla (en móvil es el gesto natural para salir de algo que se abrió).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const offerIdFromHash = () => {
  const id = window.location.hash.replace(/^#\/?/, "").split("/")[1] ?? "";
  return UUID_RE.test(id) ? id : null;
};
// #/ofertas/whatsapp y #/ofertas/pagina abren Ofertas ya filtradas por cómo venden (atajos del Radar, 28-oct-2026).
const canalFromHash = (): "all" | "pagina" | "whatsapp" => {
  const s = window.location.hash.replace(/^#\/?/, "").split("/")[1] ?? "";
  return s === "whatsapp" || s === "pagina" ? s : "all";
};
// #/ofertas/whatsapp/todas: TODAS las de ese canal (todo el catálogo, todos los mercados, fáciles y difíciles), sin
// importar los filtros guardados. Es el enlace que se le manda a alguien (Cindy, 28-oct-2026).
const todasFromHash = () => (window.location.hash.replace(/^#\/?/, "").split("/")[2] ?? "") === "todas" && canalFromHash() !== "all";
const CANALES = [
  { v: "all", t: "Todas", d: "Todas las formas de vender." },
  { v: "whatsapp", t: "💬 Por WhatsApp", d: "El anuncio lleva a un chat y la venta se cierra ahí." },
  { v: "pagina", t: "🔗 Con página de ventas", d: "El anuncio lleva a una página con botón de pago." },
] as const;

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
// Mercado elegido a mano (gana sobre el que se deduce del país). Solo comodidad de este navegador.
const MARKET_PREF_KEY = "supernova_offers_market";
const readMarketPref = () => { try { return localStorage.getItem(MARKET_PREF_KEY); } catch { return null; } };

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
    if (todasFromHash()) return "todas";
    return t === "siguiendo" || t === "apps" ? t : "ganadoras";
  });
  const follows = useOfferFollows();
  const [followed, setFollowed] = useState<FollowedRow[] | null>(null);
  const [watch, setWatch] = useState<Map<string, OfferWatch>>(() => new Map());
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [niche, setNiche] = useState("all");
  // Mercado: el que la persona eligió antes o, si nunca eligió, el de su país (user_age_country). Hasta
  // saberlo vale null y no se consulta nada (así no se carga dos veces la lista).
  const [group, setGroupState] = useState<string | null>(() => (todasFromHash() ? "all" : readMarketPref()));
  const [groupFromCountry, setGroupFromCountry] = useState(false);
  const setGroup = (g: string) => {
    setGroupState(g);
    setGroupFromCountry(false);
    try { localStorage.setItem(MARKET_PREF_KEY, g); } catch { /* sin almacenamiento */ }
  };
  // Decisión de Jean (12-oct-2026, igual que el Radar): se abre en "Todas" para no esconder de
  // entrada ninguna ganadora (de 300, 215 están en inglés o portugués). El idioma queda a un toque.
  useEffect(() => { if (group === null) setGroupState("all"); }, [group]);
  // Con el enlace de «todas» el mercado guardado se cambia a todos (si no, la próxima vez vuelve a esconderlas).
  useEffect(() => { if (todasFromHash()) setGroup("all"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [model, setModel] = useState("all");
  // Cómo vende (28-oct-2026, Cindy: "¿están mezcladas?"): página de ventas, WhatsApp o mensajes.
  const [canal, setCanal] = useState<"all" | "pagina" | "whatsapp" | "mensajes" | "sin">(canalFromHash);
  // Plataforma de cobro (Hotmart, Kiwify, Gumroad…): solo se conoce en las ofertas ya revisadas.
  const [platform, setPlatform] = useState("all");
  const [platformCounts, setPlatformCounts] = useState<{ platform: string; total: number; winners: number }[]>([]);
  const [onlyCopiable, setOnlyCopiable] = useState(() => !todasFromHash());
  const [sort, setSort] = useState("rank");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Offer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [creating, setCreating] = useState<Offer | null>(null);
  const [detail, setDetail] = useState<Offer | null>(null);
  const [ideaOffer, setIdeaOffer] = useState<Offer | null>(null);
  // Ficha rápida (al tocar una tarjeta). Ocupa una entrada del historial SIN cambiar la dirección: el botón
  // "atrás" del teléfono la cierra. "Ver oferta completa" reemplaza esa entrada por la de la ficha completa.
  const [quick, setQuick] = useState<Offer | null>(null);
  const openQuick = useCallback((o: Offer) => {
    setQuick(o);
    window.history.pushState({ quick: o.id }, "", window.location.href);
  }, []);
  const closeQuick = useCallback(() => {
    if (window.history.state?.quick) window.history.back();
    else setQuick(null);
  }, []);
  const quickToFull = useCallback((o: Offer) => {
    setQuick(null);
    setDetail(o);
    const url = `${window.location.pathname}${window.location.search}#/ofertas/${o.id}`;
    if (window.history.state?.quick) window.history.replaceState({ offer: o.id }, "", url);
    else window.history.pushState({ offer: o.id }, "", url);
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
    const sync = () => {
      if (!offerIdFromHash()) setDetail(null);
      if (!window.history.state?.quick) setQuick(null);
    };
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
  useEffect(() => { setPage(0); }, [tab, debounced, niche, group, model, platform, onlyCopiable, sort, canal]);

  useEffect(() => {
    supabase.rpc("get_offers_stats").then(({ data }) => { if (data) setStats(data as unknown as Stats); });
    supabase.rpc("offer_platform_counts").then(({ data }) => setPlatformCounts((data ?? []).map((r) => ({ ...r, total: Number(r.total), winners: Number(r.winners) }))));
  }, []);

  // Cazador de ROI: ofertas seguidas + vigilancia diaria (conteo en vivo de Meta y alertas).
  // Si get_offer_watch falla, la tarjeta cae al resumen viejo de 7 días: nunca queda vacía.
  useEffect(() => {
    if (tab !== "siguiendo") return;
    setFollowed(null);
    supabase.rpc("get_followed_offers").then(({ data }) => setFollowed((data ?? []) as unknown as FollowedRow[]));
    supabase.rpc("get_offer_watch").then(({ data, error }) => setWatch(error ? new Map() : parseWatch(data)));
  }, [tab, follows.followingIds]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    if (tab === "siguiendo") { setLoading(false); return; }
    if (group === null) return; // esperando el país de la persona
    (async () => {
      // excluded_reason (flag_excluded_offers): contenido adulto y apps de
      // dramas/novelas no se muestran NUNCA en el catálogo, con ningún filtro.
      // La plataforma viene de offer_platform (1 a 1). Con filtro, el join es obligatorio (!inner).
      const cols = platform !== "all" ? "*, offer_platform!inner(platform)" : "*, offer_platform(platform)";
      let q = supabase.from("offers").select(cols, { count: "exact" }).eq("enrich_failed", false).is("excluded_reason", null);
      if (platform !== "all") q = q.eq("offer_platform.platform", platform);
      // Ganadoras: la lista curada (curate_offers → top 300 por winner_index).
      // El resto de pestañas son "explorar": una tarjeta por ANUNCIANTE
      // (is_primary), no una por país. Ambas columnas las mantiene curate_offers.
      if (tab === "ganadoras") q = q.eq("is_winner", true);
      else q = q.eq("is_primary", true);
      if (tab === "apps") q = q.eq("offer_type", "saas_app");
      if (tab === "info") q = q.eq("offer_type", "infoproducto");
      if (niche !== "all") q = q.eq("niche", niche);
      if (group === LANG_ES_FILTER) q = q.eq("language", "es");
      else if (group !== "all") {
        const g = MARKET_GROUP[group];
        if (g) q = q.in("market", g.markets).or(`language.eq.${g.lang},language.is.null`);
      }
      if (model !== "all") q = q.eq("business_model", model);
      // "canal" es nueva (migración 20261028120000) y aún no está en los tipos generados: filtro sin tipar.
      if (canal === "sin") q = q.filter("canal", "is", null);
      else if (canal !== "all") q = q.filter("canal", "eq", canal);
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
        // Primero el conteo en vivo de Meta (offer-live-count); las que aún no tienen, por los que vimos nosotros.
        case "ads": q = q.order("live_active_ads", { ascending: false, nullsFirst: false }).order("active_ads", { ascending: false }); break;
        case "days": q = q.order("days_active", { ascending: false }); break;
        case "recent": q = q.order("first_seen", { ascending: false, nullsFirst: false }); break;
        default: q = q.order("winner_score", { ascending: false }).order("active_ads", { ascending: false });
      }
      const from = page * PAGE_SIZE;
      const { data, count } = await q.range(from, from + PAGE_SIZE - 1);
      if (!alive) return;
      const got = (data ?? []) as unknown as Offer[];
      setRows((prev) => (page === 0 ? got : [...prev, ...got]));
      setTotal(count ?? 0);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [tab, debounced, niche, group, model, platform, onlyCopiable, sort, page, canal]);

  // Opciones del filtro: solo plataformas con ofertas en esta pestaña, con su conteo real.
  const platformOptions = useMemo(
    () => platformCounts.map((p) => ({ ...p, n: tab === "ganadoras" ? p.winners : p.total })).filter((p) => p.n > 0),
    [platformCounts, tab],
  );
  const platformKnown = platformOptions.reduce((a, p) => a + p.n, 0);

  const nicheOptions = useMemo(() => Object.entries(NICHE_LABEL), []);

  // Salidas en un toque cuando hay pocas o ninguna (28-oct-2026: Cindy tenía guardado «Mercado brasileño» de otra
  // visita y con WhatsApp le salía 1 sola; el filtro estaba fuera de su vista). Cada botón dice qué quita.
  const mercadoLabel = group === LANG_ES_FILTER ? "En español" : MARKET_GROUP[group ?? ""]?.label;
  const salidas = (
    <div className="flex flex-wrap gap-2">
      {tab === "ganadoras" && (
        <button type="button" onClick={() => setTab("todas")} className="min-h-[40px] px-4 rounded-full bg-primary text-primary-foreground text-[13px] font-semibold">Buscar en todo el catálogo</button>
      )}
      {group !== "all" && mercadoLabel && <button type="button" onClick={() => setGroup("all")} className="min-h-[40px] px-4 rounded-full border border-border text-[13px] text-foreground">✕ {mercadoLabel}: ver todos los mercados</button>}
      {(niche !== "all" || model !== "all" || platform !== "all" || debounced) && (
        <button type="button" onClick={() => { setNiche("all"); setModel("all"); setPlatform("all"); setSearch(""); }} className="min-h-[40px] px-4 rounded-full border border-border text-[13px] text-foreground">✕ Quitar los demás filtros</button>
      )}
      {onlyCopiable && tab !== "ganadoras" && <button type="button" onClick={() => setOnlyCopiable(false)} className="min-h-[40px] px-4 rounded-full border border-border text-[13px] text-foreground">Ver también las más difíciles</button>}
    </div>
  );
  const hayFiltros = tab === "ganadoras" || group !== "all" || niche !== "all" || model !== "all" || platform !== "all" || !!debounced || onlyCopiable;

  // Filtros en píldoras (computadora) y en hoja (teléfono): la misma lista para los dos.
  const filtros: FiltroOferta[] = [
    {
      key: "mercado", titulo: "Idioma y mercado", todos: "🌍 Todos los mercados", valor: group ?? "all", cambiar: setGroup,
      opciones: [{ v: LANG_ES_FILTER, l: "🗣️ En español (todos los países)" }, ...Object.entries(MARKET_GROUP).map(([k, g]) => ({ v: k, l: `${g.flag} ${g.label}` }))],
    },
    { key: "tema", titulo: "Tema", todos: "Todos los temas", valor: niche, cambiar: setNiche, opciones: nicheOptions.map(([k, l]) => ({ v: k, l })) },
    {
      key: "cobra", titulo: "Dónde cobra", todos: "Cualquier plataforma", valor: platform, cambiar: setPlatform,
      opciones: platformOptions.map((p) => ({ v: p.platform, l: `${p.platform} · ${p.n.toLocaleString("es-ES")}` })),
    },
    { key: "modelo", titulo: "Forma de cobro", todos: "Cualquier forma de cobro", valor: model, cambiar: setModel, opciones: Object.entries(MODEL_LABEL).map(([k, l]) => ({ v: k, l })) },
  ];
  const orden: FiltroOferta = { key: "orden", titulo: "Ordenar", todos: "", valor: sort, cambiar: setSort, opciones: SORTS.map((x) => ({ v: x.v, l: x.l })) };
  // En Ganadoras la lista ya exige que se pueda hacer solo, y en Siguiendo no aplica: un botón que no hace nada confunde.
  const conInterruptor = tab !== "ganadoras" && tab !== "siguiendo";
  const activos = [group !== "all" && group !== null, niche !== "all", model !== "all", platform !== "all", conInterruptor && onlyCopiable, !!debounced].filter(Boolean).length;
  const limpiar = () => { setGroup("all"); setNiche("all"); setModel("all"); setPlatform("all"); setSearch(""); setOnlyCopiable(false); };
  const sortLabel = SORTS.find((x) => x.v === sort)?.l ?? "";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-primary font-semibold">Mi negocio · Etapa 1 · Elegir</p>
        <h2 className="page-heading font-display text-2xl text-foreground mt-1">OFERTAS GANADORAS</h2>
        <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
          Productos que alguien paga por anunciar hoy. Toca uno, míralo de un vistazo y haz tu versión.
        </p>
        {stats && (
          <p className="text-[12px] text-muted-foreground mt-2 tabular-nums">
            {stats.offers.toLocaleString("es-ES")} ofertas analizadas · {stats.active_ads.toLocaleString("es-ES")} anuncios que siguen activos
            {stats.updated_at && <> · lista actualizada el {new Date(stats.updated_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</>}
          </p>
        )}
        <details className="group mt-2 max-w-2xl">
          <summary className="inline-flex items-center gap-1 cursor-pointer list-none [&::-webkit-details-marker]:hidden select-none text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
            ¿Cómo funciona? <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="mt-2 space-y-1 pl-4 list-disc marker:text-primary text-[12.5px] text-muted-foreground">
            <li>Si alguien paga anuncios durante semanas, normalmente es porque vende. Por eso cada tarjeta muestra primero los días pagando anuncios.</li>
            <li>La IA ya leyó cada oferta: qué vende, a quién y si tú puedes hacer tu versión solo.</li>
            <li>Mirar es gratis. "Hacer mi versión" cuesta {CREDIT_COSTS.gen_master_prompt} créditos.</li>
          </ul>
          <div className="mt-3 rounded-xl border border-border p-3 space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Las barras de nivel cuentan</p>
            {[...NIVELES].reverse().map((n) => (
              <div key={n.label} className="flex items-center gap-2.5 text-[12.5px]">
                <span className="inline-flex items-end gap-[2px] shrink-0" aria-hidden>
                  {[5, 8, 11, 14].map((px, i) => <span key={px} style={{ height: px }} className={`w-[3px] rounded-[1px] ${i < n.barras ? "bg-primary" : "bg-foreground/15"}`} />)}
                </span>
                <span className="font-semibold text-foreground w-[84px] shrink-0">{n.label}</span>
                <span className="text-muted-foreground">{n.regla}</span>
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* Cómo vende, a la vista (28-oct-2026, Cindy no encontraba las de WhatsApp: estaba escondido entre los filtros). */}
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">¿Cómo quieres vender?</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Cómo vende">
          {CANALES.map((c) => (
            <button key={c.v} type="button" role="radio" aria-checked={canal === c.v} onClick={() => setCanal(c.v)}
              className={`rounded-xl border p-3 text-left transition-colors ${canal === c.v ? "border-primary bg-card" : "border-border hover:border-foreground/30"}`}>
              <span className="block text-[13px] sm:text-sm font-semibold text-foreground">{c.t}</span>
              <span className="hidden sm:block text-[12px] text-muted-foreground mt-0.5">{c.d}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      {/* En el celular las pestañas van en una fila con scroll y con nombre corto (antes eran 3 filas). */}
      <div className="flex flex-nowrap sm:flex-wrap gap-2 overflow-x-auto -mx-1 px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {([
          { k: "ganadoras", l: "🏆 Las 300 ganadoras", s: "🏆 Ganadoras" },
          { k: "todas", l: "🔎 Explorar todo", s: "🔎 Todo" },
          { k: "info", l: "🎓 Cursos y guías", s: "🎓 Cursos" },
          { k: "apps", l: "🧩 Apps y programas", s: "🧩 Apps" },
          { k: "siguiendo", l: "⭐ Siguiendo", s: "⭐ Sigo" },
        ] as { k: Tab; l: string; s: string }[]).map((t) => {
          const n = t.k === "siguiendo" && follows.followingIds.size ? ` · ${follows.followingIds.size}` : "";
          return (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                tab === t.k ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/40 text-muted-foreground border-border hover:text-foreground"}`}>
              <span className="sm:hidden">{t.s}{n}</span><span className="hidden sm:inline">{t.l}{n}</span>
            </button>
          );
        })}
      </div>

      {tab === "siguiendo" ? (
        <FollowingList rows={followed} watch={watch} follows={follows} onCreate={setCreating} onOpen={openQuick} />
      ) : (<>
      <OfferFilters
        search={search} onSearch={setSearch} filtros={filtros} orden={orden}
        interruptor={conInterruptor ? { label: "Solo las que haces tú solo", corto: "Tú solo", on: onlyCopiable, cambiar: setOnlyCopiable } : undefined}
        activos={activos} onClear={limpiar} total={total} loading={loading && page === 0}
      />

      <div className="text-[12px] text-muted-foreground -mt-2">
        {loading && page === 0 ? "Buscando…" : (
          <span>
            <span className="font-semibold text-foreground tabular-nums">{total.toLocaleString("es-ES")}</span> {total === 1 ? "oferta" : "ofertas"} · ordenadas por «{sortLabel}»
          </span>
        )}
        {!loading && total > 0 && total < 6 && hayFiltros && (
          <span className="block mt-2 space-y-2">
            <span className="block text-foreground">Salen pocas porque tienes filtros puestos{mercadoLabel && group !== "all" ? ` (por ejemplo «${mercadoLabel}»)` : ""}. Para ver más:</span>
            {salidas}
          </span>
        )}
        {groupFromCountry && group !== "all" && (
          <span className="ml-1.5">
            · {group === LANG_ES_FILTER ? "en español" : MARKET_GROUP[group ?? ""]?.label.toLowerCase()}, por tu país.{" "}
            <button onClick={() => setGroup("all")} className="font-semibold text-foreground underline underline-offset-2 hover:text-primary">Ver todas</button>
          </span>
        )}
        {sort === "rank" && (
          <span className="block mt-0.5">«Las mejores primero» junta días pagando anuncios y qué tan fácil es hacer tu versión; no es la que más anuncios tiene. Para eso, ordena por «Más anuncios activos».</span>
        )}
        {canal === "whatsapp" && !loading && (
          <span className="block mt-0.5">WhatsApp no deja ver el número en los datos públicos: abre el anuncio y toca su botón para ver cómo atienden.</span>
        )}
        {platform !== "all" && !loading && (
          <span className="block mt-0.5">
            Solo cuentan las ofertas donde ya vimos dónde cobran ({platformKnown.toLocaleString("es-ES")} hasta hoy). Revisamos más cada día.
          </span>
        )}
      </div>

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
              : "Prueba quitando \"Solo las que haces tú solo\" o cambia de mercado."}
          </div>
          {/* Una salida en un toque (Cindy, 28-oct-2026: «no me salió nada»). */}
          <div className="flex justify-center mt-4">{salidas}</div>
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {rows.map((o) => <OfferCard key={o.id} o={o} onOpen={() => openQuick(o)} onCreate={() => setCreating(o)} onCreateIdea={() => setIdeaOffer(o)} following={follows.isFollowing(o.id)} onToggleFollow={() => follows.toggle(o)} />)}
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

      {quick && !detail && (
        <OfferQuickView
          offer={quick}
          following={follows.isFollowing(quick.id)}
          onToggleFollow={() => follows.toggle(quick)}
          onCreate={() => setCreating(quick)}
          onFull={() => quickToFull(quick)}
          onClose={closeQuick}
        />
      )}
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
      {ideaOffer && <CreateFromIdeaSheet idea={ideaFromOffer(ideaOffer)} input={OFFER_INPUT} onClose={() => setIdeaOffer(null)} />}
      {creating && <MiniAppModal ad={offerToDemoAd(creating)} brief={offerBrief(creating)} offer={creating} origin={detail?.id === creating.id ? "oferta_ficha" : "oferta_tarjeta"} onNavigate={onNavigate} onClose={() => setCreating(null)} />}
    </div>
  );
}

function FollowingList({ rows, watch, follows, onCreate, onOpen }: {
  rows: FollowedRow[] | null; watch: Map<string, OfferWatch>; follows: ReturnType<typeof useOfferFollows>;
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
          Pulsa el corazón en una oferta para seguirla ({CREDIT_COSTS.follow_offer} créditos). Cada día la revisamos en la Biblioteca de Anuncios
          de Meta y te avisamos aquí si escala (pone más anuncios: le está funcionando), si los apaga, o si cambia su precio o su upsell.
        </div>
      </div>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {rows.map((r) => (
        <OfferCard key={r.offer.id} o={r.offer} onOpen={() => onOpen(r.offer)} onCreate={() => onCreate(r.offer)}
          following={follows.isFollowing(r.offer.id)} onToggleFollow={() => follows.toggle(r.offer)}
          insight={r} watch={watch.get(r.offer.id)} />
      ))}
    </div>
  );
}
