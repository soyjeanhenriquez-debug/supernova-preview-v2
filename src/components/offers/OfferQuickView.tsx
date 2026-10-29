import { X, Heart, Zap, ArrowRight, CalendarDays, Flame, BadgeDollarSign, Check, ExternalLink } from "lucide-react";
import { ModalPortal } from "@/components/ModalPortal";
import { AdMediaPreview } from "@/components/AdMediaPreview";
import { CREDIT_COSTS } from "@/hooks/useCredits";
import { type Offer, NICHE_LABEL, MARKET_NAME, CANAL_LABEL, enlaceCanal, flagFor, anunciosActivos, diasPagando } from "@/lib/offers";
import { LevelBars } from "@/components/offers/LevelBars";
import { nivelOferta, idiomaDe, hacerloSolo } from "@/components/offers/offerUi";

/**
 * Ficha rápida (29-oct-2026): lo que se abre al tocar una tarjeta. En el teléfono sube desde abajo; en la
 * computadora se centra. Solo hechos que ya tenemos (sin esperar a la IA): nivel, días pagando anuncios,
 * anuncios activos, precio, cómo vende y si lo haces tú solo. Para el análisis completo: "Ver oferta completa".
 */
interface Props {
  offer: Offer;
  following: boolean;
  onToggleFollow: () => void;
  onCreate: () => void;
  onFull: () => void;
  onClose: () => void;
}

export function OfferQuickView({ offer: o, following, onToggleFollow, onCreate, onFull, onClose }: Props) {
  const name = o.product_name || o.sample_title || o.page_name || "Oferta";
  const act = anunciosActivos(o);
  const nivel = nivelOferta(o);
  const solo = hacerloSolo(o.copy_score);
  const idioma = idiomaDe(o.language);
  const link = enlaceCanal(o);

  return (
    <ModalPortal onClose={onClose}>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
        <div role="dialog" aria-modal="true" aria-label={name} onClick={(e) => e.stopPropagation()}
          className="bg-card border border-border w-full sm:max-w-lg max-h-[92vh] supports-[height:100dvh]:max-h-[92dvh] rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl">
          <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0" aria-hidden><span className="w-10 h-1 rounded-full bg-border" /></div>

          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="px-4 sm:px-5 pt-2 sm:pt-5">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-secondary/40 border border-border">
                <AdMediaPreview fill fit="contain" coverUrl={o.cover_url} adUrl={o.sample_ad_url ?? undefined} pageId={o.page_id} pageName={o.page_name ?? name} title={name} />
                <button onClick={onClose} aria-label="Cerrar"
                  className="absolute top-2 right-2 z-20 w-10 h-10 rounded-full bg-background/80 backdrop-blur border border-border flex items-center justify-center text-foreground hover:bg-secondary">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-4 sm:px-5 pt-4 pb-5 space-y-4">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <LevelBars o={o} size="lg" />
                  <span className="text-[12px] text-muted-foreground shrink-0">{flagFor(o.market)}{idioma ? ` ${idioma}` : ""}</span>
                </div>
                <p className="text-[11.5px] text-muted-foreground mt-1">Nivel {nivel.label.toLowerCase()}: {nivel.regla}.</p>
                <h3 className="font-display font-semibold text-[20px] leading-snug text-foreground mt-3">{name}</h3>
                {o.page_name && o.page_name !== name && <p className="text-[12.5px] text-muted-foreground truncate mt-0.5">{o.page_name}</p>}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Kpi icon={<CalendarDays className="w-4 h-4 text-primary" />} value={diasPagando(o)} label="días pagando anuncios" />
                <Kpi icon={<Flame className="w-4 h-4 text-muted-foreground" />} value={act.texto} label={act.vivo ? "anuncios activos hoy en Meta" : "anuncios activos que vimos"} />
                <Kpi icon={<BadgeDollarSign className="w-4 h-4 text-muted-foreground" />} value={o.price_hint ?? "—"}
                  label={o.price_hint ? "precio que cobra (en su moneda)" : "precio: lo buscamos en la ficha completa"} small />
                <Kpi icon={solo?.solo ? <Check className="w-4 h-4 text-success" /> : null} value={solo?.texto ?? "Sin evaluar"} label="hacer tu versión" small />
              </div>

              <dl className="rounded-2xl border border-border divide-y divide-border/70 text-[13px]">
                <Row label="Vende por">
                  <span className="font-medium text-foreground">{o.canal ? CANAL_LABEL[o.canal] : "Sin revisar todavía"}</span>
                  {link && (
                    <a href={link.href} target="_blank" rel="noopener noreferrer" className="mt-0.5 flex items-center justify-end gap-1 text-[12px] text-primary hover:underline">
                      <ExternalLink className="w-3 h-3 shrink-0" /><span className="truncate">{link.texto}</span>
                    </a>
                  )}
                </Row>
                {/* market = país pedido a la Biblioteca de Anuncios de Meta: dónde se MUESTRAN los anuncios. */}
                <Row label="Se anuncia en"><span className="font-medium text-foreground">{flagFor(o.market)} {MARKET_NAME[o.market] ?? o.market}</span></Row>
                {o.niche && <Row label="Tema"><span className="font-medium text-foreground">{NICHE_LABEL[o.niche] ?? o.niche}</span></Row>}
                {(o.checkout ?? o.offer_platform?.platform) && <Row label="Cobra con"><span className="font-medium text-foreground">{o.checkout ?? o.offer_platform?.platform}</span></Row>}
              </dl>

              {o.why_wins && (
                <div className="rounded-2xl bg-secondary/30 border border-border/60 p-3.5">
                  <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Por qué le funciona</h4>
                  <p className="text-[13px] text-foreground/90 leading-relaxed mt-1.5 line-clamp-4">{o.why_wins}</p>
                </div>
              )}
            </div>
          </div>

          <footer className="shrink-0 border-t border-border bg-card/95 backdrop-blur px-4 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2">
            <button onClick={onCreate} className="w-full h-12 btn-primary-nova rounded-xl text-[14px] font-semibold flex items-center justify-center gap-2">
              <Zap className="w-4 h-4" /> Hacer mi versión <span className="opacity-70 font-medium">· {CREDIT_COSTS.gen_master_prompt} créditos</span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={onToggleFollow}
                title={following ? "Dejar de seguir" : `Te avisamos si crece o se apaga · ${CREDIT_COSTS.follow_offer} créditos`}
                className={`h-11 rounded-xl border text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 min-w-0 transition-colors ${following ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-foreground hover:border-foreground/40"}`}>
                <Heart className="w-4 h-4 shrink-0" fill={following ? "currentColor" : "none"} />
                <span className="truncate">{following ? "Siguiendo" : <>Seguir <span className="opacity-70 font-medium">· {CREDIT_COSTS.follow_offer} créditos</span></>}</span>
              </button>
              <button onClick={onFull}
                className="h-11 rounded-xl border border-border text-[13px] font-semibold text-foreground hover:border-foreground/40 inline-flex items-center justify-center gap-1.5 min-w-0">
                <span className="truncate">Ver oferta completa</span> <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}

function Kpi({ icon, value, label, small }: { icon: React.ReactNode; value: string; label: string; small?: boolean }) {
  return (
    <div className="rounded-xl bg-secondary/40 border border-border/60 px-3 py-2.5 min-w-0">
      <div className={`flex items-center gap-1.5 font-display font-bold text-foreground tabular-nums leading-tight ${small ? "text-[15px]" : "text-[22px] leading-none"}`}>
        {icon}<span className="truncate">{value}</span>
      </div>
      <div className="text-[11px] text-muted-foreground mt-1.5 leading-tight">{label}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3.5 py-2.5">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-right min-w-0">{children}</dd>
    </div>
  );
}
