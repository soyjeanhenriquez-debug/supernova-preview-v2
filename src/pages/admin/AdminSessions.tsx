import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Power, Wifi } from "lucide-react";
import { toast } from "sonner";

interface SessionRow {
  id: string;
  user_id: string;
  user_email: string | null;
  ip_address: string | null;
  user_agent: string | null;
  last_seen: string;
  created_at: string;
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

function parseDevice(ua: string | null): string {
  if (!ua) return "—";
  if (/iPhone|iPad/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "macOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Otro";
}

export default function AdminSessions() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from("active_sessions")
      .select("*")
      .order("last_seen", { ascending: false });
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const iv = window.setInterval(load, 15000);
    return () => window.clearInterval(iv);
  }, []);

  const terminate = async (userId: string) => {
    if (!confirm("¿Terminar la sesión de este usuario?")) return;
    const { data, error } = await supabase.rpc("admin_terminate_session", { p_target_user_id: userId });
    if (error || !(data as any)?.success) {
      toast.error((data as any)?.error || "Error");
    } else {
      toast.success("Sesión terminada");
      load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Wifi className="w-6 h-6 text-primary" strokeWidth={1.6} />
        <div>
          <h1 className="font-display text-2xl tracking-tight">Sesiones activas</h1>
          <p className="text-sm text-muted-foreground">Punto verde = activo en los últimos 5 minutos.</p>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-secondary/30 text-muted-foreground text-[10px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5">Usuario</th>
              <th className="text-left px-4 py-2.5">Dispositivo</th>
              <th className="text-left px-4 py-2.5">Conectado hace</th>
              <th className="text-right px-4 py-2.5">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="text-center py-12 text-muted-foreground">Cargando…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-12 text-muted-foreground">Sin sesiones activas</td></tr>
            ) : rows.map(s => {
              const online = Date.now() - new Date(s.last_seen).getTime() < 5 * 60 * 1000;
              return (
                <tr key={s.id} className="border-t border-border hover:bg-secondary/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2 h-2 rounded-full ${online ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/30"}`} />
                      <span className="truncate">{s.user_email || s.user_id.slice(0, 8)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{parseDevice(s.user_agent)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{timeAgo(s.last_seen)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => terminate(s.user_id)}
                      className="text-[12px] px-3 py-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 inline-flex items-center gap-1"
                    >
                      <Power className="w-3 h-3" /> Terminar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
