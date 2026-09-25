import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { PLANS, formatUsd, type PlanKey } from "@/lib/plans";
import { startCheckout } from "@/lib/stripe";
import { LogOut, Mail, Loader2, Sparkles } from "lucide-react";
import { PlanFeatures, TrialTerms } from "@/components/PlanFeatures";

// El usuario ya tiene cuenta pero no membresía activa: este es el punto de
// activación. Cobro: Stripe si está configurado; si no, Whop con el correo y el código
// FUNDADOR ya puestos (checkoutUrl). "Comunidad" sigue siendo externo (Skool).
export default function PendingAccessPage() {
  const { user, signOut } = useAuth();
  const [starting, setStarting] = useState<string | null>(null);

  const activate = async (plan: "pro") => {
    setStarting(plan);
    const redirected = await startCheckout({ action: "subscribe", plan });
    if (!redirected) setStarting(null);
  };

  // Dos planes: PRO (el recomendado, lo que casi todos necesitan) y Comunidad aparte.
  const stripePlans: Array<{ key: "pro"; featured: boolean }> = [
    { key: "pro", featured: true },
  ];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 card-surface rounded-2xl p-8 space-y-5">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-primary" />
            </div>
          </div>
          <h1 className="font-display font-semibold text-2xl text-foreground mb-2">Empieza tus 3 días gratis</h1>
          <p className="text-sm text-muted-foreground">
            Tu cuenta ya está creada. Para entrar, activa el plan PRO: los <span className="text-foreground font-medium">primeros 3 días son gratis y con todo abierto</span>. En el pago <span className="text-foreground font-medium">usa este mismo correo</span> y tu acceso se activa solo.
          </p>
        </div>

        <div className="space-y-3">
          {stripePlans.map(({ key, featured }) => {
            const p = PLANS[key];
            return (
              <button
                key={key}
                onClick={() => activate(key)}
                disabled={starting !== null}
                className={`w-full text-left rounded-xl border p-4 transition-colors disabled:opacity-60 ${
                  featured
                    ? "border-primary bg-primary/5 hover:bg-primary/10 shadow-[0_0_25px_hsl(var(--primary)/0.12)]"
                    : "border-border bg-secondary/30 hover:bg-secondary/50"
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-display font-bold text-sm tracking-wide text-foreground">
                    {p.name}
                    {featured && (
                      <span className="ml-2 rounded bg-primary/15 px-2 py-0.5 text-[10px] tracking-widest text-primary">
                        RECOMENDADO
                      </span>
                    )}
                  </span>
                  <span className="font-display font-bold text-xl text-primary">
                    {formatUsd(p.price)}<span className="text-xs text-muted-foreground font-normal">{p.period}</span>
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{p.tagline}</p>
                <PlanFeatures plan={key} />
                {starting === key ? (
                  <p className="mt-3 text-xs text-primary flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> Abriendo el pago seguro…
                  </p>
                ) : (
                  <p className="mt-3 text-xs font-semibold text-primary">Empezar mis 3 días gratis →</p>
                )}
              </button>
            );
          })}

          {/* Antes de pagar: tarjeta, día 4 y cómo cancelar, justo debajo del botón */}
          <TrialTerms />

          <a
            href={PLANS.comunidad.checkout}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-left rounded-xl border border-border bg-secondary/30 hover:bg-secondary/50 p-4 transition-colors"
          >
            <div className="flex items-baseline justify-between">
              <span className="font-display font-bold text-sm tracking-wide text-foreground">{PLANS.comunidad.name}</span>
              <span className="font-display font-bold text-xl text-primary">
                {formatUsd(PLANS.comunidad.price)}<span className="text-xs text-muted-foreground font-normal">{PLANS.comunidad.period}</span>
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{PLANS.comunidad.tagline}</p>
            <PlanFeatures plan="comunidad" />
            <p className="mt-3 text-xs font-semibold text-primary">Ver la comunidad en Skool →</p>
          </a>
        </div>

        <div className="px-3 py-2 rounded-lg bg-secondary/60 border border-border text-xs text-muted-foreground text-center">
          Entraste como <span className="text-foreground font-medium" data-ph-mask>{user?.email}</span>. Tu plan queda unido a este correo.
        </div>

        <div className="flex items-center justify-center gap-4 pt-1 text-xs">
          <a href="mailto:soyjeanhenriquez@gmail.com" className="text-muted-foreground hover:text-foreground flex items-center gap-1">
            <Mail className="w-3.5 h-3.5" /> ¿Ya activaste tu plan y no entras? Escríbenos
          </a>
          <button onClick={signOut} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
            <LogOut className="w-3.5 h-3.5" /> Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
