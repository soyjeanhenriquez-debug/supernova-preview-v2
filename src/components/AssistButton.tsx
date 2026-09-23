import { Loader2, Sparkles } from "lucide-react";

/** Botón "✨ Rellenar con IA" de los formularios (ver src/lib/formAssist.ts). Es gratis. */
export function AssistButton({ onClick, loading, filled, className = "" }: {
  onClick: () => void; loading: boolean; filled?: boolean; className?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={loading}
      title="Gratis: la IA escribe un ejemplo según tu encuesta y lo que ya contaste de tu oferta"
      className={`inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-60 ${className}`}>
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
      {loading ? "Escribiendo…" : filled ? "Otro ejemplo con IA" : "Rellenar con IA"}
    </button>
  );
}
