/**
 * Errores de Supabase Auth en español y con lo que hay que HACER (R2-19, 12-oct-2026).
 *
 * Antes vivía en AuthPage y solo traducía 5 casos: el resto llegaba en inglés ("Unable to validate
 * email address: invalid format", "Password should be at least 6 characters", "Failed to fetch"…).
 * El primer usuario real (22-sep) se quedó fuera por "email rate limit exceeded": el correo
 * integrado de Supabase manda muy pocos correos por hora para todo el proyecto, y cada correo nuevo
 * anula el anterior.
 *
 * `ctx` dice dónde pasó, porque lo que hay que hacer cambia: un límite de correos al REGISTRARSE no
 * se arregla "entrando con contraseña" (la persona todavía no tiene cuenta).
 */
export type AuthErrorContext = "login" | "signup" | "code" | "verify" | "password" | "resend";

const SUPPORT = "soyjeanhenriquez@gmail.com";

function rawMessage(err: unknown): { msg: string; code: string; status: number } {
  if (err == null) return { msg: "", code: "", status: 0 };
  if (typeof err === "string") return { msg: err, code: "", status: 0 };
  const e = err as { message?: unknown; code?: unknown; status?: unknown; error_code?: unknown };
  return {
    msg: typeof e.message === "string" ? e.message : String(err),
    code: typeof e.code === "string" ? e.code : typeof e.error_code === "string" ? e.error_code : "",
    status: typeof e.status === "number" ? e.status : 0,
  };
}

/** Segundos que pide esperar Supabase ("…only request this after 42 seconds"). */
function waitSeconds(msg: string): number | null {
  const m = /after (\d+) seconds?/i.exec(msg);
  return m ? Number(m[1]) : null;
}

export function authErrorMessage(err: unknown, ctx: AuthErrorContext = "login"): string {
  const { msg, code, status } = rawMessage(err);
  const raw = `${code} ${msg}`;

  // Sin internet o algo del navegador bloquea la llamada.
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|AuthRetryableFetchError/i.test(raw))
    return "No pudimos conectarnos. Revisa tu internet (o desactiva el bloqueador de anuncios) y vuelve a intentarlo.";

  // Límite de correos del proyecto (no de la persona).
  if (/over_email_send_rate_limit|email rate limit/i.test(raw)) {
    if (ctx === "signup")
      return `Ahora mismo se está registrando mucha gente y el correo de confirmación no sale. Tus datos siguen aquí: inténtalo de nuevo en unos minutos. Si sigue igual, escríbenos a ${SUPPORT} y te activamos a mano.`;
    if (ctx === "resend")
      return "No pudimos mandar otro correo ahora. Busca el que ya te llegó (también en Spam o Promociones) o inténtalo en unos minutos.";
    return "El correo está saturado ahora mismo. Entra con tu correo y tu contraseña (eso no necesita correo), o pide el código en un rato.";
  }
  // Espera corta entre dos pedidos seguidos.
  const secs = waitSeconds(msg);
  if (secs !== null || /over_request_rate_limit|too many requests|rate limit/i.test(raw) || status === 429)
    return secs !== null
      ? `Espera ${secs} segundos y vuelve a intentarlo: es una protección contra abusos.`
      : "Hiciste muchos intentos seguidos. Espera un minuto y vuelve a intentarlo.";

  if (/user_already_exists|already registered|already been registered|email_exists/i.test(raw))
    return "Ese correo ya tiene cuenta. Entra con tu correo y tu contraseña; si no la recuerdas, entra con un código por correo.";
  if (/email not confirmed|email_not_confirmed/i.test(raw))
    return "Tu correo aún no está confirmado. Abre el ÚLTIMO correo que te mandamos (mira también en Spam o Promociones) y toca el enlace. Cada correo nuevo anula el anterior.";
  if (/invalid login credentials|invalid_credentials/i.test(raw))
    return "Correo o contraseña incorrectos. Si no recuerdas la contraseña, entra con un código por correo. ¿Pagaste en Whop y aún no creas tu cuenta? Créala con el mismo correo.";
  if (/session.*missing|session_not_found|not authenticated|jwt expired|refresh token/i.test(raw))
    return "Tu sesión se cerró. Entra de nuevo con tu correo y tu contraseña (o con un código por correo).";
  if (/otp_expired|token has expired|otp.*expired|invalid.*token|token.*invalid|email link is invalid/i.test(raw))
    return "Ese código ya no vale. Usa el del último correo que te llegó, o pide uno nuevo.";
  if (/captcha/i.test(raw))
    return "La verificación de seguridad caducó. Márcala de nuevo y vuelve a intentarlo.";
  if (/weak_password|password is known|pwned|weak password|too weak/i.test(raw))
    return "Esa contraseña es muy fácil de adivinar. Usa una más larga, por ejemplo tres palabras con un número.";
  if (/password should be at least|password.*(short|length)|at least \d+ characters/i.test(raw))
    return "La contraseña es muy corta. Usa al menos 8 caracteres.";
  if (/same_password|should be different/i.test(raw))
    return "Es la misma contraseña que ya tenías. Elige otra.";
  if (/validate email|invalid format|email_address_invalid|invalid email|email address .* is invalid/i.test(raw))
    return "Ese correo no parece válido. Revisa que esté bien escrito (por ejemplo, nombre@gmail.com).";
  if (/signup.*(disabled|not allowed)|signups not allowed|email_provider_disabled|email logins are disabled/i.test(raw))
    return `El registro está cerrado un momento. Escríbenos a ${SUPPORT} y te damos entrada.`;
  if (/database error|unexpected_failure|internal server error/i.test(raw) || status >= 500)
    return `Algo falló de nuestro lado. Vuelve a intentarlo en un minuto; si sigue, escríbenos a ${SUPPORT}.`;

  // Lo que no reconocemos: si está en español, se muestra tal cual; si no, un mensaje útil.
  if (msg && /[áéíóúñ¿¡]/i.test(msg)) return msg;
  return `Algo falló. Vuelve a intentarlo; si sigue igual, escríbenos a ${SUPPORT}.`;
}

/** Si venimos de un enlace de correo caducado, Supabase deja el error en el hash o la query. */
export function linkErrorNotice(hash: string = window.location.hash, search: string = window.location.search): string | null {
  const s = `${hash} ${search}`;
  let decoded = s;
  try { decoded = decodeURIComponent(s.replace(/\+/g, " ")); } catch { /* hash malformado */ }
  if (/error_code=otp_expired|link is invalid or has expired/i.test(decoded))
    return "Ese enlace ya no vale: cada correo nuevo anula al anterior. Si ya confirmaste antes, entra aquí con tu correo y tu contraseña. Si no, entra con un código por correo.";
  if (/error_code=/.test(s)) return "Ese enlace no funcionó. Entra aquí con tu correo y tu contraseña, o con un código por correo.";
  return null;
}
