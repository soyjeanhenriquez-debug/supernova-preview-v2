import { useState } from "react";
import { toast } from "sonner";
import { useBusinessProfile } from "@/lib/businessProfile";
import type { Offer } from "@/lib/offers";

/**
 * "Vender esto: usarlo como mi producto" (gratis): llena la ficha de "Mi negocio" con una oferta
 * elegida (Ofertas, Mini Apps, Hacer mi versión) y lleva a revisarla. Si la ficha ya tenía producto,
 * pide confirmación antes de reemplazarlo. Mercado tiene su propio "Vender esto", que lleva a la Mándala.
 */
export type SellBrief = { product?: string | null; who?: string | null; promise?: string | null; price?: string | null };

/** Lo que sabemos de una oferta del radar, en los campos de la ficha. */
export function offerBrief(o: Offer): SellBrief {
  return {
    product: o.product_name || o.sample_title || o.page_name,
    who: o.target_audience,
    promise: o.mechanism || o.why_wins,
    price: o.price_hint,
  };
}

export function useSellThis(onNavigate?: (page: string) => void) {
  const { profile, loaded, savePatch } = useBusinessProfile();
  const [selling, setSelling] = useState(false);

  const sell = async (b: SellBrief) => {
    if (selling) return;
    const product = (b.product ?? "").trim();
    if (!product) { toast.error("Esta oferta no tiene nombre todavía. Elige otra."); return; }
    if (!loaded) { toast.info("Un segundo: estamos cargando tu ficha."); return; }
    const current = profile.product.trim();
    if (current && current !== product
      && !window.confirm(`Tu ficha ya tiene un producto: «${current.slice(0, 80)}». ¿Reemplazarlo por esta oferta?`)) return;
    setSelling(true);
    // Lo que la oferta no trae se vacía: no se mezcla con lo del producto anterior.
    // savePatch recorta a lo que acepta la base (texto 300, precio 40).
    const ok = await savePatch({
      product, who: (b.who ?? "").trim(), promise: (b.promise ?? "").trim(), price: (b.price ?? "").trim(), proof: "",
    });
    setSelling(false);
    if (!ok) { toast.error("No se pudo llenar tu ficha. Intenta de nuevo."); return; }
    toast.success("Listo: tu ficha quedó llena con esta oferta. Revísala y cámbiala a tu gusto.");
    if (onNavigate) onNavigate("Mi negocio"); else { window.location.hash = "#/mi-negocio"; window.scrollTo({ top: 0 }); }
  };

  return { sell, selling };
}
