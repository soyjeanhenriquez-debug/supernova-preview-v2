import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Save, Settings } from "lucide-react";
import { toast } from "sonner";

interface ConfigRow {
  id: string;
  key: string;
  value: string;
  description: string | null;
  category: string;
  updated_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  credits: "Créditos",
  packs: "Packs de recarga",
  limits: "Límites",
  features: "Funcionalidades",
  system: "Sistema",
  general: "General",
};

export default function AdminConfig() {
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, string>>({});

  const load = async () => {
    const { data, error } = await supabase
      .from("system_config")
      .select("*")
      .order("category")
      .order("key");
    if (error) toast.error("Error cargando configuración");
    else setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async (row: ConfigRow, newValue: string) => {
    if (newValue === row.value) return;
    const { error } = await supabase
      .from("system_config")
      .update({ value: newValue, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) {
      toast.error("Error guardando: " + error.message);
    } else {
      toast.success(`${row.key} actualizado`);
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, value: newValue } : r));
      setEditing(prev => { const n = { ...prev }; delete n[row.id]; return n; });
    }
  };

  const isBool = (v: string) => v === "true" || v === "false";

  const grouped = rows.reduce<Record<string, ConfigRow[]>>((acc, r) => {
    (acc[r.category] = acc[r.category] || []).push(r);
    return acc;
  }, {});

  if (loading) return <div className="text-sm text-muted-foreground">Cargando configuración…</div>;

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-primary" strokeWidth={1.6} />
        <div>
          <h1 className="font-display text-2xl tracking-tight">Configuración del sistema</h1>
          <p className="text-sm text-muted-foreground">Todos los valores se aplican en tiempo real.</p>
        </div>
      </div>

      {Object.keys(grouped).sort().map(cat => (
        <section key={cat} className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            {CATEGORY_LABELS[cat] || cat}
          </h2>
          <div className="rounded-xl border border-border divide-y divide-border">
            {grouped[cat].map(row => (
              <div key={row.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium font-mono">{row.key}</div>
                  {row.description && (
                    <div className="text-[11px] text-muted-foreground">{row.description}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isBool(row.value) ? (
                    <Switch
                      checked={row.value === "true"}
                      onCheckedChange={(checked) => save(row, checked ? "true" : "false")}
                    />
                  ) : (
                    <>
                      <input
                        type="text"
                        defaultValue={row.value}
                        onChange={(e) => setEditing(p => ({ ...p, [row.id]: e.target.value }))}
                        onBlur={(e) => save(row, e.target.value)}
                        className="w-40 px-3 py-1.5 rounded-lg bg-secondary/40 border border-border text-[13px] text-right tabular-nums focus:outline-none focus:border-primary/50"
                      />
                      {editing[row.id] !== undefined && editing[row.id] !== row.value && (
                        <Save className="w-3.5 h-3.5 text-primary animate-pulse" />
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
