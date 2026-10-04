import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { AD_CONCEPTS, CONCEPT_BY_ID, CONCEPT_GROUPS, MAX_CONCEPTS, type ConceptGroup } from "@/lib/adConcepts";

/**
 * "Estilo del creativo" (04-oct-2026): los 32 conceptos de anuncio estático por temperatura del
 * público, con qué recibe y un ejemplo. Plegado por defecto: sin elegir nada salen los 3 de siempre.
 * Hasta 3 conceptos u "Otro estilo" escrito. Los que necesitan datos reales piden el texto aquí mismo.
 */
export function ConceptPicker({ value, onChange, custom, onCustom, realTexts, onRealText, disabled }: {
  value: string[]; onChange: (ids: string[]) => void;
  custom: string; onCustom: (s: string) => void;
  realTexts: Record<string, string>; onRealText: (id: string, s: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<ConceptGroup>("frio");
  const max = custom.trim() ? MAX_CONCEPTS - 1 : MAX_CONCEPTS; // tu estilo ocupa una de las 3 imágenes
  const full = value.length >= max;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : full ? value : [...value, id]);
  const summary = value.length || custom.trim()
    ? [...value.map(id => CONCEPT_BY_ID[id]?.name).filter(Boolean), custom.trim() ? "Tu estilo" : ""].filter(Boolean).join(" · ")
    : "Problema → solución · Resultado · Mockup";
  const needing = value.filter(id => CONCEPT_BY_ID[id]?.needsReal);
  const chip = (on: boolean) => `shrink-0 h-8 px-3 rounded-full border text-[12px] transition-colors ${on ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} disabled={disabled}
        className="w-full flex items-center gap-2 text-left text-[13px] disabled:opacity-60">
        <span className="text-muted-foreground shrink-0">Estilo:</span>
        <span className="text-foreground truncate min-w-0">{summary}</span>
        <span className="ml-auto shrink-0 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
          {open ? "listo" : "elegir estilo"} <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="rounded-xl border border-border p-3 sm:p-4 space-y-3">
          <p className="text-[12px] text-muted-foreground">
            Los estilos que más se usan en anuncios de imagen. Elige hasta {max} ({Math.min(value.length, max)} de {max}){custom.trim() ? ", tu estilo ocupa la tercera imagen" : " o describe otro abajo"}.
            {value.length > 0 && <button type="button" onClick={() => onChange([])} className="ml-2 underline underline-offset-2 hover:text-foreground">quitar todos</button>}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="Para quién es el anuncio">
            {CONCEPT_GROUPS.map(g => (
              <button key={g.id} type="button" role="tab" aria-selected={group === g.id} onClick={() => setGroup(g.id)} className={chip(group === g.id)}>
                {g.label}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-muted-foreground">{CONCEPT_GROUPS.find(g => g.id === group)?.line}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {AD_CONCEPTS.filter(c => c.group === group).map(c => {
              const on = value.includes(c.id);
              return (
                <button key={c.id} type="button" onClick={() => toggle(c.id)} disabled={disabled || (!on && full)} aria-pressed={on}
                  className={`relative text-left rounded-xl border px-3 py-2.5 transition-colors disabled:opacity-50 ${on ? "border-primary/60 bg-primary/[0.06]" : "border-border hover:border-foreground/30"}`}>
                  {on && <Check className="absolute top-2.5 right-2.5 w-3.5 h-3.5 text-primary" />}
                  <span className="block text-[13px] font-medium text-foreground pr-5">
                    {c.name}{c.en && <span className="text-muted-foreground font-normal"> · {c.en}</span>}
                  </span>
                  <span className="block mt-0.5 text-[12px] text-muted-foreground leading-snug">{c.get}</span>
                  <span className="block mt-1 text-[11px] text-muted-foreground/80 leading-snug">Ej.: {c.example}</span>
                  {c.needsReal && <span className="block mt-1 text-[11px] text-primary/90">Necesita tu dato real</span>}
                </button>
              );
            })}
          </div>

          {needing.map(id => (
            <label key={id} className="block space-y-1">
              <span className="text-[12px] text-foreground">{CONCEPT_BY_ID[id].name}: {CONCEPT_BY_ID[id].needsReal}</span>
              <input value={realTexts[id] ?? ""} maxLength={160} onChange={e => onRealText(id, e.target.value)} disabled={disabled}
                placeholder={CONCEPT_BY_ID[id].example.replace(/^«|»$/g, "")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
            </label>
          ))}

          <label className="block space-y-1">
            <span className="text-[12px] text-foreground">¿Otro estilo? Descríbelo y la IA lo adapta (opcional)</span>
            <input value={custom} maxLength={160} onChange={e => onCustom(e.target.value)} disabled={disabled}
              placeholder="Ej.: estilo tuit, captura de chat, collage de fotos, minimalista con fondo amarillo…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
          </label>
        </div>
      )}
    </div>
  );
}
