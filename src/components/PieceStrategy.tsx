import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AnglePicker } from "@/components/AnglePicker";
import { LEVELS, LEVEL_AUTO, levelById, levelLabel, type AwarenessLevel } from "@/lib/awareness";
import { ANGLES } from "@/lib/angles";

/**
 * La estrategia de cada pieza (22-oct-2026): A QUIÉN le habla (nivel de consciencia, en escalera) y
 * DESDE DÓNDE (ángulo de venta). Va en toda herramienta que crea algo. Las dos cosas son opcionales
 * (la IA decide si no se eligen) y siempre son UNA por pieza.
 */
export function PieceStrategy({ level, onLevel, angle, onAngle }: {
  level: string; onLevel: (id: string) => void; angle: string; onAngle: (id: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <AwarenessLadder value={level} onChange={onLevel} />
      <AnglePicker value={angle} onChange={onAngle} level={level} />
    </div>
  );
}

/** Escalera mini (5 barras) para el botón: el peldaño elegido se ilumina. */
function MiniLadder({ n }: { n?: number }) {
  return (
    <span className="flex flex-col-reverse gap-[2px] w-5 shrink-0" aria-hidden>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={`h-[3px] rounded-sm ${i === n ? "bg-primary" : "bg-muted-foreground/40"}`} style={{ marginLeft: `${(i - 1) * 3}px` }} />
      ))}
    </span>
  );
}

export function AwarenessLadder({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const chosen = levelById(value);
  const [focus, setFocus] = useState<string>(chosen?.id ?? "problema");
  const l = levelById(focus) ?? LEVELS[1];
  const pick = (id: string) => { onChange(id); setOpen(false); };

  return (
    <>
      <button
        type="button"
        onClick={() => { setFocus(chosen?.id ?? "problema"); setOpen(true); }}
        className="w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-lg border border-border bg-secondary/30 hover:border-primary/40 transition-colors"
      >
        <MiniLadder n={chosen?.n} />
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] uppercase tracking-wide text-muted-foreground">A quién le hablas · un nivel</span>
          <span className="block text-[12.5px] text-foreground truncate">{levelLabel(value)}</span>
        </span>
        <span className="text-[11px] text-primary shrink-0">{chosen ? "Cambiar" : "Elegir"}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden max-h-[92dvh] flex flex-col">
          <div className="px-5 pt-5 pb-3 border-b border-border">
            <DialogTitle className="font-display text-[16px]">¿En qué punto está la persona que lo va a ver?</DialogTitle>
            <DialogDescription className="text-[12px]">
              Cada persona está en un punto distinto respecto a tu producto y a su problema. Una pieza le habla a un solo nivel.
            </DialogDescription>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto grid md:grid-cols-[1fr_1.05fr]">
            <LevelDetail level={l} />
            <div className="p-5 md:border-l border-t md:border-t-0 border-border space-y-3">
              <div className="space-y-1.5" role="radiogroup" aria-label="Niveles de consciencia">
                {[...LEVELS].reverse().map(x => {
                  const active = x.id === l.id;
                  return (
                    <button
                      key={x.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setFocus(x.id)}
                      className="block w-full text-left"
                    >
                      <span
                        className={`flex items-center gap-2 rounded-md border px-3 py-2.5 transition-colors ${active
                          ? "border-primary bg-primary/15 text-foreground"
                          : x.cold ? "border-border bg-secondary/40 text-muted-foreground hover:text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                        style={{ marginLeft: `${(x.n - 1) * 7}%` }}
                      >
                        <span className={`text-[10px] tabular-nums ${active ? "text-primary" : ""}`}>0{x.n}</span>
                        <span className={`text-[13px] ${active ? "font-semibold" : ""}`}>{x.name}</span>
                        {x.id === value && <span className="ml-auto text-[10px] text-primary">elegido</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11.5px] text-muted-foreground">
                <span className="text-foreground">La gente que no te conoce vive en 1 · 2 · 3.</span> Ahí van la mayoría de tus anuncios. El 4 y el 5 son para quien ya te vio (retargeting: volver a mostrarle anuncios a quien ya interactuó).
              </p>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between px-5 py-3 border-t border-border">
            <button type="button" onClick={() => pick(LEVEL_AUTO)} className="text-[12px] px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Que la IA decida
            </button>
            <button type="button" onClick={() => pick(l.id)} className="text-[12px] px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90">
              Hablarle al nivel {l.n}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LevelDetail({ level: l }: { level: AwarenessLevel }) {
  const angles = l.angles.map(id => ANGLES.find(a => a.id === id)?.name).filter(Boolean);
  return (
    <div className="p-5 space-y-4">
      <div>
        <div className="text-[10.5px] uppercase tracking-wider text-primary">Nivel 0{l.n} · {l.temp}</div>
        <h3 className="mt-1 font-display text-[22px] leading-tight text-foreground">{l.name}</h3>
        <p className="text-[13px] text-muted-foreground">{l.state}</p>
      </div>
      <div className="border-t border-border pt-3">
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Tu jugada</div>
        <p className="mt-1 font-display text-[18px] text-foreground">{l.play}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {l.tactics.map(t => <span key={t} className="text-[11px] px-2 py-1 rounded-md border border-border text-foreground">{t}</span>)}
        </div>
      </div>
      <div className="rounded-lg border border-border px-3 py-2">
        <div className="text-[10.5px] text-muted-foreground">Ejemplo · curso de repostería</div>
        <div className="text-[12.5px] text-foreground">“{l.example}”</div>
      </div>
      <p className="text-[12px] text-muted-foreground"><span className="text-foreground">Evita:</span> {l.avoid}</p>
      <p className="text-[12px] text-muted-foreground"><span className="text-foreground">Ángulos que funcionan aquí:</span> {angles.join(", ")}.</p>
    </div>
  );
}
