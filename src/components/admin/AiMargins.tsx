import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Margen por función (RPC admin_margin): créditos cobrados (sin reembolsos) frente al costo real de
 * la IA (ai_usage), en la misma ventana de tiempo. Vigila la regla de precios de SUPERNOVA:
 * precio = costo × 5 calculado con el crédito más barato que se vende (Nuclear ≈ US$0,008 neto);
 * piso 3× incluso en el peor caso. Si algo sale en rojo, se sube su precio en credit_prices.
 */
type Area = {
  area: string; credits: number; uses: number; calls: number;
  revenue_usd: number; cost_usd: number; background_usd: number; margin: number | null;
};
type Level = {
  slug: string; label: string; enabled: boolean; model: string; credits: number; calls: number;
  avg_usd: number | null; max_usd: number | null; worst_usd: number | null;
  margin_avg: number | null; margin_worst: number | null;
};
type Margin = { days: number; since: string; credit_usd: number; target: number; floor: number; areas: Area[]; levels: Level[] };

const usd = (n: number | null) => n == null ? "—" : `US$${Number(n).toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })}`;
const times = (m: number | null) => m == null ? "—" : `${Number(m).toLocaleString("es", { maximumFractionDigits: 1 })}×`;

function tone(m: number | null, target: number, floor: number) {
  if (m == null) return "";
  if (m < floor) return "text-destructive font-semibold";
  if (m < target) return "text-amber-500 font-semibold";
  return "text-emerald-500";
}

export function AiMargins() {
  const [data, setData] = useState<Margin | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("admin_margin", { p_days: 30 });
    if (error) setError(error.message); else setData(data as Margin);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const alerts = data
    ? [
      ...data.areas.filter(a => a.margin != null && a.margin < data.floor).map(a => a.area),
      ...data.levels.filter(l => l.enabled && l.margin_worst != null && l.margin_worst < data.floor).map(l => `Crear producto · ${l.label}`),
    ]
    : [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg">Margen por función</h2>
          <p className="text-[12px] text-muted-foreground">
            Regla: cobrar {data?.target ?? 5}× el costo real, con el crédito más barato que vendemos
            ({usd(data?.credit_usd ?? 0.008)} por crédito, pack Nuclear tras Whop). Piso: {data?.floor ?? 3}× incluso en el peor caso.
            {data?.since && ` Desde el ${new Date(data.since).toLocaleDateString("es")} (cuando empezó a medirse el costo).`}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border disabled:opacity-60">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Actualizar
        </button>
      </div>

      {error && <p className="text-sm text-destructive">No se pudo cargar: {error}</p>}

      {data && (
        <>
          <p className={`text-[13px] rounded-xl border p-3 ${alerts.length ? "border-destructive/50 text-destructive" : "border-emerald-500/40 text-emerald-500"}`}>
            {alerts.length
              ? `Bajo el piso de ${data.floor}×: ${alerts.join(", ")}. Sube su precio en credit_prices (y en CREDIT_COSTS).`
              : `Todo lo que se cobra está por encima del piso de ${data.floor}×.`}
          </p>

          <div className="rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-secondary/30 text-muted-foreground text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Función</th>
                  <th className="text-right px-3 py-2 font-medium">Cobros</th>
                  <th className="text-right px-3 py-2 font-medium">Créditos</th>
                  <th className="text-right px-3 py-2 font-medium">Ingreso mínimo</th>
                  <th className="text-right px-3 py-2 font-medium">Costo IA</th>
                  <th className="text-right px-3 py-2 font-medium">Margen</th>
                </tr>
              </thead>
              <tbody>
                {data.areas.map(a => (
                  <tr key={a.area} className="border-t border-border">
                    <td className="px-3 py-2">{a.area}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.uses}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(a.credits).toLocaleString("es")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{usd(a.revenue_usd)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.calls ? usd(a.cost_usd) : "—"}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${tone(a.margin, data.target, data.floor)}`}>
                      {a.margin != null ? times(a.margin)
                        : a.cost_usd > 0 ? <span className="text-muted-foreground">Gratis (lo pagamos)</span>
                        : <span className="text-muted-foreground">Sin costo de IA</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-border overflow-x-auto">
            <p className="text-[13px] font-medium px-3 pt-3">Crear producto · por nivel (un capítulo o lección)</p>
            <p className="text-[11px] text-muted-foreground px-3">Peor caso = la IA escribe hasta su límite de tokens. Los niveles sin uso muestran solo el peor caso (estimado con el precio oficial).</p>
            <table className="w-full text-[12px] mt-2">
              <thead className="bg-secondary/30 text-muted-foreground text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Nivel</th>
                  <th className="text-right px-3 py-2 font-medium">Cobra</th>
                  <th className="text-right px-3 py-2 font-medium">Capítulos</th>
                  <th className="text-right px-3 py-2 font-medium">Costo medio</th>
                  <th className="text-right px-3 py-2 font-medium">Margen medio</th>
                  <th className="text-right px-3 py-2 font-medium">Peor caso</th>
                  <th className="text-right px-3 py-2 font-medium">Margen peor caso</th>
                </tr>
              </thead>
              <tbody>
                {data.levels.map(l => (
                  <tr key={l.slug} className="border-t border-border">
                    <td className="px-3 py-2">{l.label}{!l.enabled && <span className="text-muted-foreground"> · apagado</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.credits}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.calls}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{usd(l.avg_usd)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${tone(l.margin_avg, data.target, data.floor)}`}>{times(l.margin_avg)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{usd(l.worst_usd)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${tone(l.margin_worst, data.floor, data.floor)}`}>{times(l.margin_worst)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
