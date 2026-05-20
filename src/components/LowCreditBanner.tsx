import { useEffect, useState } from "react";
import { Zap, X } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";

const SESSION_KEY = "supernova_low_credit_dismissed";

interface Props { onRecharge?: () => void }

export function LowCreditBanner({ onRecharge }: Props) {
  const { balance } = useCredits();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(SESSION_KEY) === "1";
  });

  useEffect(() => {
    if (balance >= 200) setDismissed(false);
  }, [balance]);

  if (balance >= 200 || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-[hsl(28_85%_28%)] text-white border-b border-[hsl(28_85%_22%)] animate-fade-in">
      <div className="flex items-center gap-2 text-[13px]">
        <Zap className="w-4 h-4" />
        <span className="font-medium">
          Te quedan <span className="font-bold tabular-nums">{balance}</span> créditos
        </span>
        <span className="text-white/70">·</span>
        <button
          onClick={onRecharge}
          className="underline underline-offset-2 hover:text-white/90 font-semibold"
        >
          Recarga para seguir →
        </button>
      </div>
      <button
        aria-label="Cerrar"
        onClick={() => { sessionStorage.setItem(SESSION_KEY, "1"); setDismissed(true); }}
        className="opacity-70 hover:opacity-100 transition"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
