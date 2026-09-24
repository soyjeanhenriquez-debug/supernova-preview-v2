import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Loader2, ExternalLink, Sparkles, Gift, TrendingUp, Star, Store, Tag, Lightbulb, X, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useCredits, generatorCost } from "@/hooks/useCredits";
import { fnHeaders, fnErrorMessage, readBilling } from "@/lib/fnAuth";
import { supabase } from "@/integrations/supabase/client";
import { IdeasWhatsApp } from "@/components/IdeasWhatsApp";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useBusinessProfile } from "@/lib/businessProfile";
import { safeExternalUrl } from "@/lib/offerIntel";

/**
 * Mercado: productos reales de redes de afiliados y tiendas (ClickBank, Digistore24, Etsy).
 * La idea no es "otro catálogo": es el puente entre encontrar QUÉ vender y tener los anuncios.
 * Por eso cada tarjeta lleva "Vender esto": rellena la oferta y abre la Mándala.
 */

type Row = {
  id: string; source: Source; title: string; description: string | null; category: string | null;
  niche: string | null; vendor: string | null; price: number | null; currency: string | null;
  commission_pct: number | null; commission_amount: number | null; popularity: number | null;
  rating: number | null; reviews: number | null; image_url: string | null; product_url: string | null;
  affiliate_url: string | null; tags: string[];
  // Solo para las filas que vienen del Radar (no del catálogo de redes):
  priceHint?: string | null; market?: string | null; platform?: string | null; days?: number | null; ads?: number | null;
};
type Source = "clickbank" | "digistore24" | "etsy" | "manual" | "radar";
type RadarRow = {
  id: string; page_id: string; page_name: string | null; product_name: string | null; niche: string | null;
  market: string | null; platform: string; evidence: string | null; price_hint: string | null;
  days_active: number | null; active_ads: number | null; ads_count: number | null;
  sample_title: string | null; sample_ad_url: string | null; landing_domain: string | null;
};

const SOURCES: { id: Source | "all"; label: string; hint: string; color: string }[] = [
  { id: "all", label: "Todo", hint: "Todas las fuentes juntas", color: "hsl(var(--primary))" },
  { id: "radar", label: "Radar de anunciantes", hint: "Negocios que están pagando anuncios, y desde hace cuántos días", color: "#F5A524" },
  { id: "clickbank", label: "ClickBank", hint: "Productos digitales que puedes vender como afiliado, con su comisión", color: "#22C55E" },
  { id: "digistore24", label: "Digistore24", hint: "Productos digitales de Europa y LATAM para vender como afiliado", color: "#3B82F6" },
  { id: "etsy", label: "Etsy", hint: "Ideas: lo que la gente ya compra de regalo, para hacer tu propia versión", color: "#F26B21" },
];

const SORTS = [
  { id: "popularity", label: "Más populares" },
  { id: "commission", label: "Mejor comisión" },
  { id: "price_low", label: "Más baratos" },
  { id: "recent", label: "Los más nuevos" },
] as const;
type Sort = typeof SORTS[number]["id"];

// Black Friday 2026: viernes 27 de noviembre.
const BLACK_FRIDAY = new Date("2026-11-27T00:00:00-05:00");
function daysToBlackFriday() {
  return Math.ceil((BLACK_FRIDAY.getTime() - Date.now()) / 86400000);
}

const money = (n: number | null, cur: string | null) =>
  n == null ? null : `${n.toLocaleString("es", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })} ${cur === "EUR" ? "EUR" : "USD"}`;

/** Lo que gana el afiliado por venta, en dinero: es el número que hace decidir. */
function payout(r: Row): number | null {
  if (r.commission_amount != null) return r.commission_amount;
  if (r.commission_pct != null && r.price != null) return (r.price * r.commission_pct) / 100;
  return null;
}

/**
 * "Idea para replicar": el catálogo sirve de inspiración, no de copia. La IA parte de un
 * producto que ya se vende y propone TU versión, con su ángulo para el último trimestre
 * (regalos). Todo lo que no sea dato del archivo se marca como estimación.
 */
function ideaPrompt(r: Row, fuente: string) {
  const ficha = [
    `Producto: ${r.title}`,
    r.category && `Categoría: ${r.category}`,
    r.price != null && `Precio: ${r.price} ${r.currency ?? "USD"}`,
    r.reviews != null && `Reseñas en la tienda: ${r.reviews}${r.rating != null ? ` (${r.rating}★)` : ""}`,
    `Fuente: ${fuente}`,
  ].filter(Boolean).join("\n");
  return `Eres un estratega de producto y de respuesta directa. A partir de un producto que YA se vende en una tienda, propones cómo hacer tu propia versión y venderla en el último trimestre del año (regalos, Black Friday, Navidad).

PRODUCTO DE REFERENCIA:
${ficha}

Entrega:
## Por qué se vende
Qué necesidad o emoción cubre. Si es una suposición tuya, dilo.
## Tu versión
Tres formas de hacer tu propia versión, de la más fácil a la más difícil: digital (descargable), física (hecha o encargada) y servicio o personalización. Para cada una: qué es, cuánto cuesta empezar y cuánto tiempo lleva.
## Precio sugerido
Un rango con su razón, comparado con el producto de referencia.
## Por qué encaja (o no) en el último trimestre
Sé honesto: si es un producto de temporada baja o difícil de enviar a tiempo, dilo.
## Cómo lo venderías
El público concreto, el ángulo del anuncio y el gancho de los 3 primeros segundos.
## Lo que NO sabemos
Qué datos harían falta para confirmar que es buena idea y cómo conseguirlos (buscador de la tienda, anuncios activos, preguntas a clientes).

Escribe en español neutro, frases cortas, títulos con ##. No inventes cifras de ventas ni de ingresos: no tenemos ese dato. No copies el nombre ni el texto del producto de referencia: la idea es hacer una versión propia.`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("market_offers");

export function MercadoPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { user } = useAuth();
  const { savePatch: saveBusiness } = useBusinessProfile();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<Source | "all">("all");
  const [sort, setSort] = useState<Sort>("popularity");
  const [q, setQ] = useState("");
  const [onlyGift, setOnlyGift] = useState(false);
  // Pestaña: las ideas para WhatsApp funcionan siempre; el catálogo depende de lo cargado.
  const [modo, setModo] = useState<"ideas" | "catalogo">("ideas");
  const { applyServerCharge, canAfford } = useCredits();
  const [idea, setIdea] = useState<{ row: Row; text: string; loading: boolean } | null>(null);
  const [plataformas, setPlataformas] = useState<{ platform: string; anunciantes: number }[]>([]);
  const [plataforma, setPlataforma] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    if (source === "radar") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [{ data: plats }, { data: filas, error }] = await Promise.all([
        sb.rpc("market_radar_platforms"),
        sb.rpc("market_radar", { p_platform: plataforma, p_limit: 90 }),
      ]);
      if (error) toast.error("No se pudo cargar el Radar. Recarga la página.");
      setPlataformas(Array.isArray(plats) ? plats : []);
      // Se reutiliza la misma tarjeta: lo del Radar se traduce a la forma del catálogo.
      setRows((Array.isArray(filas) ? (filas as RadarRow[]) : []).map(f => ({
        id: f.id,
        source: "radar" as Source,
        title: f.product_name || f.sample_title || f.page_name || "Anunciante",
        description: [f.days_active ? `${f.days_active} días anunciando` : null,
                      f.active_ads ? `${f.active_ads} anuncios activos` : null,
                      f.landing_domain].filter(Boolean).join(" · "),
        category: f.platform,
        niche: f.niche,
        vendor: f.page_name,
        price: null, currency: null, commission_pct: null, commission_amount: null,
        popularity: f.days_active, rating: null, reviews: null, image_url: null,
        product_url: f.sample_ad_url, affiliate_url: null, tags: [],
        priceHint: f.price_hint, market: f.market, platform: f.platform, days: f.days_active, ads: f.active_ads,
      })));
      setLoading(false);
      return;
    }
    let query = table().select("id,source,title,description,category,niche,vendor,price,currency,commission_pct,commission_amount,popularity,rating,reviews,image_url,product_url,affiliate_url,tags").limit(120);
    if (source !== "all") query = query.eq("source", source);
    if (onlyGift) query = query.contains("tags", ["black-friday"]);
    if (q.trim()) query = query.ilike("title", `%${q.trim().slice(0, 60)}%`);
    query = sort === "popularity" ? query.order("popularity", { ascending: false, nullsFirst: false })
      : sort === "commission" ? query.order("commission_pct", { ascending: false, nullsFirst: false })
      : sort === "price_low" ? query.order("price", { ascending: true, nullsFirst: false })
      : query.order("first_seen", { ascending: false });
    const { data, error } = await query;
    if (error) toast.error("No se pudieron cargar los productos. Recarga la página.");
    setRows(Array.isArray(data) ? (data as Row[]) : []);
    setLoading(false);
  }, [source, sort, q, onlyGift, plataforma]);

  useEffect(() => { const t = setTimeout(load, q ? 350 : 0); return () => clearTimeout(t); }, [load, q]);

  const dias = useMemo(daysToBlackFriday, []);

  /** Puente al resto de la app: la oferta queda cargada y la Mándala ya puede crear anuncios. */
  const vender = async (r: Row) => {
    const brief = {
      product: r.title.slice(0, 300),
      who: r.niche || r.category || "",
      promise: (r.description || "").replace(/\s+/g, " ").slice(0, 300),
      price: r.price != null ? String(r.price) : "",
      proof: r.rating != null ? `${r.rating}★ con ${r.reviews ?? 0} reseñas en ${SOURCES.find(s => s.id === r.source)?.label}` : "",
    };
    // La Mándala lee la ficha de "Mi negocio" (business_profile): se guarda ahí, sin perder el tipo de negocio.
    if (!(await saveBusiness(brief))) { toast.error("No se pudo cargar la oferta en la Mándala. Intenta de nuevo."); return; }
    toast.success("Oferta cargada en la Mándala");
    if (onNavigate) onNavigate("Mándala"); else window.location.hash = "#/mandala";
  };

  /** Genera la idea con la IA (mismo cobro que un generador ligero). */
  const pedirIdea = async (r: Row) => {
    const { action } = generatorCost("market-idea");
    if (!canAfford(action)) { toast.error(`Te faltan créditos: la idea cuesta ${generatorCost("market-idea").cost}`, { description: "Recarga créditos o espera a que se renueven el mes que viene." }); return; }
    setIdea({ row: r, text: "", loading: true });
    try {
      const fuente = SOURCES.find(s => s.id === r.source)?.label ?? r.source;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
        method: "POST", headers: await fnHeaders(),
        body: JSON.stringify({
          generator_id: "market-idea", generator_title: `Idea para replicar · ${r.title.slice(0, 50)}`,
          messages: [{ role: "user", content: ideaPrompt(r, fuente) }],
        }),
      });
      if (!resp.ok || !resp.body) throw new Error(await fnErrorMessage(resp, "No se pudo generar la idea"));
      applyServerCharge(action, readBilling(resp), "Idea para replicar");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", full = "", fin = false;
      while (!fin) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { fin = true; break; }
          try {
            const c = JSON.parse(json).choices?.[0]?.delta?.content;
            if (c) { full += c; setIdea(prev => prev && prev.row.id === r.id ? { ...prev, text: full } : prev); }
          } catch { buf = line + "\n" + buf; break; }
        }
      }
      setIdea(prev => prev && prev.row.id === r.id ? { ...prev, loading: false } : prev);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar la idea");
      setIdea(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabecera: el mercado y la fecha que manda este trimestre */}
      <header className="relative overflow-hidden rounded-3xl border border-border p-6 sm:p-8"
        style={{ background: "radial-gradient(120% 140% at 0% 0%, hsl(var(--primary)/0.18) 0%, transparent 55%), radial-gradient(100% 120% at 100% 0%, #F26B2133 0%, transparent 50%), hsl(var(--card))" }}>
        <div className="relative flex flex-col gap-3 max-w-2xl">
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-background/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
            <Store className="w-3.5 h-3.5 text-primary" /> Mercado
          </span>
          <h1 className="font-display font-bold text-3xl sm:text-4xl leading-tight text-foreground">
            Encuentra qué vender, aunque todavía no tengas producto.
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Aquí tienes dos caminos. <b className="text-foreground">Ideas para WhatsApp</b>: la IA te propone 5 productos digitales sencillos
            (imprimibles, plantillas, agendas) que puedes hacer esta semana y vender por WhatsApp. <b className="text-foreground">Catálogo y Radar</b>:
            productos digitales de ClickBank y Digistore24 que puedes vender como afiliado (cobras una comisión por cada venta, sin crear nada),
            productos de Etsy para inspirarte y negocios que ya están pagando anuncios.
          </p>
          <p className="text-xs text-muted-foreground">
            Cuando elijas uno, toca <b className="text-foreground">Vender esto</b> y pasa a la Mándala para crear tus anuncios.
          </p>
          {dias > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-3 py-1.5 text-xs font-bold">
                <Gift className="w-3.5 h-3.5" /> Faltan {dias} días para el Black Friday (27 de noviembre)
              </span>
              <button onClick={() => { setOnlyGift(v => !v); }}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${onlyGift ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {onlyGift ? "Viendo solo productos de regalo · ver todos" : "Ver solo productos de regalo"}
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex gap-1 rounded-xl bg-secondary/60 p-1 w-full sm:w-fit">
        {([["ideas", "Ideas para WhatsApp"], ["catalogo", "Catálogo y Radar"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setModo(id)}
            className={`flex-1 sm:flex-none rounded-lg px-4 py-2 text-xs font-semibold whitespace-nowrap ${modo === id ? "bg-card text-foreground shadow" : "text-muted-foreground"}`}>
            {label}
          </button>
        ))}
      </div>

      {modo === "ideas" ? <IdeasWhatsApp onNavigate={onNavigate} /> : (<>
      {/* Filtros */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {SOURCES.map(s => {
            const on = source === s.id;
            return (
              <button key={s.id} onClick={() => setSource(s.id)} title={s.hint}
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all ${on ? "text-foreground" : "text-muted-foreground border-border hover:text-foreground"}`}
                style={on ? { borderColor: s.color, background: `${s.color}1f`, boxShadow: `0 0 0 1px ${s.color}55 inset` } : undefined}>
                <span className="w-2 h-2 rounded-full" style={{ background: s.color }} /> {s.label}
              </button>
            );
          })}
        </div>
        {source === "radar" && plataformas.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setPlataforma(null)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${plataforma === null ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              Todas
            </button>
            {plataformas.map(p => (
              <button key={p.platform} onClick={() => setPlataforma(p.platform)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${plataforma === p.platform ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {p.platform} <span className="opacity-60">· {p.anunciantes.toLocaleString("es")} anunciantes</span>
              </button>
            ))}
          </div>
        )}
        {source !== "radar" && (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Busca por producto o tema: cocina, inglés, mascotas…"
              className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60" />
          </div>
          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SORTS.map(s => (
              <button key={s.id} onClick={() => setSort(s.id)}
                className={`whitespace-nowrap rounded-xl border px-3 py-2.5 text-xs font-medium ${sort === s.id ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        )}
      </div>

      {source === "radar" && (
        <p className="text-[11px] text-muted-foreground -mt-1">
          Negocios que tienen anuncios activos, ordenados por cuántos días llevan pagándolos: mientras más días, más probable es que
          les funcione. La plataforma de pago (Hotmart, Shopify…) la deducimos del enlace o del texto del anuncio, así que tómala como una pista.
        </p>
      )}

      {/* Si la red no manda ventas (Etsy no las manda), no se finge un ranking. */}
      {!loading && sort === "popularity" && rows.length > 0 && rows.every(r => r.popularity == null) && (
        <p className="text-[11px] text-muted-foreground -mt-1">
          Estos productos no traen dato de ventas, así que no están ordenados por lo más vendido sino en el orden en que los da la tienda.
        </p>
      )}

      {/* Rejilla */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card-surface rounded-2xl overflow-hidden animate-pulse">
              <div className="aspect-[4/3] bg-secondary/50" />
              <div className="p-4 space-y-2"><div className="h-4 bg-secondary rounded w-3/4" /><div className="h-3 bg-secondary rounded w-1/2" /></div>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="card-surface rounded-2xl p-10 text-center">
          <Store className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground">No encontramos productos con estos filtros</p>
          <p className="text-xs text-muted-foreground mt-1">Prueba con otra fuente, otra palabra o borra la búsqueda.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map(r => <Card key={r.id} r={r} onVender={() => vender(r)} onIdea={() => pedirIdea(r)} />)}
          </div>
          {rows.some(r => r.affiliate_url) && (
            // Divulgación: obligatoria en los programas de afiliados y por ley. Discreta, al pie.
            <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
              SUPERNOVA participa en programas de afiliados: algunos enlaces a productos pueden generarnos una comisión,
              sin coste para ti. ¿Quieres cobrar la tuya? Date de alta en la red del producto y usa tu propio enlace.
            </p>
          )}
        </>
      )}

      </>)}

      {/* Panel de la idea */}
      {idea && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-6" onClick={() => setIdea(null)}>
          <div className="card-surface w-full sm:max-w-2xl max-h-[85vh] overflow-auto rounded-t-2xl sm:rounded-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-primary font-semibold">Cómo hacer tu propia versión</p>
                <h3 className="font-display font-semibold text-foreground text-sm truncate">{idea.row.title}</h3>
              </div>
              <div className="flex items-center gap-2">
                {!idea.loading && idea.text && (
                  <button onClick={() => { navigator.clipboard.writeText(idea.text); toast.success("Copiado. Ya puedes pegarlo."); }}
                    className="p-2 text-muted-foreground hover:text-foreground" aria-label="Copiar"><Copy className="w-4 h-4" /></button>
                )}
                <button onClick={() => setIdea(null)} className="p-2 text-muted-foreground hover:text-foreground" aria-label="Cerrar"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="prose prose-sm prose-invert max-w-none text-foreground">
              {idea.text ? <ReactMarkdown>{idea.text}</ReactMarkdown>
                : <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Escribiendo cómo hacer tu versión…</p>}
            </div>
            {!idea.loading && idea.text && (
              <button onClick={() => { const r = idea.row; setIdea(null); vender(r); }}
                className="mt-4 inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground">
                <Sparkles className="w-4 h-4" /> Crear los anuncios en la Mándala
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ r, onVender, onIdea }: { r: Row; onVender: () => void; onIdea: () => void }) {
  const src = SOURCES.find(s => s.id === r.source);
  const gana = payout(r);
  const precio = money(r.price, r.currency);
  // Los enlaces vienen de feeds de afiliados y CSV: solo http(s), nunca "javascript:".
  const productHref = safeExternalUrl(r.affiliate_url) ?? safeExternalUrl(r.product_url);
  return (
    <article className="card-surface rounded-2xl overflow-hidden flex flex-col ad-card-hover group">
      <div className="relative aspect-[4/3] bg-secondary/40 overflow-hidden">
        {r.image_url ? (
          <img src={r.image_url} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${src?.color}22, transparent)` }}>
            <Tag className="w-8 h-8" style={{ color: src?.color }} />
          </div>
        )}
        <span className="absolute top-2.5 left-2.5 text-[10px] font-bold uppercase tracking-wider rounded-full px-2.5 py-1 text-white shadow" style={{ background: src?.color }}>
          {r.source === "radar" ? (r.platform ?? "Radar") : src?.label}
        </span>
        {r.source === "radar" ? (
          r.days != null && (
            <span className="absolute bottom-2.5 left-2.5 rounded-full bg-background/90 backdrop-blur border border-border px-2.5 py-1 text-[11px] font-bold text-primary">
              {r.days.toLocaleString("es")} días pagando anuncios
            </span>
          )
        ) : gana != null && (
          <span className="absolute bottom-2.5 left-2.5 rounded-full bg-background/90 backdrop-blur border border-border px-2.5 py-1 text-[11px] font-bold text-success">
            Ganas {gana.toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {r.currency === "EUR" ? "EUR" : "USD"} por venta
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1 gap-2">
        <h3 className="font-display font-semibold text-[15px] leading-snug text-foreground line-clamp-2">{r.title}</h3>
        {r.description && <p className="text-[12px] text-muted-foreground line-clamp-2">{r.description}</p>}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground mt-auto pt-2">
          {r.source === "radar" && r.priceHint && <span className="font-semibold text-foreground">{r.priceHint}</span>}
          {r.source === "radar" && r.ads != null && (
            <span className="inline-flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-primary" />{r.ads.toLocaleString("es")} anuncios activos</span>
          )}
          {r.source === "radar" && r.market && <span>{r.market}</span>}
          {precio && <span className="font-semibold text-foreground">{precio}</span>}
          {r.commission_pct != null && <span>{r.commission_pct.toLocaleString("es")}% de comisión</span>}
          {r.source !== "radar" && r.popularity != null && (
            <span className="inline-flex items-center gap-1" title="Índice de popularidad que da la red (no son ventas)"><TrendingUp className="w-3.5 h-3.5 text-primary" />Popularidad {Math.round(r.popularity).toLocaleString("es")}</span>
          )}
          {r.rating != null && (
            <span className="inline-flex items-center gap-1"><Star className="w-3.5 h-3.5 text-primary" fill="currentColor" />{r.rating.toLocaleString("es")}{r.reviews ? ` (${r.reviews.toLocaleString("es")} reseñas)` : ""}</span>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onVender}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg gradient-brand px-3 py-2.5 text-xs font-bold text-primary-foreground">
            <Sparkles className="w-3.5 h-3.5" /> Vender esto
          </button>
          <button onClick={onIdea} title={`Cómo hacer tu propia versión · ${generatorCost("market-idea").cost} créditos`}
            className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2.5 text-muted-foreground hover:text-primary hover:border-primary/60"
            aria-label="Cómo hacer tu propia versión de este producto">
            <Lightbulb className="w-4 h-4" />
          </button>
          {productHref && (
            <a href={productHref} target="_blank" rel="noopener noreferrer nofollow"
              className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2.5 text-muted-foreground hover:text-foreground hover:border-primary/60"
              aria-label="Ver el producto en su sitio" title="Ver el producto en su sitio">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
