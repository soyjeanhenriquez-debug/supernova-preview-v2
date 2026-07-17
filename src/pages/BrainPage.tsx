import { useRef, useState } from "react";
import { Brain, Trash2, ArrowRight, CheckCircle2, Circle, Sparkles, Loader2, Plus, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { useProjects, PILLARS, type BrainProject } from "@/hooks/useProjects";
import { ProjectThumb } from "@/components/ProjectThumb";
import { useCredits } from "@/hooks/useCredits";

export function BrainPage() {
  const { projects, remove, togglePillar, setNote } = useProjects();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = projects.find((p) => p.id === openId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="page-heading font-display text-2xl text-foreground flex items-center gap-2">
            <Brain className="w-6 h-6 text-primary" /> SUPERNOVA BRAIN — 6 PILARES
          </h2>
          <p className="text-sm text-muted-foreground mt-3">Tu sistema de inteligencia secuencial para Direct Response</p>
        </div>
      </div>

      {/* Pillars overview */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {PILLARS.map((p) => (
          <div key={p.id} className="card-surface rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-widest text-primary font-bold">PILAR {p.id}</div>
            <div className="font-display font-bold text-sm text-foreground mt-1">{p.name}</div>
            <div className="text-[11px] text-muted-foreground mt-1 leading-snug">{p.desc}</div>
          </div>
        ))}
      </div>

      {/* Projects */}
      <div>
        <h3 className="font-display font-bold text-lg mb-3">Tus proyectos activos</h3>
        {projects.length === 0 ? (
          <div className="card-surface rounded-xl py-16 text-center">
            <div className="empty-icon mb-4"><Brain className="w-9 h-9" /></div>
            <div className="font-display font-bold text-lg mb-1">Tu cerebro está listo para encender</div>
            <div className="text-sm text-muted-foreground max-w-sm mx-auto">Cada proyecto que crees alimenta tu motor SUPERNOVA. Empieza por Buscar Ofertas Winner o Modo Crear.</div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((proj) => <ProjectCard key={proj.id} p={proj} onOpen={() => setOpenId(proj.id)} onDelete={() => remove(proj.id)} />)}
          </div>
        )}
      </div>

      {open && <ProjectDetail proj={open} onClose={() => setOpenId(null)} togglePillar={togglePillar} setNote={setNote} />}
    </div>
  );
}

function ProjectCard({ p, onOpen, onDelete }: { p: BrainProject; onOpen: () => void; onDelete: () => void }) {
  const progress = (p.completedPillars.length / 6) * 100;
  const modeLabel = p.mode === "sofisticar" ? "⚡ Sofisticar" : p.mode === "crear" ? "✦ Crear" : "🎯 Blueprint";
  return (
    <div className="card-surface rounded-xl p-4 flex flex-col gap-3 ad-card-hover">
      <ProjectThumb seed={p.name} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-primary font-bold">{modeLabel}</div>
          <div className="font-display font-bold text-sm mt-1 truncate">{p.name}</div>
        </div>
        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      <div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <span>Pilar {p.pillar}: {PILLARS[p.pillar - 1]?.name}</span>
          <span>{p.completedPillars.length}/6</span>
        </div>
        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
          <div className="h-full btn-primary-nova" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground">Actualizado {new Date(p.updatedAt).toLocaleDateString("es-ES")}</div>
      <button onClick={onOpen} className="text-xs text-primary hover:underline flex items-center gap-1">
        Abrir <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}

function ProjectDetail({ proj, onClose, togglePillar, setNote }: { proj: BrainProject; onClose: () => void; togglePillar: (id: string, p: number) => void; setNote: (id: string, p: number, n: string) => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-primary font-bold">{proj.mode === "sofisticar" ? "⚡ Sofisticar" : proj.mode === "crear" ? "✦ Crear" : "🎯 Blueprint"}</div>
            <h3 className="font-display font-bold text-lg">{proj.name}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">Cerrar</button>
        </div>
        <div className="p-6 overflow-y-auto space-y-3">
          <SavedAssets context={proj.context} />
          {PILLARS.map((pillar) => (
            <PillarBlock
              key={pillar.id}
              proj={proj}
              pillar={pillar}
              togglePillar={togglePillar}
              setNote={setNote}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Muestra los assets que se generaron al crear la app (Blueprint + Mega-Prompt),
 *  guardados en project.context, para que el usuario los reencuentre y recopie. */
function SavedAssets({ context }: { context: unknown }) {
  const ctx = (context ?? {}) as { blueprint?: string; miniapp?: string; salesPath?: "whatsapp" | "vsl"; salesScript?: string };
  const [openKey, setOpenKey] = useState<"miniapp" | "blueprint" | "vender" | null>(ctx.salesScript ? "vender" : "miniapp");
  if (!ctx.miniapp && !ctx.blueprint) return null;

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado — pégalo en Lovable o Claude");
  };

  const ventaLabel = ctx.salesPath === "whatsapp" ? "📱 Guion de WhatsApp · cobro manual" : "🎥 Guion de VSL · cobro automático";

  const items = [
    { key: "vender" as const, label: ventaLabel, content: ctx.salesScript },
    { key: "miniapp" as const, label: "🧬 Mega-Prompt · Mini App + embudo", content: ctx.miniapp },
    { key: "blueprint" as const, label: "🎯 Por qué gana · Blueprint", content: ctx.blueprint },
  ].filter((i) => i.content);

  return (
    <div className="space-y-2 mb-4">
      <div className="text-[10px] uppercase tracking-widest text-primary font-bold">Lo que generaste</div>
      {items.map((i) => (
        <div key={i.key} className="border border-primary/25 rounded-lg overflow-hidden bg-primary/5">
          <div className="flex items-center justify-between px-3 py-2">
            <button onClick={() => setOpenKey(openKey === i.key ? null : i.key)} className="text-xs font-semibold text-primary text-left">
              {i.label}
            </button>
            <button onClick={() => copy(i.content!)} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline shrink-0">
              <Copy className="w-3 h-3" /> Copiar
            </button>
          </div>
          {openKey === i.key && (
            <div className="max-h-72 overflow-y-auto px-3 pb-3 prose prose-invert prose-sm max-w-none prose-headings:text-primary prose-headings:text-sm prose-p:text-xs prose-li:text-xs">
              <ReactMarkdown>{i.content!}</ReactMarkdown>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PillarBlock({
  proj, pillar, togglePillar, setNote,
}: {
  proj: BrainProject;
  pillar: typeof PILLARS[number];
  togglePillar: (id: string, p: number) => void;
  setNote: (id: string, p: number, n: string) => void;
}) {
  const { consume, canAfford } = useCredits();
  const done = proj.completedPillars.includes(pillar.id);
  const [aiText, setAiText] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const runAssist = async () => {
    if (loading) return;
    if (!canAfford("pillar_assist")) { toast.error("Sin créditos suficientes"); return; }
    setLoading(true); setAiText("");
    consume("pillar_assist", `Pilar ${pillar.id} · ${proj.name}`);

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pillar-assist`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            projectName: proj.name,
            projectMode: proj.mode,
            pillarId: pillar.id,
            pillarName: pillar.name,
            pillarDesc: pillar.desc,
            notes: proj.notes[pillar.id] || "",
            context: proj.context,
            previousNotes: proj.notes,
          }),
        },
      );
      if (!resp.ok || !resp.body) throw new Error("Error de IA");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done: rd, value } = await reader.read();
        if (rd) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content || "";
            if (delta) {
              setAiText((t) => t + delta);
              requestAnimationFrame(() => {
                if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              });
            }
          } catch {/* ignore */}
        }
      }
      toast.success("✓ Guía generada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error generando guía");
    } finally { setLoading(false); }
  };

  const insertIntoNotes = () => {
    if (!aiText) return;
    const current = proj.notes[pillar.id] || "";
    const next = current ? `${current}\n\n${aiText}` : aiText;
    setNote(proj.id, pillar.id, next);
    toast.success("✓ Añadido a tus notas");
  };

  return (
    <div className="border border-border rounded-lg p-3">
      <div className="flex items-center gap-3">
        <button onClick={() => togglePillar(proj.id, pillar.id)} className={`shrink-0 ${done ? "text-success" : "text-muted-foreground hover:text-primary"}`}>
          {done ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-primary font-bold">PILAR {pillar.id}</div>
          <div className="font-display font-bold text-sm">{pillar.name}</div>
          <div className="text-xs text-muted-foreground">{pillar.desc}</div>
        </div>
        <button
          onClick={runAssist}
          disabled={loading}
          className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-md bg-primary/15 text-primary hover:bg-primary/25 transition-colors disabled:opacity-60"
          title="Genera una guía accionable de IA para este pilar"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {loading ? "Generando…" : "Ayuda IA"}
          <span className="opacity-60 ml-1">15c</span>
        </button>
      </div>

      <textarea
        value={proj.notes[pillar.id] || ""}
        onChange={(e) => setNote(proj.id, pillar.id, e.target.value)}
        placeholder="Notas para este pilar… o usa Ayuda IA para que SUPERNOVA te genere el plan"
        rows={2}
        className="w-full mt-2 bg-secondary border border-border rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      />

      {(aiText || loading) && (
        <div className="mt-3 rounded-lg border border-primary/25 bg-primary/5 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-widest text-primary font-bold flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> Guía IA · Pilar {pillar.id}
            </span>
            {aiText && !loading && (
              <button
                onClick={insertIntoNotes}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
              >
                <Plus className="w-3 h-3" /> Insertar en notas
              </button>
            )}
          </div>
          <div
            ref={scrollRef}
            className="max-h-72 overflow-y-auto prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:text-primary prose-headings:text-sm prose-p:text-xs prose-li:text-xs prose-strong:text-foreground"
          >
            <ReactMarkdown>{aiText}</ReactMarkdown>
            {loading && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Generando…
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
