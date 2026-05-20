import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, AlertCircle, ScrollText } from "lucide-react";

interface AuditRow {
  id: string;
  user_email: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  success: boolean;
  error_message: string | null;
  created_at: string;
  new_data: any;
}

const CRITICAL = new Set(["ADMIN_DELETE_USER","ADMIN_SUSPEND_USER","UNAUTHORIZED_ACCESS"]);

export default function AdminAudit() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);

  useEffect(() => {
    supabase.from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        setRows(data || []);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter(r => {
      if (errorsOnly && r.success) return false;
      if (!term) return true;
      return (r.user_email || "").toLowerCase().includes(term)
        || r.action.toLowerCase().includes(term)
        || (r.resource_id || "").toLowerCase().includes(term);
    });
  }, [rows, q, errorsOnly]);

  const colorFor = (r: AuditRow) => {
    if (!r.success) return "text-destructive";
    if (CRITICAL.has(r.action)) return "text-destructive";
    if (r.action.startsWith("ADMIN_")) return "text-amber-600 dark:text-amber-400";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ScrollText className="w-6 h-6 text-primary" strokeWidth={1.6} />
        <div>
          <h1 className="font-display text-2xl tracking-tight">Audit log</h1>
          <p className="text-sm text-muted-foreground">Últimas 500 acciones registradas.</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Filtrar por email, acción o recurso…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary/40 border border-border text-[13px] focus:outline-none focus:border-primary/50"
          />
        </div>
        <button
          onClick={() => setErrorsOnly(v => !v)}
          className={`text-[12px] px-3 py-1.5 rounded-lg border flex items-center gap-1.5 ${
            errorsOnly ? "bg-destructive/10 border-destructive/40 text-destructive" : "border-border text-muted-foreground hover:bg-secondary/40"
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5" /> Solo errores
        </button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="bg-secondary/30 text-muted-foreground text-[10px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5">Fecha</th>
              <th className="text-left px-4 py-2.5">Email</th>
              <th className="text-left px-4 py-2.5">Acción</th>
              <th className="text-left px-4 py-2.5">Recurso</th>
              <th className="text-center px-4 py-2.5">Éxito</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">Cargando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">Sin registros</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="border-t border-border hover:bg-secondary/20">
                <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}
                </td>
                <td className="px-4 py-2 truncate max-w-[200px]">{r.user_email || "—"}</td>
                <td className={`px-4 py-2 font-mono ${colorFor(r)}`}>{r.action}</td>
                <td className="px-4 py-2 text-muted-foreground truncate max-w-[200px]">
                  {r.resource_type ? `${r.resource_type}:${r.resource_id?.slice(0, 8)}…` : "—"}
                </td>
                <td className="px-4 py-2 text-center">
                  {r.success ? <span className="text-emerald-600">✓</span> : <span className="text-destructive">✗</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
