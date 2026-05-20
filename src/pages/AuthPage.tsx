import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Mail, KeyRound, Loader2, ArrowLeft, Lock, Send, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type Step = "email" | "code" | "denied" | "requested";

export function AuthPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestMessage, setRequestMessage] = useState("");

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;

    setLoading(true);
    try {
      const { data: approved, error: rpcErr } = await supabase
        .rpc("is_email_approved", { p_email: normalized });

      if (rpcErr) throw rpcErr;

      if (!approved) {
        setEmail(normalized);
        setStep("denied");
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
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
    } catch (err: any) {
      toast.error(err.message || "No se pudo enviar la solicitud");
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
          <p className="text-muted-foreground mt-1 text-sm">Acceso restringido · Solo miembros</p>
        </div>

        <div className="card-surface rounded-2xl p-8 animate-fade-up delay-100" style={{ animationFillMode: "forwards" }}>
          {step === "email" && (
            <>
              <h2 className="font-display font-semibold text-xl text-foreground mb-1">Iniciar sesión</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Usa el email con el que te registraste en la comunidad.
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
                <button
                  type="submit" disabled={loading}
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
                <h2 className="font-display font-semibold text-xl text-foreground mb-1">Este email no tiene acceso</h2>
                <p className="text-sm text-muted-foreground">
                  SUPERNOVA es exclusivo para miembros de nuestra comunidad. Puedes solicitar acceso a continuación.
                </p>
              </div>

              <form onSubmit={handleRequestAccess} className="space-y-3 pt-2">
                <div className="px-3 py-2 rounded-lg bg-secondary/60 border border-border text-xs text-muted-foreground">
                  Solicitando para: <span className="text-foreground font-medium">{email}</span>
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
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <><Send className="w-4 h-4" /> Solicitar acceso</>}
                </button>
                <button
                  type="button" onClick={() => { setStep("email"); setEmail(""); }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground"
                >
                  ← Intentar con otro email
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
                Revisaremos y te contactaremos pronto.
              </p>
              <button
                type="button" onClick={() => { setStep("email"); setEmail(""); setRequestName(""); setRequestMessage(""); }}
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
