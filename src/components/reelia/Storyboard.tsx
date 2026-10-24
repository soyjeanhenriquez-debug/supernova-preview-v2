import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Film, GripVertical, ImageIcon, Loader2, Minus, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { FORMAS, MAX_ANIMADAS, PRICES, costoPlano, intercambiar, moverCorte, quitarPlano, type Forma, type Pantalla, type Plano, type Reel, type Tiempo } from "@/lib/reelDinamico";

/**
 * Storyboard visual de Reel Studio (25-oct-2026): una tarjeta por plano con su miniatura, número, duración, el trozo
 * de narración, el tipo, el estado de producción y lo que cuesta. Arrastrar una tarjeta sobre otra intercambia lo que
 * SE VE (el texto y la voz se quedan en su lugar). Al tocar una tarjeta se edita: tipo, look, clip, imagen, animación,
 * duración, quitar o regenerar. Los subtítulos se editan en su propia capa.
 */
export type Estado = "pendiente" | "trabajando" | "listo" | "falló";
export type Medio = { url: string; video: boolean } | null;

export function Storyboard(p: {
  reel: Reel;
  t: Tiempo[] | null;
  busy: boolean;
  thumb: (i: number) => Medio;
  refThumb: (ref: number) => string | null;
  estado: (i: number) => Estado | undefined;
  lookThumb: (k: number) => string | null;
  clips: { id: string; desc: string; item: { url: string; video: boolean } }[];
  onPlanos: (planos: Plano[]) => void;
  onRegenerar: (i: number) => void;
  onSubirClip: () => void;
  subs: Pantalla[] | null;
  onSub: (t0: number, texto: string) => void;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [capa, setCapa] = useState<"planos" | "subs">("planos");
  const { reel } = p;
  const animadas = reel.planos.filter(x => x.animar).length;
  const primerLook = new Map<number, number>();
  reel.planos.forEach((x, i) => { if ((x.forma === "tu" || x.forma === "dividida") && !primerLook.has(x.look)) primerLook.set(x.look, i); });
  const dur = (i: number) => (p.t ? p.t[i].t1 - p.t[i].t0 : reel.planos[i].texto.split(/\s+/).length / 2.7);
  const set = (i: number, patch: Partial<Plano>) => p.onPlanos(reel.planos.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const s = sel !== null ? reel.planos[sel] : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {(["planos", "subs"] as const).map(c => (
          <button key={c} type="button" onClick={() => setCapa(c)}
            className={`h-9 px-3 rounded-full border text-[12px] ${capa === c ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground"}`}>
            {c === "planos" ? `Planos (${reel.planos.length})` : "Subtítulos"}
          </button>
        ))}
        {capa === "planos" && <span className="ml-auto text-[11px] text-muted-foreground hidden sm:inline">Arrastra una tarjeta sobre otra para cambiar lo que se ve. La voz no se mueve.</span>}
      </div>

      {capa === "subs" ? (
        p.subs ? (
          <div className="space-y-1.5 max-h-[52dvh] overflow-y-auto pr-1">
            {p.subs.map(x => (
              <label key={x.t0} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="w-12 shrink-0 tabular-nums">{x.t0.toFixed(1).replace(".", ",")} s</span>
                <input defaultValue={x.texto} onBlur={e => p.onSub(x.t0, e.target.value)} maxLength={30}
                  className={`flex-1 min-h-[36px] rounded-lg border bg-background px-2 text-[13px] ${x.enfasis ? "border-primary/60 text-foreground" : "border-border text-foreground"}`} />
              </label>
            ))}
          </div>
        ) : <p className="text-[12px] text-muted-foreground">Los subtítulos salen de tu voz con el tiempo exacto de cada palabra: aparecen aquí cuando generes la voz.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {reel.planos.map((x, i) => {
            const m = p.thumb(i);
            const ref = x.ref >= 0 ? p.refThumb(x.ref) : null;
            const e = p.estado(i);
            const cr = costoPlano(x) + (primerLook.get(x.look) === i ? PRICES.look : 0);
            return (
              <button key={i} type="button" draggable={!p.busy}
                onDragStart={() => setDrag(i)} onDragOver={ev => ev.preventDefault()}
                onDrop={() => { if (drag !== null && drag !== i) p.onPlanos(intercambiar(reel.planos, drag, i)); setDrag(null); }}
                onClick={() => setSel(sel === i ? null : i)}
                className={`group relative text-left rounded-xl overflow-hidden border bg-card ${sel === i ? "border-primary" : "border-border hover:border-foreground/30"} ${drag === i ? "opacity-50" : ""}`}>
                <div className="relative aspect-[9/16] bg-secondary/40">
                  {m ? (m.video ? <video src={m.url} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
                    : <img src={m.url} alt="" className="absolute inset-0 w-full h-full object-cover" />)
                    : ref ? <img src={ref} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40 grayscale" />
                    : <div className="absolute inset-0 flex items-center justify-center text-muted-foreground"><ImageIcon className="w-5 h-5" /></div>}
                  {x.forma === "dividida" && <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-white/60" />}
                  <span className="absolute top-1 left-1 rounded-md bg-black/70 px-1.5 text-[10px] font-semibold text-white">{i + 1}</span>
                  <span className="absolute top-1 right-1 rounded-md bg-black/70 px-1.5 text-[10px] text-white tabular-nums">{dur(i).toFixed(1).replace(".", ",")} s</span>
                  <GripVertical className="absolute bottom-1 right-1 w-3.5 h-3.5 text-white/70 hidden sm:block" />
                  <span className="absolute bottom-1 left-1">
                    {e === "listo" ? <Check className="w-3.5 h-3.5 text-primary drop-shadow" /> : e === "trabajando" ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" /> : e === "falló" ? <span className="rounded bg-red-600 px-1 text-[9px] text-white">falló</span> : null}
                  </span>
                </div>
                <div className="p-1.5 space-y-0.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{FORMAS[x.forma]}{x.animar ? " · animada" : ""}{cr ? ` · ${cr} cr` : ""}</p>
                  <p className="text-[11px] leading-snug text-foreground line-clamp-2">{x.texto}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {capa === "planos" && s && sel !== null && (
        <div className="rounded-2xl border border-border p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-foreground">Plano {sel + 1}</p>
            <div className="flex gap-1">
              <button type="button" aria-label="Cambiar con el anterior" disabled={p.busy || sel === 0} onClick={() => { p.onPlanos(intercambiar(reel.planos, sel, sel - 1)); setSel(sel - 1); }} className="h-8 w-8 rounded-lg border border-border flex items-center justify-center disabled:opacity-40"><ArrowLeft className="w-4 h-4" /></button>
              <button type="button" aria-label="Cambiar con el siguiente" disabled={p.busy || sel === reel.planos.length - 1} onClick={() => { p.onPlanos(intercambiar(reel.planos, sel, sel + 1)); setSel(sel + 1); }} className="h-8 w-8 rounded-lg border border-border flex items-center justify-center disabled:opacity-40"><ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
          <p className="text-[13px] text-foreground">«{s.texto}»</p>
          <p className="text-[11px] text-muted-foreground">El texto es parte de tu voz: para cambiarlo, pide el cambio de guion arriba.</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(FORMAS) as Forma[]).map(f => (
              <button key={f} type="button" disabled={p.busy || (f === "app" && !p.clips.length)}
                onClick={() => set(sel, f === "tu" ? { forma: f, clip: "", visual: "", animar: false }
                  : f === "app" ? { forma: f, clip: s.clip || p.clips[0]?.id || "", visual: "", animar: false }
                  : f === "broll" ? { forma: f, clip: "", visual: s.visual || `A cinematic shot that represents: ${s.texto}` }
                  : { forma: f, visual: s.clip ? "" : s.visual || `A cinematic shot that represents: ${s.texto}` })}
                className={`h-8 px-3 rounded-full border text-[12px] disabled:opacity-40 ${s.forma === f ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground"}`}>{FORMAS[f]}</button>
            ))}
          </div>
          {(s.forma === "tu" || s.forma === "dividida") && reel.looks.length > 1 && (
            <div className="flex gap-2">
              {reel.looks.map((l, k) => {
                const u = p.lookThumb(k);
                return (
                  <button key={k} type="button" title={l.escena} disabled={p.busy} onClick={() => set(sel, { look: k })}
                    className={`w-12 h-20 rounded-lg overflow-hidden border text-[10px] text-muted-foreground ${s.look === k ? "border-primary" : "border-border"}`}>
                    {u ? <img src={u} alt="" className="w-full h-full object-cover" /> : `Look ${k + 1}`}
                  </button>
                );
              })}
            </div>
          )}
          {(s.forma === "app" || s.forma === "dividida") && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground">{s.forma === "dividida" ? "Arriba: un clip de tu biblioteca o una imagen con IA" : "Clip de tu app"}</p>
              <div className="flex flex-wrap gap-2">
                {p.clips.map(c => (
                  <button key={c.id} type="button" title={c.desc} disabled={p.busy} onClick={() => set(sel, { clip: c.id, visual: "", animar: false })}
                    className={`w-12 h-20 rounded-lg overflow-hidden border ${s.clip === c.id ? "border-primary" : "border-border"}`}>
                    {c.item.video ? <video src={c.item.url} muted playsInline preload="metadata" className="w-full h-full object-cover object-top" /> : <img src={c.item.url} alt="" className="w-full h-full object-cover object-top" />}
                  </button>
                ))}
                <button type="button" onClick={p.onSubirClip} disabled={p.busy} className="w-12 h-20 rounded-lg border border-dashed border-border flex flex-col items-center justify-center text-[10px] text-muted-foreground"><Upload className="w-4 h-4" />Subir</button>
                {s.forma === "dividida" && s.clip && (
                  <button type="button" onClick={() => set(sel, { clip: "", visual: `A cinematic shot that represents: ${s.texto}` })} disabled={p.busy}
                    className="w-12 h-20 rounded-lg border border-border flex flex-col items-center justify-center text-[10px] text-muted-foreground"><Film className="w-4 h-4" />Imagen IA</button>
                )}
              </div>
            </div>
          )}
          {s.visual && (
            <div className="space-y-1.5">
              <label className="block text-[11px] text-muted-foreground">Cómo se ve (en inglés, como un plano de cine)
                <textarea defaultValue={s.visual} key={`${sel}-${s.visual}`} rows={3} onBlur={e => e.target.value.trim() && e.target.value !== s.visual && set(sel, { visual: e.target.value.slice(0, 400) })} disabled={p.busy}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[12px] text-foreground" />
              </label>
              <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <input type="checkbox" checked={s.animar} disabled={p.busy || (!s.animar && animadas >= MAX_ANIMADAS)} onChange={e => set(sel, { animar: e.target.checked })} />
                Animar ({PRICES.animar} créditos){!s.animar && animadas >= MAX_ANIMADAS ? ` · máximo ${MAX_ANIMADAS}` : ""}
              </label>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={p.busy || sel === reel.planos.length - 1} onClick={() => p.onPlanos(moverCorte(reel.planos, sel, -1))}
              className="h-9 px-3 rounded-full border border-border text-[12px] text-foreground disabled:opacity-40"><Minus className="inline w-3.5 h-3.5 mr-1" />Más corto</button>
            <button type="button" disabled={p.busy || sel === reel.planos.length - 1} onClick={() => p.onPlanos(moverCorte(reel.planos, sel, 1))}
              className="h-9 px-3 rounded-full border border-border text-[12px] text-foreground disabled:opacity-40"><Plus className="inline w-3.5 h-3.5 mr-1" />Más largo</button>
            {s.visual && <button type="button" disabled={p.busy} onClick={() => p.onRegenerar(sel)} className="h-9 px-3 rounded-full border border-border text-[12px] text-foreground disabled:opacity-40"><RefreshCw className="inline w-3.5 h-3.5 mr-1" />Regenerar</button>}
            <button type="button" disabled={p.busy || reel.planos.length <= 3} onClick={() => { p.onPlanos(quitarPlano(reel.planos, sel)); setSel(null); }}
              className="h-9 px-3 rounded-full border border-border text-[12px] text-muted-foreground disabled:opacity-40"><Trash2 className="inline w-3.5 h-3.5 mr-1" />Quitar plano</button>
          </div>
          <p className="text-[11px] text-muted-foreground">Cambiar la duración mueve una palabra al plano siguiente. Si ese tramo ya tenía tu toma hablando, se vuelve a hacer.</p>
        </div>
      )}
    </div>
  );
}
