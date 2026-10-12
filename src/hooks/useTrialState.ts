import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Prueba gratis (12-oct-2026, decisión de Jean: "aplica la prueba gratis"). Toda cuenta con el
 * correo confirmado prueba la app con un tope que decide el SERVIDOR (my_trial_state /
 * edge_guard_charge): 5 usos por herramienta y un tope de costo real. Aquí solo se lee para
 * mostrarlo; nunca en dólares, solo "% de tu prueba".
 *   kind: "free" (cuenta gratis) · "tester" (probador) · "paid" (PRO o recargó) · null (sin sesión)
 */
export interface TrialState { kind: "free" | "tester" | "paid" | null; leftPct: number; uses: number; perTool: number }

export const TRIAL_REFRESH_EVENT = "sn:trial-refresh";
const EMPTY: TrialState = { kind: null, leftPct: 100, uses: 0, perTool: 5 };

let cache: TrialState | null = null;
let inflight: Promise<TrialState> | null = null;
const listeners = new Set<(s: TrialState) => void>();

async function load(): Promise<TrialState> {
  const { data, error } = await supabase.rpc("my_trial_state" as never);
  const d = (error ? null : data) as { kind?: string; left_pct?: number; uses?: number; per_tool?: number } | null;
  const kind = d?.kind === "free" || d?.kind === "tester" || d?.kind === "paid" ? d.kind : null;
  const s: TrialState = {
    kind,
    leftPct: typeof d?.left_pct === "number" ? d.left_pct : 100,
    uses: typeof d?.uses === "number" ? d.uses : 0,
    perTool: typeof d?.per_tool === "number" ? d.per_tool : 5,
  };
  cache = s;
  listeners.forEach(l => l(s));
  return s;
}

export function refreshTrialState(): Promise<TrialState> {
  if (!inflight) inflight = load().finally(() => { inflight = null; });
  return inflight;
}

/** Para leer sin hook (p. ej. dentro de un evento): lo último que se cargó. */
export function lastTrialState(): TrialState { return cache ?? EMPTY; }

export function useTrialState(): TrialState {
  const [s, setS] = useState<TrialState>(() => cache ?? EMPTY);
  useEffect(() => {
    listeners.add(setS);
    if (!cache) void refreshTrialState();
    const onRefresh = () => { void refreshTrialState(); };
    window.addEventListener(TRIAL_REFRESH_EVENT, onRefresh);
    return () => { listeners.delete(setS); window.removeEventListener(TRIAL_REFRESH_EVENT, onRefresh); };
  }, []);
  return s;
}
