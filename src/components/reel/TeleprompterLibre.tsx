import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Play, ScrollText, Trash2 } from "lucide-react";
import { Teleprompter } from "@/components/reel/Teleprompter";
import { promptLines, speakSeconds } from "@/lib/reel";

/**
 * Teleprompter libre (19-oct-2026, pedido de Jean): pegas cualquier texto (un guion tuyo, uno de otra
 * herramienta, un discurso) y lo lees en el mismo teleprompter de Analiza un Reel. No usa IA
 * ni créditos y el texto no sale de tu navegador. Se recuerda el último texto en este dispositivo.
 * Dirección: #/con-tu-cara/teleprompter
 */
const DRAFT_KEY = "supernova.teleprompter.texto";
const MAX = 20_000;

export function TeleprompterLibre({ onHome }: { onHome: () => void }) {
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(DRAFT_KEY) ?? ""; } catch { return ""; }
  });
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { if (text) localStorage.setItem(DRAFT_KEY, text); else localStorage.removeItem(DRAFT_KEY); } catch { /* sin almacenamiento */ }
  }, [text]);
  const lines = useMemo(() => promptLines(text), [text]);
  const over = text.length > MAX;

  return (
    <div className="max-w-3xl space-y-4 pb-28 sm:pb-8">
      <button type="button" onClick={onHome} className="inline-flex min-h-[40px] items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Con tu cara
      </button>
      <header className="space-y-1">
        <h1 className="font-display font-bold text-2xl text-foreground flex items-center gap-2"><ScrollText className="w-5 h-5 text-primary" /> Teleprompter</h1>
        <p className="text-sm text-muted-foreground">Pega tu texto y léelo mirando a la cámara. El texto se queda en tu dispositivo.</p>
      </header>

      <div className="card-surface rounded-2xl p-4 space-y-2">
        <label htmlFor="tp-texto" className="block text-[15px] font-semibold text-foreground">Tu texto</label>
        <p className="text-[12px] text-muted-foreground">Cada salto de línea es un párrafo. Ej.: pega el guion de tu próximo Reel o tu discurso.</p>
        <textarea id="tp-texto" value={text} onChange={e => setText(e.target.value)} rows={12} aria-invalid={over}
          placeholder={"Pega aquí lo que vas a decir.\n\nUna idea por línea se lee mejor."}
          className={`w-full resize-y rounded-xl border bg-background px-3 py-2.5 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${over ? "border-destructive" : "border-border"}`} />
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
          <span>{lines.length ? `${lines.length} párrafos · ≈ ${speakSeconds(lines)} s hablando` : "Todavía no hay texto."}</span>
          <span className="flex items-center gap-3">
            {over && <span role="alert" className="text-destructive">Es muy largo: hasta {MAX.toLocaleString("es-DO")} caracteres.</span>}
            {text && (
              <button type="button" onClick={() => setText("")} className="inline-flex min-h-[36px] items-center gap-1 hover:text-foreground"><Trash2 className="w-3.5 h-3.5" /> Borrar</button>
            )}
          </span>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <button type="button" onClick={() => setOpen(true)} disabled={!lines.length || over}
          className="btn-primary-nova inline-flex w-full sm:w-auto min-h-[52px] items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold disabled:opacity-50">
          <Play className="w-4 h-4" /> Abrir el teleprompter
        </button>
      </div>
      <p className="text-[12px] text-muted-foreground">Dentro: toca el texto o la barra espaciadora para pausar, ajusta la letra y la velocidad. Esc para salir.</p>

      {open && <Teleprompter lines={lines} ganchos={[]} hook={0} onHook={() => undefined} onClose={() => setOpen(false)} />}
    </div>
  );
}
