// El agente que atiende cada herramienta (29-oct-2026): «⚡ Zeus · tu agente de reels» encima del título. No reemplaza
// el título de la herramienta. Su rol completo va en una línea debajo si se pide (`conRol`) y siempre al pasar el dedo.
import { AGENTES, type AgenteId } from "@/lib/agentes";

export function AgenteFirma({ agente, conRol = false, className = "" }: { agente: AgenteId; conRol?: boolean; className?: string }) {
  const a = AGENTES[agente];
  return (
    <div className={className} title={a.rol}>
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{a.emoji} {a.nombre} · {a.etiqueta}</p>
      {conRol && <p className="text-[12px] text-muted-foreground">{a.rol}</p>}
    </div>
  );
}
