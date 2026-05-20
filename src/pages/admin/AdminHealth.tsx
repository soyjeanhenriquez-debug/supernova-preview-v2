import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, HeartPulse } from "lucide-react";

interface Check { name: string; ok: boolean; detail: string }

export default function AdminHealth() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const out: Check[] = [];

      // 1. Audit log accesible
      const audit = await supabase.from("audit_log").select("id", { count: "exact", head: true });
      out.push({
        name: "Audit log",
        ok: !audit.error,
        detail: audit.error ? audit.error.message : `${audit.count ?? 0} eventos registrados`,
      });

      // 2. Rate limits tabla existe
      const rl = await supabase.from("rate_limits").select("id", { count: "exact", head: true });
      out.push({
        name: "Rate limiting",
        ok: !rl.error,
        detail: rl.error ? rl.error.message : `Activo (${rl.count ?? 0} ventanas)`,
      });

      // 3. system_config tiene las claves esperadas
      const cfg = await supabase.from("system_config").select("key", { count: "exact", head: true });
      out.push({
        name: "Configuración del sistema",
        ok: (cfg.count ?? 0) >= 28,
        detail: `${cfg.count ?? 0} variables`,
      });

      // 4. Usuarios suspendidos
      const susp = await supabase.from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "suspended" as any);
      out.push({
        name: "Usuarios suspendidos",
        ok: true,
        detail: `${susp.count ?? 0} cuentas`,
      });

      // 5. Sesiones activas
      const sess = await supabase.from("active_sessions").select("id", { count: "exact", head: true });
      out.push({
        name: "Sesiones activas",
        ok: !sess.error,
        detail: `${sess.count ?? 0} sesiones`,
      });

      // 6. Scraper último run
      const lastRun = await supabase.from("master_keyword_runs")
        .select("started_at, success")
        .order("started_at", { ascending: false }).limit(1).maybeSingle();
      const lr = lastRun.data;
      const hoursAgo = lr ? (Date.now() - new Date(lr.started_at).getTime()) / 3600000 : 999;
      out.push({
        name: "Scraper de Winning Ads",
        ok: hoursAgo < 25 && (lr?.success ?? false),
        detail: lr ? `Hace ${hoursAgo.toFixed(1)}h · ${lr.success ? "exitoso" : "falló"}` : "Sin ejecuciones recientes",
      });

      // 7. user_credits con balance
      const uc = await supabase.from("user_credits").select("user_id", { count: "exact", head: true });
      out.push({
        name: "Créditos en DB",
        ok: !uc.error,
        detail: `${uc.count ?? 0} usuarios con saldo`,
      });

      setChecks(out);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <HeartPulse className="w-6 h-6 text-primary" strokeWidth={1.6} />
        <div>
          <h1 className="font-display text-2xl tracking-tight">Salud del sistema</h1>
          <p className="text-sm text-muted-foreground">Diagnóstico automático de los componentes críticos.</p>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Ejecutando diagnóstico…</div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {checks.map(c => (
            <div key={c.name} className={`rounded-xl border p-4 ${c.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/30 bg-destructive/5"}`}>
              <div className="flex items-center gap-2">
                {c.ok
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  : <XCircle className="w-5 h-5 text-destructive" />}
                <div className="font-medium text-[14px]">{c.name}</div>
              </div>
              <div className="text-[12px] text-muted-foreground mt-1.5 ml-7">{c.detail}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
