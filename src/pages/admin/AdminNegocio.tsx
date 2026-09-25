import { useCallback, useEffect, useState } from "react";
import { Copy, Crown, Film, Hourglass, RefreshCw, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { STAGE_NAMES } from "@/lib/journey";

/**
 * Admin → Negocio: lo que el dueño mira cada día o cada semana. Datos de la RPC admin_business_report
 * (solo admin): suscripciones y MRR estimado, pruebas que vencen, Comunidad (para aprobar/sacar en
 * Skool), en qué etapa están los productos de los clientes y el interés en videos.
 */
type Report = {
  days: number; mrr_usd: number; new_subs: number; lost: number;
  counts: { plan: string; status: string; n: number }[];
  conversion: { trials_done: number; paying: number };
  trials_ending: { email: string; plan: string; hours: number }[];
  comunidad: { email: string; status: string; since: string; until: string | null; changed: string }[];
  stages: { products: number; customers: number; at: Record<string, number> };
  video: { avisame: string[]; personajes: number; jobs: Record<string, number>; reservations: { email: string; usd: number; status: string; at: string }[] };
};

const STATUS_ES: Record<string, string> = { trialing: "En prueba", active: "Pagando", past_due: "Pago atrasado", canceled: "Canceló", inactive: "Inactivo" };
const fmtUsd = (n: number) => `US$${n.toLocaleString("es-ES", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("es", { day: "numeric", month: "short" }) : "—");

function Kpi({ label, value, hint, accent }: { label: string; value: string | number; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-display text-3xl font-semibold mt-1 tabular-nums ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
      {hint && <p className="text-[12px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function Section({ icon: Icon, title, action, children }: { icon: typeof Users; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2"><Icon className="w-4 h-4" />{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const copy = (list: string[], what: string) => {
  if (!list.length) return;
  navigator.clipboard?.writeText(list.join(", ")).then(() => toast.success(`${list.length} ${what} copiados`));
};

export default function AdminNegocio() {
  const [days, setDays] = useState(30);
  const [r, setR] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("admin_business_report", { p_days: days });
    if (error) toast.error("No se pudo cargar el informe.");
    else setR(data as Report);
    setLoading(false);
  }, [days]);
  useEffect(() => { void load(); }, [load]);

  const count = (plan: string, status: string) => r?.counts.find(c => c.plan === plan && c.status === status)?.n ?? 0;
  const trialing = (r?.counts ?? []).filter(c => c.status === "trialing").reduce((s, c) => s + c.n, 0);
  const paying = (r?.counts ?? []).filter(c => c.status === "active" || c.status === "past_due").reduce((s, c) => s + c.n, 0);
  const conv = r && r.conversion.trials_done > 0 ? Math.round((r.conversion.paying / r.conversion.trials_done) * 100) : null;
  const maxStage = Math.max(1, ...Object.values(r?.stages.at ?? {}));
  const comActive = (r?.comunidad ?? []).filter(c => ["active", "trialing", "past_due"].includes(c.status));
  const comGone = (r?.comunidad ?? []).filter(c => !["active", "trialing", "past_due"].includes(c.status));

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Negocio</h1>
          <p className="text-sm text-muted-foreground mt-1">Cómo va SUPERNOVA: dinero, clientes, en qué etapa se atascan y qué piden.</p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} className={`h-9 px-3 rounded-full text-[13px] font-semibold border ${days === d ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground"}`}>{d} días</button>
          ))}
          <button onClick={() => void load()} aria-label="Refrescar" className="h-9 w-9 rounded-full border border-border grid place-items-center text-muted-foreground hover:text-foreground">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {!r ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl bg-card border border-border animate-pulse" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Ingreso mensual (MRR)" value={fmtUsd(r.mrr_usd)} hint="Estimado a precio de lista: PRO US$29,99 · Comunidad US$99" accent />
            <Kpi label="Pagando" value={paying} hint={`PRO ${count("pro", "active")} · Comunidad ${count("comunidad", "active")}`} />
            <Kpi label="En prueba" value={trialing} hint={`${r.trials_ending.length} vencen en 48 h`} />
            <Kpi label="Prueba → pago" value={conv === null ? "—" : `${conv} %`} hint={conv === null ? "Aún no terminó ninguna prueba del período" : `${r.conversion.paying} de ${r.conversion.trials_done} pruebas terminadas`} />
            <Kpi label={`Nuevos (${r.days} días)`} value={r.new_subs} hint="Suscripciones creadas" />
            <Kpi label={`Bajas (${r.days} días)`} value={r.lost} hint="Cancelados o inactivos" />
            <Kpi label="Clientes con producto" value={r.stages.customers} hint={`${r.stages.products} productos (sin contar admins)`} />
            <Kpi label="Personajes creados" value={r.video.personajes} hint={`${r.video.avisame.length} piden aviso de videos`} />
          </div>

          <div className="grid lg:grid-cols-2 gap-3">
            <Section icon={Hourglass} title="Pruebas que vencen en 48 h">
              {r.trials_ending.length ? (
                <div className="divide-y divide-border/60">
                  {r.trials_ending.map(t => (
                    <div key={t.email} className="py-2 flex items-center justify-between gap-3 text-[14px]">
                      <a href={`mailto:${t.email}`} className="text-foreground hover:text-primary truncate">{t.email}</a>
                      <span className="text-muted-foreground shrink-0">{t.plan.toUpperCase()} · {t.hours} h</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">Ninguna vence en las próximas 48 horas.</p>}
              <p className="text-[12px] text-muted-foreground">Escríbeles antes de que venza: pregúntales en qué se atascaron.</p>
            </Section>

            <Section icon={TrendingUp} title="¿En qué etapa están? (productos de clientes)">
              <div className="space-y-2">
                {[1, 2, 3, 4, 5, 6, 7].map(n => {
                  const v = r.stages.at[String(n)] ?? 0;
                  return (
                    <div key={n} className="grid grid-cols-[150px_minmax(0,1fr)_32px] items-center gap-3 text-[13px]">
                      <span className="text-muted-foreground">{n <= 6 ? `${n} · ${STAGE_NAMES[n - 1]}` : "Terminaron las 6"}</span>
                      <div className="h-2.5 rounded-full bg-secondary overflow-hidden"><div className={`h-full rounded-full ${n === 7 ? "bg-success" : "bg-primary"}`} style={{ width: `${(v / maxStage) * 100}%` }} /></div>
                      <span className="text-foreground tabular-nums text-right">{v}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[12px] text-muted-foreground">La barra más larga es donde se atascan: mira sus grabaciones en PostHog (Admin → Analytics).</p>
            </Section>
          </div>

          <Section icon={Crown} title="Comunidad Creativos 10X (cobrada en Whop)"
            action={<button onClick={() => copy(comActive.map(c => c.email), "correos")} className="text-[12px] font-semibold text-primary inline-flex items-center gap-1"><Copy className="w-3.5 h-3.5" />Copiar activos</button>}>
            {r.comunidad.length ? (
              <div className="divide-y divide-border/60">
                {r.comunidad.map(c => (
                  <div key={c.email + c.since} className="py-2 grid grid-cols-[minmax(0,1fr)_110px_120px] gap-3 text-[14px] items-center">
                    <span className="truncate text-foreground">{c.email}</span>
                    <span className={`text-[12px] font-semibold ${["active", "trialing"].includes(c.status) ? "text-success" : "text-destructive"}`}>{STATUS_ES[c.status] ?? c.status}</span>
                    <span className="text-[12px] text-muted-foreground">desde {fmtDate(c.since)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">Todavía nadie pagó la Comunidad por Whop.</p>}
            <p className="text-[12px] text-muted-foreground">
              Aprueba en Skool a los activos. {comGone.length ? <b className="text-destructive">Saca de Skool a: {comGone.map(c => c.email).join(", ")}.</b> : "Nadie para sacar."}
            </p>
          </Section>

          <Section icon={Film} title="Videos y personajes"
            action={<button onClick={() => copy(r.video.avisame, "correos")} className="text-[12px] font-semibold text-primary inline-flex items-center gap-1"><Copy className="w-3.5 h-3.5" />Copiar "Avísame"</button>}>
            <div className="grid sm:grid-cols-3 gap-3 text-[14px]">
              <div><p className="text-[12px] text-muted-foreground">Piden aviso de videos</p><p className="text-foreground">{r.video.avisame.length ? r.video.avisame.join(", ") : "Nadie todavía"}</p></div>
              <div><p className="text-[12px] text-muted-foreground">Videos del período</p><p className="text-foreground">{Object.keys(r.video.jobs).length ? Object.entries(r.video.jobs).map(([k, v]) => `${v} ${k === "done" ? "listos" : k === "failed" ? "fallidos" : "en proceso"}`).join(" · ") : "Ninguno"}</p></div>
              <div><p className="text-[12px] text-muted-foreground">Reservas de créditos de video</p><p className="text-foreground">{r.video.reservations.length ? r.video.reservations.map(x => `${x.email} (${fmtUsd(Number(x.usd))})`).join(", ") : "Ninguna"}</p></div>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
