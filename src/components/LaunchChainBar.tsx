import { useEffect, useState } from "react";
import { ArrowRight, Check, ChevronDown, Rocket, X } from "lucide-react";
import { LAUNCH_EVENT, LAUNCH_STEPS, bindChainToProduct, endChain, goToStep, readChain, type LaunchChain } from "@/lib/launchChain";
import { useOptionalProducts } from "@/contexts/ProductContext";

/**
 * Barra de "Modelar esta oferta completa": en qué paso del lanzamiento vas y el siguiente a un toque.
 * Se ve en todas las pantallas mientras el lanzamiento esté abierto; "Terminar" la cierra.
 * En el teléfono (debajo de lg) va plegada en una sola línea —paso actual + "Siguiente"— y se abre
 * al tocarla: desplegada ocupaba casi un tercio de la pantalla y empujaba el contenido hacia abajo.
 */
export function LaunchChainBar({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [c, setC] = useState<LaunchChain | null>(readChain);
  const [open, setOpen] = useState(false); // solo cuenta en el teléfono; en escritorio siempre abierta
  useEffect(() => {
    const sync = () => setC(readChain());
    window.addEventListener(LAUNCH_EVENT, sync);
    return () => window.removeEventListener(LAUNCH_EVENT, sync);
  }, []);
  const activeId = useOptionalProducts()?.activeId ?? null;
  useEffect(() => { if (c && !c.productId && activeId) bindChainToProduct(activeId); }, [c, activeId]);
  // Con otro producto activo, la barra no aplica: se oculta (vuelve si regresa a ese producto).
  if (!c || (c.productId && activeId && c.productId !== activeId)) return null;

  const go = (step: number) => {
    const page = goToStep(step);
    if (page) { onNavigate(page); window.scrollTo({ top: 0 }); }
  };
  const last = c.step >= LAUNCH_STEPS.length - 1;
  const nextBtn = last
    ? <button type="button" onClick={endChain} className="btn-primary-nova inline-flex items-center gap-1.5 h-11 lg:h-9 px-3 lg:px-4 rounded-xl text-[13px] font-semibold shrink-0"><Check className="w-4 h-4" /> <span className="hidden sm:inline">Listo, </span>terminar</button>
    : <button type="button" onClick={() => go(c.step + 1)} className="btn-primary-nova inline-flex items-center gap-1.5 h-11 lg:h-9 px-3 lg:px-4 rounded-xl text-[13px] font-semibold shrink-0">Siguiente<span className="hidden lg:inline">: {LAUNCH_STEPS[c.step + 1].label}</span> <ArrowRight className="w-4 h-4" /></button>;

  return (
    <div className="max-w-[1280px] mx-auto mb-3 lg:mb-4 rounded-2xl border border-primary/30 bg-card/80 p-2.5 sm:p-3 lg:p-4">
      {/* Teléfono: una línea. Tocar el texto abre o cierra la lista de pasos. */}
      <div className="flex items-center gap-2 lg:hidden">
        <Rocket className="w-4 h-4 text-primary shrink-0" />
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={open ? "Ocultar los pasos del lanzamiento" : "Ver los pasos del lanzamiento"}
          className="min-w-0 flex-1 min-h-11 text-left">
          <p className="text-[11px] text-muted-foreground truncate">Lanzando tu versión de <b className="font-medium text-foreground">{c.offer}</b></p>
          <p className="text-[12.5px] text-foreground truncate flex items-center gap-1">
            <span className="truncate">Paso {c.step + 1} de {LAUNCH_STEPS.length} · {LAUNCH_STEPS[c.step].label}</span>
            <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </p>
        </button>
        {nextBtn}
      </div>

      {/* Escritorio: encabezado completo con el cierre. */}
      <div className="hidden lg:flex flex-wrap items-center gap-3">
        <Rocket className="w-4 h-4 text-primary shrink-0" />
        <p className="text-[13px] text-foreground min-w-0 flex-1">
          Lanzando tu versión de <b className="font-semibold">{c.offer}</b>
          {c.days > 0 && <span className="text-muted-foreground"> · {c.days} días pagando anuncios: ya está probado que se vende</span>}
        </p>
        <button type="button" onClick={endChain} aria-label="Terminar el lanzamiento guiado" className="p-2 -m-1 rounded-full text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>

      {/* Lista de pasos: siempre en escritorio; en el teléfono solo si la abres. */}
      <div className={`${open ? "block" : "hidden"} lg:block`}>
        {c.days > 0 && <p className="lg:hidden mt-2 text-[11px] text-muted-foreground">{c.days} días pagando anuncios: ya está probado que se vende.</p>}
        <ol className="mt-3 flex flex-wrap items-center gap-1.5">
          {LAUNCH_STEPS.map((s, i) => (
            <li key={s.label}>
              <button type="button" onClick={() => { go(i); setOpen(false); }}
                className={`inline-flex items-center gap-1.5 h-11 lg:h-8 px-3 rounded-full border text-[12px] ${i === c.step ? "border-primary/60 bg-primary/10 text-foreground" : i < c.step ? "border-border text-muted-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {i < c.step ? <Check className="w-3 h-3 text-emerald-400" /> : <span className="tabular-nums">{i + 1}</span>} {s.label}
              </button>
            </li>
          ))}
          <li className="ml-auto hidden lg:block">{nextBtn}</li>
          <li className="ml-auto lg:hidden">
            <button type="button" onClick={endChain} className="inline-flex items-center gap-1 h-11 px-2 text-[12px] text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /> Terminar</button>
          </li>
        </ol>
      </div>
    </div>
  );
}
