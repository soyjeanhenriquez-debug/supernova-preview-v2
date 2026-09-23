import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/contexts/AuthContext";
import { CountUp } from "@/components/CountUp";
import { DailyPicksHero } from "@/components/dashboard/DailyPicksHero";
import { RoiHunterWidget } from "@/components/dashboard/RoiHunterWidget";
import { BusinessJourney } from "@/components/journey/BusinessJourney";

/**
 * Inicio = "Mi negocio": el recorrido de 6 etapas con el siguiente paso, las tareas de la semana
 * y, debajo, lo que alimenta la etapa 1 (los 3 negocios del día y las ofertas que sigue).
 * Sin XP, rachas por entrar, niveles ni frases del día (decisión de Jean, 23-sep-2026): lo que
 * retiene es avanzar en su propio negocio, no la gamificación.
 */
interface Props { onNavigate: (p: string) => void; }

function formatRenewal(d: Date) {
  const days = Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400000));
  const formatted = d.toLocaleDateString("es", { day: "numeric", month: "long" });
  return { days, formatted };
}

export function DashboardPage({ onNavigate }: Props) {
  const { balance, limit, renewalDate } = useCredits();
  const { user } = useAuth();
  const firstName = (user?.user_metadata?.display_name || user?.email?.split("@")[0] || "")
    .toString().split(/[\s.@]/)[0].replace(/^./, (c: string) => c.toUpperCase());
  const renewal = formatRenewal(renewalDate);
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";

  return (
    <div className="max-w-[1280px] mx-auto space-y-8 py-4">
      <div>
        <h1 className="font-display font-bold text-2xl text-foreground">{hello}{firstName ? `, ${firstName}` : ""}</h1>
        <p className="text-sm text-muted-foreground">Este es tu negocio, paso a paso. Sigue la etapa que toca y tacha tus tareas de la semana.</p>
      </div>

      {/* Mi negocio: recorrido de 6 etapas + "Tu semana" (socio IA). */}
      <BusinessJourney onNavigate={onNavigate} />

      {/* Etapa 1 · Elegir: tus 3 negocios de hoy y las ofertas que sigues. */}
      <DailyPicksHero onNavigate={onNavigate} />
      <RoiHunterWidget onNavigate={onNavigate} />

      {/* Créditos */}
      <section className="card-surface rounded-2xl p-6">
        <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium mb-1">Tu plan del mes</div>
            <div className="font-display font-semibold text-lg text-foreground">Créditos disponibles</div>
            <div className="text-[12px] text-muted-foreground mt-1">Mirar ofertas, el Radar, los ganchos, la matriz, la calculadora y tu semana es gratis. Lo que la IA escribe por ti gasta créditos.</div>
            <div className="text-[12px] text-muted-foreground mt-1">Se renuevan en {renewal.days} días · {renewal.formatted}</div>
          </div>
          <button onClick={() => onNavigate("Créditos")} className="btn-primary-nova px-4 py-2 rounded-lg text-[13px]">Conseguir más créditos</button>
        </div>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="font-display text-[36px] font-semibold tabular-nums leading-none text-foreground">
            <CountUp value={balance} />
          </span>
          <span className="text-[13px] text-muted-foreground">/ <CountUp value={limit} /></span>
        </div>
        <div className="w-full h-[3px] bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${Math.min(100, (balance / Math.max(1, limit)) * 100)}%` }} />
        </div>
      </section>
    </div>
  );
}
