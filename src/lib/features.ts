import { useIsAdmin } from "@/hooks/useIsAdmin";

/**
 * Secciones en pausa (decisión de Jean, 23-sep-2026, "80/20"): los clientes no las ven y sus
 * tareas de fondo están detenidas; los admin sí las ven, para seguir probándolas. Para lanzar
 * una, quítala de esta lista (y reactiva su tarea en pg_cron si la tiene: Mercado →
 * supernova-market-feed-sync-daily).
 */
// "Proyectos" NO va aquí: es donde se guardan las mini apps de "Hacer mi versión".
// "Crear producto" (Fase 1, ebook o curso con IA): en piloto con Jean; se quita de aquí para lanzarlo.
// "UGC con IA" ya no está aquí: abre Influencer IA, que sabe mostrar "pronto" si el servidor lo tiene cerrado.
// "Recompensas" (11-oct-2026): en pausa para clientes hasta que exista la campaña de Whop (rewards.ts whopUrl):
// no se promete un pago que todavía no existe.
// "Estudio de avatar" y "Quitar marca" (22-oct-2026, al pasarlas a main con el árbol): solo admin hasta que Jean las abra.
// Estudio de avatar necesita antes su migración y la función avatar-studio en producción.
export const ADMIN_ONLY_PAGES = new Set(["Media Studio", "Mercado", "Crear", "Oráculo", "Crear producto", "Recompensas", "Estudio de avatar", "Quitar marca"]);

/** Los idiomas inglés y portugués también quedan en pausa para clientes: la app va en español. */
export const MULTI_LANGUAGE_FOR_CLIENTS = false;

export function useFeatureAccess() {
  const { isAdmin, loading } = useIsAdmin();
  const canSee = (page: string) => isAdmin === true || !ADMIN_ONLY_PAGES.has(page);
  return { isAdmin: isAdmin === true, loading, canSee };
}
