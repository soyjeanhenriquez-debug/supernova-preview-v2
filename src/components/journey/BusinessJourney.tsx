import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts } from "@/contexts/ProductContext";
import { useProjects } from "@/hooks/useProjects";
import { useBusinessProfile, profileReady, type BusinessProfile } from "@/lib/businessProfile";
import { WeeklyPlan } from "@/components/journey/WeeklyPlan";

/**
 * Recorrido "Mi negocio": el Método Negocio Gemelo en 6 etapas, con el producto del usuario en el
 * centro (inspirado en el método de Ladeira: un solo camino, cada paso deja algo concreto).
 * Cada etapa se marca sola cuando hay datos (ficha, precio elegido, mini app guardada, anuncios de
 * la Mándala, números anotados); las que aún no tienen herramienta propia se marcan a mano
 * (business_profile.journey). Siempre muestra UN siguiente paso.
 */
type Action = { label: string; page: string; primary?: boolean };
type Stage = { n: number; key: string; short: string; title: string; why: string; doneNote: string; done: boolean; progress?: string; manual?: boolean; actions: Action[] };

export function BusinessJourney({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { user } = useAuth();
  const { activeId } = useProducts();
  const { profile, savePatch, loaded } = useBusinessProfile();
  const { projects } = useProjects();
  const [ads, setAds] = useState<{ count: number; measured: boolean } | null>(null);

  useEffect(() => {
    if (!user || !activeId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("mandala_ads").select("spend,sales,status").eq("product_id", activeId).limit(300).then(({ data }: { data: { spend: number | null; sales: number | null; status: string }[] | null }) => {
      const list = data ?? [];
      setAds({ count: list.length, measured: list.some(a => a.spend != null || a.sales != null || a.status === "ganador" || a.status === "descartado") });
    });
  }, [user, activeId]);

  const manual = (k: string) => !!profile.journey?.done?.[k];
  const toggleManual = (k: string) => {
    const done = { ...(profile.journey?.done ?? {}), [k]: !manual(k) };
    const journey: BusinessProfile["journey"] = { ...(profile.journey ?? {}), done };
    savePatch({ journey }).then(ok => { if (!ok) toast.error("No se pudo guardar"); });
  };

  const hasMiniApp = projects.some(p => {
    const ctx = p.context as { miniapp?: unknown } | undefined;
    return !!ctx?.miniapp;
  });

  const planTasks = profile.launch_plan?.tasks ?? [];
  const planPct = planTasks.length ? planTasks.filter(t => t.done).length / planTasks.length : 0;
  const answered = Object.keys(profile.validation?.answers ?? {}).length;
  const hasRecovery = (profile.recovery?.messages?.length ?? 0) > 0;

  const stages: Stage[] = useMemo(() => [
    {
      n: 1, key: "1", short: "Elegir", title: "Elige qué vas a vender",
      why: "Escoge una oferta que ya se vende y cuéntala en tu ficha.", doneNote: "Ya tienes tu ficha",
      done: profileReady(profile),
      actions: [
        { label: "Ver ofertas ganadoras", page: "Ofertas", primary: true },
        { label: "Ya sé qué vender", page: "Mi negocio" },
      ],
    },
    {
      n: 2, key: "2", short: "Validar", title: "Comprueba que se vende",
      why: "14 preguntas de sí o no. Unos 3 minutos.", doneNote: "Tu oferta pasó la matriz",
      // Hecha si la matriz está completa y la oferta pasa (nota ≥ 50); con nota baja hay que ajustarla.
      done: !!profile.validation?.completed_at && (profile.validation?.score == null || profile.validation.score >= 50),
      progress: profile.validation?.completed_at && profile.validation?.score != null && profile.validation.score < 50
        ? `Nota ${profile.validation.score}: ajusta tu oferta`
        : answered && !profile.validation?.completed_at ? `${answered} de 14` : undefined,
      actions: [
        { label: "Validar mi producto", page: "Validar", primary: true },
        { label: "Ver el veredicto de la oferta", page: "Ofertas" },
      ],
    },
    {
      n: 3, key: "3", short: "Precio", title: "Ponle precio",
      why: "Mira cuánto te queda por venta antes de pagar anuncios.", doneNote: "Tu precio está elegido",
      done: !!profile.pricing?.chosen,
      actions: [{ label: "Calcular mi precio", page: "Precio", primary: true }],
    },
    {
      n: 4, key: "4", short: "Construir", title: "Construye tu producto",
      why: "Tu mini app y un plan de 14 días, tarea por tarea.", doneNote: "Tu plan va al 80% o más",
      done: planPct >= 0.8 || (hasMiniApp && manual("4")),
      progress: planTasks.length ? `${Math.round(planPct * 100)}% del plan` : hasMiniApp ? "Mini app lista" : undefined,
      manual: hasMiniApp && planPct < 0.8,
      actions: [
        { label: planTasks.length ? "Seguir mi plan" : "Armar mi plan de lanzamiento", page: "Plan", primary: true },
        { label: "Hacer mi versión (Mini Apps)", page: "Mini Apps" },
      ],
    },
    {
      n: 5, key: "5", short: "Vender", title: "Crea tus anuncios",
      why: "La IA te escribe tus primeros 5 anuncios, uno por uno.", doneNote: "Tienes tus 5 anuncios",
      done: (ads?.count ?? 0) >= 5,
      progress: ads ? `${Math.min(ads.count, 5)} de 5 anuncios` : undefined,
      actions: [
        { label: "Crear mis anuncios", page: "Mándala", primary: true },
        { label: "Calendario de contenido", page: "Contenido" },
      ],
    },
    {
      n: 6, key: "6", short: "Medir", title: "Mide y recupera",
      why: "Anota tus números y te decimos qué apagar y qué escalar.", doneNote: "Mides y recuperas ventas",
      done: !!ads?.measured && hasRecovery,
      progress: ads?.measured && !hasRecovery ? "Falta la recuperación" : !ads?.measured && hasRecovery ? "Faltan tus números" : undefined,
      actions: [
        { label: "Anotar mis resultados", page: "Resultados", primary: true },
        { label: "Recuperar ventas", page: "Recuperar" },
      ],
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [profile, ads, hasMiniApp]);

  // El socio semanal decide con el estado de las etapas; se le pasa cuando ya se conocen los anuncios.
  const stagesForPlan = useMemo(
    () => (loaded && ads ? stages.map(s => ({ n: s.n, title: s.title, done: s.done })) : null),
    [loaded, ads, stages],
  );

  if (!loaded) return null;
  const doneCount = stages.filter(s => s.done).length;
  const next = stages.find(s => !s.done);
  const lastDone = [...stages].reverse().find(s => s.done && (!next || s.n < next.n));
  const primary = (st: Stage) => st.actions.find(a => a.primary) ?? st.actions[0];

  return (
    <div className="space-y-4">
    <section className="card-surface rounded-2xl p-5 sm:p-6 space-y-4">
      {/* Etapas: una fila compacta. Tocar una te lleva directo a su herramienta. */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.22em] text-primary font-semibold truncate">
          Mi negocio{profileReady(profile) ? ` · ${profile.product}` : ""}
        </p>
        <span className="text-[11px] text-muted-foreground shrink-0">{doneCount} de 6</span>
      </div>
      <ol className="grid grid-cols-6 gap-1.5" aria-label="Etapas de tu negocio">
        {stages.map(st => {
          const isNext = next?.n === st.n;
          return (
            <li key={st.n}>
              <button onClick={() => onNavigate(primary(st).page)} title={`${st.title}${st.done ? ` · ${st.doneNote}` : ""}`}
                className={`w-full rounded-lg border px-1 py-2 flex flex-col items-center gap-1 transition-colors ${isNext ? "border-primary bg-primary/10" : st.done ? "border-emerald-500/30 bg-emerald-500/5" : "border-border hover:border-foreground/20"}`}>
                <span className={`w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold ${st.done ? "bg-emerald-500 text-white" : isNext ? "gradient-brand text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                  {st.done ? <Check className="w-3.5 h-3.5" /> : st.n}
                </span>
                <span className={`text-[10px] sm:text-[11px] leading-none ${isNext ? "text-primary font-semibold" : st.done ? "text-emerald-400" : "text-muted-foreground"}`}>{st.short}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Ahora: UNA etapa, una línea y el botón que lleva a hacerla. */}
      {next ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            {lastDone && <p className="text-xs text-emerald-400 mb-1 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Etapa {lastDone.n} lista: {lastDone.doneNote.toLowerCase()}</p>}
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Ahora · Etapa {next.n}</p>
            <p className="font-display font-semibold text-foreground text-xl">{next.title}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{next.progress ? `${next.progress} · ` : ""}{next.why}</p>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
            <button onClick={() => onNavigate(primary(next).page)}
              className="inline-flex items-center justify-center gap-2 rounded-xl gradient-brand px-5 py-3 text-sm font-semibold text-primary-foreground">
              {primary(next).label} <ArrowRight className="w-4 h-4" />
            </button>
            <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
              {next.actions.filter(a => !a.primary).map(a => (
                <button key={a.label} onClick={() => onNavigate(a.page)} className="text-xs text-muted-foreground hover:text-foreground">{a.label} →</button>
              ))}
              {next.manual && <button onClick={() => toggleManual(next.key)} className="text-xs text-muted-foreground hover:text-foreground underline">Ya lo hice</button>}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="flex-1 text-sm text-foreground">Completaste las 6 etapas. Ahora escala el anuncio que gana y repite con variaciones.</p>
          <button onClick={() => onNavigate("Resultados")} className="inline-flex items-center gap-2 rounded-xl gradient-brand px-5 py-3 text-sm font-semibold text-primary-foreground">Ver mis resultados <ArrowRight className="w-4 h-4" /></button>
        </div>
      )}
    </section>
    <WeeklyPlan onNavigate={onNavigate} stages={stagesForPlan} />
    </div>
  );
}
