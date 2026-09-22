import { Check } from "lucide-react";
import { founderOfferActive, planFeatureParts, type PlanKey } from "@/lib/plans";

/**
 * Beneficios de un plan: primero, resaltado, lo que hereda ("Todo lo de PRO"), y
 * debajo solo lo que añade. `accent` es el color del resaltado en cada pantalla
 * (la de registro usa su dorado propio; la de activación, el color del tema).
 * En PRO, mientras dure la campaña, avisa del precio de fundador: el checkout ya lo
 * aplica solo, y verlo ANTES de hacer clic es lo que decide.
 */
export function PlanFeatures({ plan, accent = "text-primary", max }: { plan: PlanKey; accent?: string; max?: number }) {
  const { inherits, extras } = planFeatureParts(plan);
  const shown = typeof max === "number" ? extras.slice(0, max) : extras;
  return (
    <div className="mt-2 space-y-1.5">
      {plan === "pro" && founderOfferActive() && (
        <p className="inline-block rounded-md bg-[#22c55e]/15 px-2 py-1 text-[11px] font-semibold text-[#4ade80]">
          🔥 Código FUNDADOR aplicado: primer mes a $19,99 · hasta el 30 de septiembre
        </p>
      )}
      {inherits && (
        <p className={`text-xs font-semibold ${accent}`}>
          ✓ {inherits}, más:
        </p>
      )}
      <ul className="space-y-1">
        {shown.map((f) => (
          <li key={f} className="flex items-start gap-1.5 text-xs text-[#a1a1aa]">
            <Check className={`mt-0.5 h-3 w-3 shrink-0 ${accent}`} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
