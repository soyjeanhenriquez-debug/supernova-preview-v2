import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Crown, Film, ImageIcon, Lock, Mic, Sparkles, X } from "lucide-react";
import { accessOf, type MediaKind, type MediaModel } from "@/lib/media";

/**
 * Selector de modelos agrupado (Seedance, Kling, Wan, Google…): cada modelo con su precio en
 * créditos y etiquetas "Recomendado", "COMUNIDAD" (candado → invitación a la Comunidad) y "PRONTO".
 * Los modelos 'admin' (en prueba) solo los ven los admins, marcados "Prueba".
 */
type Props = {
  models: MediaModel[];
  kinds: MediaKind[];
  value: string | null;
  onChange: (id: string) => void;
  isAdmin: boolean;
  comunidad: boolean;
  onUpsell: (m: MediaModel) => void;
};

const KIND_ICON = { video: Film, image: ImageIcon, avatar: Mic } as const;

export function ModelPicker({ models, kinds, value, onChange, isAdmin, comunidad, onUpsell }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const list = useMemo(() => models.filter(m => kinds.includes(m.kind) && accessOf(m, { isAdmin, comunidad }) !== "admin_only"), [models, kinds, isAdmin, comunidad]);
  const groups = useMemo(() => {
    const g = new Map<string, MediaModel[]>();
    for (const m of list) g.set(m.grp, [...(g.get(m.grp) ?? []), m]);
    return [...g.entries()];
  }, [list]);
  const [grp, setGrp] = useState<string | null>(null);
  const current = list.find(m => m.id === value) ?? null;
  const activeGrp = grp ?? current?.grp ?? groups[0]?.[0] ?? null;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (!list.length) return null;
  const Icon = current ? KIND_ICON[current.kind] : Sparkles;

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="listbox"
        className="h-11 pl-2 pr-3 rounded-xl border border-border bg-card hover:border-foreground/25 inline-flex items-center gap-2 text-[14px] font-semibold text-foreground transition-colors">
        <span className="w-7 h-7 rounded-lg bg-primary/15 text-primary grid place-items-center"><Icon className="w-4 h-4" /></span>
        {current ? current.label : "Elige un modelo"}
        {current?.cost != null && <span className="text-[12px] font-medium text-muted-foreground">· {current.cost} ⚡</span>}
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-40 top-full mt-2 left-0 w-[min(92vw,640px)] rounded-2xl border border-border bg-popover shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <span className="text-[11px] tracking-widest font-semibold text-muted-foreground">MODELOS</span>
            <button onClick={() => setOpen(false)} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-[minmax(0,200px)_minmax(0,1fr)] max-h-[60vh]">
            <div className="border-r border-border overflow-y-auto p-2 space-y-1">
              {groups.map(([g, ms]) => (
                <button key={g} onClick={() => setGrp(g)}
                  className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors ${activeGrp === g ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50"}`}>
                  <p className="text-[14px] font-semibold">{g}</p>
                  <p className="text-[11px]">{ms.length} {ms.length === 1 ? "modelo" : "modelos"}</p>
                </button>
              ))}
            </div>
            <div className="overflow-y-auto p-2 space-y-1" role="listbox">
              {(groups.find(([g]) => g === activeGrp)?.[1] ?? []).map(m => {
                const acc = accessOf(m, { isAdmin, comunidad });
                const K = KIND_ICON[m.kind];
                const pick = () => {
                  if (acc === "comunidad") { onUpsell(m); return; }
                  if (acc !== "ok") return;
                  onChange(m.id); setOpen(false);
                };
                return (
                  <button key={m.id} role="option" aria-selected={value === m.id} onClick={pick} disabled={acc === "soon"}
                    className={`w-full text-left rounded-xl px-3 py-2.5 flex items-start gap-3 transition-colors disabled:opacity-60 ${value === m.id ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-secondary/50"}`}>
                    <span className="w-8 h-8 shrink-0 rounded-lg bg-secondary grid place-items-center text-muted-foreground"><K className="w-4 h-4" /></span>
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[14px] font-semibold text-foreground">{m.label}</span>
                        {m.recommended && <span className="text-[10px] font-bold rounded px-1.5 py-0.5 bg-success/15 text-success">RECOMENDADO</span>}
                        {m.tier === "comunidad" && <span className="text-[10px] font-bold rounded px-1.5 py-0.5 bg-primary/15 text-primary inline-flex items-center gap-1"><Crown className="w-3 h-3" />COMUNIDAD</span>}
                        {acc === "soon" && <span className="text-[10px] font-bold rounded px-1.5 py-0.5 bg-secondary text-muted-foreground">PRONTO</span>}
                        {m.status === "admin" && isAdmin && <span className="text-[10px] font-bold rounded px-1.5 py-0.5 bg-sky-500/15 text-sky-400">PRUEBA</span>}
                      </span>
                      <span className="block text-[12px] text-muted-foreground mt-0.5">{m.description}</span>
                      <span className="block text-[11px] text-muted-foreground/80 mt-0.5">
                        {m.cost != null ? `${m.cost} créditos` : "Precio por definir"}{m.seconds ? ` · ${m.seconds} s` : ""}
                      </span>
                    </span>
                    {acc === "comunidad" ? <Lock className="w-4 h-4 text-primary mt-1" /> : value === m.id ? <Check className="w-4 h-4 text-primary mt-1" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
