import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Loader2, ExternalLink, Sparkles, Gift, TrendingUp, Star, Store, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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
};
type Source = "clickbank" | "digistore24" | "etsy" | "manual";

const SOURCES: { id: Source | "all"; label: string; hint: string; color: string }[] = [
  { id: "all", label: "Todo", hint: "Todas las fuentes", color: "hsl(var(--primary))" },
  { id: "clickbank", label: "ClickBank", hint: "Infoproductos con comisión alta", color: "#22C55E" },
  { id: "digistore24", label: "Digistore24", hint: "Infoproductos de Europa y LATAM", color: "#3B82F6" },
  { id: "etsy", label: "Etsy", hint: "Productos hechos a mano y digitales", color: "#F26B21" },
];

const SORTS = [
  { id: "popularity", label: "Más vendidos" },
  { id: "commission", label: "Mejor comisión" },
  { id: "price_low", label: "Más baratos" },
  { id: "recent", label: "Recién llegados" },
] as const;
type Sort = typeof SORTS[number]["id"];

// Black Friday 2026: viernes 27 de noviembre.
const BLACK_FRIDAY = new Date("2026-11-27T00:00:00-05:00");
function daysToBlackFriday() {
  return Math.ceil((BLACK_FRIDAY.getTime() - Date.now()) / 86400000);
}

const money = (n: number | null, cur: string | null) =>
  n == null ? null : `${cur === "EUR" ? "€" : "$"}${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;

/** Lo que gana el afiliado por venta, en dinero: es el número que hace decidir. */
function payout(r: Row): number | null {
  if (r.commission_amount != null) return r.commission_amount;
  if (r.commission_pct != null && r.price != null) return (r.price * r.commission_pct) / 100;
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("market_offers");

export function MercadoPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<Source | "all">("all");
  const [sort, setSort] = useState<Sort>("popularity");
  const [q, setQ] = useState("");
  const [onlyGift, setOnlyGift] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let query = table().select("id,source,title,description,category,niche,vendor,price,currency,commission_pct,commission_amount,popularity,rating,reviews,image_url,product_url,affiliate_url,tags").limit(120);
    if (source !== "all") query = query.eq("source", source);
    if (onlyGift) query = query.contains("tags", ["black-friday"]);
    if (q.trim()) query = query.ilike("title", `%${q.trim().slice(0, 60)}%`);
    query = sort === "popularity" ? query.order("popularity", { ascending: false, nullsFirst: false })
      : sort === "commission" ? query.order("commission_pct", { ascending: false, nullsFirst: false })
      : sort === "price_low" ? query.order("price", { ascending: true, nullsFirst: false })
      : query.order("first_seen", { ascending: false });
    const { data, error } = await query;
    if (error) toast.error("No se pudo cargar el mercado");
    setRows(Array.isArray(data) ? (data as Row[]) : []);
    setLoading(false);
  }, [source, sort, q, onlyGift]);

  useEffect(() => { const t = setTimeout(load, q ? 350 : 0); return () => clearTimeout(t); }, [load, q]);

  const dias = useMemo(daysToBlackFriday, []);

  /** Puente al resto de la app: la oferta queda cargada y la Mándala ya puede crear anuncios. */
  const vender = (r: Row) => {
    const brief = {
      product: r.title.slice(0, 300),
      who: r.niche || r.category || "",
      promise: (r.description || "").replace(/\s+/g, " ").slice(0, 300),
      price: r.price != null ? String(r.price) : "",
      proof: r.rating != null ? `${r.rating}★ con ${r.reviews ?? 0} reseñas en ${SOURCES.find(s => s.id === r.source)?.label}` : "",
    };
    try { localStorage.setItem(`sn_mandala_brief_${user?.id ?? "anon"}`, JSON.stringify(brief)); } catch { /* sin almacenamiento */ }
    toast.success("Oferta cargada en la Mándala");
    if (onNavigate) onNavigate("Mándala"); else window.location.hash = "#/mandala";
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
            Productos que ya se venden, listos para que tú los vendas.
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Infoproductos de ClickBank y Digistore24 con su comisión real, y productos de Etsy para regalo.
            Eliges uno, pulsas <b className="text-foreground">Vender esto</b> y la Mándala te escribe los anuncios.
          </p>
          {dias > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-3 py-1.5 text-xs font-bold">
                <Gift className="w-3.5 h-3.5" /> Faltan {dias} días para el Black Friday
              </span>
              <button onClick={() => { setOnlyGift(v => !v); }}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${onlyGift ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {onlyGift ? "Viendo solo regalo" : "Ver productos de regalo"}
              </button>
            </div>
          )}
        </div>
      </header>

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
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto, nicho o palabra clave…"
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
      </div>

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
          <p className="text-sm font-semibold text-foreground">Todavía no hay productos con estos filtros</p>
          <p className="text-xs text-muted-foreground mt-1">Prueba con otra fuente o quita la búsqueda.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map(r => <Card key={r.id} r={r} onVender={() => vender(r)} />)}
        </div>
      )}
    </div>
  );
}

function Card({ r, onVender }: { r: Row; onVender: () => void }) {
  const src = SOURCES.find(s => s.id === r.source);
  const gana = payout(r);
  const precio = money(r.price, r.currency);
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
          {src?.label}
        </span>
        {gana != null && (
          <span className="absolute bottom-2.5 left-2.5 rounded-full bg-background/90 backdrop-blur border border-border px-2.5 py-1 text-[11px] font-bold text-success">
            Ganas ${gana.toFixed(2)} por venta
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1 gap-2">
        <h3 className="font-display font-semibold text-[15px] leading-snug text-foreground line-clamp-2">{r.title}</h3>
        {r.description && <p className="text-[12px] text-muted-foreground line-clamp-2">{r.description}</p>}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground mt-auto pt-2">
          {precio && <span className="font-semibold text-foreground">{precio}</span>}
          {r.commission_pct != null && <span>{r.commission_pct}% comisión</span>}
          {r.popularity != null && (
            <span className="inline-flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-primary" />{Math.round(r.popularity).toLocaleString("es")}</span>
          )}
          {r.rating != null && (
            <span className="inline-flex items-center gap-1"><Star className="w-3.5 h-3.5 text-primary" fill="currentColor" />{r.rating}{r.reviews ? ` (${r.reviews.toLocaleString("es")})` : ""}</span>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onVender}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg gradient-brand px-3 py-2.5 text-xs font-bold text-primary-foreground">
            <Sparkles className="w-3.5 h-3.5" /> Vender esto
          </button>
          {(r.affiliate_url || r.product_url) && (
            <a href={r.affiliate_url || r.product_url || "#"} target="_blank" rel="noopener noreferrer nofollow"
              className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2.5 text-muted-foreground hover:text-foreground hover:border-primary/60"
              aria-label="Ver el producto en su sitio">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
