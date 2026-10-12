import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Mail, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fnHeaders } from "@/lib/fnAuth";

/**
 * "Alertas de las últimas 24 h" (RPC admin_health_report): lo que antes solo se sabía si un
 * cliente escribía. El mismo informe lo manda por correo la función health-alert cada mañana.
 * Si cambias las reglas de alerta aquí, cámbialas también en supabase/functions/health-alert.
 */
type Report = {
  generated_at: string;
  client_errors: { count: number; users: number; top: { message: string; n: number; who: string; last: string }[] };
  cron_failures: { job: string; fails: number; runs: number; sample: string }[];
  media_failures: { count: number; sample: string | null };
  radar: { last_scraped: string | null; new_24h: number };
  customers: { email: string; status: string; ends: string; hours_left: number; ai_actions: number; mandala_ads: number; has_business: boolean; last_login: string | null }[];
  signups_24h: number;
};
type Alert = { level: "bad" | "warn"; title: string; detail: string };
type MarginArea = { area: string; credits: number; cost_usd: number; background_usd: number; margin: number | null };

// Mismas reglas que marginAlerts() en supabase/functions/health-alert (R2-20, 12-oct-2026):
// función que cobra bajo 3× su costo (con ≥ US$0,02 gastados en 7 días) y gratis que costó ≥ US$0,50.
function marginAlerts(areas: MarginArea[]): Alert[] {
  const out: Alert[] = [];
  for (const a of areas) {
    const userUsd = Number(a.cost_usd) - Number(a.background_usd);
    if (a.margin != null && a.margin < 3 && Number(a.cost_usd) >= 0.02) {
      out.push({ level: "warn", title: `"${a.area}" cobra ${a.margin}× su costo de IA (el piso es 3×)`,
        detail: `Últimos 7 días: ${a.credits} créditos cobrados, US$${Number(a.cost_usd).toFixed(2)} de IA. Revisa su precio en "Margen por función", más abajo.` });
    } else if (a.margin == null && Number(a.credits) === 0 && userUsd >= 0.5) {
      out.push({ level: "warn", title: `"${a.area}" es gratis y costó US$${userUsd.toFixed(2)} en 7 días`,
        detail: "Si sigue subiendo, ponle tope por persona en edge_limits o un precio en créditos." });
    }
  }
  return out;
}

const hoursSince = (d: string | null) => (d ? (Date.now() - new Date(d).getTime()) / 36e5 : Infinity);

function reportAlerts(r: Report): Alert[] {
  const out: Alert[] = [];
  if (r.client_errors.count > 0) {
    const top = r.client_errors.top[0];
    out.push({
      level: "bad",
      title: `${r.client_errors.count} pantallazos de clientes (${r.client_errors.users} personas)`,
      detail: top ? `El más repetido (${top.n}×, ${top.who}): ${top.message}` : "",
    });
  }
  for (const c of r.cron_failures) {
    out.push({
      level: c.fails >= c.runs / 2 ? "bad" : "warn",
      title: `Tarea automática "${c.job}" falló ${c.fails} de ${c.runs} veces`,
      detail: (c.sample ?? "").split("\n")[0],
    });
  }
  if (r.media_failures.count > 0) {
    out.push({ level: "warn", title: `${r.media_failures.count} videos de Media Studio fallaron`, detail: r.media_failures.sample ?? "" });
  }
  if (hoursSince(r.radar.last_scraped) > 6) {
    out.push({ level: "bad", title: "El radar lleva más de 6 horas sin anuncios nuevos", detail: `Último: ${r.radar.last_scraped ?? "más de 3 días"}` });
  }
  for (const c of r.customers) {
    const unused = c.ai_actions === 0 && c.mandala_ads === 0 && !c.has_business;
    if (c.status === "trialing" && unused) {
      out.push({
        level: c.hours_left <= 36 ? "bad" : "warn",
        title: `${c.email} está en prueba y no ha usado nada`,
        detail: `Le quedan ${c.hours_left} h de prueba. Escríbele hoy: quien no usa la app en la prueba casi nunca paga.`,
      });
    }
  }
  return out;
}

export function HealthAlerts() {
  const [report, setReport] = useState<Report | null>(null);
  const [margin, setMargin] = useState<MarginArea[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [{ data, error }, m] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("admin_health_report"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("admin_margin", { p_days: 7 }),
    ]);
    if (error) setError(error.message); else setReport(data as Report);
    setMargin(m.error ? [] : (m.data?.areas ?? []));
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const alerts = report ? [...reportAlerts(report), ...marginAlerts(margin)] : [];

  // Manda este mismo informe al correo del admin (health-alert ?test=1), aunque no haya alertas.
  const [sending, setSending] = useState(false);
  const sendTest = async () => {
    setSending(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/health-alert?test=1`, { method: "POST", headers: await fnHeaders() });
      const d = await r.json().catch(() => ({}));
      if (d?.sent) toast.success("Correo de prueba enviado. Revisa tu bandeja (y la carpeta de spam).");
      else if (d?.dry_run) toast.error("Falta RESEND_API_KEY en Supabase: no se envió nada.");
      else toast.error(d?.error || "No se pudo enviar el correo de prueba.");
    } catch { toast.error("No se pudo enviar el correo de prueba."); }
    finally { setSending(false); }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg">Alertas de las últimas 24 horas</h2>
        <div className="flex items-center gap-2">
        <button onClick={sendTest} disabled={sending}
          className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border disabled:opacity-60">
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} Enviarme un correo de prueba
        </button>
        <button onClick={load} disabled={loading}
          className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border disabled:opacity-60">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Actualizar
        </button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">No se pudo cargar el informe: {error}</p>}

      {report && (alerts.length === 0 ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Todo en orden: sin pantallazos, sin tareas fallidas y ningún cliente en prueba sin usar la app.
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`rounded-xl border p-3.5 ${a.level === "bad" ? "border-destructive/30 bg-destructive/5" : "border-amber-500/30 bg-amber-500/5"}`}>
              <div className="flex items-center gap-2 text-[14px] font-medium">
                {a.level === "bad" ? <XCircle className="w-4 h-4 text-destructive shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />}
                {a.title}
              </div>
              {a.detail && <p className="text-[12px] text-muted-foreground mt-1 ml-6 break-words">{a.detail}</p>}
            </div>
          ))}
        </div>
      ))}

      {report && report.customers.length > 0 && (
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-secondary/30 text-muted-foreground text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Cliente</th>
                <th className="text-left px-3 py-2 font-medium">Estado</th>
                <th className="text-right px-3 py-2 font-medium">Horas para cobro</th>
                <th className="text-right px-3 py-2 font-medium">Acciones IA</th>
                <th className="text-right px-3 py-2 font-medium">Anuncios Mándala</th>
                <th className="text-left px-3 py-2 font-medium">Mi negocio</th>
              </tr>
            </thead>
            <tbody>
              {report.customers.map(c => (
                <tr key={c.email} className="border-t border-border">
                  <td className="px-3 py-2">{c.email}</td>
                  <td className="px-3 py-2">{c.status === "trialing" ? "En prueba" : "Pagando"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.hours_left}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.ai_actions}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.mandala_ads}</td>
                  <td className="px-3 py-2">{c.has_business ? "Sí" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {report && <p className="text-[11px] text-muted-foreground">Registros nuevos en 24 h: {report.signups_24h} · Anuncios nuevos en el radar: {report.radar.new_24h.toLocaleString("es")}</p>}
    </section>
  );
}
