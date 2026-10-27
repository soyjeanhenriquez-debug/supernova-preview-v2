// Carrusel ya leído (26-oct-2026, Jean: no pagar dos veces el mismo carrusel). La radiografía del
// original (láminas, diseño, estilo, ADN y las 3 partes que explican por qué funcionó) no depende de
// quién lo modela ni del modo: es de la publicación pública. Si alguien ya modeló esa publicación hace
// menos de CACHE_DAYS días, se reusa su radiografía: no se llama a Apify ni se le pasan las imágenes a
// la IA (lo más caro); solo se escribe la versión nueva. Nunca se guardan fotos: solo texto y los
// enlaces del CDN de Instagram, que caducan solos (parámetro `oe`).

export const CACHE_DAYS = 30;
/** Margen para que un enlace no caduque mientras la persona modela lámina por lámina. */
const MARGEN_MS = 2 * 3_600_000;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null);
const str = (v: unknown, n: number) => (typeof v === "string" ? v : "").replace(/\s+/g, " ").trim().slice(0, n);

export type Radiografia = {
  id: string;
  owner: string; likes: number | null; comments: number | null; caption: string;
  analisis: { resumen: string; gancho_original: string; por_que_funciona: string; laminas: Obj[]; estilo: unknown };
  adn: unknown[]; mantener: unknown[];
  images: string[];
};

/** Vencimiento de un enlace del CDN de Instagram (`oe` = segundos en hexadecimal), o null si no trae. */
export function igExpiry(url: string): number | null {
  try {
    const oe = new URL(url).searchParams.get("oe");
    if (!oe || !/^[0-9a-f]{6,10}$/i.test(oe)) return null;
    return parseInt(oe, 16) * 1000;
  } catch { return null; }
}

/**
 * Los enlaces de las láminas, solo si TODOS siguen vivos (la app los usa por posición: lámina i = n i+1).
 * Uno caducado o sin fecha → ninguno, y la app esconde "modelar lámina por lámina".
 */
export function liveImages(urls: unknown, now = Date.now()): string[] {
  if (!Array.isArray(urls) || urls.length < 2) return [];
  const ok = urls.every(u => typeof u === "string" && u.startsWith("https://") && (igExpiry(u) ?? 0) > now + MARGEN_MS);
  return ok ? urls as string[] : [];
}

/** Una fila de carousel_clones convertida en radiografía reusable, o null si no sirve. */
export function fromRow(row: unknown): Radiografia | null {
  const r = obj(row);
  const an = obj(r?.analysis);
  if (!r || !an || an.reel === true || an.cache_de) return null;
  const laminas = Array.isArray(an.laminas) ? (an.laminas as unknown[]).map(obj).filter((l): l is Obj => !!l && !!str(l.idea, 10)) : [];
  if (laminas.length < 2 || !Array.isArray(an.adn) || !an.adn.length || !Array.isArray(an.mantener)) return null;
  if (!str(r.summary, 10) || !str(r.why, 10)) return null;
  return {
    id: String(r.id),
    owner: str(r.owner, 40),
    likes: Number.isFinite(r.likes) ? r.likes as number : null,
    comments: Number.isFinite(r.comments) ? r.comments as number : null,
    caption: str(an.caption, 1500),
    analisis: {
      resumen: str(r.summary, 300), gancho_original: str(r.hook, 200), por_que_funciona: str(r.why, 600),
      laminas, estilo: an.estilo ?? null,
    },
    adn: an.adn as unknown[], mantener: an.mantener as unknown[],
    images: Array.isArray(an.images) ? (an.images as unknown[]).filter((u): u is string => typeof u === "string") : [],
  };
}

/** Texto para la IA: la radiografía como datos (el modelo no la vuelve a escribir). */
export function radiografiaTexto(r: Radiografia): string {
  return JSON.stringify({ analisis: r.analisis, adn: r.adn, mantener: r.mantener });
}
