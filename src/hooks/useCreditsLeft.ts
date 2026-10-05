import { useCredits } from "@/hooks/useCredits";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { formatNumber } from "@/lib/imagePrompts";

/**
 * "Te quedan N créditos" o, para un admin, "Créditos ilimitados" (04-oct-2026): los admin no gastan
 * de un saldo, así que mostrar su número confunde. Solo cambia el texto; el cobro sigue en el servidor.
 */
export function useCreditsLeft(): { label: string; isAdmin: boolean } {
  const { balance } = useCredits();
  const { isAdmin } = useIsAdmin();
  return {
    isAdmin: isAdmin === true,
    label: isAdmin === true ? "Créditos ilimitados" : `Te quedan ${formatNumber(balance)} créditos`,
  };
}
