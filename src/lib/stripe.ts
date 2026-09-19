import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { checkoutUrl } from "@/lib/plans";

// Cobro principal: Stripe. Esta lib solo pide URLs al backend y redirige —
// precios y validación viven en las edge functions (stripe-checkout / stripe-portal).

const WHOP_PACKS: Record<string, string> = {
  boost: "https://whop.com/digitalizados/boost-500",
  power: "https://whop.com/digitalizados/power-2-000",
  nuclear: "https://whop.com/digitalizados/nuclear-4-500",
};

type CheckoutBody =
  | { action: "subscribe"; plan: "pro" | "proMax" }
  | { action: "pack"; pack_id: string };

export async function startCheckout(body: CheckoutBody): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke("stripe-checkout", {
    body: { ...body, return_url: window.location.origin + "/" },
  });
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
    const whopPack = body.action === "pack" ? WHOP_PACKS[body.pack_id] : undefined;
    if (whopPack) {
      const { data: u } = await supabase.auth.getUser();
      const email = u.user?.email;
      window.location.href = email ? `${whopPack}?email=${encodeURIComponent(email)}` : whopPack;
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

/** Muestra el resultado del checkout si venimos de Stripe (?checkout=...). */
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
