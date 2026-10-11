import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Stethoscope, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ToolFeedback } from "@/components/ToolFeedback";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessProfile } from "@/lib/businessProfile";
import { maxAdCostPerSale } from "@/lib/pricing";
import { diagnose, fmtPct, LEVERS, STAGES, type FunnelInputs, type StageId, type StageResult } from "@/lib/funnelDoctor";

/**
 * Etapa 6 · "¿Dónde se me escapan las ventas?" (07-oct-2026). La mirada de afuera que los consultores
 * de las marcas grandes cobran caro: anotas los números de cada paso y la app te dice cuál frena todo
 * y los 3 cambios que más ventas mueven (lógica en src/lib/funnelDoctor.ts). Gratis, sin IA.
 * Lo anotado se recuerda en este navegador, por producto (comodidad; no es un dato del servidor).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;
type Draft = Partial<Record<keyof FunnelInputs, string>> & { levers?: Record<string, boolean>; healthy?: Partial<Record<StageId, string>> };

const FIELDS: { k: keyof FunnelInputs; label: string; hint: string; optional?: boolean }[] = [
  { k: "views", label: "Te vieron", hint: "Alcance o vistas de tus anuncios y posts" },
  { k: "clicks", label: "Hicieron clic", hint: "Clics a tu página, WhatsApp o enlace" },
  { k: "leads", label: "Te escribieron", hint: "Mensajes o datos que te dejaron" },
  { k: "contacted", label: "Les respondiste", hint: "Con los que conversaste de verdad" },
  { k: "sales", label: "Te compraron", hint: "Ventas del periodo" },
  { k: "repeat", label: "Volvieron a comprar", hint: "Clientes que te compraron algo más", optional: true },
  { k: "refunds", label: "Reembolsos", hint: "Devoluciones del periodo", optional: true },
  { k: "spend", label: "Gasto en anuncios", hint: "Lo que pagaste a Meta, TikTok…", optional: true },
];

const STATUS_STYLE: Record<StageResult["status"], string> = {
  "sin-datos": "text-muted-foreground",
  "bien": "text-emerald-400",
  "bajo": "text-primary",
  "muy-bajo": "text-red-400",
};
const STATUS_LABEL: Record<StageResult["status"], string> = {
  "sin-datos": "Falta un número", "bien": "Sano", "bajo": "Por debajo", "muy-bajo": "Muy por debajo",
};

const toNum = (s: string | undefined) => {
  if (s === undefined || s.trim() === "") return undefined;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const fmtSales = (n: number) => n.toLocaleString("es-ES", { maximumFractionDigits: n < 10 ? 1 : 0 });

export function DiagnosticoPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { user } = useAuth();
  const { profile, productId, loaded } = useBusinessProfile();
  const storeKey = `sn_diagnostico:${productId ?? "base"}`;
  const [draft, setDraft] = useState<Draft>({});
  const [restored, setRestored] = useState(false);
  const [tracker, setTracker] = useState<{ leads: number; sales: number } | null>(null);

  useEffect(() => {
    setRestored(false);
    try { const raw = localStorage.getItem(storeKey); setDraft(raw ? JSON.parse(raw) as Draft : {}); } catch { setDraft({}); }
    setRestored(true);
  }, [storeKey]);
  useEffect(() => {
    if (!restored) return;
    try { localStorage.setItem(storeKey, JSON.stringify(draft)); } catch { /* sin almacenamiento */ }
  }, [draft, restored, storeKey]);

  // La app no pregunta lo que ya sabe: leads y ventas que anotó en su tracker los últimos 30 días.
  const uid = user?.id ?? null;
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    (async () => {
      try {
        const { data } = await db().from("content_items").select("leads,sales").eq("user_id", uid).gte("created_at", since).limit(200);
        const rows = (data ?? []) as { leads: number | null; sales: number | null }[];
        const t = rows.reduce((a, r) => ({ leads: a.leads + (Number(r.leads) || 0), sales: a.sales + (Number(r.sales) || 0) }), { leads: 0, sales: 0 });
        if (alive && (t.leads || t.sales)) setTracker(t);
      } catch { /* sin datos del tracker: se escribe a mano */ }
    })();
    return () => { alive = false; };
  }, [uid]);

  const cap = maxAdCostPerSale(profile);
  const currency = cap?.currency ?? profile.pricing?.currency ?? "US$";

  const inputs = useMemo(() => {
    const out: Partial<FunnelInputs> = {};
    for (const f of FIELDS) { const v = toNum(draft[f.k]); if (v !== undefined) out[f.k] = v; }
    if (cap && cap.max > 0) out.maxCpa = cap.max;
    return out;
  }, [draft, cap]);
  const healthy = useMemo(() => {
    const h: Partial<Record<StageId, number>> = {};
    for (const s of STAGES) { const v = toNum(draft.healthy?.[s.id]); if (v && v > 0 && v <= 100) h[s.id] = v; }
    return h;
  }, [draft.healthy]);
  const d = useMemo(() => diagnose(inputs, healthy, currency), [inputs, healthy, currency]);
  // Cada paso sale del anterior: si un número es mayor que el de arriba, el resultado no tendría sentido.
  const mismatch = useMemo(() => {
    const order = FIELDS.filter(f => !f.optional);
    for (let i = 1; i < order.length; i++) {
      const prev = inputs[order[i - 1].k], cur = inputs[order[i].k];
      if (prev !== undefined && cur !== undefined && cur > prev) return `"${order[i].label}" (${cur.toLocaleString("es-ES")}) no puede ser mayor que "${order[i - 1].label}" (${prev.toLocaleString("es-ES")}). Revisa esos dos números.`;
    }
    return null;
  }, [inputs]);

  if (!loaded) return <div className="text-sm text-muted-foreground p-6">Cargando…</div>;

  const set = (k: keyof FunnelInputs, v: string) => setDraft(s => ({ ...s, [k]: v.replace(/[^\d.,]/g, "").slice(0, 12) }));
  const setLever = (id: string, v: boolean) => setDraft(s => ({ ...s, levers: { ...s.levers, [id]: v } }));
  const setHealthy = (id: StageId, v: string) => setDraft(s => ({ ...s, healthy: { ...s.healthy, [id]: v.replace(/[^\d.,]/g, "").slice(0, 5) } }));
  const applyTracker = () => tracker && setDraft(s => ({ ...s, leads: String(tracker.leads), sales: String(tracker.sales) }));
  const missingLevers = LEVERS.filter(l => draft.levers?.[l.id] === false);

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader stage="Mi negocio · Etapa 6" title="¿Dónde se me escapan las ventas?"
        icon={<Stethoscope className="w-5 h-5 text-primary" />}
        line="Anota tus números de los últimos 30 días y te decimos qué paso frena todo y qué cambiar primero."
        details={[
          "Los negocios grandes no crecen haciendo más cosas: alguien mira sus números desde afuera, encuentra el paso que frena y cambia 2 o 3 cosas.",
          "Se compara cada paso con un mínimo sano. Es una regla práctica para empezar, no una promesa: puedes cambiarla abajo.",
          "Es gratis y no usa créditos. Lo que anotas se guarda en este navegador.",
        ]} />

      <div className="grid lg:grid-cols-[1fr_340px] gap-5 items-start">
        <div className="space-y-5">
          {/* Números */}
          <div className="card-surface rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Tus números · últimos 30 días</p>
              {tracker && (
                <button type="button" onClick={applyTracker} className="text-xs text-primary hover:underline">
                  Usar mi tracker: {tracker.leads.toLocaleString("es-ES")} te escribieron · {tracker.sales.toLocaleString("es-ES")} compraron
                </button>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {FIELDS.map(f => (
                <label key={f.k} className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <span className="text-foreground font-medium">
                    {f.label}{f.k === "spend" ? ` (${currency})` : ""} {f.optional && <span className="text-muted-foreground font-normal">(opcional)</span>}
                  </span>
                  <input inputMode="decimal" value={draft[f.k] ?? ""} onChange={e => set(f.k, e.target.value)} placeholder={f.hint}
                    aria-label={f.label}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground tabular-nums focus:outline-none focus:border-primary/60" />
                </label>
              ))}
            </div>
            {cap && cap.max > 0 && (
              <p className="text-[11px] text-muted-foreground">Lo máximo que puedes pagar por venta sin perder: <span className="text-foreground">{currency} {cap.max.toLocaleString("es-ES", { maximumFractionDigits: 2 })}</span> (de tu calculadora de Precio).</p>
            )}
          </div>

          {/* Veredicto */}
          {mismatch && (
            <div className="card-surface rounded-2xl p-5 border border-primary/40 text-sm text-foreground">{mismatch}</div>
          )}
          {!mismatch && d.enough && (
            <div className="card-surface rounded-2xl p-5 space-y-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Lo que vemos desde afuera</p>
              {d.bottleneck ? (
                <div className="space-y-1">
                  <p className="font-display text-lg font-semibold text-foreground">Lo que más te frena: {d.bottleneck.def.label.toLowerCase()}</p>
                  <p className="text-sm text-muted-foreground">{d.bottleneck.def.diagnosis}</p>
                  {d.moreTrafficWontHelp && (
                    <p className="text-sm text-foreground border-l-2 border-primary pl-3 mt-2">
                      No necesitas más anuncios ni más contenido todavía. Si traes más gente, se escapa por el mismo lugar.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-foreground">Todos los pasos que anotaste están en el mínimo sano o por encima. Aquí sí tiene sentido traer más gente: más anuncios o más contenido.</p>
              )}

              {d.top.length > 0 && (
                <ol className="space-y-3">
                  {d.top.map((s, n) => (
                    <li key={s.def.id} className="rounded-xl border border-border p-4 space-y-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">{n + 1}. {s.def.label}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {fmtPct(s.rate ?? 0)} · mínimo sano {fmtPct(s.healthy)}
                        </p>
                      </div>
                      {s.extraSales >= 0.5 && (
                        <p className="text-xs text-muted-foreground">
                          Con la misma gente, llegar al mínimo serían unas <span className="text-foreground font-semibold">{fmtSales(s.extraSales)} ventas más</span> en 30 días. Es una cuenta, no una promesa.
                        </p>
                      )}
                      <ul className="space-y-1.5">
                        {s.def.actions.map(a => (
                          <li key={a} className="flex gap-2 text-sm text-muted-foreground leading-snug"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /><span>{a}</span></li>
                        ))}
                      </ul>
                      {onNavigate && (
                        <button type="button" onClick={() => onNavigate(s.def.fix.page)}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs ${n === 0 ? "gradient-brand text-primary-foreground font-semibold" : "border border-border text-muted-foreground hover:text-foreground"}`}>
                          {s.def.fix.label} <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {d.alerts.length > 0 && (
            <div className="space-y-2">
              {d.alerts.map(a => (
                <p key={a.text} className="flex gap-2 rounded-xl border border-border p-3 text-sm text-muted-foreground">
                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${a.id === "data" ? "text-muted-foreground" : "text-primary"}`} /> <span>{a.text}</span>
                </p>
              ))}
            </div>
          )}

          {/* Todos los pasos */}
          <div className="card-surface rounded-2xl p-5 space-y-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Cada paso de tu embudo</p>
            <ul className="divide-y divide-border">
              {d.stages.map(s => (
                <li key={s.def.id} className="py-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 items-baseline">
                  <p className="text-sm text-foreground">{s.def.label}</p>
                  <p className={`text-sm tabular-nums font-semibold ${STATUS_STYLE[s.status]}`}>{s.rate === null ? "—" : fmtPct(s.rate)}</p>
                  <p className="text-[11px] text-muted-foreground">{s.def.meaning}</p>
                  <label className="text-[11px] text-muted-foreground flex items-center gap-1 justify-end whitespace-nowrap">
                    <span className={STATUS_STYLE[s.status]}>{STATUS_LABEL[s.status]}</span> · mín.
                    <input value={draft.healthy?.[s.def.id] ?? String(s.def.healthy).replace(".", ",")} onChange={e => setHealthy(s.def.id, e.target.value)}
                      aria-label={`Mínimo sano para ${s.def.label}`}
                      className="w-10 rounded border border-border bg-background px-1 py-0.5 text-right text-[11px] text-foreground tabular-nums focus:outline-none focus:border-primary/60" />%
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <ToolFeedback tool="diagnostico" />
        </div>

        {/* Lo que ya tienes */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <div className="card-surface rounded-2xl p-5 text-sm space-y-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Lo que ya tienes y no estás usando</p>
            <p className="text-xs text-muted-foreground">Muchas veces la próxima venta no está en gente nueva, sino en lo que ya montaste.</p>
            <ul className="space-y-3">
              {LEVERS.map(l => {
                const v = draft.levers?.[l.id];
                return (
                  <li key={l.id} className="space-y-1.5">
                    <p className="text-foreground leading-snug text-[13px]">{l.q}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {([true, false] as const).map(opt => (
                        <button key={String(opt)} type="button" onClick={() => setLever(l.id, opt)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${v === opt ? (opt ? "border-emerald-500/50 text-emerald-400" : "border-primary bg-primary/10 text-primary font-semibold") : "border-border text-muted-foreground hover:text-foreground"}`}>
                          {opt ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} {opt ? "Sí" : "No"}
                        </button>
                      ))}
                      {v === false && onNavigate && (
                        <button type="button" onClick={() => onNavigate(l.page)} className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5">
                          {l.label} <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {missingLevers.length > 0 && (
              <p className="text-[11px] text-muted-foreground border-t border-border pt-2">Tienes {missingLevers.length} {missingLevers.length === 1 ? "palanca" : "palancas"} sin usar. Empieza por la primera: no cuesta gente nueva.</p>
            )}
          </div>
          {onNavigate && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => onNavigate("Resultados")}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground">
                ¿Qué anuncio apago o escalo? <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
