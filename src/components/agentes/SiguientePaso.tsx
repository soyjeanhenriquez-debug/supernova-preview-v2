// La tarjeta con la que cierra cada agente (misión de Jean, 29-oct-2026): una sola pregunta de avance real y el botón
// que abre al siguiente agente. Si el siguiente todavía no existe, no se muestra nada.
// `hacia` cambia el siguiente agente solo en ese momento (ej.: Eco lleva a Zeus mientras Ulises no tiene pantalla).
import { ArrowRight } from "lucide-react";
import { AGENTES, siguientePaso, type AgenteId } from "@/lib/agentes";

export function SiguientePaso({ agente, pregunta, hacia, onIr }: { agente: AgenteId; pregunta?: string | null; hacia?: AgenteId; onIr?: () => void }) {
  const sig = hacia ? (AGENTES[hacia].ruta ? AGENTES[hacia] : null) : siguientePaso(agente);
  if (!sig) return null;
  const ir = onIr ?? (() => { window.location.hash = `#/${sig.ruta}`; window.scrollTo({ top: 0 }); });
  return (
    <div className="rounded-2xl border border-primary/40 bg-card p-4 space-y-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Tu siguiente paso · {AGENTES[agente].emoji} {AGENTES[agente].nombre}</p>
      <p className="text-[15px] font-semibold text-foreground">{pregunta || AGENTES[agente].avance}</p>
      <button type="button" onClick={ir}
        className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
        Sí, vamos con {sig.emoji} {sig.nombre} <ArrowRight className="w-4 h-4" />
      </button>
      <p className="text-[12px] text-muted-foreground">{sig.rol}</p>
    </div>
  );
}
