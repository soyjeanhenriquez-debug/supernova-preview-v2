import { useState } from "react";
import { toast } from "sonner";
import { useBusinessProfile } from "@/lib/businessProfile";
import type { SellBrief } from "@/lib/sellThis";

/**
 * "Vender esto: usarlo como mi producto" SIN window.confirm (R2-12, 12-oct-2026). El diálogo gris del
 * sistema rompía el diseño y en la prueba congeló la pestaña. Si la ficha ya tiene OTRO producto, aquí
 * no se guarda nada: queda `pending` y la pantalla pinta <SellConfirmBar> con "Sí, reemplazar" / "Cancelar".
 * Misma lógica de guardado que src/lib/sellThis.ts (lo que la oferta no trae se vacía).
 */

/** ¿Hay que preguntar antes de guardar? Solo si la ficha tiene un producto y es otro. */
export function needsReplaceConfirm(current: string | null | undefined, product: string): boolean {
  const c = (current ?? "").trim();
  return !!c && c.toLowerCase() !== product.trim().toLowerCase();
}

type Pending = { brief: SellBrief; current: string; then?: () => void; quiet?: boolean };

export function useSellOffer() {
  const { profile, loaded, savePatch } = useBusinessProfile();
  const [selling, setSelling] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  const save = async (b: SellBrief, then?: () => void, quiet?: boolean): Promise<boolean> => {
    setSelling(true);
    const ok = await savePatch({
      product: (b.product ?? "").trim(), who: (b.who ?? "").trim(), promise: (b.promise ?? "").trim(),
      price: (b.price ?? "").trim(), proof: "",
    });
    setSelling(false);
    if (!ok) { toast.error("No se pudo llenar tu ficha. Intenta de nuevo."); return false; }
    if (!quiet) toast.success("Listo: tu ficha quedó con esta oferta. Las herramientas ya la usan.");
    then?.();
    return true;
  };

  /**
   * Guarda la oferta como producto activo y luego corre `then` (navegar a otra herramienta…).
   * `quiet`: sin aviso de "listo" (cuando el siguiente paso ya lo dice todo).
   * Devuelve true si guardó ya; false si falta confirmar o falló.
   */
  const sell = async (b: SellBrief, opts: { then?: () => void; quiet?: boolean } = {}): Promise<boolean> => {
    if (selling) return false;
    const product = (b.product ?? "").trim();
    if (!product) { toast.error("Esta oferta no tiene nombre todavía. Elige otra."); return false; }
    if (!loaded) { toast.info("Un segundo: estamos cargando tu ficha."); return false; }
    if (needsReplaceConfirm(profile.product, product)) {
      setPending({ brief: b, current: profile.product.trim(), then: opts.then, quiet: opts.quiet });
      return false;
    }
    return save(b, opts.then, opts.quiet);
  };

  const confirm = async () => {
    const p = pending;
    setPending(null);
    if (p) await save(p.brief, p.then, p.quiet);
  };
  const cancel = () => setPending(null);

  return { sell, selling, pending, confirm, cancel };
}
