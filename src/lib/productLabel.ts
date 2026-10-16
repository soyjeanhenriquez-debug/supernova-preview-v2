/**
 * Cómo se muestra un producto en el selector (16-oct-2026, Jean: el menú decía "JEAN HENRIQUEZ" y el
 * guion salió para "Muscle Booster"). Arriba va lo que USAN las herramientas: la ficha (`product`);
 * abajo, el nombre que le puso la persona si es distinto. Un enlace pegado como nombre o ficha no
 * sirve de etiqueta. Si la ficha es larga ("Reto IA Sin Miedo: reto de 28 días…"), se muestra la parte
 * antes de los dos puntos; el texto completo va en `full`.
 */
const isUrl = (s: string) => /^https?:\/\//i.test(s);

export function productLabel(p: { name?: string | null; product?: string | null } | null | undefined) {
  const ficha = (p?.product ?? "").trim();
  const name = (p?.name ?? "").trim();
  const hasFicha = !!ficha && !isUrl(ficha);
  const okName = !!name && !isUrl(name);
  const head = hasFicha ? ficha.split(/\s*[:—]\s+/)[0] : "";
  const main = hasFicha ? (head.length >= 3 ? head : ficha) : okName ? name : "Producto sin nombre";
  const sub = !hasFicha ? "Ficha sin llenar" : okName && name.toLowerCase() !== main.toLowerCase() ? name : null;
  return { main, sub, full: hasFicha ? ficha : main, hasFicha };
}
