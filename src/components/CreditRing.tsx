import { fmtNumber } from "@/lib/gemelo";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCredits } from "@/hooks/useCredits";
import { useBonusStatus } from "@/components/PublishBonus";

/**
 * Ruedita de créditos en la barra superior (06-oct-2026, pedido de Jean, estilo Claude/Higgsfield).
 * Un círculo ámbar que se va vaciando a medida que se gastan los créditos del mes. Sin números a la
 * vista ni avisos por cada cosa: al tocarlo se abre el detalle (cuánto queda, cuándo se renueva,
 * comprados y bono por publicar). El saldo real siempre lo pone el servidor.
 */
const R = 8, C = 2 * Math.PI * R;

export function CreditRing({ isAdmin }: { isAdmin: boolean }) {
  const { balance, monthly, purchased, limit, renewalDate } = useCredits();
  const bonus = useBonusStatus();
  const left = isAdmin ? 1 : Math.max(0, Math.min(1, monthly / limit));
  const low = !isAdmin && balance < 100;
  const usedPct = Math.round((1 - left) * 100);
  const renew = renewalDate.toLocaleDateString("es", { day: "numeric", month: "long" });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={isAdmin ? "Créditos ilimitados" : `Créditos: te quedan ${fmtNumber(balance)}`}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary/70 transition-colors">
          <svg width="22" height="22" viewBox="0 0 22 22" className="-rotate-90" aria-hidden>
            <circle cx="11" cy="11" r={R} fill="none" stroke="hsl(var(--border))" strokeWidth="2.5" />
            <circle cx="11" cy="11" r={R} fill="none" strokeWidth="2.5" strokeLinecap="round"
              stroke={low ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
              strokeDasharray={C} strokeDashoffset={C * (1 - left)}
              style={{ transition: "stroke-dashoffset 700ms ease, stroke 300ms" }} />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0 overflow-hidden">
        <div className="p-4 space-y-4">
          <Row label="Créditos del mes" right={isAdmin ? "Ilimitado (admin)" : `${fmtNumber(monthly)} de ${fmtNumber(limit)}`}
            sub={isAdmin ? undefined : `Usaste ${usedPct} % · se renuevan el ${renew}`} pct={isAdmin ? 0 : 1 - left} low={low} />
          {purchased > 0 && (
            <Row label="Créditos comprados" right={fmtNumber(purchased)} sub="No caducan: se usan después de los del mes." />
          )}
          {bonus && (
            <Row label="Bono por publicar" right={`${fmtNumber(bonus.monthTotal)} de ${fmtNumber(bonus.monthCap)}`}
              sub={bonus.claimedToday ? "Ya ganaste el de hoy." : `Gana ${bonus.perClaim} hoy: publica algo hecho aquí.`}
              pct={bonus.monthTotal / bonus.monthCap} />
          )}
        </div>
        <div className="border-t border-border px-4 py-2.5 flex items-center justify-between">
          <span className="text-[12px] text-muted-foreground">Saldo total</span>
          <span className="text-[13px] font-semibold text-foreground tabular-nums">{isAdmin ? "Ilimitado" : fmtNumber(balance)}</span>
        </div>
        <a href="#/creditos" className="block border-t border-border px-4 py-2.5 text-[12px] text-foreground hover:bg-secondary/60">Ver desglose y recargar</a>
      </PopoverContent>
    </Popover>
  );
}

function Row({ label, right, sub, pct, low }: { label: string; right: string; sub?: string; pct?: number; low?: boolean }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-foreground">{label}</span>
        <span className="text-[12px] text-muted-foreground tabular-nums">{right}</span>
      </div>
      {pct !== undefined && (
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div className={`h-full rounded-full ${low ? "bg-destructive" : "bg-primary"} transition-[width] duration-700`}
            style={{ width: `${Math.max(pct > 0 ? 2 : 0, Math.min(100, pct * 100))}%` }} />
        </div>
      )}
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
