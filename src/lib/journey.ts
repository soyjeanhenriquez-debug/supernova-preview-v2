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

/**
 * Las 6 etapas para la barra de etapa y el menú: nombre, qué se logró al terminarla y la
 * herramienta principal (a dónde lleva "Siguiente: …"). Mismos textos que BusinessJourney.
 */
export const STAGES = [
  { n: 1, short: "Elegir", title: "Elige qué vas a vender", doneNote: "Ya tienes tu ficha", page: "Ofertas" },
  { n: 2, short: "Validar", title: "Comprueba que se vende", doneNote: "Tu oferta pasó la matriz", page: "Validar" },
  { n: 3, short: "Precio", title: "Ponle precio", doneNote: "Tu precio está elegido", page: "Precio" },
  { n: 4, short: "Construir", title: "Construye tu producto", doneNote: "Tu producto y tu cobro están listos", page: "Plan" },
  { n: 5, short: "Vender", title: "Crea tus anuncios", doneNote: "Tienes tus 5 anuncios", page: "Mándala" },
  { n: 6, short: "Medir", title: "Mide y recupera", doneNote: "Mides y recuperas ventas", page: "Resultados" },
] as const;

/**
 * A qué etapa pertenece cada pantalla (la misma organización que el menú). Inicio, Mis productos,
 * Créditos y las pantallas de solo admin no son de ninguna etapa.
 */
export const PAGE_STAGE: Record<string, number> = {
  "Mi negocio": 1, "Ofertas": 1, "Buscar Ofertas Winner": 1, "Anuncios Ganadores": 1, "Mini Apps": 1,
  "Validar": 2,
  "Precio": 3,
  "Crear producto": 4, "Plan": 4, "Proyectos": 4,
  "Mándala": 5, "Hooks": 5, "Contenido": 5, "Generadores": 5, "Media Studio": 5,
  "Resultados": 6, "Recuperar": 6,
};

/**
 * Qué decirle al usuario en la pantalla donde está, sin bloquear nada:
 *   current  → está en la etapa que le toca
 *   done     → esta etapa ya está lista: ofrecer la siguiente
 *   ahead    → se adelantó: recordar la que falta (se permite trabajar aquí)
 *   none     → pantalla sin etapa (Créditos…): recordar su siguiente paso
 *   all_done → completó las 6
 */
export type StageHintKind = "current" | "done" | "ahead" | "none" | "all_done";
export function stageHint(page: string, done: boolean[], next: number | null): { kind: StageHintKind; stage: number | null; next: number | null } {
  const stage = PAGE_STAGE[page] ?? null;
  if (next === null) return { kind: "all_done", stage, next };
  if (stage === null) return { kind: "none", stage, next };
  if (done[stage - 1]) return { kind: "done", stage, next };
  if (stage === next) return { kind: "current", stage, next };
  return { kind: "ahead", stage, next };
}
