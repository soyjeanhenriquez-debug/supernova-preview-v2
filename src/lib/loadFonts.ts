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
