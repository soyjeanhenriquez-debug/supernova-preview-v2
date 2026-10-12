import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Etiqueta de SUPERNOVA (R2-08, 12-oct-2026): píldora gris con texto blanco.
 * Es la misma en toda la app: formato de una pieza ("Carrusel", "Anuncio en video"), días pagando
 * anuncios, tipo de oferta… Sin colores nuevos: gris para describir, ámbar solo si es lo principal.
 *
 *   <Pill>Carrusel</Pill>                                   → píldora suelta (en una fila de etiquetas)
 *   <div className="relative"><img …/><Pill overlay>Video 9:16</Pill></div>
 *                                                           → encima de una imagen, abajo a la izquierda
 *   <Pill tone="primary">Nuevo</Pill>                       → solo para lo que de verdad destaca
 *   <Pill tone="success" icon={<Check />}>Hecho</Pill>
 */
export type PillTone = "neutral" | "primary" | "success" | "danger";

const TONES: Record<PillTone, string> = {
  neutral: "bg-secondary/90 text-foreground border-border/70",
  primary: "bg-primary/10 text-primary border-primary/30",
  success: "bg-success/10 text-success border-success/30",
  danger: "bg-destructive/10 text-destructive border-destructive/30",
};

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  /** Encima de una imagen o video: abajo a la izquierda, con fondo oscuro legible. El padre necesita `relative`. */
  overlay?: boolean;
  icon?: React.ReactNode;
}

export const Pill = React.forwardRef<HTMLSpanElement, PillProps>(
  ({ tone = "neutral", overlay = false, icon, className, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
        overlay
          ? "absolute bottom-2 left-2 z-[1] bg-black/70 text-white border-white/10 backdrop-blur-sm"
          : TONES[tone],
        className,
      )}
      {...props}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  ),
);
Pill.displayName = "Pill";
