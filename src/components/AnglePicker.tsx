import { useState } from "react";
import { Compass, Check, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ANGLES, ANGLE_AUTO, angleById, angleLabel, type Angle } from "@/lib/angles";
import { levelById } from "@/lib/awareness";

/**
 * Selector de ángulo de venta (20-oct-2026). Va en toda herramienta que crea algo. Opcional: por
 * defecto "La IA elige el mejor" (ninguna herramienta se bloquea por no elegir). Siempre UN ángulo.
 */
/** `level`: nivel de consciencia elegido; marca los ángulos que mejor funcionan en él. */
export function AnglePicker({ value, onChange, className = "", level }: { value: string; onChange: (id: string) => void; className?: string; level?: string }) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<string>(angleById(value)?.id ?? ANGLES[0].id);
  const chosen = angleById(value);
  const a = angleById(focus) ?? ANGLES[0];
  const lvl = levelById(level);
  const good = new Set(lvl?.angles ?? []);

  const pick = (id: string) => { onChange(id); setOpen(false); };

  return (
    <>
      <button
        type="button"
        onClick={() => { setFocus(chosen?.id ?? lvl?.angles[0] ?? ANGLES[0].id); setOpen(true); }}
        className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg border border-border bg-secondary/30 hover:border-primary/40 transition-colors ${className}`}
      >
        <Compass className="w-4 h-4 text-primary shrink-0" strokeWidth={1.8} />
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] uppercase tracking-wide text-muted-foreground">Ángulo de venta · uno por pieza</span>
          <span className="block text-[12.5px] text-foreground truncate">{angleLabel(value)}</span>
        </span>
        <span className="text-[11px] text-primary shrink-0">{chosen ? "Cambiar" : "Elegir"}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden max-h-[90dvh] flex flex-col">
          <div className="px-5 pt-5 pb-3 border-b border-border">
            <DialogTitle className="font-display text-[16px]">Elige el ángulo de tu pieza</DialogTitle>
            <DialogDescription className="text-[12px]">
              El ángulo es la razón por la que alguien querría tu producto. Una pieza = un ángulo: para probar otro, haz otra pieza.{lvl ? ` Marcados: los que mejor funcionan en el nivel ${lvl.n} (${lvl.name.toLowerCase()}).` : ""}
            </DialogDescription>
          </div>
          <div className="flex-1 min-h-0 grid md:grid-cols-[230px_1fr] overflow-hidden">
            <div className="overflow-y-auto border-b md:border-b-0 md:border-r border-border max-h-[32dvh] md:max-h-none py-2">
              {[true, false].map(core => (
                <div key={String(core)}>
                  <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{core ? "Los 12 base" : "Más ángulos"}</div>
                  {ANGLES.filter(x => x.core === core).map(x => (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => setFocus(x.id)}
                      className={`w-full flex items-center gap-2 px-4 py-1.5 text-left text-[12.5px] transition-colors ${x.id === a.id ? "text-foreground bg-secondary/60" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <span className={`text-[10px] tabular-nums w-5 ${x.id === a.id ? "text-primary" : ""}`}>{String(x.n).padStart(2, "0")}</span>
                      <span className="flex-1 truncate">{x.name}</span>
                      {good.has(x.id) && x.id !== value && <span className="text-[9.5px] text-primary" title={`Funciona bien en el nivel ${lvl?.n}`}>nivel {lvl?.n}</span>}
                      {x.id === value && <Check className="w-3.5 h-3.5 text-primary" />}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <AngleDetail angle={a} />
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between px-5 py-3 border-t border-border">
            <button type="button" onClick={() => pick(ANGLE_AUTO)} className="text-[12px] px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Que la IA elija el mejor
            </button>
            <button type="button" onClick={() => pick(a.id)} className="text-[12px] px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90">
              Usar «{a.name}»
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AngleDetail({ angle: a }: { angle: Angle }) {
  return (
    <div className="overflow-y-auto p-5 space-y-4">
      <div>
        <div className="text-[10.5px] uppercase tracking-wider text-primary">Ángulo {a.n} · {a.name}</div>
        <p className="mt-2 font-display text-[19px] leading-snug text-foreground">“{a.examples[0].hook}”</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{a.examples[0].product}</p>
      </div>
      <dl className="grid gap-2 text-[12.5px]">
        <div><dt className="inline text-muted-foreground">Qué es: </dt><dd className="inline text-foreground">{a.what}</dd></div>
        <div><dt className="inline text-muted-foreground">Cuándo usarlo: </dt><dd className="inline text-foreground">{a.when}</dd></div>
        <div><dt className="inline text-muted-foreground">Cómo se entra: </dt><dd className="inline text-foreground">{a.how}</dd></div>
        {a.care && <div><dt className="inline text-muted-foreground">Cuidado: </dt><dd className="inline text-foreground">{a.care}</dd></div>}
      </dl>
      <div className="space-y-2">
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Ejemplos en otros nichos</div>
        {a.examples.slice(1).map(e => (
          <div key={e.product} className="rounded-lg border border-border px-3 py-2">
            <div className="text-[10.5px] text-muted-foreground">{e.niche} · {e.product}</div>
            <div className="text-[12.5px] text-foreground">“{e.hook}”</div>
          </div>
        ))}
      </div>
    </div>
  );
}
