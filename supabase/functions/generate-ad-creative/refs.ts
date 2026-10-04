// SUPERNOVA — Validación de `reference_paths` (fotos del producto, logo o imagen a variar) para
// generate-ad-creative. Funciones puras (sin Deno ni red) para probarlas también con vitest.
//
// Reglas (plan ATLAS, LUMEN): máximo 3; cada ruta empieza por "<uid>/" del usuario REAL (el que
// sacó auth.getUser del token, nunca uno que mande el cliente), sin "..", sin URLs, solo imágenes
// del bucket "creativos". El servidor firma después URLs de 10 minutos; nunca acepta URLs del cliente.

export const MAX_REFS = 3;

export type RefCheck = { ok: true; paths: string[] } | { ok: false; error: string };

const SAFE = /^[A-Za-z0-9._\-/]+$/;
const IMAGE = /\.(webp|png|jpe?g)$/i;

/** Devuelve las rutas limpias o el motivo del rechazo (en español, para mostrarlo). */
export function checkReferencePaths(input: unknown, uid: string): RefCheck {
  if (input === undefined || input === null) return { ok: true, paths: [] };
  if (!Array.isArray(input)) return { ok: false, error: "Las fotos de referencia no son válidas." };
  if (input.length > MAX_REFS) return { ok: false, error: `Puedes usar hasta ${MAX_REFS} fotos de referencia.` };
  if (!uid || !/^[0-9a-f-]{36}$/i.test(uid)) return { ok: false, error: "Sesión inválida." };
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") return { ok: false, error: "Las fotos de referencia no son válidas." };
    const p = raw.trim();
    if (
      !p || p.length > 300 || p.includes("..") || p.includes("//") || p.includes("\\") ||
      /^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith("/") || !SAFE.test(p) ||
      !p.startsWith(`${uid}/`) || !IMAGE.test(p)
    ) return { ok: false, error: "Esa foto de referencia no es tuya o no es válida." };
    if (!out.includes(p)) out.push(p);
  }
  return { ok: true, paths: out };
}
