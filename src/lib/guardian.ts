/**
 * Guardián del Creador (24-oct-2026): tipos y lógica pura del panel Admin → Guardián del Creador.
 * Las auditorías viven en la base (supabase/migrations/20261025200000_guardian_creador.sql); las reglas del
 * código, en src/guardian/codeRules.ts.
 */
export type Severidad = "critico" | "importante" | "mejora";
export interface Finding {
  id: string; fingerprint: string; feature: string; severity: Severidad;
  perspective: "claridad" | "esfuerzo" | "inteligencia" | "calidad" | "confianza";
  problem: string; impact: string; evidence: Record<string, unknown> | null; evidence_kind: "observado" | "hipotesis";
  proposal: string; fix_type: "autonoma" | "requiere_ok";
  status: "abierto" | "pendiente_ok" | "aprobado" | "corregido" | "rechazado" | "resuelto";
  verification: string | null; occurrences: number; last_seen: string; decision_note: string | null;
}
export interface Run {
  id: string; kind: string; status: string; requested_at: string; started_at: string | null; finished_at: string | null;
  steps: string[]; steps_done: number; current_step: string | null;
  summary: { pruebas?: { pasaron: number; fallaron: number; sin_probar: number }; indicadores?: Indicadores } | null;
}
/** Lo que mide el paso «indicadores» (cobros por herramienta y tareas con src/lib/toolEvents.ts). */
export interface Tarea {
  herramienta: string; abiertas: number; empezadas: number; completadas: number; pct_completadas: number | null;
  seg_primer_resultado: number | null; intentos_por_resultado: number | null; abandonos: number; fallaron: number; regeneraron: number; descargaron: number;
}
export interface Indicadores {
  por_herramienta?: { herramienta: string; cobros: number; personas: number; reembolsos: number }[];
  tareas?: { por_herramienta: Tarea[]; empezadas: number };
  sin_medir?: string[];
  nota?: string;
}
export interface Check { id: number; area: string; name: string; ok: boolean | null; method: "servidor" | "datos" | "codigo" | "inspeccion" | "punta_a_punta"; detail: string | null }
export interface JourneyStep { journey: string; step_order: number; step: string; status: "funciona" | "con_friccion" | "falla" | "no_probado"; method: Check["method"]; evidence: string | null }

/** Los pasos de una auditoría completa, en el orden de private.guardian_steps_for('completa'). */
export const GUARDIAN_PASOS: { id: string; label: string }[] = [
  { id: "pantallazos", label: "Errores que vieron las personas" },
  { id: "cobros_sin_resultado", label: "Cobros sin resultado" },
  { id: "reembolsos", label: "Generaciones pagadas que fallaron" },
  { id: "repeticiones", label: "Acciones repetidas" },
  { id: "atascados", label: "Trabajos que se quedan en proceso" },
  { id: "tareas", label: "Tareas automáticas" },
  { id: "opiniones", label: "Opiniones de las personas" },
  { id: "precios", label: "Precios y margen" },
  { id: "seguridad", label: "Seguridad de la base" },
  { id: "reel_studio", label: "Reel Studio" },
  { id: "pruebas_funcionales", label: "Pruebas de punta a punta" },
  { id: "indicadores", label: "Indicadores por herramienta" },
  { id: "cerrar", label: "Cerrando y resumiendo" },
];

const PESO: Record<Severidad, number> = { critico: 0, importante: 1, mejora: 2 };

/** Primero lo crítico; dentro de cada nivel, lo que más se repite y lo más reciente. */
export function ordenHallazgos(list: Finding[]): Finding[] {
  return [...list].sort((a, b) => PESO[a.severity] - PESO[b.severity] || b.occurrences - a.occurrences || b.last_seen.localeCompare(a.last_seen));
}

/** Pruebas agrupadas por área; dentro de cada una, primero las que fallaron y luego las que no se pudieron probar. */
export function groupChecks(list: Check[]): [string, Check[]][] {
  const rank = (c: Check) => (c.ok === false ? 0 : c.ok === null ? 1 : 2);
  const m = new Map<string, Check[]>();
  for (const c of list) m.set(c.area, [...(m.get(c.area) ?? []), c]);
  return [...m.entries()].map(([k, v]) => [k, v.sort((a, b) => rank(a) - rank(b))] as [string, Check[]])
    .sort((a, b) => Math.min(...a[1].map(rank)) - Math.min(...b[1].map(rank)));
}
