import { ArrowUpRight, BookOpen } from "lucide-react";
import { TOOL_BY_ID, openTool } from "@/lib/tools";
import { JEAN_GUIDES, jeanGuideUrl } from "@/lib/jeanGuides";

/** Guías de Jean: se leen en su web (pestaña nueva) y cada tarjeta lleva a las herramientas que usa. */
export function JeanGuides({ onNavigate }: { onNavigate: (p: string) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Guías paso a paso escritas por Jean. Se abren en su web; al terminar, vuelve y hazlo con estas herramientas.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {JEAN_GUIDES.map(g => {
          const tools = g.tools.map(id => TOOL_BY_ID[id]).filter(Boolean);
          return (
            <div key={g.slug} className="rounded-2xl border border-border bg-card/40 p-5 flex flex-col gap-3">
              <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <BookOpen className="w-3.5 h-3.5" strokeWidth={1.8} /> Guía · {g.minutes} min
              </span>
              <a href={jeanGuideUrl(g.slug)} target="_blank" rel="noopener" className="group">
                <span className="font-display font-semibold text-[15px] text-foreground leading-snug group-hover:underline">{g.title}</span>
                <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">{g.summary}</p>
              </a>
              {tools.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tools.map(t => (
                    <button key={t.id} onClick={() => openTool(t, onNavigate)} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-foreground/30">
                      <t.icon className="w-3 h-3" strokeWidth={1.8} /> {t.nav} →
                    </button>
                  ))}
                </div>
              )}
              <a href={jeanGuideUrl(g.slug)} target="_blank" rel="noopener" className="mt-auto self-start inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline">
                Leer la guía <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
