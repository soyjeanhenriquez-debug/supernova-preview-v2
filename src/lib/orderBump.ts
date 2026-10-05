import type { BusinessType } from "@/lib/businessProfile";

/**
 * Ideas de order bump GRATIS, sin IA: reglas simples a partir del tipo de negocio y del precio.
 * Regla de checkout clásica: el bump cuesta entre 20 % y 40 % del producto principal y se entrega
 * al instante. Son ideas para elegir; el texto final lo escribe el generador "order-bump" (cobra
 * el servidor) en la pantalla de Order bump.
 */
export type BumpIdea = {
  id: string;
  /** Formato del extra (plantilla, checklist, audio…). */
  title: string;
  /** Qué es, en una línea. */
  what: string;
  /** Porcentaje del precio principal que se usa para sugerir el precio (0,2–0,4). */
  pct: number;
  /** Precio sugerido en US$ (null si aún no sabemos el precio del producto). */
  price: number | null;
};

type Template = Omit<BumpIdea, "price">;

const DIGITAL: Template[] = [
  { id: "plantillas", title: "Plantillas listas para usar", what: "Las plantillas o formatos que ahorran el trabajo de empezar de cero.", pct: 0.25 },
  { id: "checklist", title: "Checklist o guía rápida", what: "Una hoja imprimible con los pasos en orden para no perderse.", pct: 0.2 },
  { id: "audio", title: "Versión en audio", what: "El contenido para escucharlo en el camino, sin leer.", pct: 0.3 },
  { id: "implementacion", title: "Bonus de implementación", what: "Una clase extra o ejemplos resueltos para aplicarlo más rápido.", pct: 0.4 },
];

const ECOMMERCE: Template[] = [
  { id: "segunda", title: "Segunda unidad con descuento", what: "Otra unidad del mismo producto a menor precio, para regalar o tener de repuesto.", pct: 0.4 },
  { id: "accesorio", title: "Accesorio que lo complementa", what: "Algo pequeño que se usa junto al producto principal.", pct: 0.25 },
  { id: "guia", title: "Guía digital de uso", what: "Un PDF o video corto para sacarle el máximo provecho desde el primer día.", pct: 0.2 },
  { id: "prioritario", title: "Envío prioritario", what: "Que su pedido salga primero y llegue antes.", pct: 0.2 },
];

const SERVICES: Template[] = [
  { id: "plantillas", title: "Plantillas de trabajo", what: "Los formatos que usas con tus clientes, para que avancen solos.", pct: 0.25 },
  { id: "checklist", title: "Checklist de preparación", what: "Lo que el cliente debe tener listo antes de empezar contigo.", pct: 0.2 },
  { id: "revision", title: "Revisión express", what: "Una revisión corta de su caso por escrito o en audio.", pct: 0.3 },
  { id: "sesion", title: "Sesión extra corta", what: "Una llamada breve de dudas después del servicio.", pct: 0.4 },
];

/** Precios "redondos" que se usan en checkouts (terminan en 7 o 9 casi siempre). */
const NICE = [3, 4, 5, 7, 9, 12, 14, 17, 19, 24, 27, 29, 37, 39, 47, 49, 67, 77, 97, 127, 147, 197, 247, 297, 397, 497];

/** Primer número del precio de la ficha ("27", "US$9/mes · reto US$5" → 9). null si no hay. */
export function parsePrice(raw: string | null | undefined): number | null {
  const m = String(raw ?? "").match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Precio del bump: el redondo más cercano a precio × pct, siempre entre el 20 % y el 40 %. */
export function bumpPrice(mainPrice: number, pct: number): number {
  const target = mainPrice * pct;
  const min = mainPrice * 0.2, max = mainPrice * 0.4;
  const inRange = NICE.filter(n => n >= min && n <= max);
  // Producto muy barato o con precio raro: ningún redondo cabe → el entero más cercano.
  if (!inRange.length) return Math.max(1, Math.round(target));
  let best = inRange[0];
  for (const n of inRange) if (Math.abs(n - target) < Math.abs(best - target)) best = n;
  return best;
}

export function bumpIdeas(type: BusinessType | null, rawPrice: string | null | undefined): BumpIdea[] {
  const price = parsePrice(rawPrice);
  const base = type === "ecommerce" ? ECOMMERCE : type === "servicios" ? SERVICES : DIGITAL;
  return base.map(t => ({ ...t, price: price ? bumpPrice(price, t.pct) : null }));
}

/** "US$7" o "US$7,50", en formato español. */
export const usd = (n: number) => `US$${n.toLocaleString("es-ES", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
