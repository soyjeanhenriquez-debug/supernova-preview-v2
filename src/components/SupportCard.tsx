import { useEffect, useState } from "react";
import { Check, Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureAccess } from "@/lib/features";

/**
 * "Apoya SUPERNOVA": aportes de pago único en Whop (tabla support_plans; el webhook acredita con
 * grant_support). Cada aporte desbloquea "Crear producto" y trae créditos de regalo. Si no hay
 * planes activos, no se muestra nada.
 */
type Plan = { plan_id: string; tier: "apoyo" | "impulso" | "fundador"; label: string; amount_usd: number; bonus_credits: number; perks: string[] };

export function SupportCard({ compact }: { compact?: boolean }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [supporter, setSupporter] = useState(false);
  const { user } = useAuth();
  const { canSee } = useFeatureAccess();
  // Whop acredita por correo: el checkout llega con el correo de la cuenta ya puesto.
  const email = user?.email ? `?email=${encodeURIComponent(user.email)}` : "";

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    db.from("support_plans").select("plan_id,tier,label,amount_usd,bonus_credits,perks").eq("enabled", true).order("sort_order")
      .then(({ data }: { data: Plan[] | null }) => setPlans(data ?? []));
    db.from("supporters").select("id").limit(1).then(({ data }: { data: unknown[] | null }) => setSupporter(!!data?.length));
  }, []);

  if (!plans.length) return null;

  return (
    <section className="card-surface rounded-2xl p-5 space-y-4">
      <div className="space-y-1">
        <p className="font-display font-semibold text-lg text-foreground flex items-center gap-2">
          <Heart className="w-5 h-5 text-primary" /> {supporter ? "Gracias por impulsar SUPERNOVA" : "Impulsa SUPERNOVA"}
        </p>
        {!compact && (
          <p className="text-sm text-muted-foreground max-w-2xl">
            Somos un equipo pequeño construyendo la herramienta que nos hubiera gustado tener al empezar.
            Tu aporte paga la IA que escribe tu producto y nos ayuda a traer antes las más potentes.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {plans.map(p => (
          <a key={p.plan_id} href={`https://whop.com/checkout/${p.plan_id}${email}`} target="_blank" rel="noopener"
            className={`rounded-xl border p-4 flex flex-col gap-2 transition-colors hover:border-primary ${p.tier === "impulso" ? "border-primary/60 bg-primary/5" : "border-border"}`}>
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">{p.label}</span>
              <span className="font-display text-xl font-bold text-foreground tabular-nums">US${Number(p.amount_usd).toLocaleString("es")}</span>
            </span>
            <ul className="space-y-1 text-xs text-muted-foreground flex-1">
              <li className="flex gap-1.5"><Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" /> {p.bonus_credits.toLocaleString("es")} créditos de regalo</li>
              {canSee("Crear producto") && <li className="flex gap-1.5"><Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" /> Desbloquea "Crea tu producto"</li>}
              {p.perks.map(k => <li key={k} className="flex gap-1.5"><Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" /> {k}</li>)}
            </ul>
            <span className="rounded-lg gradient-brand px-3 py-2 text-center text-xs font-semibold text-primary-foreground">Aportar US${Number(p.amount_usd).toLocaleString("es")}</span>
          </a>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Pago único y seguro por Whop, con el mismo correo de tu cuenta. No es una suscripción.</p>
    </section>
  );
}
