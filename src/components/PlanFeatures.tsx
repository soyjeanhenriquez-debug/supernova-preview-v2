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
          🔥 Código FUNDADOR ya puesto: tu primer mes cuesta US$19,99 en vez de US$29,99 · 50 cupos, cierra el 30 de septiembre
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

/**
 * Lo que la persona tiene que saber ANTES de pulsar el botón del plan PRO (pedido de Jean):
 * qué incluyen los 3 días gratis, por qué Whop pide la tarjeta, qué pasa el día 4 y cómo
 * cancelar. Escrito para alguien que nunca ha comprado una suscripción por internet.
 * No promete correos de recordatorio: hoy no podemos mandarlos.
 * `tone` adapta los colores: la pantalla de registro usa su paleta propia (oscura fija).
 */
export function TrialTerms({ tone = "theme" }: { tone?: "theme" | "signup" }) {
  const founder = founderOfferActive();
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
          incluidos los 2.000 créditos de la IA.
        </li>
        <li>
          El pago lo maneja <b className={strong}>Whop</b>, una plataforma de pagos segura. Te pide la
          tarjeta para activar la prueba, pero <b className={strong}>no te cobra nada en esos 3 días</b>.
        </li>
        <li>
          {founder ? (
            <>
              <b className={strong}>El día 4 se cobra tu primer mes: US$19,99</b> con el código FUNDADOR
              (ya va puesto). Desde el segundo mes son US$29,99 al mes.
            </>
          ) : (
            <>
              <b className={strong}>El día 4 se cobra tu primer mes: US$29,99.</b> Después, lo mismo cada mes.
            </>
          )}
        </li>
        <li>
          ¿No te convenció? <b className={strong}>Cancela antes del día 4 y no pagas nada.</b> Se hace en
          tu cuenta de Whop → Mis compras, en un par de clics. Puedes cancelar cuando quieras.
        </li>
      </ol>
    </div>
  );
}
