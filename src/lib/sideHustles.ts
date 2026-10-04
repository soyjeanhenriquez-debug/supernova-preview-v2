import type { HustleKind } from "@/lib/recommendTarget";
import { recommendTarget, targetInfo } from "@/lib/recommendTarget";

/**
 * "Ideas de side hustle": 6 caminos para empezar de cero, cada uno con qué es, cuánto cuesta
 * empezar EN CRÉDITOS (lo que gasta la primera pieza recomendada) y la primera acción.
 * Las cifras que se enseñan salen SOLO de ofertas reales del catálogo (consulta corta, límite 6,
 * sin contar filas). Una categoría sin consulta o sin resultados no muestra ninguna cifra.
 * Nada de promesas de ingresos: se habla de qué hacer, no de cuánto vas a ganar.
 */
export type OfferFilter = {
  /** Columna = valor (eq) o lista (in). */
  eq?: Record<string, string>;
  in?: Record<string, string[]>;
};

export type SideHustle = {
  id: HustleKind;
  title: string;
  /** Qué es, en una frase para alguien que empieza de cero. */
  what: string;
  /** Pasos para arrancar (3 como máximo). */
  steps: string[];
  /** Pantalla de "encontrar" relacionada (clave de Index) para ver más ejemplos. */
  explore?: { page: string; label: string };
  /** Consulta de ejemplos reales en `offers` (null = no hay datos honestos para esta categoría). */
  offers: OfferFilter | null;
};

/** Mínimo de días pagando anuncios para contar como ejemplo "probado". */
export const PROVEN_DAYS = 90;
export const EXAMPLES_LIMIT = 6;

export const SIDE_HUSTLES: SideHustle[] = [
  {
    id: "low_ticket", title: "Producto digital low ticket",
    what: "Una guía, plantilla o curso corto de bajo precio que se vende con anuncios.",
    steps: ["Elige una oferta que ya vende", "Haz tu versión con mejoras para LATAM", "Pruébala con 3 creativos"],
    explore: { page: "Ofertas", label: "Ver ofertas ganadoras" },
    offers: { eq: { offer_type: "infoproducto", business_model: "pago_unico" } },
  },
  {
    id: "faceless", title: "Canal faceless de YouTube",
    what: "Videos con voz e imágenes hechas con IA, sin mostrar tu cara.",
    steps: ["Elige un nicho con vistas en Nichos de YouTube", "Escribe un guion original por escenas", "Produce y sube tu primer video"],
    explore: { page: "Nichos YouTube", label: "Ver nichos de YouTube" },
    offers: null,
  },
  {
    id: "ugc", title: "Videos UGC con IA",
    what: "Videos cortos donde un presentador IA explica un producto, como los que hacen los creadores.",
    steps: ["Elige un producto (tuyo o de un cliente)", "La IA arma el guion y el presentador", "Publica en Reels o TikTok"],
    explore: { page: "Buscar Ofertas Winner", label: "Ver anuncios ganadores" },
    offers: null,
  },
  {
    id: "marca", title: "Carruseles y marca personal",
    what: "Contenido que enseña algo útil y atrae clientes para tu servicio o mentoría.",
    steps: ["Elige un tema que domines", "Publica carruseles que se guardan", "Invita a escribirte por mensaje"],
    explore: { page: "Ofertas", label: "Ver ofertas de servicios" },
    offers: { in: { offer_type: ["servicio", "comunidad"] } },
  },
  {
    id: "kits", title: "Plantillas y kits (Mini Apps)",
    what: "Apps sencillas, plantillas o kits listos que la gente paga por usar.",
    steps: ["Elige un kit basado en una oferta real", "Ponle tu marca y tu precio", "Véndelo con creativos"],
    explore: { page: "Mini Apps", label: "Ver Mini Apps" },
    offers: { eq: { offer_type: "saas_app" } },
  },
  {
    id: "local", title: "Creativos para negocios locales",
    what: "Haces imágenes y anuncios para restaurantes, salones o tiendas de tu zona.",
    steps: ["Haz 3 creativos de muestra para un negocio", "Enséñaselos por WhatsApp", "Cobra por paquete mensual"],
    offers: { eq: { niche: "servicios_locales" } },
  },
];

export const HUSTLE_BY_ID: Record<HustleKind, SideHustle> =
  Object.fromEntries(SIDE_HUSTLES.map((h) => [h.id, h])) as Record<HustleKind, SideHustle>;

/** Lo que cuesta la primera pieza recomendada para esta idea (créditos y texto del botón). */
export function startCost(id: HustleKind): { credits: number; label: string } {
  const info = targetInfo(recommendTarget({ source: "side_hustle", hustle: id }).target);
  return { credits: info.credits, label: info.costLabel };
}

/**
 * Etiqueta honesta de los ejemplos encontrados. Con `limit` filas pedidas, si llegaron todas solo
 * sabemos que hay "al menos" esas (no se cuentan filas). 0 → null: no se enseña ninguna cifra.
 */
export function evidenceLabel(found: number, limit = EXAMPLES_LIMIT, days = PROVEN_DAYS): string | null {
  if (!Number.isFinite(found) || found <= 0) return null;
  const n = Math.min(found, limit);
  const what = n === 1 ? "oferta real" : "ofertas reales";
  return `${found >= limit ? "Al menos " : ""}${n} ${what} con más de ${days} días pagando anuncios`;
}

/** Hash pequeño y estable de un texto (FNV-1a de 32 bits). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Día local como "AAAA-MM-DD" (la idea cambia a medianoche del usuario). */
export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Elige 1 elemento por día y por usuario, siempre el mismo ese día. Lista vacía → null. */
export function pickOfTheDay<T>(list: T[], day: string, uid: string | null | undefined): T | null {
  if (!list.length) return null;
  return list[hash32(`${day}|${uid ?? "anon"}`) % list.length];
}
