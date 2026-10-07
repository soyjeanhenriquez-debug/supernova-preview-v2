import { useEffect, useState } from "react";
import { ArrowRight, Check, Rocket, X } from "lucide-react";
import { LAUNCH_EVENT, LAUNCH_STEPS, endChain, goToStep, readChain, type LaunchChain } from "@/lib/launchChain";

/**
 * Barra de "Modelar esta oferta completa": en qué paso del lanzamiento vas y el siguiente a un toque.
 * Se ve en todas las pantallas mientras el lanzamiento esté abierto; "Terminar" la cierra.
 */
export function LaunchChainBar({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [c, setC] = useState<LaunchChain | null>(readChain);
  useEffect(() => {
    const sync = () => setC(readChain());
    window.addEventListener(LAUNCH_EVENT, sync);
    return () => window.removeEventListener(LAUNCH_EVENT, sync);
  }, []);
  if (!c) return null;

  const go = (step: number) => {
    const page = goToStep(step);
    if (page) { onNavigate(page); window.scrollTo({ top: 0 }); }
  };
  const last = c.step >= LAUNCH_STEPS.length - 1;

  return (
    <div className="max-w-[1280px] mx-auto mb-4 rounded-2xl border border-primary/30 bg-card/80 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Rocket className="w-4 h-4 text-primary shrink-0" />
        <p className="text-[13px] text-foreground min-w-0 flex-1">
          Lanzando tu versión de <b className="font-semibold">{c.offer}</b>
          {c.days > 0 && <span className="text-muted-foreground"> · {c.days} días pagando anuncios: ya está probado que se vende</span>}
        </p>
        <button type="button" onClick={endChain} aria-label="Terminar el lanzamiento guiado" className="p-1 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>
      <ol className="mt-3 flex flex-wrap items-center gap-1.5">
        {LAUNCH_STEPS.map((s, i) => (
          <li key={s.label}>
            <button type="button" onClick={() => go(i)}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[12px] ${i === c.step ? "border-primary/60 bg-primary/10 text-foreground" : i < c.step ? "border-border text-muted-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {i < c.step ? <Check className="w-3 h-3 text-emerald-400" /> : <span className="tabular-nums">{i + 1}</span>} {s.label}
            </button>
          </li>
        ))}
        <li className="ml-auto">
          {last
            ? <button type="button" onClick={endChain} className="btn-primary-nova inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold"><Check className="w-4 h-4" /> Listo, terminar</button>
            : <button type="button" onClick={() => go(c.step + 1)} className="btn-primary-nova inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-semibold">Siguiente: {LAUNCH_STEPS[c.step + 1].label} <ArrowRight className="w-4 h-4" /></button>}
        </li>
      </ol>
    </div>
  );
}
