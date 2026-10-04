import { Clapperboard, Copy, Download, Loader2, RefreshCw, Youtube } from "lucide-react";
import type { Aspect } from "@/lib/imagePrompts";

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

const iconBtn = "h-9 min-w-9 px-2 rounded-full border border-border inline-flex items-center justify-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-50";
const wideBtn = "w-full min-h-9 px-3 py-1.5 rounded-xl border border-border inline-flex items-center gap-2 text-left text-[12px] leading-tight text-muted-foreground hover:text-foreground";

/** Una imagen del estudio con sus acciones: descargar, rehacer, variar, animar (y usar en YouTube). */
export function ImageSlotCard({ slot, price, locked, onDownload, onRedo, onVary, onAnimate, onYoutube }: {
  slot: Slot; price: number; locked: boolean;
  onDownload: () => void; onRedo: () => void; onVary?: () => void; onAnimate?: () => void; onYoutube?: () => void;
}) {
  const s = slot;
  return (
    <div className="rounded-2xl border border-border overflow-hidden bg-card/40 min-w-0">
      <div className={`relative bg-secondary/30 ${ratio(s.aspect)}`}>
        {s.url ? <img src={s.url} alt={s.label} className="w-full h-full object-cover" />
          : s.status === "error" ? <p className="absolute inset-0 m-auto h-fit px-3 text-center text-[12px] text-muted-foreground">{s.error}</p>
          : <Loader2 className={`absolute inset-0 m-auto w-6 h-6 text-muted-foreground ${s.status === "busy" ? "animate-spin" : "opacity-30"}`} />}
      </div>
      <div className="p-3 space-y-2">
        <p className="text-[12px] text-foreground truncate">{s.label}</p>
        <div className="flex flex-wrap gap-1.5">
          {s.url && (
            <button type="button" onClick={onDownload} aria-label="Descargar" title="Descargar" className={iconBtn}>
              <Download className="w-4 h-4" />
            </button>
          )}
          {(s.status === "done" || s.status === "error") && (
            <button type="button" onClick={onRedo} disabled={locked} title={`Rehacer · ${price} créditos`} aria-label={`Rehacer, ${price} créditos`} className={iconBtn}>
              <RefreshCw className="w-4 h-4" /><span>{price}</span>
            </button>
          )}
          {s.status === "done" && s.path && onVary && (
            <button type="button" onClick={onVary} disabled={locked} title={`Variar · ${price} créditos`} aria-label={`Variar, ${price} créditos`} className={iconBtn}>
              <Copy className="w-4 h-4" /><span>Variar · {price}</span>
            </button>
          )}
        </div>
        {s.status === "done" && s.path && (onAnimate || onYoutube) && (
          <div className="flex flex-col gap-1.5">
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
    </div>
  );
}
