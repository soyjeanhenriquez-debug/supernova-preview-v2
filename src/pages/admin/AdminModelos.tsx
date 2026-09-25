import { useCallback, useEffect, useState } from "react";
import { Crown, Power, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Admin → Modelos y precios: los modelos de video/imagen (fal.ai) con su precio en créditos, costo
 * real y margen, y su estado (Prueba / Clientes / Pronto / Oculto). También los interruptores de cada
 * función de IA (edge_limits). Todo pasa por RPCs solo-admin que dejan registro en el audit log.
 * Regla del manual: margen mínimo 5× (piso absoluto 3×). Los precios no se cambian aquí.
 */
type Model = { id: string; kind: "video" | "image" | "avatar"; grp: string; label: string; tier: string; status: string; seconds: number | null; credits: number; cost_usd: number | null; margin: number | null; uses_30d: number };
type Switch = { fn: string; enabled: boolean; max_hour: number; max_day: number; note: string | null };

const STATUS: { id: string; label: string; cls: string }[] = [
  { id: "admin", label: "Prueba (solo admin)", cls: "text-sky-400" },
  { id: "live", label: "Clientes", cls: "text-success" },
  { id: "soon", label: "Pronto", cls: "text-muted-foreground" },
  { id: "off", label: "Oculto", cls: "text-destructive" },
];
const KIND = { video: "Video", avatar: "Avatar que habla", image: "Imagen" } as const;

export default function AdminModelos() {
  const [models, setModels] = useState<Model[]>([]);
  const [switches, setSwitches] = useState<Switch[]>([]);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("admin_media_catalog");
    if (error) { toast.error("No se pudo cargar el catálogo."); return; }
    setModels(data.models ?? []); setSwitches(data.switches ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const setStatus = async (m: Model, status: string) => {
    if (status === "live" && !confirm(`¿Abrir "${m.label}" a los clientes${m.tier === "comunidad" ? " de la Comunidad" : ""}? Cobra ${m.credits} créditos por uso.`)) return;
    setBusy(m.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("admin_set_media_model", { p_id: m.id, p_status: status });
    setBusy("");
    if (error) { toast.error("No se pudo cambiar el estado."); return; }
    toast.success(`${m.label}: ${STATUS.find(s => s.id === status)?.label}`);
    void load();
  };

  const openAll = async (kind: Model["kind"]) => {
    const list = models.filter(m => m.kind === kind && m.status === "admin");
    if (!list.length || !confirm(`¿Abrir a los clientes los ${list.length} modelos de ${KIND[kind].toLowerCase()} que están en prueba?`)) return;
    setBusy(kind);
    for (const m of list) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).rpc("admin_set_media_model", { p_id: m.id, p_status: "live" });
    }
    setBusy(""); toast.success(`${list.length} modelos abiertos a clientes`); void load();
  };

  const toggle = async (s: Switch) => {
    if (!confirm(`¿${s.enabled ? "Apagar" : "Encender"} la función "${s.fn}"? ${s.enabled ? "Quien la use verá que no está disponible." : ""}`)) return;
    setBusy(s.fn);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("admin_set_edge_switch", { p_fn: s.fn, p_enabled: !s.enabled });
    setBusy("");
    if (error) { toast.error("No se pudo cambiar."); return; }
    void load();
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Modelos y precios</h1>
          <p className="text-sm text-muted-foreground mt-1">Qué modelos de IA ven tus clientes, cuánto cobran y cuánto nos cuestan. Margen mínimo: 5× el costo real.</p>
        </div>
        <button onClick={() => void load()} aria-label="Refrescar" className="h-9 w-9 rounded-full border border-border grid place-items-center text-muted-foreground hover:text-foreground"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {(["video", "avatar", "image"] as const).map(kind => {
        const list = models.filter(m => m.kind === kind);
        if (!list.length) return null;
        const inTest = list.filter(m => m.status === "admin").length;
        return (
          <section key={kind} className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border">
              <h2 className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold">{KIND[kind]} · {list.length}</h2>
              {inTest > 0 && <button onClick={() => void openAll(kind)} disabled={busy !== ""} className="text-[12px] font-semibold text-primary disabled:opacity-50">Abrir los {inTest} en prueba a clientes</button>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-5 py-2 font-medium">Modelo</th><th className="px-3 py-2 font-medium">Plan</th>
                    <th className="px-3 py-2 font-medium text-right">Créditos</th><th className="px-3 py-2 font-medium text-right">Costo real</th>
                    <th className="px-3 py-2 font-medium text-right">Margen</th><th className="px-3 py-2 font-medium text-right">Usos 30 d</th>
                    <th className="px-5 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {list.map(m => (
                    <tr key={m.id}>
                      <td className="px-5 py-2.5"><span className="text-foreground font-medium">{m.label}</span><span className="text-muted-foreground"> · {m.grp}{m.seconds ? ` · ${m.seconds} s` : ""}</span></td>
                      <td className="px-3 py-2.5">{m.tier === "comunidad" ? <span className="inline-flex items-center gap-1 text-primary font-semibold"><Crown className="w-3 h-3" />Comunidad</span> : <span className="text-muted-foreground">PRO</span>}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{m.credits}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{m.cost_usd != null ? `US$${Number(m.cost_usd).toFixed(3)}` : "—"}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${m.margin == null ? "text-muted-foreground" : m.margin < 3 ? "text-destructive" : m.margin < 5 ? "text-amber-400" : "text-success"}`}>{m.margin != null ? `${m.margin}×` : "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{m.uses_30d}</td>
                      <td className="px-5 py-2.5">
                        <select value={m.status} disabled={busy !== ""} onChange={e => void setStatus(m, e.target.value)} aria-label={`Estado de ${m.label}`}
                          className={`bg-secondary/60 border border-border rounded-lg px-2 py-1 text-[12px] font-semibold ${STATUS.find(s => s.id === m.status)?.cls ?? ""}`}>
                          {STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-[12px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2"><Power className="w-4 h-4" />Interruptores de funciones de IA</h2>
        <p className="text-[12px] text-muted-foreground">Apagar una función la deja fuera para todos al instante (sin redesplegar). Útil si un proveedor falla o si algo cuesta más de lo esperado.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {switches.map(s => (
            <button key={s.fn} onClick={() => void toggle(s)} disabled={busy !== ""} role="switch" aria-checked={s.enabled}
              className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-2.5 text-left hover:border-foreground/25 disabled:opacity-50">
              <span className="min-w-0"><span className="block text-[13px] font-semibold text-foreground truncate">{s.fn}</span><span className="block text-[11px] text-muted-foreground">tope {s.max_hour}/hora · {s.max_day}/día</span></span>
              <span className={`w-[42px] h-6 rounded-full p-[3px] flex shrink-0 transition-colors ${s.enabled ? "bg-success justify-end" : "bg-secondary justify-start"}`}><span className="w-[18px] h-[18px] rounded-full bg-white" /></span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
