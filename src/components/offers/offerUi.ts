import { scaleLabel, type Offer } from "@/lib/offers";

/**
 * Lo que la tarjeta y la ficha rápida de Ofertas muestran de un vistazo (29-oct-2026, rediseño estilo
 * Cazador Swipe). Nada se calcula aquí de nuevo: el nivel sale de scaleLabel (anuncios activos + días
 * pagando anuncios), así la tarjeta, la ficha rápida y la ficha completa dicen siempre lo mismo.
 */
export const NIVELES = [
  { label: "En prueba", barras: 1, regla: "menos de 5 anuncios activos" },
  { label: "Despegando", barras: 2, regla: "5 o más anuncios activos" },
  { label: "Creciendo", barras: 3, regla: "10 o más anuncios activos y 30 días o más pagando anuncios" },
  { label: "Dominando", barras: 4, regla: "30 o más anuncios activos y 60 días o más pagando anuncios" },
] as const;
export type Nivel = (typeof NIVELES)[number];

export function nivelOferta(o: Pick<Offer, "active_ads" | "days_active"> & Partial<Pick<Offer, "live_active_ads" | "live_capped" | "source_data">>): Nivel {
  const l = scaleLabel(o);
  return NIVELES.find((n) => n.label === l) ?? NIVELES[0];
}

const IDIOMA_NOMBRE: Record<string, string> = {
  es: "Español", pt: "Portugués", en: "Inglés", de: "Alemán", ru: "Ruso", fr: "Francés", it: "Italiano",
};
export function idiomaDe(code: string | null | undefined): string | null {
  if (!code) return null;
  return IDIOMA_NOMBRE[code.toLowerCase()] ?? code.toUpperCase();
}

/** "Lo haces tú solo": el copy_score (1-5) dicho como esfuerzo. null = la IA aún no la evaluó. */
export function hacerloSolo(score: number | null | undefined): { texto: string; solo: boolean } | null {
  if (score == null) return null;
  if (score >= 4) return { texto: "Lo haces tú solo", solo: true };
  if (score >= 3) return { texto: "Necesita inversión", solo: false };
  return { texto: "Difícil hacerla solo", solo: false };
}
