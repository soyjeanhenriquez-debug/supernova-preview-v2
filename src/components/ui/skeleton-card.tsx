import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Carga de SUPERNOVA (R2-08, 12-oct-2026): un esqueleto con el FORMATO REAL de lo que viene,
 * no un spinner suelto. Si viene un video vertical, el esqueleto es 9:16; si viene una oferta, una
 * tarjeta con imagen y dos líneas. Así la página no salta cuando llegan los datos.
 *
 *   // Lista que carga (Ofertas, Mini Apps, Radar): misma cuadrícula que la lista real
 *   <SkeletonGrid count={6} aspect="4/5" className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4" />
 *
 *   // Una pieza que se está generando con IA: formato real + el paso en curso
 *   <SkeletonCard aspect="9/16" step="Escribiendo el guion · Toma 2 de 3" />
 *
 *   // Fila de texto (resultados de un generador)
 *   <SkeletonCard aspect={null} lines={3} />
 */
export type SkeletonAspect = "9/16" | "4/5" | "1/1" | "16/9" | "3/4";

const ASPECT: Record<SkeletonAspect, string> = {
  "9/16": "aspect-[9/16]",
  "4/5": "aspect-[4/5]",
  "1/1": "aspect-square",
  "16/9": "aspect-video",
  "3/4": "aspect-[3/4]",
};

export interface SkeletonCardProps {
  /** Formato de la imagen o video que va a llegar. `null` = tarjeta solo de texto. */
  aspect?: SkeletonAspect | null;
  /** Líneas de texto debajo de la imagen. */
  lines?: number;
  /** Paso en curso mientras se genera ("Armando la lámina 2 de 5"). Se lee en voz alta (aria-live). */
  step?: string;
  className?: string;
}

const bar = "rounded-md bg-secondary/80 animate-pulse";

export function SkeletonCard({ aspect = "4/5", lines = 2, step, className }: SkeletonCardProps) {
  return (
    <div
      aria-busy="true"
      aria-live={step ? "polite" : undefined}
      className={cn("card-surface rounded-2xl overflow-hidden", className)}
    >
      {aspect && (
        <div className={cn("relative w-full bg-secondary/50 animate-pulse", ASPECT[aspect])}>
          {step && (
            <span className="absolute bottom-2 left-2 right-2 inline-flex items-center gap-1.5 rounded-full bg-black/70 border border-white/10 px-2.5 py-1 text-[11px] text-white">
              <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              <span className="truncate">{step}</span>
            </span>
          )}
        </div>
      )}
      {lines > 0 && (
        <div className="p-4 space-y-2">
          {Array.from({ length: lines }).map((_, i) => (
            <div key={i} className={cn(bar, "h-3", i === 0 ? "w-3/4" : i === lines - 1 ? "w-1/2" : "w-full")} />
          ))}
          {!aspect && step && <p className="pt-1 text-[12px] text-muted-foreground">{step}</p>}
        </div>
      )}
    </div>
  );
}

/** Varias tarjetas de carga con la misma cuadrícula que la lista real. `className` = clases de la cuadrícula. */
export function SkeletonGrid({ count = 6, className, cardClassName, ...card }: SkeletonCardProps & { count?: number; cardClassName?: string }) {
  return (
    <div className={className ?? "grid sm:grid-cols-2 xl:grid-cols-3 gap-4"} aria-busy="true">
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} {...card} className={cardClassName} />)}
    </div>
  );
}
