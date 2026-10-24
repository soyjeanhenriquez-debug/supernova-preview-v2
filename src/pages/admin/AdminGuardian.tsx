import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleDashed, Loader2, Play, ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GUARDIAN_PASOS, groupChecks, ordenHallazgos, type Check, type Finding, type JourneyStep, type Run } from "@/lib/guardian";

/**
 * Admin → Guardián del Creador (24-oct-2026). Supervisor interno: "la prioridad es que SUPERNOVA resuelva el
 * trabajo del creador, no que le obligue a aprender cómo funciona la IA". Aquí se ve lo que encontró, lo que
 * corrigió, lo que espera el OK de Jean y cada prueba con cómo se hizo. Las auditorías corren en la base
 * (private.guardian_step); este panel solo las pide y las avanza para mostrar el progreso. Si se cierra la
 * pestaña, el cron "guardian-procesar" la termina. Nada de puntuaciones: solo conteos y pruebas reales.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;
type Tab = "hallazgos" | "pruebas" | "recorridos" | "historial";
type Filtro = "abiertos" | "ok" | "corregidos" | "todos";

const SEV: Record<Finding["severity"], { label: string; cls: string }> = {
  critico: { label: "Crítico", cls: "border-destructive/50 text-destructive bg-destructive/10" },
  importante: { label: "Importante", cls: "border-primary/50 text-primary bg-primary/10" },
  mejora: { label: "Mejora", cls: "border-border text-muted-foreground bg-secondary/40" },
};
const ESTADO: Record<Finding["status"], string> = {
  abierto: "Abierto", pendiente_ok: "Espera tu OK", aprobado: "Aprobado, por hacer", corregido: "Corregido",
  rechazado: "Rechazado", resuelto: "Resuelto (la señal desapareció)",
};
const METODO: Record<Check["method"], string> = {
  servidor: "Servidor", datos: "Datos de uso", codigo: "Código", inspeccion: "Revisión del código", punta_a_punta: "De punta a punta",
};
const JSTATUS: Record<JourneyStep["status"], string> = { funciona: "Funciona", con_friccion: "Con fricción", falla: "Falla", no_probado: "No probado en vivo" };
const fecha = (s: string | null) => (s ? new Date(s).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" }) : "—");
const valor = (v: unknown): string => (v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

export default function AdminGuardian() {
  const [tab, setTab] = useState<Tab>("hallazgos");
  const [filtro, setFiltro] = useState<Filtro>("abiertos");
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [journey, setJourney] = useState<JourneyStep[]>([]);
  const [corriendo, setCorriendo] = useState<{ done: number; total: number; step: string | null } | null>(null);

  const cargar = useCallback(async () => {
    const [f, r, j] = await Promise.all([
      db().from("guardian_findings").select("*").order("last_seen", { ascending: false }).limit(300),
      db().from("guardian_runs").select("id, kind, status, requested_at, started_at, finished_at, steps, steps_done, current_step, summary").order("requested_at", { ascending: false }).limit(30),
      db().from("guardian_journey").select("*").order("journey").order("step_order"),
    ]);
    if (f.error || r.error) { toast.error("No se pudo leer el Guardián."); setFindings([]); return; }
    setFindings(f.data ?? []);
    setRuns(r.data ?? []);
    setJourney(j.data ?? []);
    const ultima = (r.data as Run[] | null)?.find(x => x.status === "terminada");
    if (ultima) {
      const c = await db().from("guardian_checks").select("*").eq("run_id", ultima.id).order("id");
      setChecks(c.data ?? []);
    } else setChecks([]);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const auditar = async () => {
    const { data, error } = await db().rpc("guardian_request_audit", { p_kind: "completa" });
    if (error || !data?.run_id) { toast.error("No se pudo empezar la auditoría."); return; }
    if (data.ya_corriendo) toast.message("Ya hay una auditoría en curso: sigo esa.");
    setCorriendo({ done: 0, total: GUARDIAN_PASOS.length, step: null });
    try {
      for (let k = 0; k < 40; k++) {
        const { data: st, error: e } = await db().rpc("guardian_advance", { p_run: data.run_id });
        if (e) throw e;
        if (st?.busy) { await new Promise(res => setTimeout(res, 1500)); continue; }
        setCorriendo({ done: st.done, total: st.total, step: st.step ?? null });
        if (st.status === "terminada" || st.status === "fallo") break;
      }
      toast.success("Auditoría terminada.");
    } catch {
      toast.error("Se cortó la conexión. La auditoría sigue en el servidor y termina sola en unos minutos.");
    } finally {
      setCorriendo(null);
      void cargar();
    }
  };

  const decidir = async (f: Finding, decision: "aprobado" | "rechazado" | "corregido" | "abierto") => {
    let nota: string | null = null;
    if (decision === "rechazado") {
      nota = window.prompt("¿Por qué no? (el Guardián no lo vuelve a proponer salvo con evidencia nueva)") ?? null;
      if (nota === null) return;
    }
    const { error } = await db().rpc("guardian_decide", { p_finding: f.id, p_decision: decision, p_note: nota });
    if (error) { toast.error("No se pudo guardar la decisión."); return; }
    toast.success("Decisión guardada.");
    void cargar();
  };

  const abiertos = useMemo(() => (findings ?? []).filter(f => ["abierto", "pendiente_ok", "aprobado"].includes(f.status)), [findings]);
  const visibles = useMemo(() => {
    const all = findings ?? [];
    const by = filtro === "abiertos" ? all.filter(f => f.status === "abierto" || f.status === "aprobado")
      : filtro === "ok" ? all.filter(f => f.status === "pendiente_ok")
      : filtro === "corregidos" ? all.filter(f => f.status === "corregido" || f.status === "resuelto")
      : all;
    return ordenHallazgos(by);
  }, [findings, filtro]);
  const ultima = runs.find(r => r.status === "terminada");
  const cuenta = (s: Finding["severity"]) => abiertos.filter(f => f.severity === s).length;
  const pruebas = ultima?.summary?.pruebas;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-6 h-6 text-primary mt-0.5" strokeWidth={1.6} />
        <div className="flex-1">
          <h1 className="font-display text-2xl tracking-tight">Guardián del Creador</h1>
          <p className="text-sm text-muted-foreground">SUPERNOVA resuelve el trabajo del creador; no le pide que aprenda cómo funciona la IA. Aquí está todo lo que le hace trabajar de más.</p>
        </div>
      </div>

      {/* Estado general: conteos reales, sin puntuaciones */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {([["Críticos", cuenta("critico"), "text-destructive"], ["Importantes", cuenta("importante"), "text-primary"], ["Mejoras", cuenta("mejora"), "text-foreground"],
          ["Esperan tu OK", (findings ?? []).filter(f => f.status === "pendiente_ok").length, "text-foreground"],
          ["Corregidos", (findings ?? []).filter(f => f.status === "corregido" || f.status === "resuelto").length, "text-foreground"]] as const).map(([l, n, c]) => (
          <div key={l} className="rounded-xl border border-border bg-card p-3">
            <div className={`font-display text-2xl tabular-nums ${c}`}>{findings ? n : "…"}</div>
            <div className="text-[12px] text-muted-foreground">{l}</div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 text-[13px]">
          {ultima ? (
            <>
              <p className="text-foreground">Última auditoría: <b>{ultima.kind}</b> · {fecha(ultima.finished_at)}</p>
              {pruebas && <p className="text-muted-foreground">{pruebas.pasaron} pruebas pasaron · {pruebas.fallaron} fallaron · {pruebas.sin_probar} no se pudieron probar</p>}
            </>
          ) : <p className="text-muted-foreground">Todavía no hay auditorías terminadas.</p>}
          <p className="text-[12px] text-muted-foreground mt-1">Corre sola cada día (10:20 UTC) y cada lunes completa (11:10 UTC). Antes de cada publicación, las pruebas críticas del código bloquean el deploy si fallan.</p>
        </div>
        <button type="button" onClick={() => void auditar()} disabled={!!corriendo}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {corriendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Auditar toda Supernova
        </button>
      </section>

      {corriendo && (
        <section className="rounded-xl border border-border p-4 space-y-2" aria-live="polite">
          <div className="flex justify-between text-[13px]">
            <span className="text-foreground">{corriendo.step ? GUARDIAN_PASOS.find(p => p.id === corriendo.step)?.label ?? corriendo.step : "Empezando…"}</span>
            <span className="tabular-nums text-muted-foreground">{corriendo.done} de {corriendo.total}</span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${(corriendo.done / Math.max(1, corriendo.total)) * 100}%` }} /></div>
        </section>
      )}

      <div className="flex flex-wrap gap-2" role="tablist">
        {([["hallazgos", "Hallazgos"], ["pruebas", "Pruebas"], ["recorridos", "Recorridos"], ["historial", "Historial"]] as const).map(([id, l]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`h-9 px-3 rounded-full border text-[13px] ${tab === id ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground hover:text-foreground"}`}>{l}</button>
        ))}
      </div>

      {tab === "hallazgos" && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {([["abiertos", "Abiertos"], ["ok", "Esperan tu OK"], ["corregidos", "Corregidos"], ["todos", "Todos"]] as const).map(([id, l]) => (
              <button key={id} type="button" onClick={() => setFiltro(id)} aria-pressed={filtro === id}
                className={`h-8 px-3 rounded-full text-[12px] border ${filtro === id ? "border-primary/60 text-foreground" : "border-border text-muted-foreground"}`}>{l}</button>
            ))}
          </div>
          {!findings ? <p className="text-sm text-muted-foreground">Cargando…</p>
            : visibles.length === 0 ? <p className="text-sm text-muted-foreground">Nada en esta lista.</p>
            : visibles.map(f => (
              <article key={f.id} className="rounded-xl border border-border bg-card p-4 space-y-2 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SEV[f.severity].cls}`}>{SEV[f.severity].label}</span>
                  <span className="font-semibold text-foreground">{f.feature}</span>
                  <span className="text-[11px] text-muted-foreground">· {ESTADO[f.status]} · {f.evidence_kind === "hipotesis" ? "Hipótesis" : "Observado"} · {f.perspective}</span>
                </div>
                <p className="text-foreground">{f.problem}</p>
                <p className="text-muted-foreground"><b className="text-foreground font-medium">Impacto:</b> {f.impact}</p>
                <p className="text-muted-foreground"><b className="text-foreground font-medium">Propuesta:</b> {f.proposal} <span className="text-[11px]">({f.fix_type === "requiere_ok" ? "necesita tu OK" : "la puede resolver el Guardián"})</span></p>
                {f.verification && <p className="text-muted-foreground"><b className="text-foreground font-medium">Verificación:</b> {f.verification}</p>}
                <details className="text-[12px] text-muted-foreground">
                  <summary className="cursor-pointer">Evidencia ({f.occurrences} {f.occurrences === 1 ? "caso" : "casos"} · visto por última vez {fecha(f.last_seen)})</summary>
                  <ul className="mt-1 space-y-0.5 pl-4 list-disc break-words">
                    {Object.entries(f.evidence ?? {}).map(([k, v]) => <li key={k}><b>{k}:</b> {valor(v)}</li>)}
                  </ul>
                  {f.decision_note && <p className="mt-1">Nota de la decisión: {f.decision_note}</p>}
                </details>
                <div className="flex flex-wrap gap-2 pt-1">
                  {f.status === "pendiente_ok" && <>
                    <button type="button" onClick={() => void decidir(f, "aprobado")} className="h-8 px-3 rounded-full bg-primary text-primary-foreground text-[12px] font-semibold">Aprobar</button>
                    <button type="button" onClick={() => void decidir(f, "rechazado")} className="h-8 px-3 rounded-full border border-border text-[12px]">No lo hagas</button>
                  </>}
                  {(f.status === "abierto" || f.status === "aprobado") && <>
                    <button type="button" onClick={() => void decidir(f, "corregido")} className="h-8 px-3 rounded-full border border-border text-[12px]">Marcar corregido</button>
                    <button type="button" onClick={() => void decidir(f, "rechazado")} className="h-8 px-3 rounded-full border border-border text-[12px]">No es un problema</button>
                  </>}
                  {(f.status === "corregido" || f.status === "resuelto" || f.status === "rechazado") &&
                    <button type="button" onClick={() => void decidir(f, "abierto")} className="h-8 px-3 rounded-full border border-border text-[12px]">Reabrir</button>}
                </div>
              </article>
            ))}
        </section>
      )}

      {tab === "pruebas" && (
        <section className="space-y-4">
          {!ultima ? <p className="text-sm text-muted-foreground">Sin auditorías terminadas.</p> : groupChecks(checks).map(([area, list]) => (
            <div key={area} className="space-y-1.5">
              <h2 className="font-display text-base">{area}</h2>
              {list.map(c => (
                <div key={c.id} className="flex items-start gap-2 rounded-lg border border-border p-2.5 text-[13px]">
                  {c.ok === true ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" /> : c.ok === false ? <XCircle className="w-4 h-4 mt-0.5 text-destructive shrink-0" /> : <CircleDashed className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-foreground">{c.name} <span className="text-[11px] text-muted-foreground">· {METODO[c.method]}{c.ok === null ? " · no se pudo probar" : ""}</span></p>
                    {c.detail && <p className="text-[12px] text-muted-foreground break-words">{c.detail}</p>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {tab === "recorridos" && (
        <section className="space-y-2">
          {journey.length === 0 ? <p className="text-sm text-muted-foreground">Sin recorridos revisados.</p> : journey.map(s => (
            <div key={`${s.journey}-${s.step_order}`} className="rounded-lg border border-border p-3 text-[13px]">
              <p className="text-foreground"><span className="text-muted-foreground">{s.journey} · {s.step_order}.</span> {s.step}</p>
              <p className="text-[12px] text-muted-foreground"><b className={s.status === "con_friccion" || s.status === "falla" ? "text-primary" : "text-foreground"}>{JSTATUS[s.status]}</b> · {METODO[s.method]} · {s.evidence}</p>
            </div>
          ))}
        </section>
      )}

      {tab === "historial" && (
        <section className="space-y-2">
          {runs.map(r => (
            <div key={r.id} className="rounded-lg border border-border p-3 text-[13px] flex flex-wrap gap-x-3">
              <span className="text-foreground font-medium">{r.kind}</span>
              <span className="text-muted-foreground">{fecha(r.requested_at)}</span>
              <span className="text-muted-foreground">{r.status} · {r.steps_done}/{r.steps.length} pasos</span>
              {r.summary?.pruebas && <span className="text-muted-foreground">{r.summary.pruebas.pasaron} ✓ · {r.summary.pruebas.fallaron} ✗ · {r.summary.pruebas.sin_probar} sin probar</span>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
