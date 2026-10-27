/**
 * Lo que "¿Qué quieres crear hoy?" le deja a la herramienta de destino (26-oct-2026): el enlace de un reel, el
 * de un carrusel o lo que la persona describió para un video. Se lee UNA vez al abrir y se borra. Nunca genera
 * nada. Archivo sin dependencias para que los estudios lo lean sin cargar el registro de herramientas.
 */
export const IG_REEL_RE = /https?:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9._]+\/)?(?:reel|reels)\/[A-Za-z0-9_-]{5,}\/?\S*/i;
/** Publicación de Instagram (carrusel o foto): instagram.com/p/… */
export const IG_POST_RE = /https?:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9._]+\/)?p\/[A-Za-z0-9_-]{5,}\/?\S*/i;

export const REEL_URL_KEY = "supernova.reel-url";
/** La misma clave que usa "Analiza un Reel → Convertir en carrusel" (REEL_TO_CAROUSEL_KEY en src/lib/carousel.ts). */
export const TO_CAROUSEL_KEY = "supernova:reel-to-carousel";
export const CLIP_PROMPT_KEY = "supernova.clip-prompt";

/** Deja un prompt para "Video con IA · Un clip" (se lee una vez al abrir). No genera nada. */
export function setClipPrompt(text: string): void {
  try { sessionStorage.setItem(CLIP_PROMPT_KEY, text.trim().slice(0, 1000)); } catch { /* sin almacenamiento */ }
}
export function takeClipPrompt(): string {
  try {
    const v = sessionStorage.getItem(CLIP_PROMPT_KEY) ?? "";
    sessionStorage.removeItem(CLIP_PROMPT_KEY);
    return v.slice(0, 1000);
  } catch { return ""; }
}

/** Enlace de reel dejado por "¿Qué quieres crear hoy?". Se borra al leerlo. */
export function takeReelUrl(): string {
  try {
    const v = sessionStorage.getItem(REEL_URL_KEY) ?? "";
    sessionStorage.removeItem(REEL_URL_KEY);
    return IG_REEL_RE.test(v) ? v.slice(0, 300) : "";
  } catch { return ""; }
}
