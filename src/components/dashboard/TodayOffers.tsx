import { useEffect, useState } from "react";
import { Flame, Zap, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdMediaPreview } from "@/components/AdMediaPreview";
import { MiniAppModal } from "@/components/MiniAppModal";
import { offerBrief } from "@/lib/sellThis";
import { CREDIT_COSTS } from "@/hooks/useCredits";
import { track, trackMiVersionClick } from "@/lib/analytics";
import { type Offer, MARKET_NAME, flagFor, offerToDemoAd } from "@/lib/offers";

/**
 * "Hoy" (Inicio de una sola puerta, decisión de Jean del 12-oct-2026): 3 ofertas ganadoras que llevan
 * más de 90 días pagando anuncios, con su creativo visible, los días y UN botón: «Hacer mi versión».
 * Ese botón abre el flujo que ya existe (MiniAppModal); aquí no se reescribe.
 *
 * Datos: la lista curada de Ofertas (is_winner, ~300 filas de la tabla offers, nunca winning_ads), sin
 * contar filas. Primero las que están en español; cambian cada día rotando dentro de las mejores.
 * No baja ni oculta ninguna oferta: solo elige 3 para mostrar arriba.
 */
const TODAY_MIN_DAYS = 90;
const POOL = 36;

/** Elige 3 del día: español primero, rotando por día para que cada día haya otras. */
function pickToday(rows: Offer[], day: number): Offer[] {
  const es = rows.filter(o => o.language === "es");
  const rest = rows.filter(o => o.language !== "es");
  const rotate = (list: Offer[], n: number) => {
    if (list.length <= n) return list;
    const start = (day * n) % list.length;
    return Array.from({ length: n }, (_, i) => list[(start + i) % list.length]);
  };
  const first = rotate(es, 3);
  return [...first, ...rotate(rest, 3 - first.length)].slice(0, 3);
}

interface Props { onNavigate: (page: string) => void; }

export function TodayOffers({ onNavigate }: Props) {
  const [rows, setRows] = useState<Offer[] | null>(null);
  const [making, setMaking] = useState<Offer | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.from("offers").select("*")
      .eq("is_winner", true).eq("enrich_failed", false).is("excluded_reason", null)
      .gte("days_active", TODAY_MIN_DAYS)
      .order("winner_index", { ascending: false, nullsFirst: false })
      .order("winner_score", { ascending: false })
      .limit(POOL)
      .then(({ data }) => {
        if (!alive) return;
        const day = Math.floor(Date.now() / 86_400_000);
        setRows(pickToday((data ?? []) as unknown as Offer[], day));
      }, () => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, []);

  // Abre la ficha completa de la oferta (Ofertas lee la oferta de la dirección al montarse).
  const openOffer = (o: Offer) => {
    track("home_card_click", { card: "hoy_oferta", pestana: "hoy" });
    window.location.hash = `#/ofertas/${o.id}`;
  };
  const make = (o: Offer) => {
    trackMiVersionClick("inicio_hoy", o.id, o.days_active);
    setMaking(o);
  };

  return (
    <section aria-labelledby="hoy-titulo">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 id="hoy-titulo" className="font-display font-semibold text-[18px] text-foreground">Hoy</h2>
          <p className="text-[12.5px] text-muted-foreground">3 negocios digitales que llevan más de {TODAY_MIN_DAYS} días pagando anuncios. Cambian cada día.</p>
        </div>
        <button onClick={() => onNavigate("Ofertas")} className="shrink-0 text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
          Ver más <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {rows !== null && rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-5 text-[13px] text-muted-foreground flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="flex-1">No pudimos cargar las ofertas de hoy. Ábrelas en Ofertas ganadoras: ahí están todas.</p>
          <button onClick={() => onNavigate("Ofertas")} className="shrink-0 inline-flex items-center gap-1 h-9 px-3.5 rounded-full border border-border text-[12.5px] font-semibold text-foreground hover:border-foreground/30">
            Ver ofertas <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        // En el teléfono: fila que se desliza (la 2.ª asoma para que se note que hay más). En pantalla grande: 3 columnas.
        <div className="-mx-4 px-4 md:mx-0 md:px-0 flex md:grid md:grid-cols-3 gap-3 overflow-x-auto md:overflow-visible snap-x snap-mandatory [scrollbar-width:none]">
          {rows === null
            ? [0, 1, 2].map(i => <div key={i} className="shrink-0 w-[78%] sm:w-[46%] md:w-auto snap-start rounded-2xl border border-border bg-card/30 h-[380px] animate-pulse" />)
            : rows.map(o => <TodayCard key={o.id} o={o} onOpen={() => openOffer(o)} onMake={() => make(o)} />)}
        </div>
      )}

      {making && <MiniAppModal ad={offerToDemoAd(making)} brief={offerBrief(making)} onNavigate={onNavigate} onClose={() => setMaking(null)} />}
    </section>
  );
}

function TodayCard({ o, onOpen, onMake }: { o: Offer; onOpen: () => void; onMake: () => void }) {
  const name = o.product_name || o.sample_title || o.page_name || "Oferta";
  // "de-DE" agrupa también 4 cifras (1.060), como pide el manual; "es" deja "1060".
  const days = o.days_active.toLocaleString("de-DE");
  return (
    <article data-testid="today-offer" className="shrink-0 w-[78%] sm:w-[46%] md:w-auto snap-start rounded-2xl border border-border bg-card/40 overflow-hidden flex flex-col">
      <button onClick={onOpen} aria-label={`Ver la oferta ${name}`} className="relative block aspect-[4/5] bg-secondary/40 overflow-hidden text-left">
        <AdMediaPreview fill fit="cover" adUrl={o.sample_ad_url ?? undefined} pageId={o.page_id} pageName={o.page_name ?? name} title={name} />
        <span className="absolute top-2.5 left-2.5 pointer-events-none inline-flex items-center gap-1 rounded-full px-2.5 py-1 bg-background/85 backdrop-blur border border-border text-[11px] font-semibold text-foreground tabular-nums">
          <Flame className="w-3 h-3 text-primary" /> {days} días pagando anuncios
        </span>
      </button>
      <div className="p-3.5 flex flex-col flex-1">
        <button onClick={onOpen} className="text-left">
          <h3 className="font-display font-semibold text-[15px] leading-snug text-foreground line-clamp-2 hover:text-primary transition-colors">{name}</h3>
        </button>
        <p className="mt-1 text-[11.5px] text-muted-foreground truncate">
          {[`${flagFor(o.market)} ${MARKET_NAME[o.market] ?? o.market}`, o.price_hint].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-auto pt-3">
          <button onClick={onMake} className="w-full btn-primary-nova h-11 rounded-xl text-[13px] font-semibold inline-flex items-center justify-center gap-1.5">
            <Zap className="w-4 h-4" /> Hacer mi versión <span className="opacity-70 font-medium">· {CREDIT_COSTS.gen_master_prompt} créditos</span>
          </button>
        </div>
      </div>
    </article>
  );
}
