import type { ReactNode } from "react";

/**
 * Encabezado de cada herramienta del recorrido, "estilo Apple": etapa, título y UNA línea de qué
 * hacer aquí. Lo demás, solo si el usuario lo pide ("¿Cómo funciona?"). Así nadie tiene que leer
 * un párrafo para empezar.
 */
export function PageHeader({ stage, title, line, icon, details, right }: {
  stage?: string;
  title: string;
  line: string;
  icon?: ReactNode;
  details?: string[];
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {stage && <p className="text-xs uppercase tracking-wider text-primary font-semibold">{stage}</p>}
        <h1 className="font-display font-bold text-2xl text-foreground flex items-center gap-2">{icon}{title}</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{line}</p>
        {details && details.length > 0 && (
          <details className="mt-1.5 text-xs text-muted-foreground max-w-2xl group">
            <summary className="cursor-pointer text-primary hover:underline list-none inline-flex items-center gap-1">
              <span className="group-open:hidden">¿Cómo funciona?</span><span className="hidden group-open:inline">Ocultar</span>
            </summary>
            <ul className="mt-1.5 space-y-1 list-disc pl-4">
              {details.map(d => <li key={d}>{d}</li>)}
            </ul>
          </details>
        )}
      </div>
      {right}
    </div>
  );
}
