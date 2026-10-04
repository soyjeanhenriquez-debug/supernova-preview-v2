import { useEffect, useMemo } from "react";
import { X, Sparkles, Flame, Quote, ArrowRight, Lock } from "lucide-react";
import { toast } from "sonner";
import { ModalPortal } from "@/components/ModalPortal";
import { useCredits } from "@/hooks/useCredits";
import { useVitrina } from "@/contexts/VitrinaContext";
import { track } from "@/lib/analytics";
import { setSeed, TARGET_SLUG, type SeedTarget } from "@/lib/creativeSeed";
import {
  recommendTarget, alternativesFor, targetInfo, fmtNum, DEFAULT_ASPECT, type IdeaDraft, type RecInput,
} from "@/lib/recommendTarget";

/**
 * "Crear con esta idea" (gratis abrirla): de una idea real (anuncio del Radar, oferta, video de
 * Nichos o idea de side hustle) al estudio en 1 toque.
 *
 *  · Primero las piezas que se pueden crear (la recomendada marcada); al final, "¿No sabes cuál elegir?" con la recomendación de la IA, su porqué y su costo en el botón.
 *    Ese toque ES el pedido explícito: la semilla viaja con `autostart` y el estudio genera al llegar
 *    (quien cobra es el servidor, antes de gastar, y devuelve si la IA falla).
 *  · Debajo, 3 alternativas, cada una con su costo.
 *  · "Solo abrir, sin crear": pone la semilla sin `autostart` (no gasta nada).
 *
 * El texto del anuncio o del video viaja como REFERENCIA ("escribe otro con la misma idea"), nunca
 * para copiarlo. Hoja desde abajo en el teléfono (zona del pulgar), modal centrado en escritorio.
 */
interface Props {
  idea: IdeaDraft;
  /** De dónde viene la idea y lo que sabemos de ella (para recomendar la pieza). */
  input: RecInput;
  onClose: () => void;
}

export function CreateFromIdeaSheet({ idea, input, onClose }: Props) {
  const { balance } = useCredits();
  const { locked, openPlans } = useVitrina();
  const rec = useMemo(() => recommendTarget(input), [input]);
  const alts = useMemo(() => alternativesFor(rec.target, idea.source), [rec.target, idea.source]);
  const main = targetInfo(rec.target);

  useEffect(() => { track("idea_sheet_open", { source: idea.source }); }, [idea.source]);

  const go = (target: SeedTarget, autostart: boolean) => {
    if (locked) { openPlans("Crear con esta idea"); return; }
    const info = targetInfo(target);
    if (autostart && balance < info.credits) {
      toast.error(`Te faltan créditos: esto usa ${fmtNum(info.credits)} y te quedan ${fmtNum(balance)}.`, {
        action: { label: "Ver créditos", onClick: () => { window.location.hash = "#/creditos"; } },
      });
      return;
    }
    track("idea_create_click", { source: idea.source, target, autostart });
    setSeed({
      ...idea,
      target,
      // El formato que eligió la IA vale para la recomendada; las otras usan el suyo.
      aspect: target === rec.target ? rec.aspect : (target === "youtube" && idea.aspect ? idea.aspect : DEFAULT_ASPECT[target]),
      autostart,
    });
    onClose();
    window.location.hash = `#/${TARGET_SLUG[target]}`;
    window.scrollTo({ top: 0 });
  };

  return (
    <ModalPortal onClose={onClose}>
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
        <div
          role="dialog" aria-modal="true" aria-label="Crear con esta idea"
          onClick={(e) => e.stopPropagation()}
          className="bg-card border border-border w-full sm:max-w-lg max-h-[92vh] supports-[height:100dvh]:max-h-[92dvh] rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        >
          <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0" aria-hidden><span className="w-10 h-1 rounded-full bg-border" /></div>

          <header className="px-4 sm:px-6 pt-2 sm:pt-5 pb-3 flex items-start gap-3 shrink-0">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Crear con esta idea</p>
              <h3 className="font-display font-semibold text-[18px] leading-snug text-foreground mt-1 line-clamp-2 break-words">{idea.title}</h3>
              {idea.evidence && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-[12px] text-foreground">
                  <Flame className="w-3.5 h-3.5 text-primary shrink-0" /> <span className="truncate">{idea.evidence}</span>
                </p>
              )}
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="shrink-0 -mr-1 w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary">
              <X className="w-5 h-5" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 pb-4 space-y-4">
            {idea.hook && (
              <div className="rounded-xl border border-border/70 bg-secondary/20 px-3.5 py-3">
                <p className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground font-semibold flex items-center gap-1.5">
                  <Quote className="w-3.5 h-3.5" /> Gancho de referencia
                </p>
                <p className="text-[13px] text-foreground/80 mt-1.5 line-clamp-2 break-words">«{idea.hook}»</p>
                <p className="text-[11px] text-muted-foreground mt-1.5">La IA escribe uno nuevo con la misma idea. Nunca copia este texto.</p>
              </div>
            )}

            {/* Primero, lo que puedes crear (la recomendada va primera y marcada). La recomendación de
                la IA, con su porqué y el botón principal, queda al final: para quien no sabe cuál elegir. */}
            <section>
              <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-2">¿Qué quieres crear?</p>
              <ul className="space-y-2">
                {[rec.target, ...alts].map((t) => {
                  const info = targetInfo(t);
                  return (
                    <li key={t}>
                      <button onClick={() => go(t, true)}
                        className="w-full min-h-[48px] rounded-xl border border-border px-3.5 py-2.5 text-left flex items-center gap-3 hover:border-foreground/30 transition-colors">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] font-semibold text-foreground">
                            {info.label}
                            {t === rec.target && <span className="ml-2 text-[10.5px] font-semibold text-primary">Recomendada</span>}
                          </span>
                          <span className="block text-[11.5px] text-muted-foreground truncate">{info.detail}</span>
                        </span>
                        <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">{locked ? <Lock className="w-3.5 h-3.5" /> : info.costLabel}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Si no sabe cuál elegir: la IA le recomienda una, con su porqué y su costo en el botón. */}
            <section className="rounded-2xl border border-primary/40 bg-primary/5 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> ¿No sabes cuál elegir?
              </p>
              <div className="mt-2 font-display font-semibold text-[16px] text-foreground">Te recomendamos: {main.label} <span className="text-muted-foreground font-normal text-[13px]">· {rec.aspect}</span></div>
              <p className="text-[13px] text-foreground/90 mt-1.5 leading-relaxed">{rec.reason}</p>
              <button onClick={() => go(rec.target, true)}
                className="mt-3 w-full h-12 btn-primary-nova rounded-xl text-[14px] font-semibold inline-flex items-center justify-center gap-2">
                {locked ? <Lock className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                {locked ? "Activa tu plan para crear" : <>Crear {main.label.toLowerCase()} <span className="opacity-75 font-medium">· {main.costLabel}</span></>}
              </button>
            </section>
          </div>

          <footer className="shrink-0 border-t border-border px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-3">
            <span className="text-[12px] text-muted-foreground tabular-nums">{locked ? "Mirar es gratis" : `Te quedan ${fmtNum(balance)} créditos`}</span>
            <button onClick={() => go(rec.target, false)} className="h-10 px-2 text-[12.5px] font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              Solo abrir, sin crear <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}
