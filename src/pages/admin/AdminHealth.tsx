import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fnHeaders } from "@/lib/fnAuth";
import { CheckCircle2, XCircle, HeartPulse, RefreshCw, Loader2 } from "lucide-react";
import { HealthAlerts } from "@/components/admin/HealthAlerts";

interface Check { name: string; ok: boolean; detail: string }

// Estado del token de Meta (RPC fb_token_status): nunca trae el token, solo metadatos.
interface FbTokenStatus {
  configured?: boolean; is_valid?: boolean | null; works?: boolean | null; token_type?: string | null;
  expires_at?: string | null; days_left?: number | null; renewed_at?: string | null; checked_at?: string | null; last_error?: string | null;
}

function fbTokenCheck(st: FbTokenStatus): Check {
  const name = "Token de Meta (búsqueda en vivo)";
  if (!st.configured) return { name, ok: false, detail: "Aún no se ha revisado. Pulsa «Revisar y renovar»." };
  if (!st.works) return { name, ok: false, detail: st.last_error ? `No funciona: ${st.last_error}` : "No funciona. Genera un token nuevo y pégalo en FACEBOOK_ACCESS_TOKEN." };
  const left = st.days_left;
  const when = left == null ? "no caduca" : `le quedan ${left} días`;
  const auto = st.last_error ? ` · ${st.last_error}` : " · se renueva solo";
  return { name, ok: left == null || left > 10, detail: `Funciona, ${when}${auto}` };
}

export default function AdminHealth() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [fbCheck, setFbCheck] = useState<Check | null>(null);
  const [renewing, setRenewing] = useState(false);

  const loadFbToken = useCallback(async () => {
    const { data } = await supabase.rpc("fb_token_status");
    setFbCheck(fbTokenCheck((data ?? {}) as FbTokenStatus));
  }, []);
  useEffect(() => { loadFbToken(); }, [loadFbToken]);

  // Pide al servidor que revise el token y lo canjee por uno de 60 días.
  const renewFbToken = async () => {
    setRenewing(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fb-token-keeper`, {
        method: "POST", headers: await fnHeaders(), body: JSON.stringify({ action: "renew" }),
      });
      const out = (await res.json().catch(() => ({}))) as { works?: boolean; renewed?: boolean; days_left?: number | null; error?: string | null; todo?: string };
      if (out.works) toast.success(out.renewed ? `Token renovado: ${out.days_left ?? "—"} días` : "El token funciona", { description: out.error ?? out.todo ?? undefined });
      else toast.error("El token de Meta no funciona", { description: out.todo ?? out.error ?? "Genera uno nuevo y pégalo en los secretos." });
    } catch {
      toast.error("No se pudo contactar al servidor");
    } finally {
      await loadFbToken();
      setRenewing(false);
    }
  };

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
        .eq("role", "suspended" as unknown);
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

      // 6b. ¿Entran anuncios REALES? El scraper horario puede "tener éxito" guardando solo
      // páginas web sueltas: entre el 14-jul y el 19-sep no entró ni un anuncio de la
      // Biblioteca de Meta y este panel seguía en verde. Un anuncio real trae fecha de inicio.
      // Se miran solo los 100 registros más recientes (barato: van por índice). Buscar "el
      // último real" directamente obliga a saltarse miles de filas y pasa de los 8 s.
      const recent = await supabase.from("winning_ads")
        .select("scraped_at, delivery_start_time")
        .order("scraped_at", { ascending: false }).limit(100);
      const rows = recent.data ?? [];
      const realOnes = rows.filter((r) => r.delivery_start_time).length;
      out.push({
        name: "Anuncios reales de Meta",
        ok: !recent.error && realOnes > 0,
        detail: recent.error
          ? "No se pudo comprobar"
          : realOnes > 0
            ? `${realOnes} de los últimos ${rows.length} registros son anuncios reales`
            : `Ninguno de los últimos ${rows.length} registros es un anuncio real de Meta: el radar no se está actualizando`,
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

      <HealthAlerts />

      <h2 className="font-display text-lg pt-2">Componentes</h2>
      {loading ? (
        <div className="text-sm text-muted-foreground">Ejecutando diagnóstico…</div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {(fbCheck ? [...checks, fbCheck] : checks).map(c => (
            <div key={c.name} className={`rounded-xl border p-4 ${c.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/30 bg-destructive/5"}`}>
              <div className="flex items-center gap-2">
                {c.ok
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  : <XCircle className="w-5 h-5 text-destructive" />}
                <div className="font-medium text-[14px]">{c.name}</div>
              </div>
              <div className="text-[12px] text-muted-foreground mt-1.5 ml-7">{c.detail}</div>
              {c === fbCheck && (
                <button onClick={renewFbToken} disabled={renewing}
                  className="ml-7 mt-2.5 text-[12px] font-semibold text-primary inline-flex items-center gap-1.5 disabled:opacity-60">
                  {renewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Revisar y renovar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
