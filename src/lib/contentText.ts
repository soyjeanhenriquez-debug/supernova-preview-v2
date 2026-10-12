/**
 * Contenido (12-oct-2026): utilidades de texto compartidas por la pantalla Contenido y por las
 * edge functions content-ideas y content-month (allí van copiadas tal cual, porque una edge
 * function no puede importar de src/; si cambias algo aquí, cámbialo también allá).
 *
 * 1. seedFromProduct: el tema real del producto ("ejercicio en casa"), no la envoltura
 *    ("programa digital de…"). Con "programa digital" Google devolvía "programar tv samsung".
 * 2. relevantSearches: deja solo las búsquedas que hablan del tema y saca apuestas, casinos, etc.
 * 3. parseLooseJson: lee el JSON de la IA aunque venga con ```, comas de más o cortado a la mitad
 *    (rescata los objetos completos en vez de fallar con 502).
 */

/** Palabras que envuelven al producto pero no dicen de qué trata. */
const GENERIC = new Set([
  "programa", "programas", "digital", "digitales", "curso", "cursos", "online", "virtual", "guia", "guias", "ebook", "ebooks",
  "libro", "libros", "metodo", "plan", "planes", "sistema", "kit", "taller", "masterclass", "mentoria", "plantilla", "plantillas",
  "pack", "reto", "desafio", "completo", "completa", "intensivo", "premium", "pdf", "video", "videos", "clase", "clases",
  "membresia", "comunidad", "app", "aplicacion", "manual", "tutorial", "producto", "infoproducto", "servicio", "servicios",
  "tienda", "mi", "tu", "su", "nuevo", "nueva", "basico", "basica", "avanzado", "practico", "practica", "definitivo", "definitiva",
  "dias", "dia", "semanas", "semana", "meses", "mes", "horas", "minutos", "pasos", "paso", "modulos", "lecciones",
]);
const STOP = new Set(["de", "del", "la", "el", "los", "las", "y", "e", "o", "en", "con", "a", "al", "un", "una", "unos", "unas", "por", "tu", "tus", "mi", "mis", "su", "sus"]);

/** Minúsculas y sin tildes (para comparar). */
export const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function cleanTopic(text: string): string {
  // Primera frase con contenido: antes de comas, puntos o paréntesis.
  const clause = text.split(/[,.;:|()–—]|\s-\s/).map(s => s.trim()).find(Boolean) ?? "";
  // Lo que viene después de "para / sin / que…" es a quién o cómo, no el tema.
  const head = clause.replace(/\s(para|sin|que|donde|hasta|desde|incluye|mientras)\s.*$/i, "");
  const words = head.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\b\d+\b/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const keep = words.filter(w => !GENERIC.has(fold(w)));
  while (keep.length && STOP.has(fold(keep[0]))) keep.shift();
  const out = keep.slice(0, 4);
  while (out.length && STOP.has(fold(out[out.length - 1]))) out.pop();
  // Tras quitar palabras genéricas pueden quedar dos conectores juntos ("de en").
  return out.filter((w, i) => !(STOP.has(fold(w)) && i > 0 && STOP.has(fold(out[i - 1])))).join(" ").toLowerCase();
}

/** Tema de búsqueda a partir del producto (o, si no hay, de a quién ayuda). */
export function seedFromProduct(product: string, who = ""): string {
  return cleanTopic(product || "") || cleanTopic(who || "");
}

/** Palabras que mandan en el tema, en raíz corta ("ejercicios" → "ejercic"). */
export function coreTerms(seed: string): string[] {
  const out: string[] = [];
  for (const w of fold(seed).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)) {
    if (w.length < 3 || STOP.has(w) || GENERIC.has(w)) continue;
    const stem = w.length > 5 ? w.slice(0, Math.max(5, w.length - 2)) : w.length > 3 ? w.replace(/s$/, "") : w;
    if (stem && !out.includes(stem)) out.push(stem);
  }
  return out;
}

/** Temas que nunca son ideas para el negocio de nadie aquí (apuestas, adultos, cripto). */
const BLOCKED = /\b(apuestas?|casinos?|hipic[oa]s?|hipodromos?|loteria|quinielas?|tragamonedas|betplay|bet365|porno|xxx|onlyfans|escorts?|cripto|criptomonedas?|bitcoin|forex)\b/;
export const isBlocked = (s: string) => BLOCKED.test(fold(s));

function matches(q: string, terms: string[]): number {
  const toks = fold(q).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  return terms.filter(t => toks.some(tok => tok.startsWith(t))).length;
}

/** ¿Habla de este tema? Con 1–2 palabras clave deben estar todas; con más, al menos 2. */
export function isRelevant(q: string, seed: string): boolean {
  if (isBlocked(q)) return false;
  const terms = coreTerms(seed);
  if (!terms.length) return true;
  return matches(q, terms) >= Math.min(terms.length, 2);
}

/** Deja solo búsquedas del tema. Si quedan muy pocas, acepta las que tengan al menos una palabra. */
export function relevantSearches<T extends { q: string }>(list: T[], seed: string, min = 6): T[] {
  const strict = list.filter(s => isRelevant(s.q, seed));
  if (strict.length >= min) return strict;
  const terms = coreTerms(seed);
  return list.filter(s => !isBlocked(s.q) && (!terms.length || matches(s.q, terms) >= 1));
}

type Obj = Record<string, unknown>;
const tryParse = (s: string): unknown => {
  try { return JSON.parse(s); } catch { /* sigue */ }
  try { return JSON.parse(s.replace(/,\s*([}\]])/g, "$1")); } catch { return undefined; }
};

/**
 * Lee la respuesta de la IA. Devuelve el objeto completo (si se pudo) y la lista bajo `key`.
 * Si el JSON viene roto o cortado, rescata uno por uno los objetos completos de la lista.
 */
export function parseLooseJson(text: unknown, key: string): { obj: Obj | null; items: Obj[] } {
  const t = String(text ?? "").replace(/```(?:json)?/gi, "").trim();
  const isObj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);
  const pick = (v: unknown): { obj: Obj | null; items: Obj[] } | null => {
    if (Array.isArray(v)) return { obj: null, items: v.filter(isObj) };
    if (isObj(v) && Array.isArray(v[key])) return { obj: v, items: (v[key] as unknown[]).filter(isObj) };
    return null;
  };
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  for (const cand of [t, a >= 0 && b > a ? t.slice(a, b + 1) : ""]) {
    if (!cand) continue;
    const got = pick(tryParse(cand));
    if (got) return got;
  }
  // Rescate: objetos completos dentro del arreglo de `key` (o del primer arreglo).
  const k = t.indexOf(`"${key}"`);
  const from = k >= 0 ? t.indexOf("[", k) : t.indexOf("[");
  const items: Obj[] = [];
  if (from >= 0) {
    let depth = 0, start = -1, inStr = false, esc = false;
    for (let i = from + 1; i < t.length; i++) {
      const c = t[i];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') { inStr = true; continue; }
      if (c === "{") { if (depth === 0) start = i; depth++; continue; }
      if (c === "}") {
        depth--;
        if (depth === 0 && start >= 0) { const o = tryParse(t.slice(start, i + 1)); if (isObj(o)) items.push(o); start = -1; }
        if (depth < 0) break;
        continue;
      }
      if (c === "]" && depth === 0) break;
    }
  }
  return { obj: null, items };
}
