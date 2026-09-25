import { Flame, CalendarDays, Heart, Zap, Eye } from "lucide-react";
import { AdMediaPreview } from "@/components/AdMediaPreview";
import { CREDIT_COSTS } from "@/hooks/useCredits";
import { Delta, type FollowedRow } from "@/components/dashboard/RoiHunterWidget";
import { type Offer, NICHE_LABEL, MARKET_NAME, flagFor, copyLabel, scaleLabel, winnerPct } from "@/lib/offers";
import { type OfferWatch, type WatchPoint, describeEvent, daysAgo } from "@/lib/offerWatch";

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
  /** Vigilancia diaria (solo en "Siguiendo"): conteo en vivo de Meta, historia y alertas. */
  watch?: OfferWatch;
}

export function OfferCard({ o, following, onToggleFollow, onOpen, onCreate, insight, watch }: Props) {
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
          aria-label={following ? "Dejar de seguir" : `Seguir esta oferta · ${CREDIT_COSTS.follow_offer} créditos`}
          title={following ? "Dejar de seguir" : `Seguir esta oferta · ${CREDIT_COSTS.follow_offer} créditos`}
          className={`absolute top-2 right-2 w-11 h-11 rounded-full backdrop-blur flex flex-col items-center justify-center border transition-colors ${following ? "bg-primary/90 border-primary text-primary-foreground" : "bg-background/70 border-border text-foreground hover:text-primary"}`}>
          <Heart className={following ? "w-[18px] h-[18px]" : "w-4 h-4"} fill={following ? "currentColor" : "none"} />
          {/* Seguir cobra: el precio se ve también en el teléfono (sin hover). */}
          {!following && <span aria-hidden className="text-[9px] font-bold leading-none mt-0.5 tabular-nums">{CREDIT_COSTS.follow_offer}⚡</span>}
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
          <Metric icon={<Flame className="w-4 h-4 text-primary" />} value={o.active_ads.toLocaleString("es")} label="anuncios activos ahora" />
          <Metric icon={<CalendarDays className="w-4 h-4 text-muted-foreground" />} value={o.days_active.toLocaleString("es")} label="días pagando anuncios" />
        </div>

        {insight && !watch && (
          <div className="mt-2 rounded-lg bg-secondary/40 px-3 py-2 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{insight.days_tracked > 0 ? `Últimos ${insight.days_tracked} días` : "Seguimiento desde hoy"}</span>
            <span className="flex items-center gap-3"><Delta value={insight.ads_delta} suffix="ads" /><Delta value={insight.score_delta} suffix="score" /></span>
          </div>
        )}
        {watch && <WatchPanel w={watch} />}

        <dl className="mt-3 space-y-1.5 text-[12px]">
          {/* market = país pedido en ad_reached_countries a la Biblioteca de Anuncios de Meta
              (bulk-seed-ads): dónde se MUESTRAN los anuncios, no de dónde es el anunciante. */}
          <Row label="Se anuncia en" value={`${flagFor(o.market)} ${MARKET_NAME[o.market] ?? o.market}`} />
          {o.niche && <Row label="Nicho" value={NICHE_LABEL[o.niche] ?? o.niche} />}
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Replicarla</dt>
            <dd><span className={`text-[10.5px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 ${copy.cls}`}>{copy.short}</span></dd>
          </div>
        </dl>

        {/* Apiladas: "Hacer mi versión · 50 créditos" no cabe a media tarjeta en 2-3 columnas. */}
        <div className="mt-4 pt-3 border-t border-border/60 flex flex-col gap-2">
          <button onClick={onCreate} className="h-11 btn-primary-nova rounded-xl text-[13px] font-semibold inline-flex items-center justify-center gap-1.5">
            <Zap className="w-4 h-4" /> Hacer mi versión <span className="opacity-70 font-medium">· {CREDIT_COSTS.gen_master_prompt} créditos</span>
          </button>
          <button onClick={onOpen} className="h-10 rounded-xl border border-border text-[13px] font-semibold text-foreground hover:border-primary/40 inline-flex items-center justify-center gap-1.5">
            <Eye className="w-4 h-4" /> Ver detalles
          </button>
        </div>
      </div>
    </article>
  );
}

/**
 * Vigilancia: anuncios activos HOY según la Biblioteca de Meta (revisión diaria), su curva
 * y las últimas alertas. Antes de la primera revisión dice cuándo llega, sin inventar nada.
 */
function WatchPanel({ w }: { w: OfferWatch }) {
  const live = w.live_active_ads;
  const last = w.events.slice(0, 3);
  return (
    <div className="mt-2 rounded-lg bg-secondary/40 border border-border/60 px-3 py-2.5 text-[11.5px]">
      {w.checked_on == null ? (
        <p className="text-muted-foreground">Vigilancia activa: la primera revisión en Meta llega en las próximas 24 horas.</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-foreground font-semibold tabular-nums">
                {live == null ? "No se pudo leer hoy" : `${w.live_capped ? "Más de " : ""}${live.toLocaleString("es")} anuncios activos hoy`}
              </div>
              <div className="text-[10.5px] text-muted-foreground">Revisado en Meta {daysAgo(w.checked_on)}</div>
            </div>
            {w.history.length >= 2 && <Sparkline points={w.history} />}
          </div>
          {last.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {last.map((e, i) => {
                const { text, tone } = describeEvent(e);
                const dot = tone === "good" ? "bg-success" : tone === "bad" ? "bg-destructive" : "bg-muted-foreground";
                return (
                  <li key={`${e.kind}-${e.on}-${i}`} className="flex items-start gap-2">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} aria-hidden />
                    <span className="text-foreground/90">{text} <span className="text-muted-foreground">· {daysAgo(e.on)}</span></span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-1.5 text-muted-foreground">Sin cambios desde que la sigues.</p>
          )}
        </>
      )}
    </div>
  );
}

function Sparkline({ points }: { points: WatchPoint[] }) {
  const W = 84, H = 26, P = 2;
  const ns = points.map((p) => p.n);
  const max = Math.max(...ns), min = Math.min(...ns);
  const span = Math.max(1, max - min);
  const step = (W - P * 2) / Math.max(1, points.length - 1);
  const d = points.map((p, i) => `${i ? "L" : "M"}${(P + i * step).toFixed(1)},${(H - P - ((p.n - min) / span) * (H - P * 2)).toFixed(1)}`).join(" ");
  const first = ns[0], lastN = ns[ns.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0"
      role="img" aria-label={`Anuncios activos: de ${first} a ${lastN} en ${points.length} revisiones`}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
        className={lastN > first ? "text-success" : lastN < first ? "text-destructive" : "text-muted-foreground"} />
    </svg>
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
