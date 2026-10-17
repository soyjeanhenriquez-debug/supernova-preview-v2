import { useState } from "react";
import { toast } from "sonner";
import { Player } from "@remotion/player";
import { Download, Film, Loader2 } from "lucide-react";
import { CarouselVideo, carouselFrames, carouselSize, FPS, type CarouselAnim, type CarouselVideoProps } from "@/remotion/CarouselVideo";

/**
 * "Animar mi carrusel" (opcional, 17-oct-2026): convierte las láminas ya diseñadas en un video para Reels
 * o para el feed. Gratis: se arma en el navegador; no se sube nada.
 */
const ANIMS: { id: CarouselAnim; label: string }[] = [{ id: "deslizar", label: "Deslizar" }, { id: "zoom", label: "Zoom suave" }, { id: "aparecer", label: "Aparecer" }];

export function AnimateCarousel({ getFrames, count, aspect, brand }: { getFrames: () => Promise<string[]>; count: number; aspect: "4:5" | "1:1"; brand: string }) {
  const [frames, setFrames] = useState<string[]>([]);
  const [anim, setAnim] = useState<CarouselAnim>("deslizar");
  const [per, setPer] = useState(3);
  const [format, setFormat] = useState<"reel" | "feed">("reel");
  const [busy, setBusy] = useState<"" | "preparando" | "armando">("");
  const [pct, setPct] = useState(0);

  const props: CarouselVideoProps = { frames, per, anim, format, brand, aspect };
  const size = carouselSize(format, aspect);
  const durationInFrames = carouselFrames(frames.length, per);

  const prepare = async () => {
    setBusy("preparando");
    try { setFrames(await getFrames()); } catch { toast.error("No se pudieron preparar las láminas."); } finally { setBusy(""); }
  };
  const download = async () => {
    setBusy("armando"); setPct(0);
    try {
      const { renderMediaOnWeb } = await import("@remotion/web-renderer");
      const composition = { id: "carrusel", component: CarouselVideo, durationInFrames, fps: FPS, ...size, defaultProps: props };
      const r = await renderMediaOnWeb({ composition, inputProps: props, container: "mp4", videoCodec: "h264", onProgress: p => setPct(Math.round(p.progress * 100)) });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await r.getBlob()); a.download = `carrusel-animado-${format}.mp4`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      toast.error("Tu navegador no pudo armar el video. Prueba en Chrome de computadora.");
    } finally { setBusy(""); }
  };

  return (
    <details className="group rounded-xl border border-border p-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] text-foreground">
        <Film className="w-4 h-4 text-primary" /> Animar mi carrusel <span className="text-muted-foreground">(opcional · video para Reels o feed, gratis)</span>
      </summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          {ANIMS.map(a => <button key={a.id} type="button" aria-pressed={anim === a.id} onClick={() => setAnim(a.id)} className={`min-h-[40px] rounded-full border px-3.5 text-[13px] ${anim === a.id ? "border-foreground/40 bg-card text-foreground" : "border-border text-muted-foreground"}`}>{a.label}</button>)}
          {([["reel", "Reel 9:16"], ["feed", "Feed"]] as const).map(([id, l]) => <button key={id} type="button" aria-pressed={format === id} onClick={() => setFormat(id)} className={`min-h-[40px] rounded-full border px-3.5 text-[13px] ${format === id ? "border-foreground/40 bg-card text-foreground" : "border-border text-muted-foreground"}`}>{l}</button>)}
          <label className="inline-flex min-h-[40px] items-center gap-2 text-[13px] text-muted-foreground">Segundos por lámina
            <select value={per} onChange={e => setPer(Number(e.target.value))} className="rounded-lg border border-border bg-background px-2 py-1 text-foreground">{[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select>
          </label>
        </div>
        {!frames.length ? (
          <button type="button" onClick={() => void prepare()} disabled={!!busy} className="btn-primary-nova inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-[13px] font-semibold disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />} Ver mis {count} láminas animadas
          </button>
        ) : (
          <>
            <div className="mx-auto overflow-hidden rounded-xl bg-black" style={{ aspectRatio: `${size.width} / ${size.height}`, width: `min(100%, 300px)` }}>
              <Player component={CarouselVideo} inputProps={props} durationInFrames={durationInFrames} fps={FPS} compositionWidth={size.width} compositionHeight={size.height} controls loop autoPlay style={{ width: "100%", height: "100%" }} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void download()} disabled={!!busy} className="btn-primary-nova inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-[13px] font-semibold disabled:opacity-60">
                {busy === "armando" ? <><Loader2 className="w-4 h-4 animate-spin" /> Armando {pct} %</> : <><Download className="w-4 h-4" /> Descargar video · gratis</>}
              </button>
              <button type="button" onClick={() => void prepare()} disabled={!!busy} className="min-h-[44px] rounded-xl border border-border px-3 text-[13px] text-foreground">Actualizar con mis cambios</button>
            </div>
          </>
        )}
        <p className="text-[11px] text-muted-foreground">Se arma en tu navegador con las mismas láminas que descargas. No se sube nada y no gasta créditos.</p>
      </div>
    </details>
  );
}
