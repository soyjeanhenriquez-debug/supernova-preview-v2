import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts } from "@/contexts/ProductContext";
import { CREDIT_COSTS, type CreditAction } from "@/hooks/useCredits";
import type { Build, BuilderModel, Piece, PieceKind } from "@/lib/productBuilder";

/**
 * Libros y cursos del PRODUCTO ACTIVO (tablas product_builds y product_build_pieces), leídos y
 * escritos directo con supabase-js: RLS deja ver solo lo propio y los permisos por columna solo
 * dejan tocar lo "humano" (títulos, de qué trata, texto, orden, portada). Lo que escribe la IA lo
 * guarda el servidor (edge function product-builder), así lo pagado nunca se pierde.
 * Editar, reordenar y autoguardar no cuesta créditos.
 */

// Tablas nuevas, aún no están en los tipos generados de Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;
const BUILD_COLS = "id,product_id,format,size,tone,title,subtitle,status,pieces_total,pieces_done,cover,created_at,updated_at";
const PIECE_COLS = "id,build_id,idx,kind,module,title,brief,content,model_slug,gen_count,generated_at,edited_at";

export type BuildPatch = Partial<Pick<Build, "title" | "subtitle" | "tone" | "status" | "cover">>;
export type PiecePatch = Partial<Pick<Piece, "title" | "brief" | "module" | "content" | "idx" | "edited_at">>;

const SAVE_DELAY = 600;

export function useProductBuilds() {
  const { user } = useAuth();
  const { activeId } = useProducts();
  const [builds, setBuilds] = useState<Build[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [models, setModels] = useState<BuilderModel[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  /** Guardados pendientes por pieza (autoguardado con espera de 0,6 s). */
  const timers = useRef(new Map<string, number>());
  const queued = useRef(new Map<string, PiecePatch>());
  const [saving, setSaving] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const uid = user?.id ?? null;
  /** Producto de la última lectura pedida: una respuesta de otro producto (vieja) se descarta. */
  const wantedRef = useRef<string | null>(null);

  const reload = useCallback(async () => {
    if (!uid || !activeId) return;
    wantedRef.current = activeId;
    const { data, error } = await db().from("product_builds").select(BUILD_COLS)
      .eq("product_id", activeId).order("updated_at", { ascending: false });
    if (wantedRef.current !== activeId) return;
    if (error) console.error("product_builds:", error.message);
    setBuilds((data ?? []) as Build[]);
    setLoaded(true);
  }, [uid, activeId]);

  // Al cambiar de producto: la lista vieja no se muestra mientras llega la nueva.
  useEffect(() => {
    setLoaded(false);
    setBuilds([]);
    void reload();
  }, [reload]);

  // Modelos: RLS devuelve los habilitados (al admin, todos); solo los `enabled` se pueden elegir y el
  // resto se muestra como "Pronto". El precio sale de credit_prices (si no se puede
  // leer, del aviso del cliente). Nunca decide el cobro: eso lo hace el servidor.
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    (async () => {
      const { data: rows, error } = await db().from("ai_builder_models")
        .select("slug,label,hint,benefits,tier,provider,allows_profanity,piece_action,enabled,sort_order")
        .order("sort_order");
      if (error) console.error("ai_builder_models:", error.message);
      const list = (rows ?? []) as (Omit<BuilderModel, "cost"> & { sort_order?: number })[];
      const actions = Array.from(new Set(list.map(m => m.piece_action).filter(Boolean)));
      const prices: Record<string, number> = {};
      if (actions.length) {
        const { data: cp } = await db().from("credit_prices").select("action,cost").in("action", actions);
        for (const r of (cp ?? []) as { action: string; cost: number }[]) prices[r.action] = r.cost;
      }
      if (!alive) return;
      setModels(list.map(m => ({
        slug: m.slug, label: m.label, hint: m.hint ?? "", benefits: Array.isArray(m.benefits) ? m.benefits : [], tier: m.tier, provider: m.provider,
        allows_profanity: !!m.allows_profanity, piece_action: m.piece_action,
        cost: prices[m.piece_action] ?? CREDIT_COSTS[m.piece_action as CreditAction] ?? 0,
        enabled: m.enabled === true,
      })));
      setModelsLoaded(true);
    })();
    return () => { alive = false; };
  }, [uid]);

  const loadPieces = useCallback(async (buildId: string): Promise<Piece[]> => {
    const { data, error } = await db().from("product_build_pieces").select(PIECE_COLS).eq("build_id", buildId).order("idx");
    if (error) console.error("product_build_pieces:", error.message);
    return (data ?? []) as Piece[];
  }, []);

  const updateBuild = useCallback(async (id: string, patch: BuildPatch) => {
    setBuilds(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)));
    const { error } = await db().from("product_builds").update(patch).eq("id", id);
    if (error) { console.error("product_builds:", error.message); return false; }
    return true;
  }, []);

  const deleteBuild = useCallback(async (id: string) => {
    const { error } = await db().from("product_builds").delete().eq("id", id);
    if (error) { console.error("product_builds:", error.message); return false; }
    setBuilds(prev => prev.filter(b => b.id !== id));
    return true;
  }, []);

  const addPiece = useCallback(async (buildId: string, p: { kind: PieceKind; module: string | null; title: string; brief: string; idx: number }) => {
    if (!uid) return null;
    const { data, error } = await db().from("product_build_pieces")
      .insert({ build_id: buildId, user_id: uid, kind: p.kind, module: p.module, title: p.title, brief: p.brief, idx: p.idx })
      .select(PIECE_COLS).single();
    if (error) { console.error("product_build_pieces:", error.message); return null; }
    return data as Piece;
  }, [uid]);

  const updatePiece = useCallback(async (id: string, patch: PiecePatch) => {
    const { error } = await db().from("product_build_pieces").update(patch).eq("id", id);
    if (error) { console.error("product_build_pieces:", error.message); return false; }
    return true;
  }, []);

  const flushPiece = useCallback(async (id: string) => {
    const t = timers.current.get(id);
    if (t) window.clearTimeout(t);
    timers.current.delete(id);
    const patch = queued.current.get(id);
    if (!patch) return true;
    queued.current.delete(id);
    setSaving(n => n + 1);
    const ok = await updatePiece(id, patch);
    setSaving(n => n - 1);
    if (ok) setLastSavedAt(Date.now());
    return ok;
  }, [updatePiece]);

  /** Autoguardado: junta los cambios de una pieza y los guarda 0,8 s después del último. */
  const savePieceDebounced = useCallback((id: string, patch: PiecePatch) => {
    queued.current.set(id, { ...(queued.current.get(id) ?? {}), ...patch });
    const t = timers.current.get(id);
    if (t) window.clearTimeout(t);
    timers.current.set(id, window.setTimeout(() => { void flushPiece(id); }, SAVE_DELAY));
  }, [flushPiece]);

  const flushAll = useCallback(async () => {
    await Promise.all(Array.from(queued.current.keys()).map(id => flushPiece(id)));
  }, [flushPiece]);

  // Si se sale de la pantalla, se cierra o se recarga la pestaña con cambios sin guardar, se guardan
  // igual (sin esperar la respuesta: el navegador puede cortar, por eso además la espera es corta).
  useEffect(() => {
    const flushNow = () => {
      for (const t of timers.current.values()) window.clearTimeout(t);
      timers.current.clear();
      for (const [id, patch] of queued.current) void db().from("product_build_pieces").update(patch).eq("id", id);
      queued.current.clear();
    };
    const onHide = () => { if (document.visibilityState === "hidden") flushNow(); };
    window.addEventListener("beforeunload", flushNow);
    window.addEventListener("pagehide", flushNow);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", flushNow);
      window.removeEventListener("pagehide", flushNow);
      document.removeEventListener("visibilitychange", onHide);
      flushNow();
    };
  }, []);

  /** Borra una pieza y corre las siguientes un lugar (así "Capítulo N" sigue siendo correcto). */
  const deletePiece = useCallback(async (id: string, rest: Piece[]) => {
    queued.current.delete(id);
    const { error } = await db().from("product_build_pieces").delete().eq("id", id);
    if (error) { console.error("product_build_pieces:", error.message); return false; }
    // En orden ascendente: nunca dos filas con el mismo idx a la vez.
    const sorted = [...rest].sort((a, b) => a.idx - b.idx);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].idx !== i) await updatePiece(sorted[i].id, { idx: i });
    }
    return true;
  }, [updatePiece]);

  /** Sube o baja una pieza: intercambia su idx con la vecina. */
  const movePiece = useCallback(async (a: Piece, b: Piece) => {
    const ok1 = await updatePiece(a.id, { idx: b.idx });
    const ok2 = ok1 && await updatePiece(b.id, { idx: a.idx });
    return ok1 && ok2;
  }, [updatePiece]);

  return {
    builds, loaded, reload, models, modelsLoaded,
    loadPieces, updateBuild, deleteBuild,
    addPiece, updatePiece, savePieceDebounced, flushPiece, flushAll, deletePiece, movePiece,
    saving: saving > 0, lastSavedAt,
  };
}
