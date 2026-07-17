import { useEffect, useState, useCallback } from "react";

const KEY = "supernova_brain_projects_v1";

export type ProjectMode = "sofisticar" | "crear" | "blueprint";

export const PILLARS = [
  { id: 1, name: "Detectar",  desc: "Encontrar el anuncio ganador" },
  { id: 2, name: "Analizar",  desc: "Entender por qué vende" },
  { id: 3, name: "Diseñar",   desc: "Crear tu versión superior" },
  { id: 4, name: "Producir",  desc: "Construir los assets" },
  { id: 5, name: "Lanzar",    desc: "Primera venta en 7 días" },
  { id: 6, name: "Escalar",   desc: "Paid media con ROI probado" },
] as const;

export interface BrainProject {
  id: string;
  name: string;
  mode: ProjectMode;
  pillar: number;            // 1..6 current
  completedPillars: number[];
  createdAt: string;
  updatedAt: string;
  notes: Record<number, string>;
  context?: unknown;
}

function read(): BrainProject[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
  catch { return []; }
}

function persist(list: BrainProject[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("supernova_brain_changed"));
}

export function useProjects() {
  const [projects, setProjects] = useState<BrainProject[]>(read);

  useEffect(() => {
    const sync = () => setProjects(read());
    window.addEventListener("storage", sync);
    window.addEventListener("supernova_brain_changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("supernova_brain_changed", sync);
    };
  }, []);

  const create = useCallback((p: Omit<BrainProject, "id" | "createdAt" | "updatedAt" | "completedPillars" | "notes" | "pillar"> & { pillar?: number }) => {
    const now = new Date().toISOString();
    const next: BrainProject = {
      id: crypto.randomUUID(),
      pillar: p.pillar ?? 1,
      completedPillars: [],
      notes: {},
      createdAt: now,
      updatedAt: now,
      ...p,
    } as BrainProject;
    const list = [next, ...read()];
    persist(list);
    return next;
  }, []);

  const update = useCallback((id: string, patch: Partial<BrainProject>) => {
    const list = read().map((p) => p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p);
    persist(list);
  }, []);

  const remove = useCallback((id: string) => {
    persist(read().filter((p) => p.id !== id));
  }, []);

  const togglePillar = useCallback((id: string, pillar: number) => {
    const list = read().map((p) => {
      if (p.id !== id) return p;
      const has = p.completedPillars.includes(pillar);
      const completedPillars = has ? p.completedPillars.filter((x) => x !== pillar) : [...p.completedPillars, pillar];
      const maxDone = Math.max(0, ...completedPillars);
      return { ...p, completedPillars, pillar: Math.min(6, maxDone + 1), updatedAt: new Date().toISOString() };
    });
    persist(list);
  }, []);

  const setNote = useCallback((id: string, pillar: number, note: string) => {
    const list = read().map((p) => p.id === id ? {
      ...p, notes: { ...p.notes, [pillar]: note }, updatedAt: new Date().toISOString(),
    } : p);
    persist(list);
  }, []);

  return { projects, create, update, remove, togglePillar, setNote };
}
