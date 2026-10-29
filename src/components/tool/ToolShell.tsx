import { useEffect, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronRight } from "lucide-react";
import { ProductSwitcher } from "@/components/ProductSwitcher";
import { useVia } from "@/lib/tools";
import { toolEvent } from "@/lib/toolEvents";
import { AgenteFirma } from "@/components/agentes/AgenteFirma";
import type { AgenteId } from "@/lib/agentes";

/**
 * Esqueleto común de una herramienta (Fase 1 de la organización, 16-oct-2026, estilo Higgsfield):
 *  · arriba: "Volver", dónde estás (migas) y para qué producto trabajas (se cambia ahí mismo);
 *  · los pasos 1 · 2 · 3 con el actual marcado;
 *  · en la computadora, opciones a la izquierda (`aside`) y resultado a la derecha (`children`);
 *    en el teléfono, uno debajo del otro.
 */
export type Crumb = { label: string; onClick?: () => void };

export function ToolShell({ crumbs, title, line, onBack, backLabel = "Volver", steps, step = 0, onStep, aside, children, onNavigate, previewFirst, toolId, agente }: {
  crumbs: Crumb[];
  title: string;
  line?: string;
  onBack?: () => void;
  backLabel?: string;
  steps?: string[];
  /** Paso actual, desde 0. */
  step?: number;
  /** Tocar un paso ya hecho para volver a él. */
  onStep?: (i: number) => void;
  aside?: ReactNode;
  children: ReactNode;
  onNavigate: (page: string) => void;
  /** En el teléfono, el resultado (`children`, p. ej. la vista previa del video) va arriba de las opciones. */
  previewFirst?: boolean;
  /** Id corto de la herramienta (p. ej. "reel-studio") para medir "abrir" (src/lib/toolEvents.ts). */
  toolId?: string;
  /** El agente del equipo que atiende esta herramienta (src/lib/agentes.ts): va encima del título. */
  agente?: AgenteId;
}) {
  useEffect(() => { if (toolId) toolEvent(toolId, "abrir"); }, [toolId]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {onBack && (
          <button type="button" onClick={onBack}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-border px-3 text-[12px] text-foreground hover:bg-secondary/60">
            <ArrowLeft className="w-3.5 h-3.5" /> {backLabel}
          </button>
        )}
        <nav aria-label="Estás aquí" className="flex min-w-0 flex-wrap items-center gap-1 text-[12px] text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={c.label} className="inline-flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3 opacity-60" />}
              {c.onClick && i < crumbs.length - 1
                ? <button type="button" onClick={c.onClick} className="hover:text-foreground hover:underline">{c.label}</button>
                : <span className={i === crumbs.length - 1 ? "text-foreground" : ""} aria-current={i === crumbs.length - 1 ? "page" : undefined}>{c.label}</span>}
            </span>
          ))}
        </nav>
        <div className="ml-auto hidden lg:block"><ToolContext onNavigate={onNavigate} /></div>
      </div>

      <div>
        {agente && <AgenteFirma agente={agente} className="mb-1" />}
        <h1 className="font-display font-bold text-[22px] sm:text-2xl leading-tight text-foreground">{title}</h1>
        {line && <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{line}</p>}
      </div>

      {steps && steps.length > 1 && <Steps steps={steps} step={step} onStep={onStep} />}

      {aside ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] items-start">
          <aside className={`space-y-4 lg:sticky lg:top-20 ${previewFirst ? "order-2 lg:order-1" : ""}`}>{aside}</aside>
          <section className={`min-w-0 space-y-4 ${previewFirst ? "order-1 lg:order-2" : ""}`}>{children}</section>
        </div>
      ) : <section className="min-w-0 space-y-4">{children}</section>}
    </div>
  );
}

/** Pasos de la herramienta: listos con ✓, el actual en ámbar, los que faltan apagados. */
export function Steps({ steps, step, onStep }: { steps: string[]; step: number; onStep?: (i: number) => void }) {
  return (
    <ol className="scroll-row flex items-center gap-1.5" aria-label={`Paso ${step + 1} de ${steps.length}`}>
      {steps.map((label, i) => {
        const done = i < step, now = i === step;
        const body = (
          <>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${done ? "bg-secondary text-foreground" : now ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
              {done ? <Check className="w-3 h-3" /> : i + 1}
            </span>
            <span className="whitespace-nowrap">{label}</span>
          </>
        );
        const cls = `inline-flex min-h-[32px] items-center gap-2 rounded-full px-3 text-[12px] ${now ? "border border-primary/50 bg-primary/10 text-foreground" : done ? "text-foreground" : "text-muted-foreground"}`;
        return (
          <li key={label} className="flex items-center gap-1.5" aria-current={now ? "step" : undefined}>
            {i > 0 && <span className="h-px w-4 bg-border" aria-hidden />}
            {done && onStep ? <button type="button" onClick={() => onStep(i)} className={`${cls} hover:bg-secondary/60`}>{body}</button> : <span className={cls}>{body}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** Para qué producto y en qué vía estás trabajando; el producto se cambia aquí mismo. */
export function ToolContext({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { current } = useVia();
  return (
    <div className="flex items-center gap-2">
      <div className="rounded-full border border-border px-3 py-1"><ProductSwitcher bar alignRight onNavigate={onNavigate} /></div>
      <span className="rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground" title={current.line}>Vía: <span className="text-foreground">{current.short}</span></span>
    </div>
  );
}
