import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { checkoutUrl } from "@/lib/plans";

// Cobro principal: Whop. Stripe está APAGADO (secreto STRIPE_ENABLED en el servidor; manual §2).
// Esta lib solo pide URLs al backend o arma el enlace de Whop y redirige: precios y validación
// viven en el servidor (stripe-checkout / stripe-portal / whop-webhook).

/**
 * Espejo en el navegador del interruptor del servidor (12-oct-2026, misión "pagar y recargar"):
 * mientras Stripe esté apagado no se le pregunta nada. Antes cada "Comprar" llamaba a
 * stripe-checkout, esperaba a que fallara (1-2 s de "Abriendo el pago…") y recién ahí iba a Whop;
 * y Mis créditos mostraba "Cargando tu suscripción…" por la misma llamada. Para encender Stripe hay
 * que poner VITE_STRIPE_ENABLED=true en Vercel ADEMÁS del secreto del servidor (y el OK de Jean).
 */
export const STRIPE_ON = import.meta.env.VITE_STRIPE_ENABLED === "true";

const WHOP_PACKS: Record<string, string> = {
  boost: "https://whop.com/checkout/plan_ogd3Tq3dhAPU0",
  power: "https://whop.com/checkout/plan_MmMIIQFDwfLFg",
  nuclear: "https://whop.com/checkout/plan_iLopCOOcLRFGb",
  pro100: "https://whop.com/checkout/plan_ep1IoU1lqyq2f",
  pro250: "https://whop.com/checkout/plan_4Grs7qGPHcLCr",
  "media-starter": "https://whop.com/checkout/plan_Om5ryuOj3N6ny",
  "media-pro": "https://whop.com/checkout/plan_LUqedwz8eidhm",
  "media-scale": "https://whop.com/checkout/plan_8TEzDcA67omY8",
};

type CheckoutBody =
  | { action: "subscribe"; plan: "pro" }
  | { action: "pack"; pack_id: string };

/** Enlace de Whop de un pack (con el correo puesto si lo hay). null si el pack no existe en Whop. */
export function whopPackUrl(packId: string, email?: string | null): string | null {
  const base = WHOP_PACKS[packId];
  if (!base) return null;
  return email ? `${base}?email=${encodeURIComponent(email)}` : base;
}

export async function startCheckout(body: CheckoutBody): Promise<boolean> {
  const { data, error } = STRIPE_ON
    ? await supabase.functions.invoke("stripe-checkout", {
        body: { ...body, return_url: window.location.origin + "/" },
      })
    : { data: null, error: new Error("stripe_off") };
  if (error || !data?.url) {
    // Respaldo: si Stripe no está disponible (falta la llave o falla), la membresía se cobra
    // por Whop. Su webhook activa el acceso por CORREO, por eso el checkout va con el correo
    // de la cuenta ya puesto. Los Media Credits solo existen en Stripe.
    if (body.action === "subscribe") {
      const { data: u } = await supabase.auth.getUser();
      window.location.href = checkoutUrl(body.plan, u.user?.email ?? undefined);
      return true;
    }
    // Recargas de créditos de texto: también existen en Whop (el webhook las acredita por correo).
    if (body.action === "pack" && WHOP_PACKS[body.pack_id]) {
      const { data: u } = await supabase.auth.getUser();
      window.location.href = whopPackUrl(body.pack_id, u.user?.email) as string;
      return true;
    }
    toast.error("No se pudo abrir el pago", {
      description: data?.error || "Inténtalo de nuevo en un momento.",
    });
    return false;
  }
  window.location.href = data.url;
  return true;
}

/** Muestra el resultado del checkout si venimos de Stripe (?checkout=...). Con Whop no se usa. */
export function consumeCheckoutResult() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get("checkout");
  if (!result) return;
  params.delete("checkout");
  const clean = window.location.pathname + (params.size ? `?${params}` : "");
  window.history.replaceState({}, "", clean);
  if (result === "success") {
    toast.success("¡Pago recibido!", {
      description: "Tu compra se acredita en unos segundos.",
      duration: 8000,
    });
  } else if (result === "cancel") {
    toast("Pago cancelado", { description: "No se realizó ningún cobro." });
  }
}
