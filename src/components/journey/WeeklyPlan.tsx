import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Flame, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts } from "@/contexts/ProductContext";

/**
 * "Tu semana": el socio IA semanal (edge function weekly-plan, tabla weekly_plans).
 * La primera vez que el usuario abre el Inicio en la semana se arma solo, con el estado real de su
 * negocio; las tareas se tachan aquí y el lunes siguiente el socio retoma lo que quedó pendiente.
 * Lo que retiene no es la gamificación: es tener trabajo claro y ver el avance semana a semana.
 */
type Task = { id: string; title: string; why: string; page: string; minutes: number; done: boolean };
type Plan = { week_start: string; focus: string | null; tasks: Task[]; regenerations: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const plansTable = () => (supabase as any).from("weekly_plans");

// Lunes de la semana en hora de República Dominicana (UTC−4), igual que weekStart() en la
// edge function weekly-plan.
function currentWeekStart(): string {
  const now = new Date(Date.now() - 4 * 3600_000);
  now.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  return now.toISOString().slice(0, 10);
}

export function WeeklyPlan({ onNavigate, stages }: {
  onNavigate: (page: string) => void;
  /** Estado de las 6 etapas del recorrido: el socio decide con él qué toca esta semana. */
  stages: { n: number; title: string; done: boolean }[] | null;
}) {
  const { user } = useAuth();
  const { activeId } = useProducts();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const asked = useRef(false);
  // Producto abierto ahora: descarta respuestas que llegan después de cambiar de producto.
  const currentProduct = useRef(activeId);
  // Plan en pantalla (para conservar lo ya hecho cuando se pide "Otro plan").
  const planRef = useRef<Plan | null>(null);
  planRef.current = plan;

  // Cada producto tiene su propio plan semanal: al cambiar de producto se empieza de cero.
  useEffect(() => {
    currentProduct.current = activeId;
    asked.current = false;
    setPlan(null); setStreak(0); setError(""); setLoading(false);
  }, [activeId]);

  const fetchPlan = useCallback(async (force = false) => {
    if (!activeId) return;
    const productId = activeId;
    setLoading(true); setError("");
    const { data, error } = await supabase.functions.invoke("weekly-plan", { body: { force, stages, product_id: productId } });
    if (currentProduct.current !== productId) return;
    if (error || !data?.plan) {
      const ctx = (error as { context?: Response } | null)?.context;
      const msg = ctx ? await ctx.json().then((b: { error?: string }) => b?.error).catch(() => null) : data?.error;
      setError(msg || "No se pudo armar tu semana.");
    } else {
      let next = data.plan as Plan;
      // "Otro plan": el servidor reemplaza la semana entera. Aquí se conservan las tareas ya hechas
      // y solo se cambia lo que falta; se guarda con el mismo update que usa tachar una tarea.
      const doneBefore = force && data.created ? (planRef.current?.tasks ?? []).filter(t => t.done) : [];
      if (doneBefore.length && user) {
        const ids = new Set(doneBefore.map(t => t.id));
        const titles = new Set(doneBefore.map(t => t.title.trim().toLowerCase()));
        const fresh = next.tasks
          .filter(t => !t.done && !titles.has(t.title.trim().toLowerCase()))
          .map(t => (ids.has(t.id) ? { ...t, id: `${t.id}-r${next.regenerations}` } : t));
        next = { ...next, tasks: [...doneBefore, ...fresh] };
        const { error: saveError } = await plansTable().update({ tasks: next.tasks, updated_at: new Date().toISOString() })
          .eq("user_id", user.id).eq("product_id", productId).eq("week_start", next.week_start);
        if (currentProduct.current !== productId) return;
        if (saveError) toast.error("No se pudo guardar tu semana");
      }
      setPlan(next);
      if (force && data.created) toast.success("Cambiamos solo lo que te falta.");
      if (data.note) toast.info(data.note);
    }
    setLoading(false);
  }, [stages, activeId, user]);

  // Se arma sola una vez por semana, cuando ya se conoce el estado del recorrido. Si el plan de
  // esta semana ya existe se lee directo de la tabla (un viaje corto); la función del servidor
  // (arranque en frío + validación + IA) solo se llama cuando todavía no hay plan.
  useEffect(() => {
    if (!user || !activeId || !stages || asked.current) return;
    asked.current = true;
    const productId = activeId;
    plansTable().select("*").eq("user_id", user.id).eq("product_id", productId).eq("week_start", currentWeekStart()).maybeSingle()
      .then(({ data }: { data: Plan | null }) => {
        if (currentProduct.current !== productId) return;
        if (data) setPlan(data);
        else fetchPlan(false);
      }, () => fetchPlan(false));
  }, [user, activeId, stages, fetchPlan]);

  // Racha: semanas seguidas (antes de esta) en las que hizo al menos la mitad de sus tareas.
  useEffect(() => {
    if (!user || !activeId) return;
    let alive = true;
    plansTable().select("week_start,tasks").eq("product_id", activeId).order("week_start", { ascending: false }).limit(12)
      .then(({ data }: { data: { week_start: string; tasks: Task[] }[] | null }) => {
        if (!alive) return;
        let n = 0;
        for (const w of (data ?? []).slice(1)) {
          const t = Array.isArray(w.tasks) ? w.tasks : [];
          if (t.length && t.filter(x => x.done).length / t.length >= 0.5) n++; else break;
        }
        setStreak(n);
      });
    return () => { alive = false; };
  }, [user, activeId, plan?.week_start]);

  const toggle = async (id: string) => {
    if (!plan || !user || !activeId) return;
    const tasks = plan.tasks.map(t => (t.id === id ? { ...t, done: !t.done } : t));
    setPlan({ ...plan, tasks });
    const { error } = await plansTable().update({ tasks, updated_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("product_id", activeId).eq("week_start", plan.week_start);
    if (error) toast.error("No se pudo guardar");
    else if (tasks.every(t => t.done)) toast.success("¡Semana completa! El lunes tu socio te arma la siguiente.");
  };

  const done = plan ? plan.tasks.filter(t => t.done).length : 0;

  return (
    <section className="card-surface rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-primary font-semibold">Tu semana · socio IA</p>
          <h2 className="font-display font-semibold text-xl text-foreground">
            {plan?.focus || "Tu plan de esta semana"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {plan ? `${done} de ${plan.tasks.length} tareas hechas. Cada lunes llega un plan nuevo según cómo va tu negocio.` : "Tareas concretas para esta semana, según cómo va tu negocio. Es gratis."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {streak > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-400" title="Semanas seguidas con al menos la mitad de las tareas hechas">
              <Flame className="w-3.5 h-3.5" /> {streak} {streak === 1 ? "semana" : "semanas"} seguidas
            </span>
          )}
          {plan && plan.regenerations < 2 && (
            <button onClick={() => fetchPlan(true)} disabled={loading} title="Pedir otro plan para esta semana (2 veces por semana)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Otro plan
            </button>
          )}
        </div>
      </div>

      {!plan && loading && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Tu socio está armando tu semana…</p>}
      {!plan && error && (
        <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-2">
          {error}
          <button onClick={() => fetchPlan(false)} className="text-primary hover:underline">Intentar de nuevo</button>
        </div>
      )}

      {plan && (
        <ol className="space-y-2">
          {plan.tasks.map((t, i) => (
            <li key={t.id} className={`rounded-xl border p-3 flex items-start gap-3 ${t.done ? "border-emerald-500/30 bg-emerald-500/5" : "border-border"}`}>
              <button onClick={() => toggle(t.id)} aria-label={t.done ? "Marcar como pendiente" : "Marcar como hecha"}
                className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${t.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-border hover:border-primary"}`}>
                {t.done && <Check className="w-3.5 h-3.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${t.done ? "text-muted-foreground line-through" : "text-foreground"}`}>{i + 1}. {t.title}</p>
                {t.why && !t.done && <p className="text-xs text-muted-foreground mt-0.5">{t.why}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-muted-foreground hidden sm:inline">~{t.minutes} min</span>
                {!t.done && t.page !== "Dashboard" && (
                  <button onClick={() => onNavigate(t.page)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                    Ir <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
