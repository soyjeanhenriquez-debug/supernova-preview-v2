/**
 * "Semilla" que viaja de una idea (Radar, Oferta, Nicho, side hustle) a un estudio (plan ATLAS, 04-oct-2026).
 * Va en sessionStorage con la clave `supernova.seed`, se borra al leerla y caduca a los 10 minutos.
 * `autostart` (generar sin otro toque) solo vale si el botón tocado mostraba el costo, y solo 2 minutos.
 *
 * NOTA DE INTEGRACIÓN: este archivo es un contrato de Nexo (sección 1.A del plan). KINEMA lo escribió
 * tal cual el contrato para poder compilar su rama; si al fusionar ya existe la versión de Nexo, se
 * queda la de Nexo (misma forma y mismas funciones).
 */
export type SeedSource = "radar" | "oferta" | "nicho_yt" | "side_hustle" | "manual";
export type SeedTarget = "creativos" | "carrusel" | "miniaturas" | "foto_ugc" | "foto_producto"
  | "video_anuncio" | "video_ugc" | "serie" | "youtube";
export type SeedAspect = "1:1" | "4:5" | "9:16" | "16:9";
export type CreativeSeed = {
  v: 1; source: SeedSource; target: SeedTarget;
  title: string;            // ≤80
  product: string; who: string; promise: string; price?: string;   // ≤200 c/u
  hook?: string;            // ≤140, REFERENCIA (nunca se copia literal)
  angle?: string;           // ≤200, por qué funciona
  evidence?: string;        // ≤80, dato real: "214 días pagando anuncios"
  aspect?: SeedAspect;
  imagePath?: string;       // ruta en el bucket "creativos" del propio usuario (<uid>/...)
  ytRef?: { id: string; title: string; seconds: number };
  refId?: string;           // id de anuncio, oferta o video (solo analítica)
  autostart?: boolean;      // true SOLO si el botón tocado mostraba el costo
  at: number;
};

export const SEED_KEY = "supernova.seed";
export const SEED_TTL_MS = 10 * 60_000;
export const AUTOSTART_TTL_MS = 2 * 60_000;

const SOURCES: SeedSource[] = ["radar", "oferta", "nicho_yt", "side_hustle", "manual"];
const TARGETS: SeedTarget[] = ["creativos", "carrusel", "miniaturas", "foto_ugc", "foto_producto", "video_anuncio", "video_ugc", "serie", "youtube"];
const ASPECTS: SeedAspect[] = ["1:1", "4:5", "9:16", "16:9"];

/** Clave de pantalla en Index.tsx (switch). */
export const TARGET_PAGE: Record<SeedTarget, string> = {
  creativos: "Creativos", carrusel: "Carrusel", miniaturas: "Miniaturas",
  foto_ugc: "Fotos UGC", foto_producto: "Foto de producto",
  video_anuncio: "Video anuncio", video_ugc: "UGC con IA", serie: "Series",
  youtube: "Creador YouTube",
};
/** Slug del hash (#/creativos, #/video-anuncio…). */
export const TARGET_SLUG: Record<SeedTarget, string> = {
  creativos: "creativos", carrusel: "carrusel", miniaturas: "miniaturas",
  foto_ugc: "fotos-ugc", foto_producto: "foto-producto",
  video_anuncio: "video-anuncio", video_ugc: "ugc", serie: "series",
  youtube: "creador-youtube",
};

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
const opt = (v: unknown, max: number): string | undefined => str(v, max) || undefined;
const UID_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^\s]+$/i;

/** Valida y recorta. Descarta la semilla si falta lo esencial; quita un imagePath sospechoso. */
export function cleanSeed(x: unknown): CreativeSeed | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (!SOURCES.includes(o.source as SeedSource) || !TARGETS.includes(o.target as SeedTarget)) return null;
  const at = typeof o.at === "number" && Number.isFinite(o.at) ? o.at : NaN;
  if (!Number.isFinite(at)) return null;
  const title = str(o.title, 80);
  const product = str(o.product, 200);
  if (!title && !product) return null;
  const imagePath = typeof o.imagePath === "string" && UID_PATH.test(o.imagePath) && !o.imagePath.includes("..") && o.imagePath.length <= 300
    ? o.imagePath : undefined;
  let ytRef: CreativeSeed["ytRef"];
  const y = o.ytRef as Record<string, unknown> | undefined;
  if (y && typeof y === "object" && typeof y.id === "string" && /^[\w-]{6,20}$/.test(y.id)) {
    ytRef = { id: y.id, title: str(y.title, 120), seconds: Math.max(0, Math.min(86_400, Math.round(Number(y.seconds) || 0))) };
  }
  return {
    v: 1, source: o.source as SeedSource, target: o.target as SeedTarget,
    title: title || product.slice(0, 80), product, who: str(o.who, 200), promise: str(o.promise, 200),
    price: opt(o.price, 200), hook: opt(o.hook, 140), angle: opt(o.angle, 200), evidence: opt(o.evidence, 80),
    aspect: ASPECTS.includes(o.aspect as SeedAspect) ? (o.aspect as SeedAspect) : undefined,
    imagePath, ytRef, refId: opt(o.refId, 80), autostart: o.autostart === true, at,
  };
}

function storage(): Storage | null {
  try { return typeof window !== "undefined" ? window.sessionStorage : null; } catch { return null; }
}

export function setSeed(s: Omit<CreativeSeed, "v" | "at">): void {
  const clean = cleanSeed({ ...s, v: 1, at: Date.now() });
  if (!clean) return;
  try { storage()?.setItem(SEED_KEY, JSON.stringify(clean)); } catch { /* sin almacenamiento: la pantalla abre vacía */ }
}

/** Lee la semilla si es para esta pantalla y la borra. Caduca a los 10 min; autostart solo < 2 min. */
export function takeSeed(targets: SeedTarget | SeedTarget[], now: number = Date.now()): CreativeSeed | null {
  const st = storage();
  if (!st) return null;
  let raw: string | null = null;
  try { raw = st.getItem(SEED_KEY); } catch { return null; }
  if (!raw) return null;
  let seed: CreativeSeed | null = null;
  try { seed = cleanSeed(JSON.parse(raw)); } catch { seed = null; }
  const list = Array.isArray(targets) ? targets : [targets];
  if (!seed) { try { st.removeItem(SEED_KEY); } catch { /* nada */ } return null; }
  if (!list.includes(seed.target)) return null; // es de otra pantalla: se queda para ella
  try { st.removeItem(SEED_KEY); } catch { /* nada */ }
  const age = now - seed.at;
  if (age < 0 || age > SEED_TTL_MS) return null;
  if (seed.autostart && age > AUTOSTART_TTL_MS) seed.autostart = false;
  return seed;
}
