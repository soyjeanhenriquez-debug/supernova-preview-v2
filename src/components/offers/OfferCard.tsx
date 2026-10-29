import { Flame, CalendarDays, Heart, Zap, Eye, Sparkles, Check } from "lucide-react";
import { AdMediaPreview } from "@/components/AdMediaPreview";
import { Pill } from "@/components/ui/pill";
import { CREDIT_COSTS } from "@/hooks/useCredits";
import { Delta, type FollowedRow } from "@/components/dashboard/RoiHunterWidget";
import { type Offer, NICHE_LABEL, CANAL_CORTO, flagFor, anunciosActivos, diasPagando } from "@/lib/offers";
import { type OfferWatch, type WatchPoint, describeEvent, daysAgo } from "@/lib/offerWatch";
import { LevelBars } from "@/components/offers/LevelBars";
import { idiomaDe, hacerloSolo } from "@/components/offers/offerUi";

/**
 * Tarjeta de oferta (rediseño 29-oct-2026, estilo Cazador Swipe pero con nuestra prueba de venta).
 * De arriba abajo, lo que un principiante mira para decidir en un segundo:
 *   imagen del anuncio → nivel en barras + idioma → nombre → días pagando anuncios y anuncios activos
 *   (cada número dice qué cuenta) → cómo vende, si lo haces tú solo y su precio → "Hacer mi versión".
 * Tocar la imagen o el nombre abre la ficha rápida; lo demás vive en la ficha completa.
 */
interface Props {
  o: Offer;
  following: boolean;
  onToggleFollow: () => void;
  onOpen: () => void;
  onCreate: () => void;
  /** "Crear con esta idea": abre la hoja de crear (creativos, video…) con esta oferta como semilla. */
  onCreateIdea?: () => void;
  insight?: FollowedRow;
  /** Vigilancia diaria (solo en "Siguiendo"): conteo en vivo de Meta, historia y alertas. */
  watch?: OfferWatch;
}

export function OfferCard({ o, following, onToggleFollow, onOpen, onCreate, onCreateIdea, insight, watch }: Props) {
  const name = o.product_name || o.sample_title || o.page_name || "Oferta";
  const act = anunciosActivos(o);
  const idioma = idiomaDe(o.language);
  const solo = hacerloSolo(o.copy_score);
  const sub = [o.page_name, o.niche ? (NICHE_LABEL[o.niche] ?? o.niche) : null].filter(Boolean).join(" · ");

  return (
    <article className="card-surface rounded-2xl overflow-hidden flex flex-col ad-card-hover relative">
      {/* La imagen abre la ficha rápida, salvo el enlace «Original» que lleva dentro. */}
      <div
        className="relative aspect-[4/3] bg-secondary/40 overflow-hidden cursor-pointer"
        onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) onOpen(); }}
      >
        <AdMediaPreview fill coverUrl={o.cover_url} adUrl={o.sample_ad_url ?? undefined} pageId={o.page_id} pageName={o.page_name ?? name} title={name} />
      </div>
      {/* 44px: el mínimo cómodo para un dedo. Seguir cobra: el precio se ve también en el teléfono (sin hover). */}
      <button onClick={onToggleFollow}
        aria-label={following ? "Dejar de seguir" : `Seguir esta oferta · ${CREDIT_COSTS.follow_offer} créditos`}
        title={following ? "Dejar de seguir" : `Seguir esta oferta: te avisamos si crece o se apaga · ${CREDIT_COSTS.follow_offer} créditos`}
        className={`absolute top-2 right-2 z-10 w-11 h-11 rounded-full backdrop-blur flex flex-col items-center justify-center border transition-colors ${following ? "bg-primary/90 border-primary text-primary-foreground" : "bg-background/70 border-border text-foreground hover:text-primary"}`}>
        <Heart className={following ? "w-[18px] h-[18px]" : "w-4 h-4"} fill={following ? "currentColor" : "none"} />
        {!following && <span aria-hidden className="text-[9px] font-bold leading-none mt-0.5 tabular-nums">{CREDIT_COSTS.follow_offer}⚡</span>}
      </button>

      <div className="px-4 pt-3.5 flex flex-col flex-1">
        <button onClick={onOpen} className="text-left group" aria-label={`Ver ${name} de un vistazo`}>
          <div className="flex items-center justify-between gap-3">
            <LevelBars o={o} />
            <span className="text-[11.5px] text-muted-foreground shrink-0 whitespace-nowrap">{flagFor(o.market)}{idioma ? ` ${idioma}` : ""}</span>
          </div>
          <h4 className="font-display font-semibold text-[17px] leading-snug text-foreground line-clamp-2 mt-2 group-hover:text-primary transition-colors">{name}</h4>
          {sub && <p className="text-[12px] text-muted-foreground mt-0.5 truncate">{sub}</p>}

          {/* La prueba de venta primero: días pagando anuncios. Luego cuántos anuncios, diciendo de dónde sale el número. */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Metric icon={<CalendarDays className="w-4 h-4 text-primary" />} value={diasPagando(o)} label="días pagando anuncios" />
            <Metric icon={<Flame className="w-4 h-4 text-muted-foreground" />} value={act.texto} label={act.vivo ? "anuncios activos hoy en Meta" : "anuncios activos que vimos"} />
          </div>

          <div className="flex flex-wrap gap-1.5 mt-3">
            <Pill>{o.canal ? CANAL_CORTO[o.canal] : "Cómo vende: sin revisar"}</Pill>
            {solo && <Pill tone={solo.solo ? "success" : "neutral"} icon={solo.solo ? <Check /> : undefined}>{solo.texto}</Pill>}
            {o.price_hint && <Pill>Precio: {o.price_hint}</Pill>}
          </div>
        </button>

        {insight && !watch && (
          <div className="mt-3 rounded-lg bg-secondary/40 px-3 py-2 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{insight.days_tracked > 0 ? `Últimos ${insight.days_tracked} días` : "Seguimiento desde hoy"}</span>
            <span className="flex items-center gap-3"><Delta value={insight.ads_delta} suffix="anuncios" /><Delta value={insight.score_delta} suffix="puntos" /></span>
          </div>
        )}
        {watch && <WatchPanel w={watch} />}

        {/* Apiladas: "Hacer mi versión · 50 créditos" no cabe a media tarjeta en 2-3 columnas. */}
        <div className="mt-auto pt-4 pb-4">
          <div className="pt-3 border-t border-border/60 flex flex-col gap-2">
            <button onClick={onCreate} className="h-11 btn-primary-nova rounded-xl text-[13px] font-semibold inline-flex items-center justify-center gap-1.5">
              <Zap className="w-4 h-4" /> Hacer mi versión <span className="opacity-70 font-medium">· {CREDIT_COSTS.gen_master_prompt} créditos</span>
            </button>
            <div className={onCreateIdea ? "grid grid-cols-2 gap-2" : "grid"}>
              <button onClick={onOpen} className="h-10 rounded-xl border border-border text-[13px] font-semibold text-foreground hover:border-foreground/40 inline-flex items-center justify-center gap-1.5 min-w-0">
                <Eye className="w-4 h-4 shrink-0" /> <span className="truncate">{onCreateIdea ? "Ver ficha" : "Ver ficha rápida"}</span>
              </button>
              {onCreateIdea && (
                <button onClick={onCreateIdea} className="h-10 rounded-xl border border-border text-[13px] font-semibold text-foreground hover:border-foreground/40 inline-flex items-center justify-center gap-1.5 min-w-0">
                  <Sparkles className="w-4 h-4 shrink-0" /> <span className="truncate">Crear anuncios</span>
                </button>
              )}
            </div>
          </div>
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
    <div className="rounded-xl bg-secondary/40 border border-border/60 px-3 py-2.5 min-w-0">
      <div className="flex items-center gap-1.5 font-display font-bold text-[20px] text-foreground tabular-nums leading-none">{icon}{value}</div>
      <div className="text-[10.5px] text-muted-foreground mt-1.5 leading-tight">{label}</div>
    </div>
  );
}
