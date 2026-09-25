import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { clearNewPasswordOffer, offerNewPasswordAfterLogin } from "@/lib/setPassword";
import { Sparkles, Mail, KeyRound, Loader2, ArrowLeft, Lock, Send, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Turnstile } from "@/components/Turnstile";

type Step = "password" | "email" | "code" | "denied" | "requested";

const CAPTCHA_ENABLED = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY);

/**
 * Errores de Supabase Auth en español y con lo que hay que HACER. El primer usuario real
 * (22-sep) se quedó fuera por "email rate limit exceeded": el correo integrado de Supabase
 * solo manda 2 correos por hora para todo el proyecto, y cada código nuevo anula el anterior.
 */
export function authErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err ?? "");
  if (/rate limit|over_email_send_rate_limit|429/i.test(raw))
    return "El correo está saturado ahora mismo. Entra con tu correo y tu contraseña (no necesita correo), o prueba el código en una hora.";
  if (/email not confirmed/i.test(raw))
    return "Tu correo aún no está confirmado. Abre el ÚLTIMO correo que te llegó (cada correo nuevo anula el anterior) o escríbenos por WhatsApp y te activamos al momento.";
  if (/invalid login credentials/i.test(raw))
    return "Correo o contraseña incorrectos. Si no recuerdas la contraseña, entra con un código por correo.";
  if (/token has expired|otp.*expired|invalid.*token|token.*invalid/i.test(raw))
    return "Ese código ya no vale. Usa el del último correo que te llegó.";
  if (/captcha/i.test(raw)) return "La verificación de seguridad caducó. Márcala de nuevo y vuelve a intentarlo.";
  return raw || "Algo falló. Inténtalo de nuevo.";
}

/** Si venimos de un enlace de correo caducado, Supabase deja el error en el hash o la query. */
function linkErrorNotice(): string | null {
  const s = `${window.location.hash} ${window.location.search}`;
  if (/error_code=otp_expired|link is invalid or has expired/i.test(decodeURIComponent(s.replace(/\+/g, " "))))
    return "Ese enlace ya no vale: cada correo nuevo anula al anterior. No hace falta otro enlace: entra aquí con tu correo y tu contraseña.";
  if (/error_code=/.test(s)) return "Ese enlace no funcionó. Entra aquí con tu correo y tu contraseña.";
  return null;
}

export function AuthPage() {
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [notice] = useState(linkErrorNotice);

  const resetCaptcha = () => { setCaptchaToken(""); setCaptchaResetKey((k) => k + 1); };

  // Entrar con contraseña: no manda ningún correo, así que no puede chocar con el límite.
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized || !password) return;
    if (CAPTCHA_ENABLED && !captchaToken) { toast.error("Completa la verificación de seguridad"); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: normalized,
        password,
        options: { captchaToken: CAPTCHA_ENABLED ? captchaToken : undefined },
      });
      if (error) throw error;
      // Limpia el hash del enlace caducado, si lo había.
      if (window.location.hash) window.history.replaceState({}, "", window.location.pathname);
      toast.success("¡Bienvenido! 🚀");
    } catch (err: unknown) {
      toast.error(authErrorMessage(err), { duration: 8000 });
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    if (CAPTCHA_ENABLED && !captchaToken) {
      toast.error("Completa la verificación de seguridad");
      return;
    }

    setLoading(true);
    try {
      // Sin pregunta previa de "¿este correo es cliente?": respondía a cualquiera y servía para
      // averiguar quién paga SUPERNOVA. El código se manda igual; si la cuenta no tiene acceso, al
      // entrar ve la pantalla para activar su membresía.
      const { error } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: window.location.origin,
          captchaToken: CAPTCHA_ENABLED ? captchaToken : undefined,
        },
      });
      if (error) throw error;
      toast.success("Código enviado. Revisa tu correo 📩 — usa solo el último que te llegue.");
      setEmail(normalized);
      setStep("code");
    } catch (err: unknown) {
      toast.error(authErrorMessage(err), { duration: 8000 });
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Quien entra con código casi siempre olvidó su contraseña: al entrar se le ofrece crear una.
    // Se marca antes de verificar porque la app se monta en cuanto la sesión existe.
    offerNewPasswordAfterLogin();
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: "email",
      });
      if (error) throw error;
      toast.success("¡Acceso concedido! 🚀");
    } catch (err: unknown) {
      clearNewPasswordOffer();
      toast.error(authErrorMessage(err), { duration: 8000 });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from("access_requests").upsert({
        email,
        full_name: requestName.trim() || null,
        message: requestMessage.trim() || null,
        source: "signup_failed",
      }, { onConflict: "email" });
      if (error && error.code !== "23505") throw error;
      setStep("requested");
    } catch (err: unknown) {
      toast.error(authErrorMessage(err) || "No se pudo enviar la solicitud");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-4 right-4 z-20">
        <LanguageSwitcher variant="ghost" />
      </div>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8 animate-fade-up">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 animate-pulse-glow">
            <img src="/supernova-icon.png" alt="SUPERNOVA" className="w-14 h-14" />
          </div>
          <h1 className="font-display font-bold text-3xl text-foreground">SUPERNOVA</h1>
          <p className="text-muted-foreground mt-1 text-sm">Entra a tu cuenta</p>
        </div>

        <div className="card-surface rounded-2xl p-8 animate-fade-up delay-100" style={{ animationFillMode: "forwards" }}>
          {notice && (step === "password" || step === "email") && (
            <div className="mb-5 rounded-lg border border-primary/30 bg-primary/10 px-3.5 py-3 text-xs leading-relaxed text-foreground">
              {notice}
            </div>
          )}

          {step === "password" && (
            <>
              <h2 className="font-display font-semibold text-xl text-foreground mb-1">Iniciar sesión</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Con el correo y la contraseña que pusiste al crear tu cuenta.
              </p>

              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email" autoComplete="email" placeholder="tu@email.com" value={email}
                    onChange={(e) => setEmail(e.target.value)} required autoFocus
                    className="w-full bg-secondary border border-border rounded-lg pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                  />
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="password" autoComplete="current-password" placeholder="Tu contraseña" value={password}
                    onChange={(e) => setPassword(e.target.value)} required
                    className="w-full bg-secondary border border-border rounded-lg pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                  />
                </div>
                {CAPTCHA_ENABLED && (
                  <Turnstile onVerify={setCaptchaToken} resetKey={captchaResetKey} />
                )}
                <button
                  type="submit" disabled={loading || (CAPTCHA_ENABLED && !captchaToken)}
                  className="w-full gradient-brand text-primary-foreground py-3 rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 glow-primary disabled:opacity-60"
                >
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</> : <><Sparkles className="w-4 h-4" /> Entrar</>}
                </button>
              </form>
              <button
                type="button"
                onClick={() => { setStep("email"); resetCaptcha(); }}
                className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ¿No tienes contraseña o la olvidaste? <span className="text-primary">Entra con un código por correo</span>
              </button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                ¿Aún no tienes cuenta? <a href="/signup" className="text-primary hover:underline">Créala y prueba 3 días gratis</a>
              </p>
            </>
          )}

          {step === "email" && (
            <>
              <button
                type="button" onClick={() => { setStep("password"); resetCaptcha(); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-4"
              >
                <ArrowLeft className="w-3 h-3" /> Entrar con contraseña
              </button>
              <h2 className="font-display font-semibold text-xl text-foreground mb-1">Entrar con un código</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Te mandamos un código de 6 dígitos. Pídelo una sola vez: cada código nuevo anula el anterior.
              </p>

              <form onSubmit={handleSendCode} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email" placeholder="tu@email.com" value={email}
                    onChange={(e) => setEmail(e.target.value)} required autoFocus
                    className="w-full bg-secondary border border-border rounded-lg pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                  />
                </div>
                {CAPTCHA_ENABLED && (
                  <Turnstile onVerify={setCaptchaToken} resetKey={captchaResetKey} />
                )}
                <button
                  type="submit" disabled={loading || (CAPTCHA_ENABLED && !captchaToken)}
                  className="w-full gradient-brand text-primary-foreground py-3 rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 glow-primary disabled:opacity-60"
                >
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verificando...</> : <><Sparkles className="w-4 h-4" /> Enviar código de acceso</>}
                </button>
              </form>
            </>
          )}

          {step === "code" && (
            <>
              <button
                type="button" onClick={() => { setStep("email"); setCode(""); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-4"
              >
                <ArrowLeft className="w-3 h-3" /> Cambiar correo
              </button>
              <h2 className="font-display font-semibold text-xl text-foreground mb-1">Introduce tu código</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Hemos enviado un código a <span className="text-foreground font-medium">{email}</span>
              </p>

              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]*" placeholder="123456"
                    value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required autoFocus maxLength={6}
                    className="w-full bg-secondary border border-border rounded-lg pl-10 pr-4 py-3 text-base font-mono tracking-[0.4em] text-center text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                  />
                </div>
                <button
                  type="submit" disabled={loading || code.length < 6}
                  className="w-full gradient-brand text-primary-foreground py-3 rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 glow-primary disabled:opacity-60"
                >
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verificando...</> : "Acceder"}
                </button>
              </form>
            </>
          )}

          {step === "denied" && (
            <div className="space-y-5">
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
                  <Lock className="w-6 h-6 text-destructive" />
                </div>
              </div>
              <div className="text-center">
                <h2 className="font-display font-semibold text-xl text-foreground mb-1">Este correo todavía no tiene un plan activo</h2>
                <p className="text-sm text-muted-foreground">
                  Si aún no te registras, crea tu cuenta y prueba el plan PRO 3 días gratis, con todo abierto.
                </p>
                <a href="/signup" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
                  Crear mi cuenta y probar 3 días gratis →
                </a>
                <p className="mt-3 text-xs text-muted-foreground">
                  ¿Ya pagaste con este correo o crees que es un error? Déjanos tus datos y lo revisamos.
                </p>
              </div>

              <form onSubmit={handleRequestAccess} className="space-y-3 pt-2">
                <div className="px-3 py-2 rounded-lg bg-secondary/60 border border-border text-xs text-muted-foreground">
                  Correo: <span className="text-foreground font-medium">{email}</span>
                </div>
                <input
                  type="text" placeholder="Tu nombre completo (opcional)" value={requestName}
                  onChange={(e) => setRequestName(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <textarea
                  placeholder="Mensaje (opcional): ¿cómo conociste SUPERNOVA?" value={requestMessage}
                  onChange={(e) => setRequestMessage(e.target.value)} rows={3}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
                <button
                  type="submit" disabled={loading}
                  className="w-full gradient-brand text-primary-foreground py-3 rounded-lg font-semibold text-sm hover:opacity-90 flex items-center justify-center gap-2 glow-primary disabled:opacity-60"
                >
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <><Send className="w-4 h-4" /> Pedir que lo revisen</>}
                </button>
                <button
                  type="button" onClick={() => { setStep("email"); setEmail(""); }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground"
                >
                  ← Probar con otro correo
                </button>
              </form>
            </div>
          )}

          {step === "requested" && (
            <div className="text-center space-y-4 py-2">
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-success" />
                </div>
              </div>
              <h2 className="font-display font-semibold text-xl text-foreground">Solicitud enviada</h2>
              <p className="text-sm text-muted-foreground">
                Hemos recibido tu solicitud para <span className="text-foreground font-medium">{email}</span>.
                La revisamos y te respondemos lo antes posible.
              </p>
              <button
                type="button" onClick={() => { setStep("password"); setEmail(""); setRequestName(""); setRequestMessage(""); }}
                className="text-xs text-primary hover:underline"
              >
                ← Volver al inicio
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground/50 mt-6">
          © 2026 SUPERNOVA · Plataforma privada · Solo miembros
        </p>
      </div>
    </div>
  );
}
