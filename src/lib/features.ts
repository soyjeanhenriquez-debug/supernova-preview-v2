import { useIsAdmin } from "@/hooks/useIsAdmin";

/**
 * Secciones en pausa (decisión de Jean, 23-sep-2026, "80/20"): los clientes no las ven y sus
 * tareas de fondo están detenidas; los admin sí las ven, para seguir probándolas. Para lanzar
 * una, quítala de esta lista (y reactiva su tarea en pg_cron si la tiene: Mercado →
 * supernova-market-feed-sync-daily).
 */
// "Proyectos" NO va aquí: es donde se guardan las mini apps de "Hacer mi versión".
export const ADMIN_ONLY_PAGES = new Set(["Media Studio", "Mercado", "Crear", "Oráculo"]);

/** Los idiomas inglés y portugués también quedan en pausa para clientes: la app va en español. */
export const MULTI_LANGUAGE_FOR_CLIENTS = false;

export function useFeatureAccess() {
  const { isAdmin, loading } = useIsAdmin();
  const canSee = (page: string) => isAdmin === true || !ADMIN_ONLY_PAGES.has(page);
  return { isAdmin: isAdmin === true, loading, canSee };
}
