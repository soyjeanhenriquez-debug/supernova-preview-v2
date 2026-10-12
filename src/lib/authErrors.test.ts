import { describe, expect, it } from "vitest";
import { authErrorMessage, linkErrorNotice } from "./authErrors";

const err = (message: string, extra: Record<string, unknown> = {}) => ({ message, ...extra });

describe("authErrorMessage", () => {
  it("nunca deja pasar los mensajes de Supabase en inglés", () => {
    const english = [
      "Unable to validate email address: invalid format",
      "Password should be at least 6 characters.",
      "Failed to fetch",
      "For security purposes, you can only request this after 42 seconds.",
      "User already registered",
      "Email not confirmed",
      "Invalid login credentials",
      "Token has expired or is invalid",
      "captcha protection: request disallowed (invalid-input-response)",
      "Password is known to be weak and easy to guess, please choose a different one.",
      "New password should be different from the old password.",
      "Signups not allowed for this instance",
      "Auth session missing!",
      "Database error saving new user",
      "Something totally unexpected happened",
    ];
    for (const m of english) {
      const out = authErrorMessage(err(m));
      expect(out, m).not.toMatch(/\b(the|is|should|invalid|please|request)\b/i);
      expect(out.length, m).toBeGreaterThan(20);
    }
  });

  it("el límite de correos dice algo distinto al registrarse que al entrar", () => {
    const e = err("email rate limit exceeded", { code: "over_email_send_rate_limit", status: 429 });
    expect(authErrorMessage(e, "signup")).toMatch(/registrando mucha gente/);
    expect(authErrorMessage(e, "signup")).not.toMatch(/contraseña/);
    expect(authErrorMessage(e, "login")).toMatch(/contraseña/);
    expect(authErrorMessage(e, "resend")).toMatch(/Spam/);
  });

  it("dice cuántos segundos esperar", () => {
    expect(authErrorMessage(err("For security purposes, you can only request this after 37 seconds."))).toMatch(/37 segundos/);
  });

  it("la sesión caducada no se confunde con un código vencido", () => {
    expect(authErrorMessage(err("Invalid Refresh Token: Refresh Token Not Found"))).toMatch(/sesión/);
    expect(authErrorMessage(err("Token has expired or is invalid"), "verify")).toMatch(/código/);
  });

  it("deja pasar mensajes que ya vienen en español", () => {
    expect(authErrorMessage(err("Tu cuenta está suspendida"))).toBe("Tu cuenta está suspendida");
  });

  it("acepta cadenas y vacíos", () => {
    expect(authErrorMessage("Invalid login credentials")).toMatch(/incorrectos/);
    expect(authErrorMessage(null)).toMatch(/Algo falló/);
  });
});

describe("linkErrorNotice", () => {
  it("explica el enlace caducado", () => {
    expect(linkErrorNotice("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired", "")).toMatch(/ya no vale/);
    expect(linkErrorNotice("", "?error_code=bad_jwt")).toMatch(/no funcionó/);
    expect(linkErrorNotice("#/ofertas", "")).toBeNull();
  });
});
