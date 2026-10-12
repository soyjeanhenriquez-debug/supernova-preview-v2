/**
 * Correo mal escrito = la persona nunca recibe el correo de confirmación y cree que la app falla.
 * En LATAM los errores típicos son "gmial.com", "hotmial.com", "gmail.con", "gmail.co".
 * suggestEmail() propone la corrección (no la aplica sola: la persona decide).
 */
const DOMAINS = [
  "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com", "live.com",
  "hotmail.es", "yahoo.es", "outlook.es", "yahoo.com.mx", "yahoo.com.ar", "yahoo.com.br", "hotmail.com.ar", "hotmail.com.mx",
  "outlook.com.mx", "outlook.com.ar", "live.com.mx", "live.com.ar", "hotmail.cl", "hotmail.co.uk", "hotmail.fr", "msn.com",
  "me.com", "mail.com", "gmx.com", "aol.com", "zoho.com", "yandex.com", "proton.me", "protonmail.com", "prodigy.net.mx",
];
// Solo se proponen los más comunes: los demás de la lista están para no "corregir" un dominio real.
const SUGGEST = new Set(["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com", "live.com", "hotmail.es", "yahoo.es", "outlook.es"]);

function distance(a: string, b: string): number {
  if (a === b) return 0;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // Dos letras cambiadas de lugar ("gmial") cuentan como un solo error.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
    }
  }
  return dp[a.length][b.length];
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** Devuelve el correo corregido si el dominio parece un error de tipeo de uno conocido; si no, null. */
export function suggestEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return null;
  const user = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (!domain || DOMAINS.includes(domain)) return null;
  let best: string | null = null;
  let bestD = Infinity;
  for (const d of DOMAINS) {
    const dist = distance(domain, d);
    if (dist < bestD) { bestD = dist; best = d; }
  }
  // Hasta 2 errores, y el dominio escrito no puede ser demasiado corto (evita "a.co" → "me.com").
  if (best && SUGGEST.has(best) && bestD > 0 && bestD <= 2 && domain.length >= 6) return `${user}@${best}`;
  return null;
}
