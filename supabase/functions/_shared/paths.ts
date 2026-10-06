// SUPERNOVA — Rutas de Storage que manda el cliente (fotos de personaje, creativos, inicio de video).
//
// Por qué existe (chequeo de seguridad 06-oct-2026, hallazgo M1): revisar solo
// `startsWith(uid/)` y `!includes("..")` no basta. storage-js arma la URL sin codificar la ruta y
// el parser de URL convierte `%2e%2e` en `..`: `<mi_uid>/%2e%2e/<otro_uid>/foto.webp` terminaba
// firmando la foto privada de otro usuario (la firma usa service_role, así que RLS no frena).
//
// Regla: solo letras, números, punto, guion, guion bajo y "/" (nada de "%", "\", espacios ni
// esquemas), sin "..", sin "//", dentro de la carpeta del usuario REAL de la sesión.

const SAFE = /^[A-Za-z0-9._\-/]+$/;
const UID = /^[0-9a-f-]{36}$/i;

/** Devuelve la ruta limpia si es del usuario, o null si no se debe firmar. */
export function ownStoragePath(uid: string, path: unknown): string | null {
  if (typeof path !== "string" || !UID.test(uid)) return null;
  const p = path.trim();
  if (
    !p || p.length > 300 || !SAFE.test(p) || p.includes("..") || p.includes("//") ||
    !p.startsWith(`${uid}/`) || p.length === uid.length + 1
  ) return null;
  return p;
}
