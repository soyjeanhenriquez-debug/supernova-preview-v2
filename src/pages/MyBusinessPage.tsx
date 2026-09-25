import { ArrowRight, Briefcase } from "lucide-react";
import { useBusinessProfile, profileReady } from "@/lib/businessProfile";
import { BusinessProfileForm } from "@/components/BusinessProfileForm";
import { calcScenario } from "@/lib/pricing";
import { useJourney } from "@/contexts/JourneyContext";
import { STAGES } from "@/lib/journey";

/**
 * "Mi negocio": la ficha del negocio (una sola vez) y lo que el usuario ya construyó en cada etapa.
 * Antes la ficha vivía dentro de la Mándala; ahora todas las herramientas la leen de aquí.
 */
export function MyBusinessPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { profile, setProfile, savePatch, loaded } = useBusinessProfile();
  const journey = useJourney();
  if (!loaded) return <div className="text-sm text-muted-foreground p-6">Cargando…</div>;

  const ready = profileReady(profile);
  const chosen = profile.pricing?.scenarios?.find(s => s.id === profile.pricing?.chosen);
  const priceInfo = chosen ? calcScenario(chosen) : null;
  const cur = profile.pricing?.currency ?? "US$";
  const answered = Object.keys(profile.validation?.answers ?? {}).length;
  const tasks = profile.launch_plan?.tasks ?? [];
  const tasksDone = tasks.filter(t => t.done).length;
  const recovery = profile.recovery?.messages?.length ?? 0;
  // Con la ficha lista, el botón lleva a la primera etapa que falta: la MISMA regla que el Inicio,
  // la barra de etapa y el menú (src/lib/journey.ts), para que nunca digan cosas distintas.
  const next = journey.next && journey.next > 1 ? STAGES[journey.next - 1] : null;
  const nextStep = next ? { label: `Siguiente: ${next.title.toLowerCase()}`, page: next.page }
    : { label: "Volver al inicio", page: "Dashboard" };

  const summary: { stage: string; label: string; value: string; page: string }[] = [
    { stage: "2 · Validar", label: "Matriz de validación", value: profile.validation?.completed_at ? "Completa" : answered ? `${answered} respuestas` : "Sin empezar", page: "Validar" },
    { stage: "3 · Precio", label: "Precio y ganancia", value: chosen && priceInfo ? `${cur}${chosen.price} · te quedan ${cur}${priceInfo.perSale.toFixed(2)} por venta` : "Sin números todavía", page: "Precio" },
    { stage: "4 · Construir", label: "Plan de lanzamiento", value: tasks.length ? `${tasksDone} de ${tasks.length} tareas` : "Sin plan todavía", page: "Plan" },
    { stage: "6 · Recuperar", label: "Mensajes para quien casi compra", value: recovery ? `${recovery} mensajes listos` : "Sin crear", page: "Recuperar" },
  ];

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <p className="text-xs uppercase tracking-wider text-primary font-semibold">Mi negocio · Tu ficha</p>
        <h1 className="font-display font-bold text-2xl text-foreground flex items-center gap-2"><Briefcase className="w-5 h-5 text-primary" /> {ready ? profile.product : "Cuéntanos qué vas a vender"}</h1>
        <p className="text-sm text-muted-foreground max-w-2xl mt-1">
          Lo llenas una vez y lo usan todas las herramientas. ¿Aún no sabes qué vender? <button onClick={() => onNavigate?.("Ofertas")} className="text-primary hover:underline">Elige una oferta que ya vende</button>.
        </p>
      </div>

      <div className="card-surface rounded-2xl p-5">
        <BusinessProfileForm profile={profile} setProfile={setProfile} savePatch={savePatch} />
      </div>

      {ready && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Lo que ya tienes</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {summary.map(s => (
              <button key={s.page} onClick={() => onNavigate?.(s.page)}
                className="card-surface rounded-xl p-4 text-left hover:border-primary/40 transition-colors">
                <p className="text-[11px] text-muted-foreground">Etapa {s.stage}</p>
                <p className="text-sm font-semibold text-foreground">{s.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">{s.value} <ArrowRight className="w-3 h-3" /></p>
              </button>
            ))}
          </div>
          <button onClick={() => onNavigate?.(nextStep.page)}
            className="inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2.5 text-sm font-semibold text-primary-foreground mt-2">
            {nextStep.label} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
