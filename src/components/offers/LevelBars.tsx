import type { Offer } from "@/lib/offers";
import { nivelOferta } from "@/components/offers/offerUi";

/**
 * Nivel de la oferta en barras (como una señal de celular): 1 barra = en prueba, 4 = dominando.
 * Cuenta anuncios activos y días pagando anuncios; el texto lo dice al pasar el dedo o el ratón.
 */
export function LevelBars({ o, size = "sm" }: {
  o: Pick<Offer, "active_ads" | "days_active"> & Partial<Pick<Offer, "live_active_ads" | "live_capped">>;
  size?: "sm" | "lg";
}) {
  const n = nivelOferta(o);
  const h = size === "lg" ? [7, 11, 15, 19] : [5, 8, 11, 14];
  return (
    <span className="inline-flex items-center gap-2 min-w-0" title={`${n.label}: ${n.regla}`}>
      <span className="inline-flex items-end gap-[2px] shrink-0" role="img" aria-label={`Nivel ${n.label}, ${n.barras} de 4 barras: ${n.regla}`}>
        {h.map((px, i) => (
          <span key={px} style={{ height: px }}
            className={`${size === "lg" ? "w-[4px]" : "w-[3px]"} rounded-[1px] ${i < n.barras ? "bg-primary" : "bg-foreground/15"}`} />
        ))}
      </span>
      <span className={`font-display font-semibold text-foreground truncate ${size === "lg" ? "text-[14px]" : "text-[12px]"}`}>{n.label}</span>
    </span>
  );
}
