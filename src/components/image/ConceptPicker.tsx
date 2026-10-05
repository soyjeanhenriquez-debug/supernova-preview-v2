import { useState } from "react";
import { Check } from "lucide-react";
import { CONCEPT_BY_ID, CONCEPT_GROUPS, MAX_CONCEPTS, levelConcepts, type AdConcept, type ConceptGroup } from "@/lib/adConcepts";

/**
 * "Elige el estilo de tus creativos" (04-oct-2026, Jean): los 32 conceptos de anuncio estático a la
 * vista, sin desplegar nada, por nivel de conciencia del cliente (N0 → N4), cada uno con su imagen
 * de ejemplo, qué recibe y un ejemplo de texto. Siempre salen 3 conceptos DISTINTOS del mismo nivel:
 * los que elige y, si faltan, los recomendados de ese nivel. Hasta 3 u "Otro estilo".
 * Las imágenes de ejemplo son fijas: public/ejemplos-creativos/<id>.webp. Si falta una, la tarjeta
 * muestra una vista previa de texto en su lugar.
 */
const exampleSrc = (id: string) => `/ejemplos-creativos/${id}.webp`;

function Preview({ c }: { c: AdConcept }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="w-full h-full flex items-center justify-center p-3 bg-gradient-to-b from-secondary/60 to-background">
        <span className="font-display font-semibold text-[13px] leading-snug text-center text-foreground line-clamp-4">
          {c.example.replace(/^Ej\.:\s*/, "").replace(/[«»]/g, "")}
        </span>
      </div>
    );
  }
  // Ejemplo, no resultado: la imagen va un poco apagada y con una sombra profunda desde abajo y un
  // filo de luz interior; al pasar el cursor recupera el color. Sin texto encima.
  return (
    <div className="relative w-full h-full">
      <img src={exampleSrc(c.id)} alt={`Ejemplo de ${c.name}`} loading="lazy" onError={() => setBroken(true)}
        className="w-full h-full object-cover opacity-[0.88] saturate-[0.85] transition duration-300 group-hover:opacity-100 group-hover:saturate-100" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/5 shadow-[inset_0_0_40px_rgba(0,0,0,0.55)] ring-1 ring-inset ring-white/10" />
    </div>
  );
}

export function ConceptPicker({ level, onLevel, value, onChange, custom, onCustom, realTexts, onRealText, disabled }: {
  level: ConceptGroup; onLevel: (l: ConceptGroup) => void;
  value: string[]; onChange: (ids: string[]) => void;
  custom: string; onCustom: (s: string) => void;
  realTexts: Record<string, string>; onRealText: (id: string, s: string) => void;
  disabled?: boolean;
}) {
  const max = custom.trim() ? MAX_CONCEPTS - 1 : MAX_CONCEPTS; // tu estilo ocupa una de las 3 imágenes
  const full = value.length >= max;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : full ? value : [...value, id]);
  // Lo que se va a crear: lo elegido y, si falta, los recomendados del nivel (misma regla que imagePrompts).
  const picked = value.slice(0, max);
  const fill = levelConcepts(level).filter(c => !c.needsReal && !picked.includes(c.id)).map(c => c.id);
  const willCreate = [...picked.map(id => CONCEPT_BY_ID[id]?.name), ...(custom.trim() ? ["Tu estilo"] : []), ...fill.map(id => CONCEPT_BY_ID[id].name)].slice(0, MAX_CONCEPTS);
  const group = level;
  const levelInfo = CONCEPT_GROUPS.find(g => g.id === level);
  const needing = value.filter(id => CONCEPT_BY_ID[id]?.needsReal);
  const chip = (on: boolean) => `shrink-0 h-9 px-3.5 rounded-full border text-[13px] transition-colors ${on ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground hover:text-foreground"}`;

  return (
    <section className="space-y-3" aria-label="Estilo de tus creativos">
      <div className="space-y-1">
        <h2 className="font-display font-semibold text-[15px] text-foreground">¿Qué sabe ya tu cliente?</h2>
        <p className="text-[12px] text-muted-foreground">El problema no es el diseño, es el concepto. Elige el nivel y creamos 3 conceptos distintos para él: los datos te dirán cuál conecta.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="Nivel de conciencia de tu cliente">
        {CONCEPT_GROUPS.map(g => (
          <button key={g.id} type="button" role="tab" aria-selected={level === g.id} onClick={() => onLevel(g.id)} disabled={disabled} className={chip(level === g.id)}>
            <span className={`tabular-nums mr-1.5 ${level === g.id ? "text-primary" : "text-muted-foreground/70"}`}>{g.code}</span>{g.label}
          </button>
        ))}
      </div>
      <p className="text-[12px] text-muted-foreground">
        {levelInfo?.line} Vas a crear: <span className="text-foreground">{willCreate.join(" · ")}</span>
        {(value.length > 0 || custom.trim()) && <button type="button" onClick={() => { onChange([]); onCustom(""); }} disabled={disabled} className="ml-2 underline underline-offset-2 hover:text-foreground">usar los recomendados</button>}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {levelConcepts(group).map(c => {
          const on = value.includes(c.id);
          return (
            <button key={c.id} type="button" onClick={() => toggle(c.id)} disabled={disabled || (!on && full)} aria-pressed={on}
              className={`group relative text-left rounded-xl border overflow-hidden transition-colors disabled:opacity-50 ${on ? "border-primary/70 ring-1 ring-primary/40" : "border-border hover:border-foreground/30"}`}>
              <div className="aspect-[4/5] bg-card/60 overflow-hidden"><Preview c={c} /></div>
              {on && <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center"><Check className="w-3.5 h-3.5" /></span>}
              <span className="block px-3 pt-2.5 pb-3">
                <span className="block text-[13px] font-medium text-foreground leading-snug">
                  {c.name}{c.en && <span className="text-muted-foreground font-normal"> · {c.en}</span>}
                </span>
                <span className="block mt-0.5 text-[12px] text-muted-foreground leading-snug">{c.get}</span>
                {c.needsReal && <span className="block mt-1 text-[11px] text-primary/90">Necesita tu dato real</span>}
              </span>
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
        <span className="text-[12px] text-muted-foreground">¿Otro estilo? Descríbelo y la IA lo adapta (opcional)</span>
        <input value={custom} maxLength={160} onChange={e => onCustom(e.target.value)} disabled={disabled}
          placeholder="Ej.: estilo tuit, captura de chat, collage de fotos, minimalista con fondo amarillo…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
      </label>
    </section>
  );
}
