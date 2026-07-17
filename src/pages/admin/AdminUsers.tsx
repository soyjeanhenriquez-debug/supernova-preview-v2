import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, Shield, Coins, Ban, Trash2, RefreshCw, X, Mail, Activity, Plus, Minus, UserCog, Circle } from "lucide-react";
import { toast } from "sonner";

type Role = "admin" | "moderator" | "user";

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  confirmed_at: string | null;
  roles: Role[];
  profile: { display_name?: string; avatar_url?: string; company_name?: string } | null;
  total_credits_spent: number;
  last_activity_at: string;
}

interface UserDetail {
  user: unknown;
  roles: Role[];
  profile: unknown;
  transactions: unknown[];
  history: unknown[];
  analyses: unknown[];
}

async function call(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("admin-users", {
    body: { action, ...payload },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

function timeAgo(d?: string | null) {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const days = Math.floor(h / 24);
  return `hace ${days}d`;
}

function isOnline(d?: string | null) {
  if (!d) return false;
  return Date.now() - new Date(d).getTime() < 5 * 60 * 1000;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await call("list", { page: 1, perPage: 200 });
      setUsers(data.users);
    } catch (e: unknown) {
      toast.error(e.message || "Error cargando usuarios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime activity refresh — refetch every 20s + subscribe to new credit txs / ad_history
  useEffect(() => {
    const iv = setInterval(load, 20000);
    const ch = supabase
      .channel("admin-users-activity")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "credit_transactions" }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ad_history" }, () => load())
      .subscribe();
    return () => { clearInterval(iv); supabase.removeChannel(ch); };
  }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return users
      .filter((u) => roleFilter === "all" || u.roles.includes(roleFilter))
      .filter((u) =>
        !term ||
        u.email?.toLowerCase().includes(term) ||
        u.profile?.display_name?.toLowerCase().includes(term) ||
        u.id.toLowerCase().includes(term)
      )
      .sort((a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime());
  }, [users, q, roleFilter]);

  const stats = useMemo(() => ({
    total: users.length,
    online: users.filter((u) => isOnline(u.last_activity_at)).length,
    admins: users.filter((u) => u.roles.includes("admin")).length,
    suspended: users.filter((u) => u.banned_until && new Date(u.banned_until) > new Date()).length,
  }), [users]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl tracking-tight">Usuarios</h1>
          <p className="text-sm text-muted-foreground">Gestión, créditos y actividad en tiempo real.</p>
        </div>
        <button
          onClick={load}
          className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-secondary/40"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refrescar
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total usuarios" value={stats.total} />
        <StatCard label="En línea (5m)" value={stats.online} accent />
        <StatCard label="Admins" value={stats.admins} />
        <StatCard label="Suspendidos" value={stats.suspended} />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por email, nombre o ID…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary/40 border border-border text-[13px] focus:outline-none focus:border-primary/50"
          />
        </div>
        <div className="flex items-center gap-1 text-[12px]">
          {(["all", "admin", "moderator", "user"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-lg border transition-colors ${
                roleFilter === r
                  ? "bg-primary/10 border-primary/40 text-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary/40"
              }`}
            >
              {r === "all" ? "Todos" : r}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-secondary/30 text-muted-foreground text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Usuario</th>
              <th className="text-left px-4 py-2.5 font-medium">Role</th>
              <th className="text-left px-4 py-2.5 font-medium">Registro</th>
              <th className="text-left px-4 py-2.5 font-medium">Última actividad</th>
              <th className="text-right px-4 py-2.5 font-medium">Créditos</th>
              <th className="text-right px-4 py-2.5 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Cargando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Sin resultados</td></tr>
            ) : filtered.map((u) => {
              const online = isOnline(u.last_activity_at);
              const suspended = u.banned_until && new Date(u.banned_until) > new Date();
              const role = u.roles[0] || "user";
              return (
                <tr
                  key={u.id}
                  onClick={() => setSelected(u.id)}
                  className="border-t border-border hover:bg-secondary/30 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Circle className={`w-2 h-2 ${online ? "fill-emerald-500 text-emerald-500" : "fill-muted-foreground/30 text-muted-foreground/30"}`} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{u.profile?.display_name || u.email?.split("@")[0]}</div>
                        <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                          <Mail className="w-2.5 h-2.5" /> {u.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={role} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(u.created_at)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{timeAgo(u.last_activity_at)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{u.total_credits_spent}</td>
                  <td className="px-4 py-3 text-right">
                    {suspended ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Suspendido</span>
                    ) : !u.confirmed_at ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">Sin confirmar</span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Activo</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <UserDetailModal userId={selected} onClose={() => setSelected(null)} onChanged={load} />
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-display tabular-nums ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const map: Record<Role, string> = {
    admin: "bg-primary/15 text-primary border-primary/30",
    moderator: "bg-sky-500/10 text-sky-500 border-sky-500/30",
    user: "bg-secondary/60 text-muted-foreground border-border",
  };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${map[role]}`}>{role}</span>
  );
}

function UserDetailModal({ userId, onClose, onChanged }: { userId: string; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("100");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await call("detail", { userId });
      setD(data);
    } catch (e: unknown) {
      toast.error(e.message);
    } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const run = async (action: string, payload: Record<string, unknown> = {}, msg = "Hecho") => {
    setBusy(true);
    try {
      await call(action, { userId, ...payload });
      toast.success(msg);
      await load();
      onChanged();
    } catch (e: unknown) {
      toast.error(e.message);
    } finally { setBusy(false); }
  };

  const totalSpent = d?.transactions.filter(t => t.cost > 0).reduce((s, t) => s + t.cost, 0) || 0;
  const totalRefilled = d?.transactions.filter(t => t.cost < 0).reduce((s, t) => s + Math.abs(t.cost), 0) || 0;
  const suspended = d?.user.banned_until && new Date(d.user.banned_until) > new Date();
  const role = d?.roles[0] || "user";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-border">
          <div>
            <div className="font-display text-lg">{d?.profile?.display_name || d?.user.email?.split("@")[0] || "Usuario"}</div>
            <div className="text-[12px] text-muted-foreground flex items-center gap-1.5">
              <Mail className="w-3 h-3" /> {d?.user.email}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {loading || !d ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Cargando…</div>
        ) : (
          <div className="overflow-auto p-6 space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MiniStat label="Créditos gastados" value={totalSpent} />
              <MiniStat label="Créditos añadidos" value={totalRefilled} />
              <MiniStat label="Anuncios vistos" value={d.history.length} />
              <MiniStat label="Landings analizadas" value={d.analyses.length} />
            </div>

            {/* Actions */}
            <section className="space-y-3">
              <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Acciones</h3>

              <div className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center gap-2 text-[12px] font-medium">
                  <UserCog className="w-3.5 h-3.5" /> Role
                </div>
                <div className="flex gap-2">
                  {(["user", "moderator", "admin"] as Role[]).map((r) => (
                    <button
                      key={r}
                      disabled={busy || role === r}
                      onClick={() => run("set_role", { role: r }, `Role cambiado a ${r}`)}
                      className={`text-[12px] px-3 py-1.5 rounded-lg border transition-colors ${
                        role === r ? "bg-primary/15 border-primary/40 text-foreground" : "border-border text-muted-foreground hover:bg-secondary/40"
                      } disabled:opacity-50`}
                    >{r}</button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center gap-2 text-[12px] font-medium">
                  <Coins className="w-3.5 h-3.5" /> Créditos
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-28 px-3 py-1.5 rounded-lg bg-secondary/40 border border-border text-[13px] focus:outline-none focus:border-primary/50"
                  />
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Nota (opcional)"
                    className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg bg-secondary/40 border border-border text-[13px] focus:outline-none focus:border-primary/50"
                  />
                  <button
                    disabled={busy}
                    onClick={() => run("adjust_credits", { amount: Number(amount), note: note || "Refill admin" }, "Créditos añadidos")}
                    className="text-[12px] px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/40 text-foreground hover:bg-primary/25 flex items-center gap-1 disabled:opacity-50"
                  ><Plus className="w-3 h-3" /> Añadir</button>
                  <button
                    disabled={busy}
                    onClick={() => run("adjust_credits", { amount: -Number(amount), note: note || "Deducción admin" }, "Créditos deducidos")}
                    className="text-[12px] px-3 py-1.5 rounded-lg border border-border hover:bg-secondary/40 flex items-center gap-1 disabled:opacity-50"
                  ><Minus className="w-3 h-3" /> Quitar</button>
                </div>
              </div>

              <div className="rounded-xl border border-border p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-[12px] font-medium">
                  <Ban className="w-3.5 h-3.5" /> Cuenta
                </div>
                <div className="flex gap-2">
                  {suspended ? (
                    <button disabled={busy} onClick={() => run("unsuspend", {}, "Usuario reactivado")} className="text-[12px] px-3 py-1.5 rounded-lg border border-border hover:bg-secondary/40 disabled:opacity-50">Reactivar</button>
                  ) : (
                    <button disabled={busy} onClick={() => run("suspend", {}, "Usuario suspendido")} className="text-[12px] px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 disabled:opacity-50">Suspender</button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (!confirm("¿Eliminar este usuario? Esta acción es irreversible.")) return;
                      run("delete", {}, "Usuario eliminado").then(onClose);
                    }}
                    className="text-[12px] px-3 py-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 flex items-center gap-1 disabled:opacity-50"
                  ><Trash2 className="w-3 h-3" /> Eliminar</button>
                </div>
              </div>
            </section>

            {/* Timeline */}
            <section className="space-y-3">
              <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
                <Activity className="w-3 h-3" /> Actividad reciente
              </h3>
              <div className="rounded-xl border border-border divide-y divide-border max-h-72 overflow-auto">
                {([
                  ...d.transactions.map((t: unknown) => ({ type: "credit", at: t.created_at, label: t.label || t.action, value: t.cost })),
                  ...d.history.map((h: unknown) => ({ type: "ad", at: h.visited_at, label: `Vio ad: ${h.title || h.page_name || "anuncio"}` })),
                  ...d.analyses.map((a: unknown) => ({ type: "landing", at: a.created_at, label: `Analizó ${a.domain}` })),
                ] as unknown[])
                  .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
                  .slice(0, 30)
                  .map((e, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2 text-[12px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full ${e.type === "credit" ? "bg-primary" : e.type === "ad" ? "bg-emerald-500" : "bg-sky-500"}`} />
                      <span className="truncate">{e.label}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {e.type === "credit" && (
                        <span className={`tabular-nums ${e.value < 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                          {e.value < 0 ? `+${Math.abs(e.value)}` : `-${e.value}`}
                        </span>
                      )}
                      <span className="text-muted-foreground">{timeAgo(e.at)}</span>
                    </div>
                  </div>
                ))}
                {d.transactions.length + d.history.length + d.analyses.length === 0 && (
                  <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">Sin actividad registrada</div>
                )}
              </div>
            </section>

            <div className="text-[10px] text-muted-foreground/60 text-center">ID: {d.user.id}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-display tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
