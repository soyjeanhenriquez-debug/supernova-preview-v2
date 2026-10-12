import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { startCheckout } from "@/lib/stripe";
import { formatUsd } from "@/lib/plans";
import { creditEquivalentsLine } from "@/components/CreditRing";
import { useCredits } from "@/hooks/useCredits";
import { useCreditsLeft } from "@/hooks/useCreditsLeft";
import { fmtNumber } from "@/lib/gemelo";
import { refreshTrialState, useTrialState } from "@/hooks/useTrialState";
import { PLANS } from "@/lib/plans";

/**
 * Probadores (10-oct-2026, decisión de Jean): cuando el servidor responde "recharge_required" (ya
 * usó las pruebas gratis de esa acción, o la acción es cara), sale esta ventana. NO bloquea la app:
 * se cierra y la persona sigue con cualquier otra herramienta. La regla vive en el servidor
 * (edge_guard_charge); aquí solo se muestra. Se abre con el evento RECHARGE_EVENT (fnAuth.offerRecharge).
 *
 * 11-oct-2026 (misión "pagar y recargar"): el evento puede traer detalle (`CustomEvent.detail`):
 *  · reason "recharge_required" (probador sin recarga) o "insufficient_credits" (cliente sin saldo);
 *  · cost (lo que costaba la acción) y balance (lo que tiene), si el servidor los mandó.
 * Es el momento de más intención: la persona acaba de pedir algo y no salió. Por eso el botón
 * principal compra directo el pack que desbloquea (POWER, 2.000 créditos por US$20) sin pasar por
 * otra pantalla; "Ver todos los paquetes" queda como segunda opción. El precio del pack es el de
 * src/pages/CreditsPage.tsx (Whop cobra; el webhook acredita).
 */
export const RECHARGE_EVENT = "sn:recharge-required";

export type RechargeReason = "recharge_required" | "insufficient_credits";
export interface RechargeDetail { reason?: RechargeReason; cost?: number; balance?: number }

// El pack mínimo que levanta el bloqueo de probador (US$20 = 2.000 créditos). Mismo id y precio
// que PACKS en CreditsPage y WHOP_PACKS en lib/stripe.
const UNLOCK_PACK = { id: "power", credits: 2000, price: 20 };

export function RechargePopup({ onRecharge }: { onRecharge: () => void }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<RechargeDetail>({});
  const [buying, setBuying] = useState(false);
  useEffect(() => {
    const show = (e: Event) => {
      const d = (e as CustomEvent<RechargeDetail | undefined>).detail;
      setDetail(d && typeof d === "object" ? d : {});
      setOpen(true);
      void refreshTrialState();
    };
    window.addEventListener(RECHARGE_EVENT, show);
    return () => window.removeEventListener(RECHARGE_EVENT, show);
  }, []);

  const noBalance = detail.reason === "insufficient_credits";
  const rinde = creditEquivalentsLine(UNLOCK_PACK.credits, { withOr: true });
  // Prueba gratis (12-oct-2026): a una cuenta gratis no se le ofrece un pack, se le ofrece PRO.
  const trial = useTrialState();
  const free = trial.kind === "free";
  const subscribe = async () => {
    setBuying(true);
    const redirected = await startCheckout({ action: "subscribe", plan: "pro" });
    if (!redirected) setBuying(false);
  };

  const buy = async () => {
    setBuying(true);
    const redirected = await startCheckout({ action: "pack", pack_id: UNLOCK_PACK.id });
    if (!redirected) setBuying(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setBuying(false); }}>
      <DialogContent className="max-w-md">
        {free ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">
                {trial.leftPct <= 0 ? "Terminaste tu prueba gratis" : "Ya probaste esto gratis"}
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    {trial.leftPct <= 0
                      ? "Usaste todas tus pruebas gratis. Lo que hiciste queda guardado."
                      : `Usaste tus ${trial.perTool} pruebas gratis de esta herramienta. Puedes seguir probando las demás.`}
                  </p>
                  <p>
                    Con <b className="text-foreground">SUPERNOVA PRO</b> sigues sin límite de pruebas: {fmtNumber(2000)} créditos cada mes
                    para crear lo que necesites. Cuesta {formatUsd(PLANS.pro.price)} al mes y cancelas cuando quieras.
                  </p>
                  <p className="text-[12px]">Garantía: 30 días; si no terminas tu producto, te devolvemos el 100 % (reembolso).</p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-2 sm:flex-col sm:space-x-0">
              <button type="button" onClick={subscribe} disabled={buying} className="btn-primary-nova w-full rounded-lg px-4 py-2.5 text-sm font-semibold">
                {buying ? "Abriendo el pago…" : "Activar PRO →"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:text-foreground">
                {trial.leftPct <= 0 ? "Ahora no" : "Seguir probando otra cosa"}
              </button>
            </DialogFooter>
          </>
        ) : (<>
        <DialogHeader>
          <DialogTitle className="font-display">
            {noBalance ? "Te faltan créditos para esto" : "Recarga para seguir con esta herramienta"}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {noBalance ? (
                <p>
                  {typeof detail.cost === "number" && detail.cost > 0
                    ? <>Esto cuesta <b className="text-foreground">{fmtNumber(detail.cost)} créditos</b>{typeof detail.balance === "number" ? <> y te quedan <b className="text-foreground">{fmtNumber(Math.max(0, detail.balance))}</b></> : null}.</>
                    : "Se te acabaron los créditos del mes."}{" "}
                  Lo que ya hiciste queda guardado. Recarga y sigues justo aquí: los créditos que compras no caducan.
                </p>
              ) : (
                <p>
                  Ya usaste tus pruebas gratis de esta herramienta. Recarga al menos {formatUsd(UNLOCK_PACK.price)} para seguir usándola:
                  lo que recargas no caduca. Mientras tanto, puedes seguir probando todo lo demás.
                </p>
              )}
              <p className="text-[12px]">
                Con {UNLOCK_PACK.credits.toLocaleString("de-DE")} créditos haces {rinde || "muchas piezas"}.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2 sm:flex-col sm:space-x-0">
          <button type="button" onClick={buy} disabled={buying} className="btn-primary-nova w-full rounded-lg px-4 py-2.5 text-sm font-semibold">
            {buying ? "Abriendo el pago…" : `Recargar ${UNLOCK_PACK.credits.toLocaleString("de-DE")} créditos por ${formatUsd(UNLOCK_PACK.price)} →`}
          </button>
          <div className="flex items-center justify-between gap-2 w-full">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:text-foreground">
              {noBalance ? "Ahora no" : "Seguir probando otra cosa"}
            </button>
            <button type="button" onClick={() => { setOpen(false); onRecharge(); }} className="rounded-lg border border-border px-3 py-2 text-[13px] text-foreground hover:bg-secondary/60">
              Ver todos los paquetes
            </button>
          </div>
        </DialogFooter>
        </>)}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Aviso suave DESPUÉS de un resultado bueno (12-oct-2026, misión R2-03 "pagar y recargar").
 * Es el momento de más valor: la persona acaba de decir "Sí, me sirvió". Si su saldo es bajo
 * (< NUDGE_BELOW) le decimos qué le queda y que 2.000 créditos son US$20 y no caducan.
 * Reglas: nunca en medio de una generación (solo se pinta donde ToolFeedback ya recibió el "Sí",
 * que aparece con el resultado terminado), nunca al admin, una sola vez por sesión, se cierra
 * con "Ahora no", y el botón compra directo el pack POWER (Whop) sin otra pantalla.
 * Uso (ToolFeedback, dueño R2-10): `{vote === true && <RechargeNudge />}`.
 */
export const NUDGE_BELOW = 300;
const NUDGE_KEY = "supernova_recharge_nudge_shown";
let nudgeShownThisSession = false;

/** ¿Toca ofrecer recarga después de un buen resultado? (puro, para pruebas y otros usos) */
export function shouldNudgeRecharge(balance: number, isAdmin: boolean, alreadyShown: boolean) {
  return !isAdmin && !alreadyShown && Number.isFinite(balance) && balance < NUDGE_BELOW;
}

function nudgeAlreadyShown() {
  if (nudgeShownThisSession) return true;
  try { return sessionStorage.getItem(NUDGE_KEY) === "1"; } catch { return false; }
}

export function RechargeNudge() {
  const { balance } = useCredits();
  const { isAdmin } = useCreditsLeft();
  // Se decide una vez al montar: si el saldo cambia después, no aparece ni desaparece de golpe.
  const [show, setShow] = useState(() => shouldNudgeRecharge(balance, isAdmin, nudgeAlreadyShown()));
  const [buying, setBuying] = useState(false);
  useEffect(() => {
    if (!show) return;
    nudgeShownThisSession = true;
    try { sessionStorage.setItem(NUDGE_KEY, "1"); } catch { /* sin almacenamiento */ }
  }, [show]);
  if (!show) return null;

  const rinde = creditEquivalentsLine(balance, { withOr: true });
  const buy = async () => {
    setBuying(true);
    const redirected = await startCheckout({ action: "pack", pack_id: UNLOCK_PACK.id });
    if (!redirected) setBuying(false);
  };
  return (
    <div role="note" className="rounded-xl border border-border p-3.5 text-[13px] text-muted-foreground space-y-2.5">
      <p>
        {balance <= 0
          ? "Se te acabaron los créditos del mes."
          : <>Te quedan <b className="text-foreground tabular-nums">{fmtNumber(balance)}</b> créditos{rinde ? ` (${rinde})` : ""}.</>}{" "}
        Si quieres seguir a este ritmo, {fmtNumber(UNLOCK_PACK.credits)} créditos son {formatUsd(UNLOCK_PACK.price)} y no caducan.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={buy} disabled={buying}
          className="btn-primary-nova min-h-[36px] rounded-lg px-3 text-[12px] font-semibold disabled:opacity-60">
          {buying ? "Abriendo el pago…" : `Recargar ${fmtNumber(UNLOCK_PACK.credits)} por ${formatUsd(UNLOCK_PACK.price)}`}
        </button>
        <button type="button" onClick={() => setShow(false)}
          className="min-h-[36px] rounded-lg px-3 text-[12px] text-muted-foreground hover:text-foreground">
          Ahora no
        </button>
      </div>
    </div>
  );
}

/** Solo para pruebas: olvida que ya se mostró en esta sesión. */
export function __resetRechargeNudge() {
  nudgeShownThisSession = false;
  try { sessionStorage.removeItem(NUDGE_KEY); } catch { /* sin almacenamiento */ }
}
