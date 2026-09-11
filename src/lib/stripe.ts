import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Cobro principal: Stripe. Esta lib solo pide URLs al backend y redirige —
// precios y validación viven en las edge functions (stripe-checkout / stripe-portal).

type CheckoutBody =
  | { action: "subscribe"; plan: "pro" | "proMax" }
  | { action: "pack"; pack_id: string };

export async function startCheckout(body: CheckoutBody): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke("stripe-checkout", {
    body: { ...body, return_url: window.location.origin + "/" },
  });
  if (error || !data?.url) {
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
