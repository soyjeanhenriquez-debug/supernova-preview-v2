import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Mail, KeyRound, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const ALLOWED_EMAILS = ["soyjeanhenriquez@gmail.com"];

export function AuthPage() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();

    if (!ALLOWED_EMAILS.includes(normalized)) {
      toast.error("Este correo no tiene acceso a la app.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      toast.success("Código enviado. Revisa tu correo 📩");
      setEmail(normalized);
      setStep("code");
    } catch (err: any) {
      toast.error(err.message || "No se pudo enviar el código");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: "email",
      });
      if (error) throw error;
      toast.success("¡Acceso concedido! 🚀");
    } catch (err: any) {
      toast.error(err.message || "Código inválido o expirado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
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
          <p className="text-muted-foreground mt-1 text-sm">Acceso restringido · Solo invitados</p>
        </div>

        <div className="card-surface rounded-2xl p-8 animate-fade-up delay-100" style={{ animationFillMode: "forwards" }}>
          {step === "email" ? (
            <>
              <h2 className="font-display font-semibold text-xl text-foreground mb-1">
                Iniciar sesión
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Te enviaremos un código de 6 dígitos a tu correo.
              </p>

              <form onSubmit={handleSendCode} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="w-full bg-secondary border border-border rounded-lg pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full gradient-brand text-primary-foreground py-3 rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 glow-primary disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Enviando código...</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Enviar código de acceso</>
                  )}
                </button>
              </form>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setStep("email"); setCode(""); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 mb-4"
              >
                <ArrowLeft className="w-3 h-3" /> Cambiar correo
              </button>
              <h2 className="font-display font-semibold text-xl text-foreground mb-1">
                Introduce tu código
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Hemos enviado un código a <span className="text-foreground font-medium">{email}</span>
              </p>

              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    autoFocus
                    maxLength={6}
                    className="w-full bg-secondary border border-border rounded-lg pl-10 pr-4 py-3 text-base font-mono tracking-[0.4em] text-center text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || code.length < 6}
                  className="w-full gradient-brand text-primary-foreground py-3 rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2 glow-primary disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Verificando...</>
                  ) : (
                    "Acceder"
                  )}
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const { error } = await supabase.auth.signInWithOtp({
                        email,
                        options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
                      });
                      if (error) throw error;
                      toast.success("Nuevo código enviado");
                    } catch (err: any) {
                      toast.error(err.message || "Error al reenviar");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ¿No te llegó? Reenviar código
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground/50 mt-6">
          © 2025 SUPERNOVA · Acceso por invitación
        </p>
      </div>
    </div>
  );
}
