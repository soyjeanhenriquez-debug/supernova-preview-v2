import { Zap } from "lucide-react";

/** Costo en créditos con formato español (2.000) y plural correcto (1 crédito, 0 o 7 créditos). */
export function CreditBadge({ cost }: { cost: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-black/80">
      <Zap className="w-3 h-3" /> {cost.toLocaleString("de-DE")} crédito{cost === 1 ? "" : "s"}
    </span>
  );
}
