import { useState } from "react";
import { GraduationCap, PlayCircle } from "lucide-react";
import { TUTORIALS, youtubeId, type Tutorial } from "@/lib/tutorials";
import { TOOLS, ADMIN_EXTRA_TOOLS } from "@/lib/tools";
import { TutorialDialog } from "@/components/TutorialButton";

/**
 * Aprende: un video corto por herramienta (src/lib/tutorials.ts), abierto también en la vitrina.
 * Cada tarjeta dice qué herramienta enseña y lleva a ella después de verlo.
 */
export function AprendePage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const [playing, setPlaying] = useState<Tutorial | null>(null);
  const toolOf = (page: string) => [...TOOLS, ...ADMIN_EXTRA_TOOLS].find(t => t.key === page);

  return (
    <div className="max-w-[1280px] mx-auto space-y-6 py-4">
      <div>
        <h1 className="font-display font-bold text-2xl text-foreground flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-primary" /> Aprende
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Un video corto por herramienta: mira cómo se usa con un caso real y hazlo tú.</p>
      </div>

      {TUTORIALS.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-[13px] text-muted-foreground">Pronto verás aquí los videos de cada herramienta.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TUTORIALS.map(t => {
            const tool = toolOf(t.page);
            return (
              <div key={t.youtubeId} className="rounded-2xl border border-border bg-card/40 overflow-hidden flex flex-col">
                <button onClick={() => setPlaying(t)} className="relative aspect-video bg-black group" aria-label={`Ver: ${t.title}`}>
                  <img src={`https://i.ytimg.com/vi/${youtubeId(t.youtubeId)}/hqdefault.jpg`} alt="" loading="lazy" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                  <PlayCircle className="absolute inset-0 m-auto w-12 h-12 text-white/90" strokeWidth={1.4} />
                  <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">{t.minutes} min</span>
                </button>
                <div className="p-4 flex-1 flex flex-col gap-2">
                  {tool && <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{tool.title}</span>}
                  <span className="font-display font-semibold text-[15px] text-foreground leading-snug">{t.title}</span>
                  {tool && (
                    <button onClick={() => onNavigate(tool.key)} className="mt-auto self-start text-[12px] font-semibold text-primary hover:underline">Ir a la herramienta →</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {playing && <TutorialDialog tutorial={playing} open={!!playing} onOpenChange={(o) => { if (!o) setPlaying(null); }} />}
    </div>
  );
}
