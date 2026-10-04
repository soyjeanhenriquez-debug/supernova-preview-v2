/**
 * La "semilla" que viaja de una idea (Radar, Ofertas, Nichos de YouTube, Ideas de side hustle) a un
 * estudio (Creativos, Video, YouTube…). Vive en sessionStorage (clave `supernova.seed`), se borra al
 * leerla y caduca a los 10 minutos. `autostart` (generar al llegar) solo vale si el botón tocado
 * mostraba el costo y hace menos de 2 minutos: nunca se gasta nada que el usuario no pidió.
 *
 * Contrato del plan ATLAS (sección 1.A). Lo que viene aquí es texto del CLIENTE: el servidor lo trata
 * como dato (nunca precio, rol ni rutas ajenas). `imagePath` se filtra aquí y otra vez en el servidor.
 * `hook` es una REFERENCIA: los estudios lo pasan como "escribe otro con la misma idea", nunca literal.
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

export const SEED_SOURCES: readonly SeedSource[] = ["radar", "oferta", "nicho_yt", "side_hustle", "manual"];
export const SEED_TARGETS: readonly SeedTarget[] = [
  "creativos", "carrusel", "miniaturas", "foto_ugc", "foto_producto", "video_anuncio", "video_ugc", "serie", "youtube",
];
const ASPECTS: readonly SeedAspect[] = ["1:1", "4:5", "9:16", "16:9"];

/** Clave de pantalla en Index.tsx (switch). */
export const TARGET_PAGE: Record<SeedTarget, string> = {
  creativos: "Creativos",
  carrusel: "Carrusel",
  miniaturas: "Miniaturas",
  foto_ugc: "Fotos UGC",
  foto_producto: "Foto de producto",
  video_anuncio: "Video anuncio",
  video_ugc: "UGC con IA",
  serie: "Series",
  youtube: "Creador YouTube",
};

/** Slug del hash (#/creativos, #/video-anuncio…): debe coincidir con PAGE_SLUG/SLUG_PAGE de Index.tsx. */
export const TARGET_SLUG: Record<SeedTarget, string> = {
  creativos: "creativos",
  carrusel: "carrusel",
  miniaturas: "miniaturas",
  foto_ugc: "fotos-ugc",
  foto_producto: "foto-producto",
  video_anuncio: "video-anuncio",
  video_ugc: "ugc",
  serie: "series",
  youtube: "creador-youtube",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Texto limpio: sin caracteres de control, espacios colapsados y recortado a `max`. */
function txt(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
}
const opt = (v: unknown, max: number) => txt(v, max) || undefined;

/**
 * Ruta de imagen aceptable: dentro de la carpeta del usuario (`<uid>/...`), sin `..`, sin URL, sin
 * barra inicial. Sin `uid` conocido exige que el primer tramo tenga forma de id de usuario (el
 * servidor vuelve a comprobar que sea el SUYO).
 */
export function safeImagePath(p: unknown, uid?: string | null): string | undefined {
  if (typeof p !== "string") return undefined;
  const s = p.trim();
  if (!s || s.length > 300 || s.startsWith("/") || s.includes("..") || s.includes("\\") || /^[a-z]+:/i.test(s) || s.includes("//")) return undefined;
  const [first, ...rest] = s.split("/");
  if (rest.length === 0 || rest.some((r) => !r)) return undefined;
  if (uid ? first !== uid : !UUID_RE.test(first)) return undefined;
  return s;
}

/** Valida y recorta una semilla venida de sessionStorage (o de donde sea). null si no sirve. */
export function cleanSeed(x: unknown, uid?: string | null): CreativeSeed | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  if (r.v !== 1) return null;
  if (!SEED_SOURCES.includes(r.source as SeedSource) || !SEED_TARGETS.includes(r.target as SeedTarget)) return null;
  const at = typeof r.at === "number" && Number.isFinite(r.at) ? r.at : NaN;
  if (!Number.isFinite(at)) return null;
  const title = txt(r.title, 80);
  const product = txt(r.product, 200);
  if (!title && !product) return null;

  const seed: CreativeSeed = {
    v: 1,
    source: r.source as SeedSource,
    target: r.target as SeedTarget,
    title: title || product.slice(0, 80),
    product: product || title,
    who: txt(r.who, 200),
    promise: txt(r.promise, 200),
    at,
  };
  const price = opt(r.price, 200); if (price) seed.price = price;
  const hook = opt(r.hook, 140); if (hook) seed.hook = hook;
  const angle = opt(r.angle, 200); if (angle) seed.angle = angle;
  const evidence = opt(r.evidence, 80); if (evidence) seed.evidence = evidence;
  if (ASPECTS.includes(r.aspect as SeedAspect)) seed.aspect = r.aspect as SeedAspect;
  const img = safeImagePath(r.imagePath, uid); if (img) seed.imagePath = img;
  const yt = r.ytRef as Record<string, unknown> | undefined;
  if (yt && typeof yt === "object" && typeof yt.id === "string" && /^[A-Za-z0-9_-]{6,20}$/.test(yt.id)) {
    const seconds = Number(yt.seconds);
    seed.ytRef = { id: yt.id, title: txt(yt.title, 140), seconds: Number.isFinite(seconds) ? Math.max(0, Math.min(86_400, Math.round(seconds))) : 0 };
  }
  const refId = opt(r.refId, 80); if (refId) seed.refId = refId;
  if (r.autostart === true) seed.autostart = true;
  return seed;
}

/** Guarda la semilla (pisa la anterior). */
export function setSeed(s: Omit<CreativeSeed, "v" | "at">): void {
  const full = cleanSeed({ ...s, v: 1, at: Date.now() });
  if (!full) return;
  try { sessionStorage.setItem(SEED_KEY, JSON.stringify(full)); } catch { /* sin almacenamiento */ }
}

/**
 * Lee la semilla si es para uno de estos estudios, y la BORRA al leerla (no se repite al volver).
 * Si es para otro estudio se deja donde está. Vencida (10 min) → null. `autostart` se apaga si
 * pasaron más de 2 minutos desde el toque.
 */
export function takeSeed(targets: SeedTarget | SeedTarget[], uid?: string | null, now = Date.now()): CreativeSeed | null {
  const list = Array.isArray(targets) ? targets : [targets];
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(SEED_KEY); } catch { return null; }
  if (!raw) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  const seed = cleanSeed(parsed, uid);
  if (!seed) { try { sessionStorage.removeItem(SEED_KEY); } catch { /* */ } return null; }
  if (!list.includes(seed.target)) return null;
  try { sessionStorage.removeItem(SEED_KEY); } catch { /* */ }
  const age = now - seed.at;
  if (age < 0 || age > SEED_TTL_MS) return null;
  if (seed.autostart && age > AUTOSTART_TTL_MS) delete seed.autostart;
  return seed;
}
