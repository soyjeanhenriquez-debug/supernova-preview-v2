import { useCreditsLeft } from "@/hooks/useCreditsLeft";
import { useEffect, useState } from "react";
import { Zap, X } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";
import { creditEquivalentsLine } from "@/components/CreditRing";

const SESSION_KEY = "supernova_low_credit_dismissed";

interface Props { onRecharge?: () => void }

/**
 * Aviso de pocos créditos (menos de 200): una franja fina arriba, se cierra y no vuelve en la sesión.
 * 11-oct-2026: dice qué te rinde lo que queda y, si los del mes se renuevan en pocos días y no hay
 * comprados, lo avisa antes de invitar a recargar (no empujamos una compra que no hace falta).
 */
export function LowCreditBanner({ onRecharge }: Props) {
  const { balance, purchased, renewalDate } = useCredits();
  const { isAdmin } = useCreditsLeft();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(SESSION_KEY) === "1";
  });

  useEffect(() => {
    if (balance >= 200) setDismissed(false);
  }, [balance]);

  if (isAdmin || balance >= 200 || dismissed) return null;

  const renewDays = Math.max(0, Math.ceil((renewalDate.getTime() - Date.now()) / 86_400_000));
  const soon = purchased === 0 && renewDays <= 3;
  const rinde = creditEquivalentsLine(balance, { withOr: true });

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-[hsl(28_85%_28%)] text-white border-b border-[hsl(28_85%_22%)] animate-fade-in">
      <div className="flex items-center gap-2 text-[13px] flex-wrap">
        <Zap className="w-4 h-4 shrink-0" />
        <span className="font-medium">
          {balance <= 0 ? "Se te acabaron los créditos" : <>Te quedan <span className="font-bold tabular-nums">{balance}</span> créditos{rinde ? <span className="text-white/80 font-normal"> ({rinde})</span> : null}</>}
        </span>
        <span className="text-white/70">·</span>
        {soon ? (
          <span className="text-white/90">
            Los de tu plan se renuevan {renewDays === 0 ? "hoy" : renewDays === 1 ? "mañana" : `en ${renewDays} días`}.{" "}
            <button onClick={onRecharge} className="underline underline-offset-2 hover:text-white font-semibold">¿No puedes esperar? Recarga →</button>
          </span>
        ) : (
          <button onClick={onRecharge} className="underline underline-offset-2 hover:text-white/90 font-semibold">
            Recarga desde US$10: lo que compras no caduca →
          </button>
        )}
      </div>
      <button
        aria-label="Cerrar"
        onClick={() => { sessionStorage.setItem(SESSION_KEY, "1"); setDismissed(true); }}
        className="opacity-70 hover:opacity-100 transition shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
