import { useEffect, useState } from "react";
import { Bot, Check, X, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Learning {
  id: string;
  insight: string;
  category: string;
  source: string | null;
  data_evidence: any;
  status: string;
  admin_note: string | null;
  created_at: string;
  week_date: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  keyword_performance: "Keywords",
  user_behavior: "Usuarios",
  market_trend: "Mercado",
  feature_usage: "Features",
  scoring_calibration: "Scoring",
};

export default function AdminAgent() {
  const [pending, setPending] = useState<Learning[]>([]);
  const [history, setHistory] = useState<Learning[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("system_learnings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    const all = (data ?? []) as Learning[];
    setPending(all.filter((l) => l.status === "pending"));
    setHistory(all.filter((l) => l.status !== "pending"));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const decide = async (id: string, status: "approved" | "rejected") => {
    const { error } = await supabase
      .from("system_learnings")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(status === "approved" ? "Aplicado" : "Ignorado"); load(); }
  };

  const triggerLearner = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("weekly-learner", { body: {} });
      if (error) throw error;
      toast.success("Aprendizajes generados");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally { setRunning(false); }
  };

  return (
    <div className="space-y-6">
      <header className="card-surface rounded-xl p-6 flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl border border-border bg-secondary/40 flex items-center justify-center">
          <Bot className="w-5 h-5 text-primary" strokeWidth={1.6} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display font-semibold text-[20px] tracking-tight text-foreground">
            Agente IA Admin
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            El agente analiza la actividad semanal y propone ajustes. Tú decides qué aplica.
          </p>
        </div>
        <button
          onClick={triggerLearner}
          disabled={running}
          className="text-[12px] font-semibold px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 flex items-center gap-2"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Generar ahora
        </button>
      </header>

      <section className="card-surface rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[13px] font-bold uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Aprendizajes de esta semana
            <span className="text-muted-foreground font-normal">({pending.length} pendientes)</span>
          </h2>
        </div>

        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : pending.length === 0 ? (
          <div className="text-[13px] text-muted-foreground py-6 text-center">
            No hay aprendizajes pendientes. Pulsa <strong>Generar ahora</strong> o espera al lunes.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((l) => (
              <li key={l.id} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-secondary/60 text-foreground/80">
                      {CATEGORY_LABEL[l.category] ?? l.category}
                    </span>
                    {l.source && <span className="text-[10px] text-muted-foreground">· {l.source}</span>}
                  </div>
                  <p className="text-[13px] text-foreground/90 leading-snug">{l.insight}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => decide(l.id, "approved")}
                    className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 flex items-center gap-1"
                    title="Aplicar"
                  >
                    <Check className="w-3.5 h-3.5" /> Aplicar
                  </button>
                  <button
                    onClick={() => decide(l.id, "rejected")}
                    className="text-[11px] font-semibold px-2.5 py-1.5 rounded-md bg-secondary/50 text-muted-foreground border border-border hover:bg-secondary flex items-center gap-1"
                    title="Ignorar"
                  >
                    <X className="w-3.5 h-3.5" /> Ignorar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 pt-3 border-t border-border">
          <button
            onClick={() => setShowHistory((s) => !s)}
            className="text-[12px] text-primary hover:underline"
          >
            {showHistory ? "Ocultar" : "Ver"} historial completo ({history.length}) →
          </button>
        </div>

        {showHistory && history.length > 0 && (
          <ul className="mt-3 divide-y divide-border/60">
            {history.map((l) => (
              <li key={l.id} className="py-2 flex items-start gap-2 text-[12px]">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${l.status === "approved" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                  {l.status === "approved" ? "✓" : "✗"}
                </span>
                <span className="text-[10px] text-muted-foreground w-20 flex-shrink-0">{CATEGORY_LABEL[l.category] ?? l.category}</span>
                <span className="text-foreground/80 flex-1 min-w-0 truncate">{l.insight}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
