/**
 * "Semilla" que viaja de una idea (Radar, Oferta, Nicho de YouTube, Ideas) a un estudio (plan ATLAS,
 * 04-oct-2026). Va en sessionStorage con la clave `supernova.seed` y se borra al leerla.
 *
 * - Caduca a los 10 minutos.
 * - `autostart` solo vale si el botón tocado MOSTRABA el costo y han pasado menos de 2 minutos:
 *   así nada gasta créditos por una semilla vieja (otra pestaña, otro día).
 * - `hook` es una REFERENCIA: los estudios lo pasan como "escribe otro con la misma idea", nunca literal.
 * - `imagePath` solo puede ser una ruta de la carpeta del propio usuario en el bucket "creativos";
 *   el servidor lo vuelve a comprobar (nunca se mandan URLs del cliente a un proveedor).
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
  imagePath?: string;       // ruta en bucket "creativos" del propio usuario (<uid>/...)
  ytRef?: { id: string; title: string; seconds: number };
  refId?: string;           // id de anuncio, oferta o video (solo analítica)
  autostart?: boolean;      // true SOLO si el botón tocado mostraba el costo
  at: number;
};

export const SEED_KEY = "supernova.seed";
export const SEED_TTL_MS = 10 * 60_000;
export const AUTOSTART_TTL_MS = 2 * 60_000;

const SOURCES: SeedSource[] = ["radar", "oferta", "nicho_yt", "side_hustle", "manual"];
export const SEED_TARGETS: SeedTarget[] = ["creativos", "carrusel", "miniaturas", "foto_ugc", "foto_producto", "video_anuncio", "video_ugc", "serie", "youtube"];
const ASPECTS: SeedAspect[] = ["1:1", "4:5", "9:16", "16:9"];

/** Clave de pantalla en Index.tsx (el `switch`). */
export const TARGET_PAGE: Record<SeedTarget, string> = {
  creativos: "Creativos", carrusel: "Carrusel", miniaturas: "Miniaturas",
  foto_ugc: "Fotos UGC", foto_producto: "Foto de producto",
  video_anuncio: "Video anuncio", video_ugc: "UGC con IA", serie: "Series",
  youtube: "Creador YouTube",
};

/** Slug del hash (#/creativos, #/video-anuncio…). Debe coincidir con PAGE_SLUG de Index.tsx. */
export const TARGET_SLUG: Record<SeedTarget, string> = {
  creativos: "creativos", carrusel: "carrusel", miniaturas: "miniaturas",
  foto_ugc: "fotos-ugc", foto_producto: "foto-producto",
  video_anuncio: "video-anuncio", video_ugc: "ugc", serie: "series",
  youtube: "creador-youtube",
};

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;

/** Ruta de imagen aceptable: carpeta del usuario (o con forma de uuid si no se sabe cuál), sin "..", sin URL. */
export function safeImagePath(p: unknown, uid?: string | null): string | undefined {
  if (typeof p !== "string") return undefined;
  const s = p.trim();
  if (!s || s.length > 300) return undefined;
  if (s.includes("..") || s.includes("//") || s.includes("\\") || /^[a-z]+:/i.test(s) || s.startsWith("/")) return undefined;
  if (uid ? !s.startsWith(`${uid}/`) : !UUID_PREFIX.test(s)) return undefined;
  if (!/^[A-Za-z0-9._\-/]+$/.test(s)) return undefined;
  return s;
}

/** Valida y recorta una semilla. Devuelve null si no sirve. */
export function cleanSeed(x: unknown, uid?: string | null): CreativeSeed | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const source = SOURCES.includes(o.source as SeedSource) ? (o.source as SeedSource) : null;
  const target = SEED_TARGETS.includes(o.target as SeedTarget) ? (o.target as SeedTarget) : null;
  if (!source || !target) return null;
  const at = typeof o.at === "number" && Number.isFinite(o.at) ? o.at : NaN;
  if (!Number.isFinite(at)) return null;
  const title = str(o.title, 80);
  const product = str(o.product, 200);
  if (!title && !product) return null;
  const seed: CreativeSeed = {
    v: 1, source, target, title: title || product.slice(0, 80),
    product, who: str(o.who, 200), promise: str(o.promise, 200), at,
  };
  const price = str(o.price, 200); if (price) seed.price = price;
  const hook = str(o.hook, 140); if (hook) seed.hook = hook;
  const angle = str(o.angle, 200); if (angle) seed.angle = angle;
  const evidence = str(o.evidence, 80); if (evidence) seed.evidence = evidence;
  if (ASPECTS.includes(o.aspect as SeedAspect)) seed.aspect = o.aspect as SeedAspect;
  const imagePath = safeImagePath(o.imagePath, uid); if (imagePath) seed.imagePath = imagePath;
  const yt = o.ytRef as Record<string, unknown> | undefined;
  if (yt && typeof yt === "object" && typeof yt.id === "string" && /^[A-Za-z0-9_-]{6,20}$/.test(yt.id)) {
    const seconds = Number(yt.seconds);
    seed.ytRef = { id: yt.id, title: str(yt.title, 140), seconds: Number.isFinite(seconds) && seconds > 0 ? Math.min(Math.round(seconds), 86_400) : 0 };
  }
  const refId = str(o.refId, 80); if (refId) seed.refId = refId;
  if (o.autostart === true) seed.autostart = true;
  return seed;
}

/** Deja la semilla para el estudio de destino. */
export function setSeed(s: Omit<CreativeSeed, "v" | "at">): void {
  const seed = cleanSeed({ ...s, v: 1, at: Date.now() });
  if (!seed) return;
  try { sessionStorage.setItem(SEED_KEY, JSON.stringify(seed)); } catch { /* sin almacenamiento */ }
}

/**
 * Lee la semilla si es para uno de estos destinos, y la borra. Si es para otro destino la deja
 * (la tomará esa pantalla). Caduca a los 10 min; `autostart` solo vale si tiene menos de 2 min.
 */
export function takeSeed(targets: SeedTarget | SeedTarget[], now: number = Date.now()): CreativeSeed | null {
  const list = Array.isArray(targets) ? targets : [targets];
  try {
    const raw = sessionStorage.getItem(SEED_KEY);
    if (!raw) return null;
    let parsed: unknown = null;
    try { parsed = JSON.parse(raw); } catch { /* basura */ }
    const seed = cleanSeed(parsed);
    if (!seed) { sessionStorage.removeItem(SEED_KEY); return null; }
    const age = now - seed.at;
    if (age < 0 || age > SEED_TTL_MS) { sessionStorage.removeItem(SEED_KEY); return null; }
    if (!list.includes(seed.target)) return null;
    sessionStorage.removeItem(SEED_KEY);
    if (seed.autostart && age > AUTOSTART_TTL_MS) seed.autostart = false;
    return seed;
  } catch { return null; }
}
