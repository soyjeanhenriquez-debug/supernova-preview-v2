import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Costo real de la IA (RPC admin_ai_costs, tabla ai_usage): cuánto nos cuesta cada cliente
 * frente a lo que paga. Los precios por modelo están en la tabla ai_model_prices.
 */
type Costs = {
  days: number; since: string | null; total_usd: number; background_usd: number;
  by_user: { email: string; cost_usd: number; calls: number; credits_spent: number; plan_status: string | null }[];
  by_fn: { fn: string; cost_usd: number; calls: number; avg_usd: number }[];
};

// Lo que queda de un PRO de US$29,99 tras las comisiones de Whop (tarjeta internacional).
const NET_PER_USER = 28.03;
const usd = (n: number) => `US$${Number(n).toLocaleString("es", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })}`;

export function AiCosts() {
  const [data, setData] = useState<Costs | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("admin_ai_costs", { p_days: 30 });
    if (error) setError(error.message); else setData(data as Costs);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg">Costo real de la IA (30 días)</h2>
          <p className="text-[12px] text-muted-foreground">
            Lo que Google nos cobra por cada cliente, frente a los {usd(NET_PER_USER)} que nos deja un PRO después de Whop.
            {data?.since && ` Medido desde el ${new Date(data.since).toLocaleDateString("es")}.`}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border p-3"><div className="text-[11px] text-muted-foreground">Total IA</div><div className="font-display text-xl tabular-nums">{usd(data.total_usd)}</div></div>
            <div className="rounded-xl border border-border p-3"><div className="text-[11px] text-muted-foreground">Tareas de fondo (sin cliente)</div><div className="font-display text-xl tabular-nums">{usd(data.background_usd)}</div></div>
            <div className="rounded-xl border border-border p-3"><div className="text-[11px] text-muted-foreground">Clientes que usaron IA</div><div className="font-display text-xl tabular-nums">{data.by_user.length}</div></div>
          </div>

          {data.by_user.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay consumo registrado de clientes. Se empieza a contar desde hoy.</p>
          ) : (
            <div className="rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-secondary/30 text-muted-foreground text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Cliente</th>
                    <th className="text-right px-3 py-2 font-medium">Costo IA</th>
                    <th className="text-right px-3 py-2 font-medium">Llamadas</th>
                    <th className="text-right px-3 py-2 font-medium">Créditos gastados</th>
                    <th className="text-right px-3 py-2 font-medium">% de lo que paga</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_user.map(u => {
                    const pct = (u.cost_usd / NET_PER_USER) * 100;
                    return (
                      <tr key={u.email} className="border-t border-border">
                        <td className="px-3 py-2">{u.email}{u.plan_status === "trialing" ? " · en prueba" : ""}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{usd(u.cost_usd)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{u.calls}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{Number(u.credits_spent).toLocaleString("es")}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${pct > 25 ? "text-destructive font-semibold" : pct > 10 ? "text-amber-500" : ""}`}>{pct.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {data.by_fn.length > 0 && (
            <details className="rounded-xl border border-border p-3">
              <summary className="text-[13px] font-medium cursor-pointer">Qué función gasta más</summary>
              <table className="w-full text-[12px] mt-2">
                <thead className="text-muted-foreground text-[11px] uppercase tracking-wider">
                  <tr><th className="text-left py-1 font-medium">Función</th><th className="text-right py-1 font-medium">Total</th><th className="text-right py-1 font-medium">Llamadas</th><th className="text-right py-1 font-medium">Promedio</th></tr>
                </thead>
                <tbody>
                  {data.by_fn.map(f => (
                    <tr key={f.fn} className="border-t border-border">
                      <td className="py-1.5 break-all">{f.fn}</td>
                      <td className="py-1.5 text-right tabular-nums">{usd(f.cost_usd)}</td>
                      <td className="py-1.5 text-right tabular-nums">{f.calls}</td>
                      <td className="py-1.5 text-right tabular-nums">{usd(f.avg_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}
    </section>
  );
}
