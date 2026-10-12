// Fuentes que solo usan el registro y la landing de React (Playfair Display + Inter). Se piden
// al abrir esas páginas, no en toda la app: la app usa Sora y Manrope (index.html).
const EDITORIAL_FONTS =
  "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@300;400;500;600&display=swap";

export function loadEditorialFonts(): void {
  if (typeof document === "undefined" || document.querySelector(`link[href="${EDITORIAL_FONTS}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = EDITORIAL_FONTS;
  document.head.appendChild(link);
}

// Fuentes de la app (Sora para títulos, Manrope para texto). Son fuentes variables: con el rango
// de pesos Google devuelve UN archivo por alfabeto (antes, 42 bloques @font-face con los mismos
// archivos repetidos: 15,8 KB de CSS → 3 KB). Los pesos usados van de 300 (font-light) a 800
// (font-extrabold). vite.config.ts tiene la misma dirección para el preload: si cambias una, cambia la otra.
export const APP_FONTS =
  "https://fonts.googleapis.com/css2?family=Sora:wght@300..800&family=Manrope:wght@300..700&display=swap";

/**
 * Activa las fuentes de la app SIN bloquear el primer pintado. index.html (vía vite.config.ts)
 * solo las precarga (`rel=preload`, no bloquea); aquí se convierten en hoja de estilos cuando el
 * código de la app ya corre. Mientras tanto se ve la fuente del sistema y, al llegar, cambia
 * (display=swap). Sin manejadores en línea: la CSP no los permite.
 */
export function loadAppFonts(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector('link[rel="stylesheet"][href*="fonts.googleapis.com/css2?family=Sora"]')) return;
  // Se usa la dirección exacta del preload (así sale del mismo pedido, sin bajarla dos veces).
  const preload = document.querySelector<HTMLLinkElement>('link[rel="preload"][as="style"][href*="fonts.googleapis.com/css2?family=Sora"]');
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = preload?.href || APP_FONTS;
  document.head.appendChild(link);
}
