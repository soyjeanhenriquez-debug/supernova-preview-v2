/**
 * El Estratega de anuncios (20-oct-2026): chat flotante junto a Ayuda. El método y el precio viven en
 * el servidor (supabase/functions/_shared/estratega.ts); aquí solo van los pasos y los formatos que
 * la persona puede elegir. Mismos ids de formato que ESTRATEGA_FORMATS del servidor.
 */
import { CREDIT_COSTS } from "@/hooks/useCredits";
import { levelById } from "@/lib/awareness";

export type EstrategaStep = "chat" | "estrategia" | "guiones" | "produccion";

export const ESTRATEGA_FORMAT_OPTIONS: { id: string; label: string }[] = [
  { id: "ugc-camara", label: "UGC a cámara" },
  { id: "voz-broll", label: "Voz en off + imágenes" },
  { id: "avatar-ia", label: "Avatar IA (sin tu cara)" },
  { id: "video-ia", label: "Video con IA (3 tomas)" },
  { id: "yapping", label: "Hablar a cámara" },
  { id: "estatico", label: "Anuncio de imagen" },
  { id: "carrusel", label: "Carrusel" },
];

/** Lo que cobra cada paso. Mismo mapa que ESTRATEGA_ACTION del servidor (las dudas no cobran). */
export const ESTRATEGA_COST: Record<EstrategaStep, { action: "gen_light" | "gen_medium" | null; cost: number }> = {
  chat: { action: null, cost: 0 },
  estrategia: { action: "gen_light", cost: CREDIT_COSTS.gen_light },
  guiones: { action: "gen_medium", cost: CREDIT_COSTS.gen_medium },
  produccion: { action: "gen_light", cost: CREDIT_COSTS.gen_light },
};

/** Lo que se escribe en el chat cuando la persona toca un botón con la caja vacía. */
export function stepMessage(step: Exclude<EstrategaStep, "chat">, typed: string, formats: string[], level?: string): string {
  const t = typed.trim();
  const fmt = ESTRATEGA_FORMAT_OPTIONS.filter(f => formats.includes(f.id)).map(f => f.label).join(", ");
  if (step === "estrategia") return t || "Arma la estrategia de mi producto.";
  const lvl = levelById(level);
  const lv = lvl ? ` Nivel de consciencia: ${lvl.n} (${lvl.name.toLowerCase()}), todos los guiones para ese nivel.` : "";
  if (step === "guiones") return `Desarrolla estos ángulos: ${t || "elige los 3 mejores"}.${fmt ? ` Formato: ${fmt}.` : ""}${lv}`;
  return `Pasa a producción: ${t || "el último guion"}.`;
}
