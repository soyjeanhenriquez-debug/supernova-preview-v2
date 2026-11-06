import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Ofertas guardadas con estrellita (06-nov-2026, pedido de Jean): gratis y aparte de «Seguir» (que vigila la oferta
 * y cuesta créditos). Se ven en «Lo que creaste». Un solo pedido a la base para todas las tarjetas: el conjunto vive
 * en memoria de la pestaña y cada tarjeta se entera cuando cambia.
 */
// La tabla aún no está en los tipos generados de Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabla = () => (supabase as any).from("offer_favorites");
let ids: Set<string> | null = null;
let cargando: Promise<void> | null = null;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach(f => f());

function cargar() {
  if (!cargando) {
    cargando = tabla().select("offer_id").then(({ data }: { data: { offer_id: string }[] | null }) => {
      ids = new Set((data ?? []).map(r => r.offer_id));
      avisar();
    });
  }
  return cargando;
}

export function useOfferFavorites() {
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN(n => n + 1);
    oyentes.add(f);
    void cargar();
    return () => { oyentes.delete(f); };
  }, []);

  const isFavorite = useCallback((id: string) => !!ids?.has(id), []);
  const toggle = useCallback(async (id: string) => {
    const antes = !!ids?.has(id);
    ids = new Set(ids ?? []);
    if (antes) ids.delete(id); else ids.add(id);
    avisar();
    const { error } = antes ? await tabla().delete().eq("offer_id", id) : await tabla().insert({ offer_id: id });
    if (error) {
      ids = new Set(ids); if (antes) ids.add(id); else ids.delete(id);
      avisar();
      toast.error("No se pudo guardar. Intenta de nuevo.");
      return;
    }
    if (!antes) toast.success("Oferta guardada", { description: "La encuentras en «Lo que creaste»." });
  }, []);
  return { isFavorite, toggle };
}

/** Para pruebas: olvida lo cargado. */
export const _resetFavorites = () => { ids = null; cargando = null; };
