import { useState } from "react";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { useJourney } from "@/contexts/JourneyContext";
import { useProducts } from "@/contexts/ProductContext";
import { STAGES, stageHint } from "@/lib/journey";

/**
 * Barra de etapa: arriba de TODAS las pantallas (menos el Inicio, que ya muestra el recorrido
 * completo). Dice en qué etapa estás y cuál es tu siguiente paso, sin bloquear nada: quien se
 * adelanta puede seguir trabajando; solo se le recuerda lo que falta.
 * En teléfono es una sola línea; al tocarla se abren las 6 etapas.
 */
export function StageBar({ page, onNavigate }: { page: string; onNavigate: (p: string) => void }) {
  const { loaded, done, doneCount, next } = useJourney();
  const { active } = useProducts();
  const [open, setOpen] = useState(false);
  if (!loaded) return null;

  const hint = stageHint(page, done, next);
  const here = hint.stage ?? next ?? 6;   // la etapa que se resalta
  const nextStage = next ? STAGES[next - 1] : null;
  const go = (p: string) => { setOpen(false); onNavigate(p); };

  const message = (() => {
    switch (hint.kind) {
      case "all_done": return { text: "Completaste las 6 etapas. Escala lo que gana.", mobile: "", cta: null };
      case "current": return { text: `Estás en tu etapa actual: ${STAGES[here - 1].title.toLowerCase()}`, mobile: "", cta: null };
      case "done": return { text: "Esta etapa está lista", mobile: "Siguiente", cta: nextStage };
      case "ahead": return { text: "Aún te falta", mobile: "Aún te falta", cta: nextStage };
      default: return { text: "Tu siguiente paso", mobile: "Tu siguiente paso", cta: nextStage };
    }
  })();

  const segments = (
    <ol className="flex items-center gap-1" aria-label={`Etapas de tu negocio: ${doneCount} de 6 listas`}>
      {STAGES.map(s => {
        const isDone = done[s.n - 1];
        const isHere = s.n === here;
        return (
          <li key={s.n} className="flex-1 min-w-0">
            <button onClick={() => go(s.page)} title={`${s.n} · ${s.title}${isDone ? ` · ${s.doneNote}` : ""}`}
              aria-current={isHere ? "step" : undefined}
              className="w-full group flex flex-col gap-1 text-left">
              <span className={`h-1.5 rounded-full transition-colors ${isHere ? "bg-primary" : isDone ? "bg-emerald-500" : "bg-secondary group-hover:bg-foreground/20"}`} />
              <span className={`hidden md:flex items-center gap-1 text-[10.5px] leading-none truncate ${isHere ? "text-primary font-semibold" : isDone ? "text-emerald-400" : "text-muted-foreground"}`}>
                {isDone && <Check className="w-3 h-3 shrink-0" />}{s.n} · {s.short}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  return (
    <div className="border-b border-border/60 bg-background/80 backdrop-blur px-4 md:px-6 lg:px-8 py-2.5">
      {/* Escritorio: segmentos con nombre + mensaje a la derecha */}
      <div className="hidden md:flex items-center gap-5">
        <p className="text-[11px] text-muted-foreground shrink-0 max-w-[180px] truncate" title={active?.name}>
          {active?.name ? <><span className="text-foreground font-medium">{active.name}</span> · </> : null}{doneCount} de 6
        </p>
        <div className="flex-1 min-w-0">{segments}</div>
        <div className="shrink-0 flex items-center gap-3 text-[12px]">
          <span className={hint.kind === "done" ? "text-emerald-400 flex items-center gap-1" : "text-muted-foreground"}>
            {hint.kind === "done" && <Check className="w-3.5 h-3.5" />}{message.text}
          </span>
          {message.cta && (
            <button onClick={() => go(message.cta!.page)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 text-primary px-3 py-1.5 font-semibold hover:bg-primary/15">
              {message.cta.n} · {message.cta.short} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Teléfono: una línea que abre las 6 etapas */}
      <div className="md:hidden">
        <button onClick={() => setOpen(o => !o)} aria-expanded={open}
          className="w-full flex items-center gap-2 text-left">
          <span className="text-[12px] font-semibold text-primary shrink-0">Etapa {here} de 6 · {STAGES[here - 1].short}</span>
          {hint.kind === "done" && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
          <span className="flex-1" />
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <div className="mt-2">{segments}</div>
        {open && (
          <ul className="mt-3 space-y-1">
            {STAGES.map(s => {
              const isDone = done[s.n - 1];
              const isNext = s.n === next;
              return (
                <li key={s.n}>
                  <button onClick={() => go(s.page)}
                    className={`w-full min-h-[44px] rounded-lg px-3 flex items-center gap-3 text-left text-[13px] ${isNext ? "bg-primary/10 text-primary" : "text-foreground hover:bg-secondary/60"}`}>
                    <span className={`w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${isDone ? "bg-emerald-500 text-white" : isNext ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                      {isDone ? <Check className="w-3.5 h-3.5" /> : s.n}
                    </span>
                    <span className="flex-1">{s.title}</span>
                    {isNext && <span className="text-[11px] font-semibold">Siguiente</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!open && message.cta && (
          <button onClick={() => go(message.cta!.page)}
            className="mt-2 w-full min-h-[40px] inline-flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/10 text-primary px-3 text-[12.5px] font-semibold">
            <span className="truncate">{message.mobile}: {message.cta.n} · {message.cta.short}</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Al final de una herramienta cuya etapa ya está lista: el siguiente paso a un clic, sin tener
 * que volver al Inicio a buscarlo.
 */
export function NextStepCard({ page, onNavigate }: { page: string; onNavigate: (p: string) => void }) {
  const { loaded, done, next } = useJourney();
  if (!loaded) return null;
  const hint = stageHint(page, done, next);
  if (hint.kind !== "done" || !next || hint.stage === null) return null;
  const doneStage = STAGES[hint.stage - 1];
  const nextStage = STAGES[next - 1];
  return (
    <div className="mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-emerald-400 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Etapa {doneStage.n} lista: {doneStage.doneNote.toLowerCase()}</p>
        <p className="font-display font-semibold text-foreground text-lg mt-0.5">Siguiente: {nextStage.title.toLowerCase()}</p>
      </div>
      <button onClick={() => onNavigate(nextStage.page)}
        className="inline-flex items-center justify-center gap-2 rounded-xl gradient-brand px-5 py-3 text-sm font-semibold text-primary-foreground shrink-0">
        Ir a la etapa {nextStage.n} <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
