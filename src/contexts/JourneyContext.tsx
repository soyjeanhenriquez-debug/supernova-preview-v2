import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts } from "@/contexts/ProductContext";
import { journeyStages, buildIsDone, STAGE_NAMES, type BuildRow, type JourneyProduct } from "@/lib/journey";
import { track } from "@/lib/analytics";

/**
 * En qué etapa va el producto activo, calculado UNA vez y compartido por la barra de etapa, el menú
 * y "Mi ficha" (misma regla que el recorrido del Inicio: src/lib/journey.ts). Se recalcula al
 * cambiar de producto, al cambiar de pantalla y cuando alguien avisa con notifyJourneyChanged()
 * (p. ej. al guardar la ficha o crear un anuncio). Tres lecturas pequeñas por producto.
 */
export const JOURNEY_EVENT = "supernova:journey-changed";
export const notifyJourneyChanged = () => window.dispatchEvent(new Event(JOURNEY_EVENT));

interface JourneyState {
  loaded: boolean;
  done: boolean[];
  doneCount: number;
  /** Primera etapa sin hacer (1-6) o null si completó las 6. */
  next: number | null;
  refresh: () => void;
}

const EMPTY: boolean[] = [false, false, false, false, false, false];
const JourneyContext = createContext<JourneyState>({ loaded: false, done: EMPTY, doneCount: 0, next: 1, refresh: () => {} });

export function JourneyProvider({ page, children }: { page: string; children: ReactNode }) {
  const { user } = useAuth();
  const { activeId } = useProducts();
  const [state, setState] = useState<Omit<JourneyState, "refresh">>({ loaded: false, done: EMPTY, doneCount: 0, next: 1 });
  const seq = useRef(0);
  const prevDone = useRef<{ id: string; done: boolean[] } | null>(null);

  const load = useCallback(async () => {
    if (!user || !activeId) return;
    const my = ++seq.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const [prod, ads, builds] = await Promise.all([
      db.from("products").select("product,who,promise,validation,pricing,launch_plan,recovery,journey").eq("id", activeId).maybeSingle(),
      db.from("mandala_ads").select("spend,sales,status").eq("product_id", activeId).limit(300),
      db.from("product_builds").select("status,pieces_done,pieces_total").eq("product_id", activeId).limit(30),
    ]);
    if (my !== seq.current) return; // llegó una respuesta más nueva (cambio de producto)
    if (prod.error) { console.error("journey:", prod.error.message); return; }
    const list = (ads.data ?? []) as { spend: number | null; sales: number | null; status: string }[];
    const r = journeyStages(
      (prod.data ?? {}) as JourneyProduct,
      { count: list.length, measured: list.some(a => a.spend != null || a.sales != null || a.status === "ganador" || a.status === "descartado") },
      ((builds.data ?? []) as BuildRow[]).some(buildIsDone),
    );
    setState({ loaded: true, done: r.done, doneCount: r.doneCount, next: r.next });
    // Medición: etapa que pasa de pendiente a hecha en esta visita (no al cargar ni al cambiar de producto).
    const before = prevDone.current;
    if (before && before.id === activeId) {
      r.done.forEach((d, i) => { if (d && !before.done[i]) track("etapa_completada", { etapa: i + 1, nombre: STAGE_NAMES[i] }); });
    }
    prevDone.current = { id: activeId, done: r.done };
  }, [user, activeId]);

  // Cambio de producto: se empieza de cero para no mostrar la etapa del producto anterior.
  useEffect(() => { setState(s => ({ ...s, loaded: false })); load(); }, [load]);

  // Cambio de pantalla o aviso de otra pantalla: recalcular, agrupando avisos seguidos.
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const soon = useCallback(() => { clearTimeout(timer.current); timer.current = setTimeout(load, 400); }, [load]);
  useEffect(() => { soon(); }, [page, soon]);
  useEffect(() => {
    window.addEventListener(JOURNEY_EVENT, soon);
    return () => { window.removeEventListener(JOURNEY_EVENT, soon); clearTimeout(timer.current); };
  }, [soon]);

  return <JourneyContext.Provider value={{ ...state, refresh: load }}>{children}</JourneyContext.Provider>;
}

export const useJourney = () => useContext(JourneyContext);
