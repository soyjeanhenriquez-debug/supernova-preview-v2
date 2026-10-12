import { Loader2 } from "lucide-react";

/** Confirmación en línea de "¿reemplazar el producto de tu ficha?" (en vez de window.confirm). */
export function SellConfirmBar({ current, next, busy, onConfirm, onCancel }: {
  current: string; next: string; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div role="alertdialog" aria-label="Reemplazar el producto de tu ficha"
      className="rounded-xl border border-primary/40 bg-primary/5 px-3.5 py-3 text-[13px] text-foreground space-y-2.5">
      <p className="leading-snug">
        Tu ficha ya tiene «<b>{current.slice(0, 70)}</b>». ¿La cambias por «<b>{next.slice(0, 70)}</b>»?
        <span className="block text-[11.5px] text-muted-foreground mt-0.5">Puedes volver a cambiarla cuando quieras en Mi negocio.</span>
      </p>
      <div className="flex gap-2">
        <button onClick={onConfirm} disabled={busy}
          className="h-9 px-4 rounded-lg btn-primary-nova text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Sí, cambiarla
        </button>
        <button onClick={onCancel} disabled={busy}
          className="h-9 px-4 rounded-lg border border-border text-[13px] text-foreground hover:bg-secondary disabled:opacity-60">
          Cancelar
        </button>
      </div>
    </div>
  );
}
