import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Test A/B de la landing: embudo de cada versión (visita → clic al checkout / test → prueba → pago).
 * A = "Descubre qué vender…"; B = "Ofertas que ya se venden en otro país". Datos: admin_landing_ab().
 * Para anuncios, cada conjunto puede apuntar a su versión con ?v=a o ?v=b.
 */
type Row = { variant: "A" | "B"; visitors: number; clicked: number; quiz_opened: number; leads: number; signed_in: number; trials: number; paying: number };

const NAMES: Record<string, string> = { A: "Descubre qué vender", B: "Ofertas que ya se venden" };
const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

export function LandingAB() {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null); setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc("admin_landing_ab", { p_days: days }).then(({ data, error }: { data: { variants: Row[] } | null; error: { message: string } | null }) => {
      if (error) setError(error.message); else setRows(data?.variants ?? []);
    });
  }, [days]);

  const best = rows && rows.length === 2
    ? (() => {
        const [a, b] = rows;
        const ra = a.visitors ? a.trials / a.visitors : 0, rb = b.visitors ? b.trials / b.visitors : 0;
        if (a.visitors + b.visitors < 200 || a.trials + b.trials < 10) return "Aún faltan datos: espera al menos 200 visitas y 10 pruebas en total antes de decidir.";
        if (ra === rb) return "Empate por ahora.";
        return `Va ganando ${ra > rb ? "A" : "B"} en pruebas por visita.`;
      })()
    : null;

  const metrics: { key: keyof Row; label: string; base?: keyof Row }[] = [
    { key: "visitors", label: "Visitas" },
    { key: "clicked", label: "Clic al checkout", base: "visitors" },
    { key: "quiz_opened", label: "Abrieron el test", base: "visitors" },
    { key: "leads", label: "Dejaron correo", base: "visitors" },
    { key: "signed_in", label: "Entraron a la app", base: "visitors" },
    { key: "trials", label: "Empezaron prueba", base: "visitors" },
    { key: "paying", label: "Pagando ahora", base: "visitors" },
  ];

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg tracking-tight">Test A/B de la landing</h2>
          <p className="text-xs text-muted-foreground">Anuncios: usa supernova…/?v=a o ?v=b para mandar cada conjunto a su versión. Sin eso, se reparte 50/50.</p>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} className={`rounded-lg px-2.5 py-1 text-xs ${days === d ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{d} días</button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!rows && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {rows && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium"></th>
                {rows.map(r => <th key={r.variant} className="py-1.5 pr-3 font-medium">{r.variant} · {NAMES[r.variant]}</th>)}
              </tr>
            </thead>
            <tbody>
              {metrics.map(m => (
                <tr key={m.key} className="border-t border-border">
                  <td className="py-1.5 pr-3 text-muted-foreground">{m.label}</td>
                  {rows.map(r => (
                    <td key={r.variant} className="py-1.5 pr-3 tabular-nums">
                      {Number(r[m.key]).toLocaleString("es")}
                      {m.base && <span className="ml-1.5 text-xs text-muted-foreground">{pct(Number(r[m.key]), Number(r[m.base]))}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {best && <p className="text-xs text-muted-foreground">{best} La métrica que decide es "Empezaron prueba" (y después "Pagando ahora"), no los clics.</p>}
    </section>
  );
}
