import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts } from "@/contexts/ProductContext";

/**
 * Lo que el usuario guarda con "Hacer mi versión", los kits de Mini Apps y las ofertas mejoradas
 * (tabla product_assets), separado por PRODUCTO ACTIVO. Antes vivía solo en el navegador
 * (localStorage "supernova_brain_projects_v1"): no se veía en otro dispositivo. Lo que había ahí se
 * sube una vez al producto activo.
 * El contrato se mantiene (create devuelve el proyecto al instante; update/remove) para no tocar a
 * quienes lo usan (MiniAppModal, KitsPage, SofisticarModal, CrearPage, BrainPage, el recorrido y el plan).
 */
const LEGACY_KEY = "supernova_brain_projects_v1";
const CHANGED = "supernova_assets_changed";

export type ProjectMode = "sofisticar" | "crear" | "blueprint";

export interface BrainProject {
  id: string;
  name: string;
  mode: ProjectMode;
  createdAt: string;
  updatedAt: string;
  context?: unknown;
  // Campos del modelo viejo de "6 pilares"; se conservan para no romper tipos, ya no se usan.
  pillar: number;
  completedPillars: number[];
  notes: Record<number, string>;
}

type Row = { id: string; name: string; kind: ProjectMode; context: unknown; created_at: string; updated_at: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const assets = () => (supabase as any).from("product_assets");
const toProject = (r: Row): BrainProject => ({
  id: r.id, name: r.name, mode: r.kind, context: r.context ?? undefined,
  createdAt: r.created_at, updatedAt: r.updated_at, pillar: 1, completedPillars: [], notes: {},
});
// Inserciones en curso: un update() justo después de create() espera a que la fila exista.
const pending = new Map<string, Promise<unknown>>();

export function useProjects() {
  const { user } = useAuth();
  const { activeId } = useProducts();
  const [projects, setProjects] = useState<BrainProject[]>([]);

  const load = useCallback(async () => {
    if (!user || !activeId) { setProjects([]); return; }
    const { data } = await assets().select("id,name,kind,context,created_at,updated_at")
      .eq("product_id", activeId).order("created_at", { ascending: false }).limit(100);
    setProjects(((data ?? []) as Row[]).map(toProject));
  }, [user, activeId]);

  // Subida única de lo que había en el navegador al producto activo.
  useEffect(() => {
    if (!user || !activeId) return;
    let legacy: BrainProject[] = [];
    try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]"); } catch { /* sin almacenamiento */ }
    if (!Array.isArray(legacy) || legacy.length === 0) return;
    (async () => {
      const rows = legacy.slice(0, 100).map(p => ({
        id: p.id, user_id: user.id, product_id: activeId, kind: ["crear", "sofisticar", "blueprint"].includes(p.mode) ? p.mode : "crear",
        name: String(p.name || "Guardado").slice(0, 160), context: p.context ?? null,
      }));
      const { error } = await assets().upsert(rows, { onConflict: "id", ignoreDuplicates: true });
      if (!error) { try { localStorage.removeItem(LEGACY_KEY); } catch { /* sin almacenamiento */ } }
      window.dispatchEvent(new Event(CHANGED));
    })();
  }, [user, activeId]);

  useEffect(() => {
    load();
    const sync = () => load();
    window.addEventListener(CHANGED, sync);
    return () => window.removeEventListener(CHANGED, sync);
  }, [load]);

  const create = useCallback((p: { name: string; mode: ProjectMode; context?: unknown }) => {
    const now = new Date().toISOString();
    const project: BrainProject = { id: crypto.randomUUID(), name: p.name, mode: p.mode, context: p.context, createdAt: now, updatedAt: now, pillar: 1, completedPillars: [], notes: {} };
    setProjects(prev => [project, ...prev]);
    if (user && activeId) {
      const ins = assets().insert({ id: project.id, user_id: user.id, product_id: activeId, kind: p.mode, name: p.name.slice(0, 160), context: p.context ?? null })
        .then(({ error }: { error: { message: string } | null }) => { if (error) console.error("product_assets:", error.message); window.dispatchEvent(new Event(CHANGED)); });
      pending.set(project.id, ins);
      ins.finally(() => pending.delete(project.id));
    }
    return project;
  }, [user, activeId]);

  const update = useCallback(async (id: string, patch: Partial<Pick<BrainProject, "name" | "context">>) => {
    setProjects(prev => prev.map(p => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)));
    await pending.get(id);
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name.slice(0, 160);
    if (patch.context !== undefined) row.context = patch.context;
    const { error } = await assets().update(row).eq("id", id);
    if (error) console.error("product_assets:", error.message);
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  const remove = useCallback(async (id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    await assets().delete().eq("id", id);
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  return { projects, create, update, remove };
}
