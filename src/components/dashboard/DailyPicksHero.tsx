import { useEffect, useState } from "react";
import { Flame, ExternalLink, Zap, Radar, ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MiniAppModal } from "@/components/MiniAppModal";
import { CREDIT_COSTS } from "@/hooks/useCredits";
import { buildAdsLibraryPageUrl, type AdMarket } from "@/lib/demo-winning-ads";
import {
  type Offer, NICHE_LABEL, OFFER_TYPE_LABEL, MARKET_GROUP, MARKET_NAME,
  flagFor, copyLabel, scaleLabel, offerToDemoAd, openOfferAdsInRadar,
} from "@/lib/offers";

interface Pick { slot: number; market_group: string; offer: Offer; }
interface Props { onNavigate?: (page: string) => void; }

/**
 * "Tus 3 negocios de hoy": el wow al abrir la app. La RPC get_daily_picks()
 * elige 3 ofertas COPIABLES (copy_score) que este usuario nunca vio, rotando
 * los mercados español / brasileño / americano / ruso. Ver es gratis; copiar
 * el negocio usa el pipeline existente (MiniAppModal, 50 créditos).
 */
export function DailyPicksHero({ onNavigate }: Props) {
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [totalOffers, setTotalOffers] = useState<number | null>(null);
  const [copying, setCopying] = useState<Offer | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data }, { count }] = await Promise.all([
        supabase.rpc("get_daily_picks"),
        supabase.from("offers").select("id", { count: "exact", head: true }).gt("active_ads", 0),
      ]);
      if (!alive) return;
      setPicks(Array.isArray(data) ? (data as unknown as Pick[]) : []);
      setTotalOffers(count ?? null);
    })();
    return () => { alive = false; };
  }, []);

  if (picks && picks.length === 0) return null;

  const today = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  return (
    <section>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-primary font-semibold mb-1 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" /> Seleccionados hoy · {today}
          </div>
          <h3 className="font-display font-semibold text-2xl text-foreground tracking-tight">
            Tus 3 negocios de hoy, listos para copiar
          </h3>
          <p className="text-[13px] text-muted-foreground mt-1.5 max-w-2xl">
            Elegidos entre {totalOffers ? totalOffers.toLocaleString("es-ES") : "miles de"} ofertas que están pagando anuncios ahora mismo.
            Nunca te repetimos uno. Cada día: 3 mercados distintos (español, brasileño, americano, ruso).
          </p>
        </div>
        <button
          onClick={() => onNavigate?.("Ofertas")}
          className="text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          Ver todas las ofertas <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {picks === null
          ? [0, 1, 2].map((i) => <div key={i} className="card-surface rounded-2xl h-[340px] animate-pulse" />)
          : picks.map((p) => <PickCard key={p.offer.id} pick={p} onCopy={() => setCopying(p.offer)} onNavigate={onNavigate} />)}
      </div>

      {copying && <MiniAppModal ad={offerToDemoAd(copying)} onClose={() => setCopying(null)} />}
    </section>
  );
}

function PickCard({ pick, onCopy, onNavigate }: { pick: Pick; onCopy: () => void; onNavigate?: (p: string) => void }) {
  const o = pick.offer;
  const group = MARKET_GROUP[pick.market_group];
  const copy = copyLabel(o.copy_score);
  const name = o.product_name || o.sample_title || o.page_name || "Oferta";
  const metaUrl = buildAdsLibraryPageUrl(o.page_id, (group?.markets.includes(o.market) ? o.market : "LATAM") as AdMarket);

  return (
    <article className="card-surface rounded-2xl p-5 flex flex-col border border-primary/20 ad-card-hover">
      {/* Mercado + nicho */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-foreground bg-secondary/60 border border-border rounded-full px-2.5 py-1">
          {group?.flag ?? flagFor(o.market)} {group?.label ?? MARKET_NAME[o.market] ?? o.market}
          <span className="text-muted-foreground font-normal">· {flagFor(o.market)} {MARKET_NAME[o.market] ?? o.market}</span>
        </span>
        <span className={`text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1 ${copy.cls}`}>{copy.label}</span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {o.niche && <Tag>{NICHE_LABEL[o.niche] ?? o.niche}</Tag>}
        {o.offer_type && <Tag>{OFFER_TYPE_LABEL[o.offer_type] ?? o.offer_type}</Tag>}
        {o.price_hint && <Tag accent>{o.price_hint}</Tag>}
      </div>

      <h4 className="font-display font-semibold text-[17px] leading-snug text-foreground line-clamp-2">{name}</h4>
      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{o.page_name}</p>

      {o.mechanism && <p className="text-[13px] text-foreground/90 mt-3 leading-relaxed line-clamp-3">{o.mechanism}</p>}
      {o.why_wins && (
        <p className="text-[12px] text-muted-foreground mt-2 leading-relaxed line-clamp-3">
          <span className="text-primary font-semibold">Por qué gana:</span> {o.why_wins}
        </p>
      )}

      {/* La prueba con dinero real */}
      <div className="mt-4 pt-3 border-t border-border/60 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1 text-primary font-semibold"><Flame className="w-3 h-3" /> {o.days_active} días pagando</span>
        <span>{o.active_ads} anuncios activos</span>
        <span>Score {o.winner_score}</span>
        <span className="ml-auto font-semibold text-foreground">{scaleLabel(o)}</span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button onClick={onCopy} className="flex-1 btn-primary-nova py-2.5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5">
          <Zap className="w-3.5 h-3.5" /> Copiar este negocio <span className="opacity-70 text-[11px]">· {CREDIT_COSTS.gen_master_prompt}⚡</span>
        </button>
        <button
          onClick={() => openOfferAdsInRadar(o, onNavigate)}
          title="Ver todos sus anuncios en el radar"
          className="px-3 py-2.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
        >
          <Radar className="w-4 h-4" />
        </button>
        <a href={metaUrl} target="_blank" rel="noopener noreferrer" title="Ver en Meta Ads Library"
          className="px-3 py-2.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40">
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </article>
  );
}

function Tag({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span className={`text-[10px] font-semibold rounded-md px-2 py-0.5 ${accent ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
      {children}
    </span>
  );
}
