import { useState } from "react";
import { Brain, Trash2, ArrowRight, Sparkles, Plus as PlusIcon, CheckCircle2, Circle } from "lucide-react";
import { useProjects, PILLARS, type BrainProject } from "@/hooks/useProjects";

export function BrainPage() {
  const { projects, remove, togglePillar, setNote } = useProjects();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = projects.find((p) => p.id === openId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-2xl text-foreground flex items-center gap-2">
            <Brain className="w-6 h-6 text-primary" /> SUPERNOVA BRAIN <span className="text-primary">— 6 PILARES</span>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Tu sistema de inteligencia secuencial para Direct Response</p>
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
            <Brain className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <div className="font-display font-semibold mb-1">Sin proyectos todavía</div>
            <div className="text-sm text-muted-foreground">Crea uno desde Anuncios Ganadores o desde Modo Crear</div>
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
    <div className="card-surface rounded-xl p-4 flex flex-col gap-3 hover:border-primary/40 transition-all">
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
          {PILLARS.map((pillar) => {
            const done = proj.completedPillars.includes(pillar.id);
            return (
              <div key={pillar.id} className="border border-border rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <button onClick={() => togglePillar(proj.id, pillar.id)} className={`shrink-0 ${done ? "text-success" : "text-muted-foreground hover:text-primary"}`}>
                    {done ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                  </button>
                  <div className="flex-1">
                    <div className="text-[10px] uppercase tracking-wider text-primary font-bold">PILAR {pillar.id}</div>
                    <div className="font-display font-bold text-sm">{pillar.name}</div>
                    <div className="text-xs text-muted-foreground">{pillar.desc}</div>
                  </div>
                </div>
                <textarea
                  value={proj.notes[pillar.id] || ""}
                  onChange={(e) => setNote(proj.id, pillar.id, e.target.value)}
                  placeholder="Notas para este pilar..."
                  rows={2}
                  className="w-full mt-2 bg-secondary border border-border rounded-lg p-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
