// SUPERNOVA — Borrar llaves y tokens de un texto antes de escribirlo en logs o devolverlo.
//
// Por qué existe (chequeo de seguridad 06-oct-2026, hallazgo M4): Meta y YouTube reciben la llave
// en la URL (?access_token=…, ?key=…). Cuando la red falla, Deno pone la URL COMPLETA en el
// mensaje del error ("error sending request for url (…access_token=EAA…)"), y ese mensaje se
// escribía tal cual en los logs de Supabase.

const PATTERNS: [RegExp, string][] = [
  [/([?&](?:access_token|key|api_key|apikey|token|client_secret|signature)=)[^&\s"')]+/gi, "$1[oculto]"],
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/g, "$1[oculto]"],
  [/\bEAA[A-Za-z0-9]{20,}/g, "[token-meta]"],
  [/\bAIza[0-9A-Za-z_-]{20,}/g, "[llave-google]"],
];

/** Texto de un error (o de cualquier cosa) sin llaves ni tokens, recortado. */
export function redact(x: unknown, max = 500): string {
  let s = x instanceof Error ? `${x.name}: ${x.message}` : typeof x === "string" ? x : JSON.stringify(x) ?? String(x);
  for (const [re, rep] of PATTERNS) s = s.replace(re, rep);
  return s.slice(0, max);
}
