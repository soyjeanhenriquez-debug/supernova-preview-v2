/**
 * "Modelar esta oferta completa" (Fase 2 de las 37 herramientas, 07-oct-2026): la oferta pasa a ser
 * el producto de la persona y una barra la lleva paso a paso, con "Siguiente", por las pantallas que
 * hacen falta para lanzar. Cada pantalla ya lee el producto activo: aquí solo se guarda en qué paso
 * va (en este navegador). Nada se genera solo: cada pantalla muestra su costo antes de gastar.
 */
export type LaunchStep = { page: string; label: string; generator?: string };

export const LAUNCH_STEPS: LaunchStep[] = [
  { page: "Precio", label: "Precio en tu moneda" },
  { page: "Generadores", label: "Página de ventas", generator: "landing-copy" },
  { page: "Order bump", label: "Order bump" },
  { page: "Mándala", label: "Tus primeros 5 anuncios" },
  { page: "Recuperar", label: "WhatsApp para quien casi compra" },
];

export type LaunchChain = { offer: string; days: number; step: number; at: number };

const KEY = "supernova.launch_chain";
export const LAUNCH_EVENT = "supernova:launch-chain";
const TTL_MS = 30 * 24 * 3_600_000;

export function readChain(): LaunchChain | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "null") as LaunchChain | null;
    if (!c || typeof c.step !== "number" || c.step < 0 || c.step >= LAUNCH_STEPS.length || Date.now() - c.at > TTL_MS) return null;
    return c;
  } catch { return null; }
}

function write(c: LaunchChain | null) {
  try { if (c) localStorage.setItem(KEY, JSON.stringify(c)); else localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event(LAUNCH_EVENT));
}

export function startChain(offer: string, days: number) {
  write({ offer: offer.slice(0, 80), days: Math.max(0, Math.round(days) || 0), step: 0, at: Date.now() });
}

/** Deja listo el paso (generador del Robot si hace falta) y devuelve su pantalla. */
export function goToStep(step: number): string | null {
  const c = readChain();
  if (!c || step < 0 || step >= LAUNCH_STEPS.length) return null;
  const s = LAUNCH_STEPS[step];
  if (s.generator) {
    try { localStorage.setItem("supernova_generator_prefill", JSON.stringify({ generator: s.generator })); } catch { /* sin almacenamiento */ }
  }
  write({ ...c, step, at: Date.now() });
  return s.page;
}

export function endChain() { write(null); }
