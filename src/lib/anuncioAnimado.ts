/**
 * Agente «Anuncio animado» (28-oct-2026). El método, el estilo real y las transiciones viven en el
 * servidor (supabase/functions/_shared/anuncioAnimado.ts); aquí solo lo que ve la persona: los 5
 * estilos con nombre nuestro (sin marcas), los mercados y lo que cobra cada paso.
 */
import { CREDIT_COSTS } from "@/hooks/useCredits";

export type AnuncioStep = "base" | "anuncio" | "prompts" | "cambio";

/** Mismos ids que ANUNCIO_ESTILOS del servidor. El primero es el recomendado. */
export const ANUNCIO_ESTILOS: { id: string; nombre: string; frase: string }[] = [
  { id: "fabula", nombre: "Fábula", frase: "Personajes con alma, como una película animada." },
  { id: "lanzamiento", nombre: "Lanzamiento", frase: "Limpio y premium, como la presentación de un producto." },
  { id: "futuro", nombre: "Futuro", frase: "Neón, hologramas y tecnología." },
  { id: "plastilina", nombre: "Plastilina", frase: "Hecho a mano, cercano y divertido." },
  { id: "postal", nombre: "Postal", frase: "Simétrico, colores pastel, cine de autor." },
];

export const ANUNCIO_MERCADOS = ["Latinoamérica", "EE. UU. (latinos)", "España", "República Dominicana", "México", "Colombia"];

/** Lo que cobra cada paso. Mismo mapa que ANUNCIO_ACTION del servidor. */
export const ANUNCIO_COST: Record<AnuncioStep, { action: "gen_light" | "gen_medium"; cost: number }> = {
  base: { action: "gen_light", cost: CREDIT_COSTS.gen_light },
  anuncio: { action: "gen_medium", cost: CREDIT_COSTS.gen_medium },
  prompts: { action: "gen_light", cost: CREDIT_COSTS.gen_light },
  cambio: { action: "gen_light", cost: CREDIT_COSTS.gen_light },
};
