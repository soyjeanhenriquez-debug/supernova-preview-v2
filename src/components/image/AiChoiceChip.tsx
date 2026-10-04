import { useState } from "react";
import { Sparkles } from "lucide-react";
import { ASPECT_LABEL, type Aspect } from "@/lib/imagePrompts";

/** "Formato: X · cambiar": muestra el formato ya elegido y su porqué; al tocar, las opciones. */
export function AiChoiceChip({ aspect, reason, options, onChange, disabled }: {
  aspect: Aspect; reason: string; options: Aspect[]; onChange: (a: Aspect) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Sparkles className="w-3.5 h-3.5 text-primary" strokeWidth={1.8} /> Formato:</span>
        <span className="text-foreground">{ASPECT_LABEL[aspect]}</span>
        <button type="button" onClick={() => setOpen(o => !o)} disabled={disabled} aria-expanded={open}
          className="text-[12px] text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50">
          {open ? "listo" : "cambiar"}
        </button>
      </div>
      <p className="text-[12px] text-muted-foreground">{reason}</p>
      {open && (
        <div className="flex flex-wrap gap-2">
          {options.map(a => (
            <button key={a} type="button" disabled={disabled} onClick={() => { onChange(a); setOpen(false); }}
              className={`h-9 px-3 rounded-full border text-[12px] ${aspect === a ? "border-foreground/40 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {ASPECT_LABEL[a]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
