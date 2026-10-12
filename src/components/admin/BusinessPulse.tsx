import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  CREDIT_FLOOR_USD, HAS_PRUEBA_9_DE_10, PRUEBA_9_DE_10_PATH, daysSinceMonthStart, fmtInt, fmtUsd, monthStart, summarizePulse,
  type OtherSale, type Pulse, type Tx,
} from "./pulseMath";

/**
 * Pulso del negocio (Admin → Resumen, lo primero que ve Jean): ventas del mes por Whop, créditos
 * vendidos frente a gastados, costo real de la IA, margen y si alguna función cobra por debajo del
 * piso de la regla de precios. Solo lectura: RPC solo-admin + tablas que el admin ya puede leer.
 * Las cuentas están en pulseMath.ts (con pruebas).
 */


type MarginArea = { area: string; margin: number | null };
type State = { pulse: Pulse; below3: string[]; below5: string[]; days: number };

const MONTH = new Date().toLocaleDateString("es", { month: "long" });

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: React.ReactNode; tone?: "accent" | "bad" | "good" }) {
  const color = tone === "accent" ? "text-primary" : tone === "bad" ? "text-destructive" : tone === "good" ? "text-success" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-5 min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-display text-3xl font-semibold mt-1 tabular-nums ${color}`}>{value}</p>
      {hint && <div className="text-[12px] text-muted-foreground mt-1 leading-snug">{hint}</div>}
    </div>
  );
}

export function BusinessPulse() {
  const [s, setS] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const days = daysSinceMonthStart();
    const since = monthStart();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const [biz, ai, margin, txs, admins, other] = await Promise.all([
      sb.rpc("admin_business_report", { p_days: days }),
      sb.rpc("admin_ai_costs", { p_days: days }),
      sb.rpc("admin_margin", { p_days: 30 }),
      sb.from("credit_transactions").select("user_id, action, cost, label, meta, created_at").gte("created_at", since).limit(5000),
      sb.from("user_roles").select("user_id").eq("role", "admin"),
      sb.from("whop_product_sales").select("amount, event, status").gte("created_at", since).limit(500),
    ]);
    const failed = [biz, ai, txs].find((r) => r.error);
    if (failed) { setError(failed.error.message); setLoading(false); return; }

    const counts: { plan: string; status: string; n: number }[] = biz.data?.counts ?? [];
    const payingSubs = counts
      .filter((c) => (c.plan === "pro" || c.plan === "comunidad") && (c.status === "active" || c.status === "past_due"))
      .reduce((t, c) => t + Number(c.n), 0);

    const pulse = summarizePulse({
      txs: (txs.data ?? []) as Tx[],
      adminIds: new Set(((admins.data ?? []) as { user_id: string }[]).map((r) => r.user_id)),
      subsUsd: Number(biz.data?.mrr_usd ?? 0),
      payingSubs,
      otherSales: (other.error ? [] : other.data ?? []) as OtherSale[],
      aiTotalUsd: Number(ai.data?.total_usd ?? 0),
      aiBackgroundUsd: Number(ai.data?.background_usd ?? 0),
    });
    const areas: MarginArea[] = margin.error ? [] : margin.data?.areas ?? [];
    setS({
      pulse, days,
      below3: areas.filter((a) => a.margin != null && a.margin < 3).map((a) => a.area),
      below5: areas.filter((a) => a.margin != null && a.margin >= 3 && a.margin < 5).map((a) => a.area),
    });
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const p = s?.pulse;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg">Cómo va el negocio en {MONTH}</h2>
          <p className="text-[12px] text-muted-foreground">Desde el día 1 hasta hoy. Ventas por Whop, créditos, costo real de la IA y lo que queda.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} aria-label="Actualizar"
          className="h-9 px-3 rounded-full border border-border text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 disabled:opacity-60">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </div>

      {error && <p className="text-sm text-destructive">No se pudo cargar el pulso del negocio: {error}</p>}

      {!p ? (
        !error && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-32 rounded-2xl bg-card border border-border animate-pulse" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="Ventas del mes" value={fmtUsd(p.sales.totalUsd)} tone="accent"
              hint={<>
                Suscripciones {fmtUsd(p.sales.subsUsd)} (estimado: activas a precio de lista)
                {" · "}Packs {fmtUsd(p.sales.packsUsd)}{p.sales.packs.length ? ` (${p.sales.packs.length})` : ""}
                {p.sales.otherUsd > 0 && <> · Otros productos {fmtUsd(p.sales.otherUsd)}</>}
              </>} />
            <Tile label="Costo de la IA" value={fmtUsd(p.ai.totalUsd)}
              hint={<>Uso de personas (clientes y tus pruebas) {fmtUsd(p.ai.usersUsd)} · Catálogo y tareas automáticas {fmtUsd(p.ai.backgroundUsd)}</>} />
            <Tile label="Lo que queda" value={fmtUsd(p.margin.usd)} tone={p.margin.usd < 0 ? "bad" : "good"}
              hint={p.margin.pct == null ? "Sin ventas este mes todavía." : `${p.margin.pct} % de las ventas, antes de la comisión de Whop y de los costos fijos.`} />
            <Tile label="Créditos gastados / vendidos" value={`${fmtInt(p.credits.spentClients)} / ${fmtInt(p.credits.sold)}`}
              hint={<>
                Vendidos: planes {fmtInt(p.credits.soldPlans)} + packs {fmtInt(p.credits.soldPacks)}.
                {p.credits.usedPct != null && <> Los clientes usaron el {p.credits.usedPct} %.</>}
                {p.credits.testerUses > 0 && <> Probadores: {p.credits.testerUses} usos gratis (valían {fmtInt(p.credits.testerFree)}).</>}
                {p.credits.spentAdmin > 0 && <> Tú: {fmtInt(p.credits.spentAdmin)}.</>}
              </>} />
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_auto] gap-3">
            <div className={`rounded-2xl border p-4 text-[13px] flex gap-3 ${s.below3.length ? "border-destructive/50" : "border-border"}`}>
              {s.below3.length
                ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-destructive" />
                : <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-success" />}
              <div className="min-w-0 space-y-1">
                <p className="text-foreground">
                  {s.below3.length
                    ? `Cobran por debajo del piso (3 veces el costo): ${s.below3.join(", ")}.`
                    : "Todo lo que se cobró en 30 días está por encima del piso de 3 veces el costo."}
                  {s.below5.length > 0 && ` Entre 3 y 5 veces: ${s.below5.join(", ")}.`}
                </p>
                <p className="text-muted-foreground text-[12px]">
                  Los créditos que gastaron los clientes valen al menos {fmtUsd(p.margin.spentValueUsd)} (a US${String(CREDIT_FLOOR_USD).replace(".", ",")} cada uno, el crédito más barato que vendemos).
                  {" "}<Link to="/admin/salud" className="text-primary hover:underline">Ver margen por función</Link>
                </p>
              </div>
            </div>
            {HAS_PRUEBA_9_DE_10 && (
              <Link to={PRUEBA_9_DE_10_PATH}
                className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3 hover:border-primary/60 transition-colors">
                <Target className="w-5 h-5 text-primary shrink-0" strokeWidth={1.6} />
                <div>
                  <p className="text-[13px] font-semibold text-foreground">Prueba 9 de 10</p>
                  <p className="text-[12px] text-muted-foreground">¿Quieren comprar y recargar?</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground ml-auto" />
              </Link>
            )}
          </div>
        </>
      )}
    </section>
  );
}
