import { startCheckout } from "@/lib/stripe";
import { useTrialState } from "@/hooks/useTrialState";
import { fmtNumber } from "@/lib/gemelo";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCredits, CREDIT_COSTS } from "@/hooks/useCredits";
import { useBonusStatus } from "@/components/PublishBonus";

/**
 * Ruedita de créditos en la barra superior (06-oct-2026, pedido de Jean, estilo Claude/Higgsfield).
 * Un círculo ámbar que se va vaciando a medida que se gastan los créditos del mes. Sin números a la
 * vista ni avisos por cada cosa: al tocarlo se abre el detalle (cuánto queda, cuándo se renueva,
 * comprados y bono por publicar). El saldo real siempre lo pone el servidor.
 */
const R = 8, C = 2 * Math.PI * R;

/**
 * Qué te rinde un saldo, en piezas reales (11-oct-2026, misión "pagar y recargar"): la gente no
 * sabe qué es "2.000 créditos" hasta que lo ve en imágenes, anuncios en video o textos. Los precios
 * salen de CREDIT_COSTS (espejo de credit_prices, que es quien cobra). Vive aquí, y no en la
 * página de créditos, porque esa página se carga aparte (lazy) y la ruedita y el aviso de pocos
 * créditos la necesitan en todas las pantallas.
 */
export const VIDEO_AD_TAKES = 3; // un anuncio en video = 3 tomas de 5 s (Video con IA)
export function creditEquivalents(credits: number) {
  const c = Math.max(0, credits);
  return {
    images: Math.floor(c / CREDIT_COSTS.gen_ad_image),
    videoAds: Math.floor(c / (CREDIT_COSTS.vid_mini_5 * VIDEO_AD_TAKES)),
    shortTexts: Math.floor(c / CREDIT_COSTS.gen_light),
    mediumTexts: Math.floor(c / CREDIT_COSTS.gen_medium),
  };
}

/** Frase corta: "≈ 285 imágenes · 8 anuncios en video · 133 textos cortos". */
export function creditEquivalentsLine(credits: number, opts: { withOr?: boolean } = {}) {
  const e = creditEquivalents(credits);
  const sep = opts.withOr ? " o " : " · ";
  const parts: string[] = [];
  if (e.images > 0) parts.push(`${fmtNumber(e.images)} ${e.images === 1 ? "imagen" : "imágenes"}`);
  if (e.videoAds > 0) parts.push(`${fmtNumber(e.videoAds)} ${e.videoAds === 1 ? "anuncio en video" : "anuncios en video"}`);
  if (e.shortTexts > 0) parts.push(`${fmtNumber(e.shortTexts)} ${e.shortTexts === 1 ? "texto corto" : "textos cortos"}`);
  return parts.length ? `≈ ${parts.join(sep)}` : "";
}

export function CreditRing({ isAdmin }: { isAdmin: boolean }) {
  const { balance, monthly, purchased, limit, renewalDate } = useCredits();
  const bonus = useBonusStatus();
  // El anillo sigue a los del mes; si ya se acabaron pero quedan comprados, muestra esos para que
  // no se vea vacío (ni rojo) con saldo de sobra.
  const shown = monthly > 0 || purchased === 0 ? monthly : balance;
  const left = isAdmin ? 1 : Math.max(0, Math.min(1, shown / limit));
  const low = !isAdmin && balance < 100;
  const usedPct = Math.round((1 - Math.max(0, Math.min(1, monthly / limit))) * 100);
  const renew = renewalDate.toLocaleDateString("es", { day: "numeric", month: "long" });
  const rinde = isAdmin ? "" : creditEquivalentsLine(balance);
  const trial = useTrialState();

  // Prueba gratis (12-oct-2026): la cuenta gratis no tiene créditos; ve cuánto le queda de su prueba.
  if (!isAdmin && trial.kind === "free") {
    const pct = Math.max(0, Math.min(100, trial.leftPct));
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-label={`Prueba gratis: te queda ${pct} %`}
            className="h-8 min-h-[32px] rounded-full border border-primary/40 px-3 text-[12px] font-semibold text-primary hover:bg-primary/10 transition-colors whitespace-nowrap">
            Prueba gratis · {pct} %
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="w-80 p-4 space-y-3">
          <Row label="Tu prueba gratis" right={`te queda ${pct} %`} sub={`Prueba cada herramienta hasta ${trial.perTool} veces. Llevas ${fmtNumber(trial.uses)} pruebas.`} pct={1 - pct / 100} low={pct <= 20} />
          <p className="text-[12px] text-muted-foreground">
            Con PRO sigues sin límite de pruebas: {fmtNumber(limit)} créditos cada mes. Cancelas cuando quieras y tienes garantía de 30 días (reembolso).
          </p>
          <button type="button" onClick={() => { void startCheckout({ action: "subscribe", plan: "pro" }); }}
            className="btn-primary-nova w-full rounded-lg px-4 py-2 text-sm font-semibold">
            Activar PRO →
          </button>
        </PopoverContent>
      </Popover>
    );
  }

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
            sub={isAdmin ? undefined : `Usaste ${usedPct} % · se renuevan el ${renew}`} pct={isAdmin ? 0 : usedPct / 100} low={low} />
          {purchased > 0 && (
            <Row label="Créditos comprados" right={fmtNumber(purchased)} sub="No caducan: se usan después de los del mes." />
          )}
          {bonus && (
            <Row label="Bono por publicar" right={`${fmtNumber(bonus.monthTotal)} de ${fmtNumber(bonus.monthCap)}`}
              sub={bonus.claimedToday ? "Ya ganaste el de hoy." : `Gana ${bonus.perClaim} hoy: publica algo hecho aquí.`}
              pct={bonus.monthTotal / bonus.monthCap} />
          )}
        </div>
        <div className="border-t border-border px-4 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground">Saldo total</span>
            <span className="text-[13px] font-semibold text-foreground tabular-nums">{isAdmin ? "Ilimitado" : fmtNumber(balance)}</span>
          </div>
          {rinde && <p className="mt-1 text-[11px] text-muted-foreground">Te rinde para {rinde}.</p>}
        </div>
        <a href="#/creditos" className="block border-t border-border px-4 py-2.5 text-[12px] text-foreground hover:bg-secondary/60">
          {low ? "Recargar créditos" : "Ver desglose y recargar"}
        </a>
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
