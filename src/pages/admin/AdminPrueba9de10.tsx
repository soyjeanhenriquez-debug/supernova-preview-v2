import { useCallback, useEffect, useState } from "react";
import { Check, Minus, RefreshCw, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FUNNEL_9DE10 } from "@/lib/analytics";

/**
 * Admin → Prueba 9 de 10 (R2-10, 12-oct-2026). La prueba de verdad de la misión 10: 10 personas
 * reales en prueba de 3 días. Metas: 9 usan "Mi versión", 5 pagan el día 4, 3 recargan en 30 días.
 *
 * Lee la RPC admin_prueba_9de10 (solo admin; migración 20261012120000_r2_10_prueba_9de10.sql), que
 * cuenta desde tablas propias: landing_visitors, auth.users, user_age_country, credit_transactions,
 * creation_feedback y subscriptions. Sin admins ni probadores. Nada de PostHog aquí: lo que solo
 * ve PostHog (abrir Inicio, toques) se arma allá con los eventos de FUNNEL_9DE10.
 */

type Day = {
  d: string; visitas: number; clic_prueba: number; cuentas: number; entraron: number; mi_version: number;
  pieza: number; sirvio: number; prueba: number; pagaron: number; recargaron: number;
};
type Total = Omit<Day, "d"> & { mi_version_72h: number; aun_en_prueba: number; prueba_terminada: number; cuentas_30d: number };
type Person = {
  d: string; email: string | null; entro: boolean; mi_version_h: number | null; pieza: boolean; sirvio: boolean;
  estado: string; pago: boolean; recargo: boolean; prueba?: boolean; prueba_terminada?: boolean; dias_cuenta?: number;
};
type Report = { days: number; since: string; today: string; por_dia: Day[]; total: Total; personas: Person[] };

const MIGRATION = "20261012120000_r2_10_prueba_9de10.sql";
const ESTADO_ES: Record<string, string> = {
  trialing: "En prueba", active: "Pagando", past_due: "Pago atrasado", canceled: "Canceló", inactive: "Inactivo", sin_prueba: "Sin prueba",
};
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
const pct = (n: number, base: number) => (base > 0 ? `${Math.round((n / base) * 100).toLocaleString("es-ES")} %` : "—");

/** Pasos del embudo en la base, en orden, con qué cuenta cada uno. */
const STEPS: { key: keyof Omit<Day, "d">; label: string; hint: string }[] = [
  { key: "visitas", label: "Visitan la portada", hint: "Visitantes únicos de la landing" },
  { key: "clic_prueba", label: "Tocan el botón", hint: "Visitantes que tocaron el botón principal" },
  { key: "cuentas", label: "Crean cuenta", hint: "Sin admins ni probadores" },
  { key: "entraron", label: "Entran a la app", hint: "Dieron edad y país (o ya usaron algo)" },
  { key: "mi_version", label: "Hacen Mi versión", hint: "Al menos una «Hacer mi versión»" },
  { key: "pieza", label: "Primera pieza", hint: "Imagen, carrusel o video" },
  { key: "sirvio", label: "«¿Te sirvió?» Sí", hint: "En cualquier herramienta" },
  { key: "prueba", label: "Empiezan la prueba", hint: "Tienen suscripción en Whop" },
  { key: "pagaron", label: "Pagan el día 4", hint: "Pagando y con la prueba ya vencida (aprox.)" },
  { key: "recargaron", label: "Recargan", hint: "Compraron un pack en sus primeros 30 días" },
];

function Goal({ title, n, base, goal, hint }: { title: string; n: number; base: number; goal: number; hint: string }) {
  // goal = de cada 10. Sin 10 personas no hay veredicto: se dice cuántas faltan.
  const ok = base > 0 && n / base >= goal / 10;
  const status = base < 10 ? `Faltan ${10 - base} ${10 - base === 1 ? "persona" : "personas"} para tener la muestra`
    : ok ? "Cumple la meta" : "Por debajo de la meta";
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</p>
      <p className="font-display text-3xl font-semibold mt-1 tabular-nums text-foreground">
        {n} <span className="text-muted-foreground text-lg font-normal">de {base}</span>
      </p>
      <p className="text-[12px] text-muted-foreground mt-1">Meta: {goal} de 10 · hoy {pct(n, base)}</p>
      <p className={`text-[12px] mt-2 ${base >= 10 && !ok ? "text-primary" : "text-foreground"}`}>{status}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}

const Mark = ({ on }: { on: boolean }) => on
  ? <Check className="w-4 h-4 text-foreground" aria-label="Sí" />
  : <Minus className="w-4 h-4 text-muted-foreground/50" aria-label="No" />;

export default function AdminPrueba9de10() {
  const [days, setDays] = useState(21);
  const [r, setR] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    // RPC nueva, aún fuera de los tipos generados.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("admin_prueba_9de10", { p_days: days });
    if (error) {
      const missing = /does not exist|could not find|schema cache|PGRST202/i.test(`${error.message} ${error.code ?? ""}`);
      setErr(missing ? `Falta aplicar la migración ${MIGRATION}. Mientras tanto no hay números.` : "No se pudo cargar la prueba. Intenta de nuevo.");
      setR(null);
    } else setR(data as Report);
    setLoading(false);
  }, [days]);
  useEffect(() => { void load(); }, [load]);

  // La prueba se mide sobre quienes empezaron la prueba de 3 días en Whop.
  const people = r?.personas ?? [];
  const enPrueba = people.filter(p => p.prueba ?? p.estado !== "sin_prueba");
  const usaron = enPrueba.filter(p => p.mi_version_h !== null).length;
  const terminadas = enPrueba.filter(p => p.prueba_terminada);
  const pagaron = terminadas.filter(p => p.pago).length;
  const recargaron = enPrueba.filter(p => p.recargo).length;
  const con30 = enPrueba.filter(p => (p.dias_cuenta ?? 0) >= 30).length;
  const t = r?.total;

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Prueba 9 de 10</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            10 personas reales en prueba de 3 días. Si 9 usan «Mi versión», 5 pagan el día 4 y 3 recargan en 30 días,
            la puerta está bien elegida. Cada persona se cuenta una vez, el día en que creó su cuenta (hora de RD).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 21, 30].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`h-9 px-3 rounded-full text-[13px] font-semibold border ${days === d ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground"}`}>
              {d} días
            </button>
          ))}
          <button onClick={() => void load()} aria-label="Refrescar" className="h-9 w-9 rounded-full border border-border grid place-items-center text-muted-foreground hover:text-foreground">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {err && <div className="rounded-2xl border border-primary/40 p-5 text-[14px] text-foreground">{err}</div>}

      {!r && !err ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{[0, 1, 2].map(i => <div key={i} className="h-36 rounded-2xl bg-card border border-border animate-pulse" />)}</div>
      ) : r && t ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Goal title="Usan Mi versión" n={usaron} base={enPrueba.length} goal={9}
              hint={`${t.mi_version_72h} de ${t.cuentas} cuentas la hicieron en sus primeras 72 horas`} />
            <Goal title="Pagan el día 4" n={pagaron} base={terminadas.length} goal={5}
              hint={`Solo pruebas ya vencidas. ${t.aun_en_prueba} siguen en prueba hoy`} />
            <Goal title="Recargan en 30 días" n={recargaron} base={enPrueba.length} goal={3}
              hint={con30 < enPrueba.length ? `${con30} de ${enPrueba.length} ya cumplieron 30 días: el número aún puede subir` : "Todas ya cumplieron 30 días"} />
          </div>

          <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2">
              <Target className="w-4 h-4" /> Embudo · últimos {r.days} días
            </h2>
            <ol className="space-y-2">
              {STEPS.map((s, i) => {
                const n = t[s.key];
                const prev = i > 0 ? t[STEPS[i - 1].key] : null;
                const base = i < 3 ? t.visitas : t.cuentas;
                const w = base > 0 && n > 0 ? Math.max(2, Math.round((n / base) * 100)) : 0;
                return (
                  <li key={s.key} className="grid grid-cols-[1fr_auto] gap-x-3 items-center">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] text-foreground">{s.label}</span>
                        <span className="text-[11px] text-muted-foreground truncate">{s.hint}</span>
                      </div>
                      <div className="h-1.5 mt-1 rounded-full bg-border/60 overflow-hidden">
                        <div className="h-full bg-foreground/70" style={{ width: `${Math.min(100, w)}%` }} />
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-display text-lg tabular-nums text-foreground">{n.toLocaleString("es-ES")}</span>
                      {prev !== null && <span className="block text-[11px] text-muted-foreground">{pct(n, prev)} del paso anterior</span>}
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="text-[11px] text-muted-foreground">Barras: los 3 primeros pasos sobre visitas; el resto sobre cuentas creadas.</p>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold">Por día</h2>
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full min-w-[760px] text-[12px] tabular-nums">
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th className="py-2 pr-3 font-medium">Día</th>
                    {STEPS.map(s => <th key={s.key} className="py-2 px-2 font-medium text-right">{s.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {r.por_dia.map(d => {
                    const empty = STEPS.every(s => d[s.key] === 0);
                    return (
                      <tr key={d.d} className={`border-t border-border ${empty ? "text-muted-foreground/60" : "text-foreground"}`}>
                        <td className="py-2 pr-3 whitespace-nowrap">{fmtDay(d.d)}</td>
                        {STEPS.map(s => <td key={s.key} className="py-2 px-2 text-right">{d[s.key] || "·"}</td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold">Personas ({people.length})</h2>
            {people.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Nadie creó cuenta en este período (sin contar admins ni probadores).</p>
            ) : (
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full min-w-[720px] text-[12px]">
                  <thead>
                    <tr className="text-muted-foreground text-left">
                      <th className="py-2 pr-3 font-medium">Cuenta</th>
                      <th className="py-2 pr-3 font-medium">Correo</th>
                      <th className="py-2 px-2 font-medium">Entró</th>
                      <th className="py-2 px-2 font-medium">Mi versión</th>
                      <th className="py-2 px-2 font-medium">Pieza</th>
                      <th className="py-2 px-2 font-medium">Le sirvió</th>
                      <th className="py-2 px-2 font-medium">Plan</th>
                      <th className="py-2 px-2 font-medium">Pagó</th>
                      <th className="py-2 px-2 font-medium">Recargó</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p, i) => (
                      <tr key={`${p.d}-${i}`} className="border-t border-border text-foreground">
                        <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{fmtDay(p.d)}</td>
                        <td className="py-2 pr-3 max-w-[220px] truncate" data-ph-mask>{p.email ?? "—"}</td>
                        <td className="py-2 px-2"><Mark on={p.entro} /></td>
                        <td className="py-2 px-2 tabular-nums">{p.mi_version_h === null ? <Mark on={false} /> : `a las ${p.mi_version_h} h`}</td>
                        <td className="py-2 px-2"><Mark on={p.pieza} /></td>
                        <td className="py-2 px-2"><Mark on={p.sirvio} /></td>
                        <td className="py-2 px-2 whitespace-nowrap">{ESTADO_ES[p.estado] ?? p.estado}</td>
                        <td className="py-2 px-2"><Mark on={p.pago} /></td>
                        <td className="py-2 px-2"><Mark on={p.recargo} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border p-5 space-y-2">
            <h2 className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold">Lo que mira PostHog</h2>
            <p className="text-[12px] text-muted-foreground">
              Abrir Inicio y los toques no quedan en la base. En PostHog, arma un embudo con estos eventos en este orden
              (ventana de 30 días, por persona):
            </p>
            <ol className="text-[12px] text-foreground list-decimal pl-5 space-y-0.5">
              {FUNNEL_9DE10.map(s => <li key={s.event}><code className="text-[11px]">{s.event}</code> · {s.label}</li>)}
            </ol>
            <p className="text-[11px] text-muted-foreground">
              «Pagan el día 4» es aproximado: la base guarda solo el último estado de cada suscripción; quien pagó y canceló después
              sale como «Canceló».
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
