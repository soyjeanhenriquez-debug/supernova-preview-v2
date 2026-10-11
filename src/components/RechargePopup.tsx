import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Probadores (10-oct-2026, decisión de Jean): cuando el servidor responde "recharge_required" (ya
 * usó las pruebas gratis de esa acción, o la acción es cara), sale esta ventana. NO bloquea la app:
 * se cierra y la persona sigue con cualquier otra herramienta. La regla vive en el servidor
 * (edge_guard_charge); aquí solo se muestra. Se abre con el evento RECHARGE_EVENT (fnAuth.offerRecharge).
 */
export const RECHARGE_EVENT = "sn:recharge-required";

export function RechargePopup({ onRecharge }: { onRecharge: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(RECHARGE_EVENT, show);
    return () => window.removeEventListener(RECHARGE_EVENT, show);
  }, []);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Recarga para seguir con esta herramienta</DialogTitle>
          <DialogDescription>
            Ya usaste tus pruebas gratis de esta herramienta. Recarga al menos US$20 para seguir usándola: lo que recargas no caduca.
            Mientras tanto, puedes seguir probando todo lo demás.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            Seguir probando otra cosa
          </button>
          <button type="button" onClick={() => { setOpen(false); onRecharge(); }} className="rounded-lg gradient-brand px-4 py-2 text-sm font-semibold text-primary-foreground">
            Ver paquetes
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
