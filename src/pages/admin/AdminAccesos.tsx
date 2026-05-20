import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, UserPlus, Upload, Search, Pause, Play, Trash2,
  Inbox, Users, BarChart3, Loader2,
} from "lucide-react";

interface ApprovedRow {
  id: string; email: string; full_name: string | null; notes: string | null;
  is_active: boolean; approved_at: string; last_access: string | null;
}
interface RequestRow {
  id: string; email: string; full_name: string | null; message: string | null;
  source: string; status: string; created_at: string;
}

type Tab = "pending" | "approved" | "stats";

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "hace unos segundos";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}

export default function AdminAccesos() {
  const [tab, setTab] = useState<Tab>("pending");
  const [pending, setPending] = useState<RequestRow[]>([]);
  const [approved, setApproved] = useState<ApprovedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Add manual
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [adding, setAdding] = useState(false);

  // Import CSV
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<{ email: string; nombre?: string; notas?: string }[]>([]);

  async function refreshAll() {
    const [p, a] = await Promise.all([
      supabase.from("access_requests").select("*").eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("approved_emails").select("*").order("approved_at", { ascending: false }),
    ]);
    setPending((p.data as RequestRow[]) || []);
    setApproved((a.data as ApprovedRow[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    refreshAll();
    const channel = supabase
      .channel("access_requests_realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "access_requests" }, (payload: any) => {
        toast.info(`⚡ Nueva solicitud: ${payload.new.email}`);
        refreshAll();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function approveRequest(id: string, email: string) {
    const { data, error } = await supabase.rpc("approve_access_request", {
      p_request_id: id,
      p_notes: `Aprobado desde panel el ${new Date().toLocaleDateString()}`,
    });
    if (error) { toast.error(error.message); return; }
    if ((data as any)?.success) {
      toast.success(`✅ ${email} aprobado`);
      refreshAll();
    } else {
      toast.error((data as any)?.error || "No se pudo aprobar");
    }
  }

  async function rejectRequest(id: string) {
    const reason = window.prompt("Motivo del rechazo (opcional):") || "No cumple los requisitos";
    const { error } = await supabase.rpc("reject_access_request", { p_request_id: id, p_reason: reason });
    if (error) { toast.error(error.message); return; }
    toast.success("Solicitud rechazada");
    refreshAll();
  }

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    if (!addEmail.trim()) return;
    setAdding(true);
    const { error } = await supabase.from("approved_emails").upsert({
      email: addEmail.trim().toLowerCase(),
      full_name: addName.trim() || null,
      notes: addNotes.trim() || null,
      is_active: true,
    }, { onConflict: "email" });
    setAdding(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`✅ ${addEmail} aprobado`);
    setAddEmail(""); setAddName(""); setAddNotes("");
    refreshAll();
  }

  async function toggleActive(row: ApprovedRow) {
    const { error } = await supabase.from("approved_emails")
      .update({ is_active: !row.is_active }).eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success(row.is_active ? "Acceso suspendido" : "Acceso reactivado");
    refreshAll();
  }

  async function removeApproved(row: ApprovedRow) {
    if (!confirm(`Eliminar acceso de ${row.email}?`)) return;
    const { error } = await supabase.from("approved_emails").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Acceso eliminado");
    refreshAll();
  }

  function parseCsv(text: string) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return [];
    const header = lines[0].toLowerCase().split(",").map(h => h.trim());
    const iEmail = header.indexOf("email");
    const iNombre = header.findIndex(h => h === "nombre" || h === "full_name" || h === "name");
    const iNotas = header.findIndex(h => h === "notas" || h === "notes");
    if (iEmail === -1) return [];
    return lines.slice(1).map(line => {
      const cols = line.split(",").map(c => c.trim());
      return {
        email: (cols[iEmail] || "").toLowerCase(),
        nombre: iNombre >= 0 ? cols[iNombre] : undefined,
        notas: iNotas >= 0 ? cols[iNotas] : undefined,
      };
    }).filter(r => r.email.includes("@"));
  }

  async function handleCsvFile(file: File) {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      toast.error("CSV vacío o sin columna 'email'");
      return;
    }
    setCsvPreview(rows);
    setCsvOpen(true);
  }

  async function importCsvConfirm() {
    const payload = csvPreview.map(r => ({
      email: r.email, full_name: r.nombre || null, notes: r.notas || null, is_active: true,
    }));
    const { error, count } = await supabase.from("approved_emails")
      .upsert(payload, { onConflict: "email", count: "exact" });
    if (error) { toast.error(error.message); return; }
    toast.success(`${count ?? payload.length} emails procesados`);
    setCsvOpen(false); setCsvPreview([]);
    refreshAll();
  }

  const filteredApproved = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return approved;
    return approved.filter(r =>
      r.email.toLowerCase().includes(q) || (r.full_name || "").toLowerCase().includes(q));
  }, [approved, search]);

  const stats = useMemo(() => {
    const total = approved.length;
    const active = approved.filter(a => a.is_active).length;
    const suspended = total - active;
    const recent = approved
      .filter(a => a.last_access)
      .sort((a, b) => new Date(b.last_access!).getTime() - new Date(a.last_access!).getTime())
      .slice(0, 8);
    const sevenDaysAgo = Date.now() - 7 * 86400_000;
    const stale = approved.filter(a => a.is_active && (!a.last_access || new Date(a.last_access).getTime() < sevenDaysAgo));
    return { total, active, suspended, pending: pending.length, recent, stale: stale.length };
  }, [approved, pending]);

  return (
    <div className="space-y-6 max-w-[1400px]">
      <header>
        <h1 className="font-display text-2xl tracking-tight">Accesos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestiona quién puede entrar a SUPERNOVA. Acceso por email aprobado.
        </p>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {[
          { id: "pending" as const, label: "Pendientes", icon: Inbox, badge: pending.length },
          { id: "approved" as const, label: "Aprobados", icon: Users, badge: approved.length },
          { id: "stats" as const, label: "Estadísticas", icon: BarChart3 },
        ].map(t => (
          <button
            key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-4 h-4" strokeWidth={1.6} /> {t.label}
            {typeof t.badge === "number" && t.badge > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
        </div>
      )}

      {/* PENDING */}
      {!loading && tab === "pending" && (
        <div className="space-y-3">
          {pending.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-10 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto text-success/70" strokeWidth={1.4} />
              <p className="mt-3 text-sm text-muted-foreground">No hay solicitudes pendientes</p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground">
                ⚡ Tienes <strong>{pending.length}</strong> solicitud{pending.length === 1 ? "" : "es"} esperando aprobación.
              </div>
              {pending.map(r => (
                <div key={r.id} className="rounded-2xl border border-border bg-card p-5 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-base text-foreground">{r.full_name || "Sin nombre"}</div>
                    <div className="text-sm text-muted-foreground">{r.email}</div>
                    {r.message && (
                      <div className="mt-2 text-[13px] text-muted-foreground italic line-clamp-3">"{r.message}"</div>
                    )}
                    <div className="mt-2 text-[11px] text-muted-foreground/70">
                      {timeAgo(r.created_at)} · vía {r.source === "signup_failed" ? "intento de login" : r.source}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => approveRequest(r.id, r.email)}
                      className="gradient-brand text-primary-foreground px-4 py-2 rounded-lg font-semibold text-[13px] hover:opacity-90 flex items-center gap-1.5 glow-primary"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Aprobar
                    </button>
                    <button
                      onClick={() => rejectRequest(r.id)}
                      className="px-4 py-2 rounded-lg border border-border text-[13px] text-muted-foreground hover:text-foreground hover:bg-secondary/40 flex items-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" /> Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* APPROVED */}
      {!loading && tab === "approved" && (
        <div className="space-y-4">
          {/* Add + import */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-primary" />
              <h3 className="font-display text-sm">Añadir email aprobado</h3>
            </div>
            <form onSubmit={addManual} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2">
              <input
                type="email" required placeholder="email@miembro.com" value={addEmail}
                onChange={e => setAddEmail(e.target.value)}
                className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="text" placeholder="Nombre completo" value={addName}
                onChange={e => setAddName(e.target.value)}
                className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="text" placeholder="Notas (ej: Skool mayo 2026)" value={addNotes}
                onChange={e => setAddNotes(e.target.value)}
                className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="submit" disabled={adding}
                className="gradient-brand text-primary-foreground px-4 py-2 rounded-lg text-[13px] font-semibold hover:opacity-90 glow-primary disabled:opacity-60 flex items-center gap-1.5 justify-center"
              >
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Aprobar
              </button>
            </form>

            <label className="flex items-center gap-2 text-[12px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors w-fit">
              <Upload className="w-3.5 h-3.5" />
              <span>Importar CSV (columnas: email, nombre, notas)</span>
              <input
                type="file" accept=".csv" className="hidden"
                onChange={e => e.target.files?.[0] && handleCsvFile(e.target.files[0])}
              />
            </label>
          </div>

          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text" placeholder="Buscar email o nombre..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Nombre</th>
                  <th className="text-left px-4 py-3 font-medium">Notas</th>
                  <th className="text-left px-4 py-3 font-medium">Último acceso</th>
                  <th className="text-left px-4 py-3 font-medium">Estado</th>
                  <th className="text-right px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredApproved.map(r => (
                  <tr key={r.id} className="border-t border-border/60 hover:bg-secondary/20">
                    <td className="px-4 py-3 text-foreground">{r.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.full_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-[12px] truncate max-w-[200px]">{r.notes || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-[12px]">
                      {r.last_access ? timeAgo(r.last_access) : "nunca"}
                    </td>
                    <td className="px-4 py-3">
                      {r.is_active ? (
                        <span className="px-2 py-0.5 rounded-full bg-success/10 text-success text-[11px] font-medium">Activo</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-medium">Suspendido</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => toggleActive(r)} title={r.is_active ? "Suspender" : "Reactivar"}
                          className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                        >
                          {r.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => removeApproved(r)} title="Eliminar acceso"
                          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredApproved.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Sin resultados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STATS */}
      {!loading && tab === "stats" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Aprobados", value: stats.total },
              { label: "Activos", value: stats.active },
              { label: "Pendientes", value: stats.pending },
              { label: "Suspendidos", value: stats.suspended },
            ].map(k => (
              <div key={k.label} className="rounded-2xl border border-border bg-card p-5">
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">{k.label}</div>
                <div className="mt-3 font-display text-3xl">{k.value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="font-display text-sm mb-4">Últimos accesos</h3>
            {stats.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin accesos registrados aún</p>
            ) : (
              <ul className="space-y-2">
                {stats.recent.map(r => (
                  <li key={r.id} className="flex items-center justify-between text-[13px] py-1.5 border-b border-border/40 last:border-0">
                    <span>{r.email}</span>
                    <span className="text-muted-foreground text-[11px]">{timeAgo(r.last_access!)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">Sin acceder en +7 días</div>
            <div className="mt-2 font-display text-2xl">{stats.stale}</div>
            <p className="text-xs text-muted-foreground mt-1">Usuarios aprobados que llevan más de una semana sin entrar.</p>
          </div>
        </div>
      )}

      {/* CSV preview modal */}
      {csvOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="p-5 border-b border-border">
              <h3 className="font-display text-base">Previsualizar importación</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {csvPreview.length} emails detectados. Los duplicados se actualizarán como activos.
              </p>
            </div>
            <div className="flex-1 overflow-auto p-5">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left py-1">Email</th>
                    <th className="text-left py-1">Nombre</th>
                    <th className="text-left py-1">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.map((r, i) => (
                    <tr key={i} className="border-t border-border/40">
                      <td className="py-1.5">{r.email}</td>
                      <td className="py-1.5 text-muted-foreground">{r.nombre || "—"}</td>
                      <td className="py-1.5 text-muted-foreground">{r.notas || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-5 border-t border-border flex gap-2 justify-end">
              <button
                onClick={() => { setCsvOpen(false); setCsvPreview([]); }}
                className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground"
              >Cancelar</button>
              <button
                onClick={importCsvConfirm}
                className="gradient-brand text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 glow-primary"
              >Importar {csvPreview.length} emails</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
