import { Zap } from "lucide-react";

export function CreditBadge({ cost }: { cost: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-black/80">
      <Zap className="w-3 h-3" /> {cost} crédito{cost > 1 ? "s" : ""}
    </span>
  );
}
