/**
 * Estado de las 6 etapas del recorrido "Mi negocio". Lo usan el recorrido (BusinessJourney) y
 * "Mis productos" (ProductsPage): una sola regla para que las dos pantallas nunca digan cosas distintas.
 */
export type JourneyProduct = {
  product?: string | null; who?: string | null; promise?: string | null;
  validation?: { completed_at?: string | null; score?: number | null } | null;
  pricing?: { chosen?: string | null } | null;
  launch_plan?: { tasks?: { done: boolean; group?: string }[] } | null;
  recovery?: { messages?: unknown[] } | null;
  journey?: { done?: Record<string, boolean> } | null;
};
export type JourneyAds = { count: number; measured: boolean };
export type BuildRow = { status: string; pieces_done: number; pieces_total: number };

export const STAGE_NAMES = ["Elegir", "Validar", "Precio", "Construir", "Vender", "Medir"];

const filled = (s: string | null | undefined) => (s ?? "").trim().length > 2;

/** Un ebook o curso terminado en "Crear producto" (tabla product_builds). */
export const buildIsDone = (b: BuildRow) => b.status === "listo" || (b.pieces_total > 0 && b.pieces_done >= b.pieces_total);

/**
 * Del plan de lanzamiento, la etapa 4 solo pide lo que es CONSTRUIR: los grupos "1. Tu producto" y
 * "2. Página y cobro" (o "2. Tienda y cobro"). Anuncios y lanzamiento son las etapas 5 y 6.
 */
export function buildTasksDone(tasks: { done: boolean; group?: string }[] | undefined) {
  const build = (tasks ?? []).filter(t => /^[12]\./.test(t.group ?? ""));
  return build.length > 0 && build.every(t => t.done);
}

/** Tareas de construir hechas / totales (para mostrar el avance). */
export function buildTasksProgress(tasks: { done: boolean; group?: string }[] | undefined) {
  const build = (tasks ?? []).filter(t => /^[12]\./.test(t.group ?? ""));
  return { done: build.filter(t => t.done).length, total: build.length };
}

/** Qué etapas están hechas (índice 0 = etapa 1). */
export function journeyStages(p: JourneyProduct, ads: JourneyAds | null | undefined, hasBuiltProduct: boolean) {
  const done = [
    filled(p.product) && filled(p.who) && filled(p.promise),
    !!p.validation?.completed_at && (p.validation?.score == null || p.validation.score >= 50),
    !!p.pricing?.chosen,
    // El ebook o curso listo, las tareas de producto y de página/cobro del plan, o "Ya lo hice" (mini app hecha fuera).
    hasBuiltProduct || buildTasksDone(p.launch_plan?.tasks) || !!p.journey?.done?.["4"],
    (ads?.count ?? 0) >= 5,
    !!ads?.measured && !!p.recovery?.messages?.length,
  ];
  const nextIdx = done.findIndex(d => !d);
  return { done, doneCount: done.filter(Boolean).length, next: nextIdx === -1 ? null : nextIdx + 1 };
}
