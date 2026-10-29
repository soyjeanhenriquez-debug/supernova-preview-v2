import { useId, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, ArrowRight, Check, ChevronDown, Fingerprint, Loader2, Lock, Pencil, Trash2 } from "lucide-react";
import {
  charCount, DNA_FIELDS, dnaErrors, dnaProgress, isAnswered, useBrandDna, useEditorialPrefs, type DnaField, type SaveState,
} from "@/lib/brandDna";
import { AgenteFirma } from "@/components/agentes/AgenteFirma";
import { SiguientePaso } from "@/components/agentes/SiguientePaso";

/**
 * "Tu ADN" (19-oct-2026, ADN de marca 2.0): quién eres y cómo comunicas, una sola vez. Lo usan los
 * modelos de Reels y carruseles, y solo la parte que cada modo necesita (brandDna.ts → brandContext).
 * 6 preguntas esenciales siempre a la vista y 8 opcionales en acordeones, cerradas. Se guarda solo.
 * La pregunta 8 es privada: no entra a ningún texto hasta que la persona active "uso editorial".
 */
export function BrandDnaPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { dna, loaded, state, set, flush } = useBrandDna();
  const prefs = useEditorialPrefs();
  const [deepOpen, setDeepOpen] = useState(false);
  if (!loaded) return <div className="p-6 text-sm text-muted-foreground"><Loader2 className="inline w-4 h-4 animate-spin mr-2" />Cargando tu ADN…</div>;

  const progress = dnaProgress(dna);
  const errors = dnaErrors(dna);
  const essentials = DNA_FIELDS.filter(f => f.essential);
  const optional = DNA_FIELDS.filter(f => !f.essential);
  const firstMissing = essentials.find(f => !isAnswered(f, dna[f.key]));

  const saveAndGo = async () => {
    const ok = await flush();
    if (!ok) { toast.error("No se guardó, revisa tu conexión."); return; }
    if (Object.keys(errors).length) { toast.error("Hay una respuesta muy larga. Acórtala y se guarda sola."); return; }
    // Misión de Eco (29-oct-2026): ninguna pregunta frena. Lo que falta se completa después; mientras, se usa lo que hay.
    if (firstMissing) toast.success("Guardado", { description: "Lo que falta lo completas cuando quieras. Mientras, usamos lo que ya sabemos." });
    else toast.success("Tu ADN está listo", { description: "Pruébalo modelando un Reel." });
    onNavigate?.("Con tu cara");
  };
  // El sí de la tarjeta de cierre: guarda y abre a Zeus (Reel Studio) para el primer reel con su voz.
  const irAZeus = async () => {
    if (!(await flush())) { toast.error("No se guardó, revisa tu conexión."); return; }
    window.location.hash = "#/con-tu-cara/reel-ia"; window.scrollTo({ top: 0 });
  };

  return (
    <div className="max-w-3xl space-y-5 pb-28 sm:pb-8">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wider text-primary font-semibold">Tu ADN</p>
        <AgenteFirma agente="voz" />
        <h1 className="font-display font-bold text-2xl text-foreground flex items-center gap-2"><Fingerprint className="w-5 h-5 text-primary" /> Cómo eres y cómo hablas</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">Lo llenas una vez y lo que dejes en blanco se completa después. SUPERNOVA lo usa para que lo que modelas suene a ti, sin cambiar el tema de lo que tomas como referencia.</p>
      </header>

      <div className="card-surface rounded-2xl p-4 space-y-2" aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{progress.message}</p>
          <SaveBadge state={state} />
        </div>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.pct} aria-label="Tu ADN">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress.pct}%` }} />
        </div>
      </div>

      <section className="space-y-4" aria-label="Preguntas esenciales">
        {essentials.map(f => (
          <Question key={f.key} f={f} value={dna[f.key]} error={errors[f.key]} onChange={v => set(f.key, v)} onBlur={() => void flush()} />
        ))}
      </section>

      <section className="card-surface rounded-2xl">
        <button type="button" onClick={() => setDeepOpen(o => !o)} aria-expanded={deepOpen} aria-controls="adn-profundiza"
          className="w-full min-h-[56px] px-4 py-3 flex items-center justify-between gap-3 text-left rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <span>
            <span className="block text-sm font-semibold text-foreground">✦ Profundiza en tu ADN — 8 preguntas opcionales</span>
            <span className="block text-[12px] text-muted-foreground">Lo que has vivido, lo que te diferencia y cómo hablas. Con esto, SUPERNOVA escribe más como tú. · {progress.optional} de 8 respondidas</span>
          </span>
          <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${deepOpen ? "rotate-180" : ""}`} />
        </button>
        {deepOpen && (
          <div id="adn-profundiza" className="border-t border-border divide-y divide-border">
            {optional.map(f => (
              <details key={f.key} className="group px-4">
                <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 py-3 text-[14px] text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded">
                  <span className="flex items-start gap-2">
                    {isAnswered(f, dna[f.key]) ? <Check className="mt-0.5 w-4 h-4 shrink-0 text-emerald-400" aria-label="Respondida" /> : <span className="mt-0.5 w-4 h-4 shrink-0 rounded-full border border-border" aria-hidden />}
                    <span>{f.n}. {f.question}{f.key === "formative_experiences" && <Lock className="inline w-3.5 h-3.5 ml-1.5 text-muted-foreground" aria-label="Privada" />}</span>
                  </span>
                  <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="pb-4 space-y-3">
                  <Question f={f} value={dna[f.key]} error={errors[f.key]} onChange={v => set(f.key, v)} onBlur={() => void flush()} bare />
                  {f.key === "formative_experiences" && (
                    <label className="flex items-start gap-3 rounded-xl border border-border p-3 cursor-pointer">
                      <input type="checkbox" checked={dna.formative_editorial_ok} onChange={e => set("formative_editorial_ok", e.target.checked, true)}
                        className="mt-1 h-5 w-5 accent-[hsl(var(--primary))]" />
                      <span className="text-[13px]">
                        <span className="block font-semibold text-foreground">Usar esta respuesta en mi contenido</span>
                        <span className="block text-muted-foreground">{dna.formative_editorial_ok ? "Activado: puede aparecer cuando encaje con el tema. Lo quitas cuando quieras." : "Apagado: es privada y SUPERNOVA no la usa en nada."}</span>
                      </span>
                    </label>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      {/* Misión de Eco: con 3 esenciales ya hay con qué escribir en su voz. Ulises todavía no tiene pantalla: va a Zeus. */}
      {progress.essentials >= 3 && <SiguientePaso agente="voz" hacia="reels" pregunta="¿Hacemos ya tu primer reel con tu voz?" onIr={() => void irAZeus()} />}

      <PrefsSection prefs={prefs} />

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <button type="button" onClick={saveAndGo}
          className="btn-primary-nova inline-flex w-full sm:w-auto min-h-[52px] items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold">
          Guardar y continuar <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "saving") return <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando…</span>;
  if (state === "saved") return <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground"><Check className="w-3.5 h-3.5 text-emerald-400" /> Guardado</span>;
  if (state === "error") return <span role="alert" className="inline-flex items-center gap-1 text-[12px] text-destructive"><AlertCircle className="w-3.5 h-3.5" /> No se guardó, revisa tu conexión</span>;
  return null;
}

/** Una pregunta: textarea que crece sola, contador en caracteres reales y ayuda de una línea. */
function Question({ f, value, error, onChange, onBlur, bare }: {
  f: DnaField; value: string; error?: string; onChange: (v: string) => void; onBlur: () => void; bare?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const helpId = useId();
  const n = charCount(value);
  const short = f.essential && n > 0 && charCount(value.trim()) < 20;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 420)}px`;
  }, [value]);
  const body = (
    <>
      {!bare && <label htmlFor={`adn-${f.key}`} className="block text-[15px] font-semibold text-foreground">{f.n}. {f.question}</label>}
      <p id={helpId} className="text-[12px] text-muted-foreground">{f.help}</p>
      <textarea id={`adn-${f.key}`} ref={ref} value={value} rows={3} aria-label={bare ? f.question : undefined}
        aria-describedby={`${helpId} ${f.key}-count`} aria-invalid={!!error}
        onChange={e => onChange(e.target.value)} onBlur={onBlur}
        className={`w-full resize-none rounded-xl border bg-background px-3 py-2.5 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${error ? "border-destructive" : "border-border focus:border-primary/60"}`} />
      <div className="flex items-start justify-between gap-3 text-[12px]">
        <span role={error ? "alert" : undefined} className={error ? "text-destructive" : "text-muted-foreground"}>
          {error ?? (short ? "Escribe al menos 20 caracteres para darla por respondida." : "")}
        </span>
        <span id={`${f.key}-count`} className={`tabular-nums shrink-0 ${n > f.max ? "text-destructive" : "text-muted-foreground"}`}>{n.toLocaleString("es-DO")}/{f.max.toLocaleString("es-DO")}</span>
      </div>
    </>
  );
  return bare ? <div className="space-y-1.5">{body}</div> : <div className="card-surface rounded-2xl p-4 space-y-1.5">{body}</div>;
}

function PrefsSection({ prefs }: { prefs: ReturnType<typeof useEditorialPrefs> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  if (!prefs.prefs.length) return (
    <div className="rounded-2xl border border-dashed border-border p-4 text-[13px] text-muted-foreground">
      <p className="font-semibold text-foreground">Tus preferencias editoriales</p>
      <p>Todavía no guardas ninguna. Cuando modeles un Reel o un carrusel, toca «Guardar como preferencia» en tu toque personal y aparece aquí.</p>
    </div>
  );
  return (
    <div className="card-surface rounded-2xl p-4 space-y-2">
      <p className="text-sm font-semibold text-foreground">Tus preferencias editoriales</p>
      <p className="text-[12px] text-muted-foreground">Se aplican a todo lo que modelas. Lo que pidas en una generación gana sobre ellas.</p>
      <ul className="space-y-2">
        {prefs.prefs.map(p => (
          <li key={p.id} className="rounded-xl border border-border p-3 text-[13px]">
            {editing === p.id ? (
              <div className="space-y-2">
                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} aria-label="Editar preferencia"
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[14px] text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60" />
                <div className="flex items-center gap-2">
                  <button type="button" disabled={charCount(draft.trim()) < 3 || charCount(draft) > 300}
                    onClick={async () => { const err = await prefs.update(p.id, draft); if (err) toast.error(err); else setEditing(null); }}
                    className="btn-primary-nova min-h-[40px] rounded-lg px-3 text-[13px] font-semibold disabled:opacity-50">Guardar</button>
                  <button type="button" onClick={() => setEditing(null)} className="min-h-[40px] rounded-lg px-3 text-[13px] text-muted-foreground hover:text-foreground">Cancelar</button>
                  <span className="ml-auto tabular-nums text-[12px] text-muted-foreground">{charCount(draft)}/300</span>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <p className="flex-1 text-foreground">{p.text}</p>
                <button type="button" aria-label="Editar preferencia" onClick={() => { setEditing(p.id); setDraft(p.text); }} className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"><Pencil className="w-4 h-4" /></button>
                <button type="button" aria-label="Borrar preferencia" onClick={async () => { const err = await prefs.remove(p.id); if (err) toast.error(err); }} className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
