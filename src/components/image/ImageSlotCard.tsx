import { Clapperboard, Copy, Download, RefreshCw, Send, Youtube } from "lucide-react";
import { ASPECT_LABEL, type Aspect } from "@/lib/imagePrompts";

export type Slot = {
  id: string; label: string; prompt: string; aspect: Aspect;
  status: "idle" | "busy" | "done" | "error";
  url?: string; error?: string;
  /** Ruta guardada en "creativos" (sirve para variar y animar). */
  path?: string;
  /** Rutas de referencia con las que se hizo (se repiten al rehacer). */
  refs?: string[];
};

const ratio = (a: Aspect) => (a === "16:9" ? "aspect-video" : a === "9:16" ? "aspect-[9/16]" : a === "4:5" ? "aspect-[4/5]" : "aspect-square");

const actBtn = "min-h-[44px] rounded-xl border border-border inline-flex flex-col items-center justify-center gap-0.5 px-1 text-[11px] leading-tight text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-40 disabled:hover:text-muted-foreground";
const wideBtn = "w-full min-h-[44px] px-3 py-1.5 rounded-xl border border-border inline-flex items-center gap-2 text-left text-[12px] leading-tight text-muted-foreground hover:text-foreground";

/**
 * Esqueleto con el formato REAL de la imagen (12-oct-2026, R2-04): mientras la IA trabaja se ve el
 * marco 4:5, 1:1, 9:16 o 16:9 con la silueta de un anuncio (titular, imagen, botón), no un círculo
 * girando en una caja vacía. "En fila" cuando espera su turno (se crean de a una).
 */
function Skeleton({ aspect, busy }: { aspect: Aspect; busy: boolean }) {
  const pulse = busy ? "animate-pulse" : "";
  return (
    <div className="absolute inset-0 flex flex-col p-[8%] gap-[5%]" role="status" aria-live="polite">
      <div className={`h-[7%] w-[78%] rounded-md bg-foreground/10 ${pulse}`} />
      <div className={`h-[5%] w-[52%] rounded-md bg-foreground/10 ${pulse}`} />
      <div className={`flex-1 rounded-xl bg-foreground/[0.06] ${pulse}`} />
      <div className={`h-[7%] w-[38%] self-center rounded-full bg-foreground/10 ${pulse}`} />
      <p className="absolute inset-x-0 bottom-3 text-center text-[11px] text-muted-foreground">
        {busy ? "Creando… unos 40 segundos" : "En fila"} · {aspect}
      </p>
    </div>
  );
}

/**
 * Una imagen del estudio como tarjeta vertical: la imagen en su formato real y debajo 4 acciones
 * fijas (Descargar · Rehacer · Variar · Publicar). Animar y "Usar en YouTube" van aparte, debajo.
 */
export function ImageSlotCard({ slot, price, locked, onDownload, onRedo, onVary, onPublish, onAnimate, onYoutube }: {
  slot: Slot; price: number; locked: boolean;
  onDownload: () => void; onRedo: () => void; onVary?: () => void; onPublish?: () => void; onAnimate?: () => void; onYoutube?: () => void;
}) {
  const s = slot;
  const done = s.status === "done" && !!s.url;
  const canRedo = s.status === "done" || s.status === "error";
  const canVary = done && !!s.path && !!onVary;
  return (
    <article className="rounded-2xl border border-border overflow-hidden bg-card/40 min-w-0 flex flex-col" aria-label={s.label}>
      <div className={`relative bg-secondary/30 ${ratio(s.aspect)}`} title={ASPECT_LABEL[s.aspect]}>
        {s.url ? <img src={s.url} alt={s.label} className="w-full h-full object-cover" />
          : s.status === "error" ? <p className="absolute inset-0 m-auto h-fit px-4 text-center text-[12px] text-muted-foreground">{s.error}</p>
          : <Skeleton aspect={s.aspect} busy={s.status === "busy"} />}
      </div>
      <div className="p-3 space-y-2.5 flex-1 flex flex-col">
        <p className="text-[13px] text-foreground truncate">{s.label}</p>
        <div className="grid grid-cols-4 gap-1.5">
          <button type="button" onClick={onDownload} disabled={!done} aria-label="Descargar" className={actBtn}>
            <Download className="w-4 h-4" /><span>Descargar</span>
          </button>
          <button type="button" onClick={onRedo} disabled={locked || !canRedo} aria-label={`Rehacer, ${price} créditos`} title={`Rehacer · ${price} créditos`} className={actBtn}>
            <RefreshCw className="w-4 h-4" /><span>Rehacer · {price}</span>
          </button>
          <button type="button" onClick={onVary} disabled={locked || !canVary} aria-label={`Variar, ${price} créditos`} title={`3 versiones nuevas · ${price} créditos cada una`} className={actBtn}>
            <Copy className="w-4 h-4" /><span>Variar · {price}</span>
          </button>
          <button type="button" onClick={onPublish} disabled={!done || !onPublish} aria-label="Publicar" title="Texto del anuncio y pasos para subirla" className={actBtn}>
            <Send className="w-4 h-4" /><span>Publicar</span>
          </button>
        </div>
        {done && s.path && (onAnimate || onYoutube) && (
          <div className="flex flex-col gap-1.5 mt-auto">
            {onAnimate && (
              <button type="button" onClick={onAnimate} className={wideBtn}>
                <Clapperboard className="w-4 h-4 shrink-0" /><span>Animar este creativo</span>
              </button>
            )}
            {onYoutube && (
              <button type="button" onClick={onYoutube} className={wideBtn}>
                <Youtube className="w-4 h-4 shrink-0" /><span>Usar en mi video de YouTube</span>
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
