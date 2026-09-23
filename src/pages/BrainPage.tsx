import { useState } from "react";
import { Brain, Trash2, ArrowRight, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { useProjects, type BrainProject } from "@/hooks/useProjects";
import { ProjectThumb } from "@/components/ProjectThumb";
import { ModalPortal } from "@/components/ModalPortal";

/**
 * Etapa 4 · "Mis productos": lo que el usuario creó y guardó (mini apps de "Hacer mi versión", planes
 * de negocio, ofertas mejoradas). Antes era "Proyectos · 6 pasos"; esos 6 pilares duplicaban el
 * recorrido "Mi negocio", así que ahora cada producto lleva al plan de lanzamiento y a los anuncios.
 */
export function BrainPage({ onNavigate }: { onNavigate?: (page: string) => void } = {}) {
  const { projects, remove } = useProjects();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = projects.find((p) => p.id === openId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="page-heading font-display text-2xl text-foreground flex items-center gap-2">
            <Brain className="w-6 h-6 text-primary" /> Lo que creaste
          </h2>
          <p className="text-xs uppercase tracking-wider text-primary font-semibold mt-1">Mi negocio · Etapa 4</p>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Aquí queda todo lo que creas y guardas: tu mini app de "Hacer mi versión" con sus instrucciones, tu guion de venta y los planes de negocio.
            Ábrelo cuando lo necesites y sigue con tu plan de lanzamiento.
          </p>
        </div>
      </div>

      {/* Projects */}
      <div>
        <h3 className="font-display font-bold text-lg mb-3">Guardados ({projects.length})</h3>
        {projects.length === 0 ? (
          <div className="card-surface rounded-xl py-16 text-center">
            <div className="empty-icon mb-4"><Brain className="w-9 h-9" /></div>
            <div className="font-display font-bold text-lg mb-1">Todavía no guardaste ningún producto</div>
            <div className="text-sm text-muted-foreground max-w-sm mx-auto">Se guardan solos cuando usas "Hacer mi versión" en una oferta, una mini app o un anuncio del Radar.</div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((proj) => <ProjectCard key={proj.id} p={proj} onOpen={() => setOpenId(proj.id)} onDelete={() => remove(proj.id)} />)}
          </div>
        )}
      </div>

      {open && <ProjectDetail proj={open} onClose={() => setOpenId(null)} onNavigate={onNavigate} />}
    </div>
  );
}

const MODE_LABEL: Record<string, string> = { sofisticar: "Oferta mejorada", crear: "Mi versión (mini app)", blueprint: "Plan de negocio" };

function ProjectCard({ p, onOpen, onDelete }: { p: BrainProject; onOpen: () => void; onDelete: () => void }) {
  const modeLabel = MODE_LABEL[p.mode] ?? "Producto";
  return (
    <div className="card-surface rounded-xl p-4 flex flex-col gap-3 ad-card-hover">
      <ProjectThumb seed={p.name} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-primary font-bold">{modeLabel}</div>
          <div className="font-display font-bold text-sm mt-1 truncate">{p.name}</div>
        </div>
        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive" aria-label="Borrar proyecto" title="Borrar proyecto"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      <div className="text-[10px] text-muted-foreground">Actualizado {new Date(p.updatedAt).toLocaleDateString("es-ES")}</div>
      <button onClick={onOpen} className="text-xs text-primary hover:underline flex items-center gap-1">
        Abrir <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}

function ProjectDetail({ proj, onClose, onNavigate }: { proj: BrainProject; onClose: () => void; onNavigate?: (page: string) => void }) {
  const analysis = (proj.context as { analysis?: string } | undefined)?.analysis;
  return (
    <ModalPortal onClose={onClose}>
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-primary font-bold">{MODE_LABEL[proj.mode] ?? "Producto"}</div>
            <h3 className="font-display font-bold text-lg">{proj.name}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">Cerrar</button>
        </div>
        <div className="p-6 overflow-y-auto space-y-3">
          <SavedAssets context={proj.context} />
          {analysis && <div className="prose prose-sm prose-invert max-w-none text-foreground"><ReactMarkdown>{analysis}</ReactMarkdown></div>}
          {onNavigate && (
            <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-2">
              <p className="text-sm font-semibold text-foreground">Siguiente paso</p>
              <p className="text-xs text-muted-foreground">Construye y lanza con tu plan de 14 días; cuando esté listo, crea tus anuncios en la Mándala.</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { onClose(); onNavigate("Plan"); }} className="inline-flex items-center gap-2 rounded-lg gradient-brand px-4 py-2 text-sm font-semibold text-primary-foreground">Mi plan de lanzamiento <ArrowRight className="w-4 h-4" /></button>
                <button onClick={() => { onClose(); onNavigate("Mándala"); }} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground">Crear mis anuncios</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

/** Muestra los assets que se generaron al crear la app (Blueprint + Mega-Prompt),
 *  guardados en project.context, para que el usuario los reencuentre y recopie. */
function SavedAssets({ context }: { context: unknown }) {
  const ctx = (context ?? {}) as { blueprint?: string; miniapp?: string; salesPath?: "whatsapp" | "vsl"; salesScript?: string; adImage?: string };
  const [openKey, setOpenKey] = useState<"miniapp" | "blueprint" | "vender" | null>(ctx.salesScript ? "vender" : "miniapp");
  if (!ctx.miniapp && !ctx.blueprint) return null;

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado. Pégalo en Claude, ChatGPT o la IA que uses.");
  };

  const ventaLabel = ctx.salesPath === "whatsapp" ? "📱 Guion de WhatsApp · cobro manual" : "🎥 Guion de VSL · cobro automático";

  const items = [
    { key: "vender" as const, label: ventaLabel, content: ctx.salesScript },
    { key: "miniapp" as const, label: "🧬 Mega-Prompt para crear tu mini app y su embudo", content: ctx.miniapp },
    { key: "blueprint" as const, label: "🎯 Por qué funciona esta oferta (blueprint)", content: ctx.blueprint },
  ].filter((i) => i.content);

  return (
    <div className="space-y-2 mb-4">
      <div className="text-[10px] uppercase tracking-widest text-primary font-bold">Lo que ya creaste para este proyecto</div>
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
      {ctx.adImage && (
        <div className="border border-primary/25 rounded-lg overflow-hidden bg-primary/5 p-3">
          <div className="text-xs font-semibold text-primary mb-2">🖼️ Imagen para tu anuncio</div>
          <img src={ctx.adImage} alt="Creativo de anuncio" className="w-40 rounded-lg border border-border" />
        </div>
      )}
    </div>
  );
}
