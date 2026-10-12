import { Check, ShieldCheck } from "lucide-react";
import { PLANS, formatUsd, planFeatureParts, type PlanKey } from "@/lib/plans";
import { creditEquivalentsLine } from "@/components/CreditRing";

/**
 * Garantía publicada (manual §1): 30 días, si no terminas tu producto se devuelve el 100 %.
 * Mismas palabras que la landing. Va donde se decide pagar: ventana de planes (vitrina), acceso
 * pendiente, candados y la tarjeta de la prueba. Es un reembolso real, no una promesa de resultados.
 */
export const GUARANTEE_TEXT = "Garantía de 30 días: si no terminas tu producto, te devolvemos el 100 %.";

export function GuaranteeLine({ className = "" }: { className?: string }) {
  return (
    <p className={`inline-flex items-start gap-1.5 text-[12px] text-muted-foreground ${className}`}>
      <ShieldCheck className="mt-[1px] h-3.5 w-3.5 shrink-0 text-foreground/70" aria-hidden />
      <span>{GUARANTEE_TEXT}</span>
    </p>
  );
}

// Créditos del mes de PRO: el mismo número que DEFAULT_LIMIT (useCredits) y que PLANS.pro.features.
const PRO_MONTHLY_CREDITS = 2000;

/**
 * Beneficios de un plan: primero, resaltado, lo que hereda ("Todo lo de PRO"), y
 * debajo solo lo que añade. `accent` es el color del resaltado en cada pantalla
 * (la de registro usa su dorado propio; la de activación, el color del tema).
 * En PRO dice qué rinden los 2.000 créditos en piezas (con los precios de CREDIT_COSTS):
 * "2.000 créditos" solo no dice nada. El cupón FUNDADOR cerró el 30-sep-2026 y ya no se muestra.
 */
export function PlanFeatures({ plan, accent = "text-primary", max }: { plan: PlanKey; accent?: string; max?: number }) {
  const { inherits, extras } = planFeatureParts(plan);
  const shown = typeof max === "number" ? extras.slice(0, max) : extras;
  const rinde = plan === "pro" ? creditEquivalentsLine(PRO_MONTHLY_CREDITS, { withOr: true }) : "";
  return (
    <div className="mt-2 space-y-1.5">
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
      {rinde && (
        <p className="text-[11px] text-muted-foreground">
          Con {PRO_MONTHLY_CREDITS.toLocaleString("de-DE")} créditos al mes haces {rinde}.
        </p>
      )}
    </div>
  );
}

/**
 * Lo que la persona tiene que saber ANTES de pulsar el botón del plan PRO (pedido de Jean):
 * qué incluyen los 3 días gratis, por qué Whop pide la tarjeta, qué pasa el día 4 y cómo
 * cancelar. Escrito para alguien que nunca ha comprado una suscripción por internet.
 * No promete correos de recordatorio: hoy no podemos mandarlos. Cierra con la garantía de 30 días
 * (con las palabras del manual), que es lo que quita el miedo a pagar el día 4.
 * `tone` adapta los colores: la pantalla de registro usa su paleta propia (oscura fija).
 */
export function TrialTerms({ tone = "theme" }: { tone?: "theme" | "signup" }) {
  const box = tone === "signup"
    ? "border-[#ffffff15] bg-[#141416] text-[#a1a1aa]"
    : "border-border bg-secondary/40 text-muted-foreground";
  const strong = tone === "signup" ? "text-[#F5F5F7]" : "text-foreground";
  return (
    <div className={`rounded-xl border p-4 text-left text-xs leading-relaxed ${box}`}>
      <p className={`mb-2 text-sm font-semibold ${strong}`}>Cómo funcionan tus 3 días gratis</p>
      <ol className="list-decimal space-y-1.5 pl-4">
        <li>
          <b className={strong}>Hoy no pagas nada.</b> Tienes 3 días para usar SUPERNOVA completo,
          incluidos los {PRO_MONTHLY_CREDITS.toLocaleString("de-DE")} créditos de la IA.
        </li>
        <li>
          El pago lo maneja <b className={strong}>Whop</b>, una plataforma de pagos segura. Te pide la
          tarjeta para activar la prueba, pero <b className={strong}>no te cobra nada en esos 3 días</b>.
        </li>
        <li>
          <b className={strong}>El día 4 se cobra tu primer mes: {formatUsd(PLANS.pro.price)}.</b> Después, lo mismo cada mes.
        </li>
        <li>
          ¿No te convenció? <b className={strong}>Cancela antes del día 4 y no pagas nada.</b> Se hace en
          tu cuenta de Whop → Mis compras, en un par de clics. Puedes cancelar cuando quieras.
        </li>
        <li>
          <b className={strong}>Garantía de 30 días:</b> si no terminas tu producto, te devolvemos el 100 %.
        </li>
      </ol>
    </div>
  );
}
