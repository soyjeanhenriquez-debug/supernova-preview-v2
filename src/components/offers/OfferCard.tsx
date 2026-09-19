import { Flame, CalendarDays, Heart, Zap, Eye } from "lucide-react";
import { AdMediaPreview } from "@/components/AdMediaPreview";
import { CREDIT_COSTS } from "@/hooks/useCredits";
import { Delta, type FollowedRow } from "@/components/dashboard/RoiHunterWidget";
import { type Offer, NICHE_LABEL, MARKET_NAME, flagFor, copyLabel, scaleLabel, winnerPct } from "@/lib/offers";

/**
 * Tarjeta de oferta. Orden de lectura de arriba abajo, el mismo en el que un
 * principiante decide: ¿qué es? → ¿hay dinero detrás? → ¿puedo copiarla? → abrir.
 * Todo lo demás (mecanismo, público, embudo, checkout, veredicto) vive en la
 * ficha: aquí solo lo que cabe de un vistazo en un teléfono.
 */
interface Props {
  o: Offer;
  following: boolean;
  onToggleFollow: () => void;
  onOpen: () => void;
  onCreate: () => void;
  insight?: FollowedRow;
}

export function OfferCard({ o, following, onToggleFollow, onOpen, onCreate, insight }: Props) {
  const copy = copyLabel(o.copy_score);
  const name = o.product_name || o.sample_title || o.page_name || "Oferta";
  const score = winnerPct(o);

  return (
    <article className="card-surface rounded-2xl overflow-hidden flex flex-col ad-card-hover">
      <div className="relative aspect-[16/10] bg-secondary/40 overflow-hidden">
        <AdMediaPreview fill adUrl={o.sample_ad_url ?? undefined} pageId={o.page_id} pageName={o.page_name ?? name} title={name} />
        <div className="absolute top-2.5 left-2.5 flex flex-col items-start gap-1.5 pointer-events-none">
          <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2.5 py-1 bg-primary text-primary-foreground shadow">🔥 {scaleLabel(o)}</span>
          {o.price_hint && <span className="text-[10.5px] font-bold rounded-full px-2.5 py-1 bg-background/85 backdrop-blur text-foreground border border-border">{o.price_hint}</span>}
        </div>
        {/* 44px: el mínimo cómodo para un dedo */}
        <button onClick={onToggleFollow}
          aria-label={following ? "Dejar de seguir" : "Seguir esta oferta"}
          title={following ? "Dejar de seguir" : `Seguir en el Cazador de ROI · ${CREDIT_COSTS.follow_offer} ⚡`}
          className={`absolute top-2 right-2 w-11 h-11 rounded-full backdrop-blur flex items-center justify-center border transition-colors ${following ? "bg-primary/90 border-primary text-primary-foreground" : "bg-background/70 border-border text-foreground hover:text-primary"}`}>
          <Heart className="w-[18px] h-[18px]" fill={following ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <button onClick={onOpen} className="text-left group">
          <h4 className="font-display font-semibold text-[16px] leading-snug text-foreground line-clamp-2 group-hover:text-primary transition-colors">{name}</h4>
          <p className="text-[11.5px] text-muted-foreground mt-0.5 truncate">{o.page_name}</p>
        </button>

        <div className="mt-3">
          <div className="flex items-center justify-between text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1.5">
            <span>Índice ganador</span><span className="text-success font-bold text-[12px] tabular-nums">{score}%</span>
          </div>
          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden" role="img" aria-label={`Índice ganador ${score} por ciento`}>
            <div className="h-full bg-success rounded-full" style={{ width: `${score}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <Metric icon={<Flame className="w-4 h-4 text-primary" />} value={o.active_ads.toLocaleString("es")} label="Anuncios activos" />
          <Metric icon={<CalendarDays className="w-4 h-4 text-muted-foreground" />} value={o.days_active.toLocaleString("es")} label="Días pagando" />
        </div>

        {insight && (
          <div className="mt-2 rounded-lg bg-secondary/40 px-3 py-2 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{insight.days_tracked > 0 ? `Últimos ${insight.days_tracked} días` : "Seguimiento desde hoy"}</span>
            <span className="flex items-center gap-3"><Delta value={insight.ads_delta} suffix="ads" /><Delta value={insight.score_delta} suffix="score" /></span>
          </div>
        )}

        <dl className="mt-3 space-y-1.5 text-[12px]">
          <Row label="País" value={`${flagFor(o.market)} ${MARKET_NAME[o.market] ?? o.market}`} />
          {o.niche && <Row label="Nicho" value={NICHE_LABEL[o.niche] ?? o.niche} />}
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Replicarla</dt>
            <dd><span className={`text-[10.5px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 ${copy.cls}`}>{copy.short}</span></dd>
          </div>
        </dl>

        <div className="mt-4 pt-3 border-t border-border/60 grid grid-cols-2 gap-2">
          <button onClick={onOpen} className="h-11 rounded-xl border border-border text-[13px] font-semibold text-foreground hover:border-primary/40 inline-flex items-center justify-center gap-1.5">
            <Eye className="w-4 h-4" /> Ver detalles
          </button>
          <button onClick={onCreate} className="h-11 btn-primary-nova rounded-xl text-[13px] font-semibold inline-flex items-center justify-center gap-1.5">
            <Zap className="w-4 h-4" /> Crear <span className="opacity-70 font-medium">· {CREDIT_COSTS.gen_master_prompt}⚡</span>
          </button>
        </div>
      </div>
    </article>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-xl bg-secondary/40 border border-border/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 font-display font-bold text-[20px] text-foreground tabular-nums leading-none">{icon}{value}</div>
      <div className="text-[10.5px] text-muted-foreground mt-1.5">{label}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-foreground font-medium truncate text-right">{value}</dd>
    </div>
  );
}
