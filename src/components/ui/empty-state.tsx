import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Estado vacío de SUPERNOVA (R2-08, 12-oct-2026). Uno solo para toda la app: icono en anillo gris,
 * título corto en Sora, una línea de qué hacer y UN botón ámbar con el siguiente paso.
 * Regla del manual: cada pantalla dice qué hacer después; un vacío nunca es un callejón.
 *
 *   <EmptyState
 *     icon={<Gem />}
 *     title="No hay ofertas con esos filtros"
 *     text="Quita algún filtro o busca en Explorar todo."
 *     action={{ label: "Quitar filtros", onClick: reset }}
 *   />
 *
 *   // Error de carga: mismo formato, botón "Reintentar".
 *   <EmptyState icon={<RefreshCw />} title="No pudimos cargar los kits" text="Suele ser la conexión." action={{ label: "Reintentar", onClick: load }} />
 *
 *   // Dentro de otra tarjeta (sin borde propio, menos aire): compact
 *   <EmptyState compact icon={<Quote />} title="Aún no guardas ganchos" />
 */
export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  text?: React.ReactNode;
  action?: { label: string; onClick: () => void; icon?: React.ReactNode };
  /** Acción de segundo nivel (texto, sin relleno). */
  secondary?: { label: string; onClick: () => void };
  /** Sin tarjeta propia y con menos aire: para usar dentro de otra tarjeta o de una hoja. */
  compact?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function EmptyState({ icon, title, text, action, secondary, compact = false, className, children }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "text-center px-6",
        compact ? "py-8" : "card-surface rounded-2xl py-14 sm:py-16",
        className,
      )}
    >
      {icon && <div className={cn("empty-icon [&_svg]:size-7 [&_svg]:stroke-[1.4]", compact ? "mb-3 !w-12 !h-12 [&_svg]:size-5" : "mb-5")}>{icon}</div>}
      <p className="font-display font-semibold text-base text-foreground mb-1">{title}</p>
      {text && <div className="text-sm text-muted-foreground max-w-md mx-auto">{text}</div>}
      {children}
      {(action || secondary) && (
        <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-2">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="btn-primary-nova inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-10 px-5 rounded-xl text-[13px] [&_svg]:size-4"
            >
              {action.icon}
              {action.label}
            </button>
          )}
          {secondary && (
            <button
              type="button"
              onClick={secondary.onClick}
              className="inline-flex items-center justify-center min-h-11 sm:min-h-10 px-4 rounded-xl text-[13px] text-muted-foreground hover:text-foreground"
            >
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
