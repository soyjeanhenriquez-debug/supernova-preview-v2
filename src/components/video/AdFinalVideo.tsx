import { useEffect, useRef, useState } from "react";
import { Download, Film, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchJobFile } from "@/components/video/videoApi";
import { ClipOpenError, stitchClips, type Format, type MontageResult } from "@/lib/montage";
import { track } from "@/lib/analytics";

/**
 * "Armar video final" (11-oct-2026, prueba de Hany: el anuncio salía en 3 archivos sueltos). Baja cada toma a
 * través de la función (sin problemas de CORS), las une con su sonido en el navegador y deja UN archivo para
 * descargar. Gratis: no usa IA. Tarda lo que dura el video, porque se graba en tiempo real.
 */
export function AdFinalVideo({ jobIds, size, name }: { jobIds: string[]; size: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [left, setLeft] = useState<number | null>(null); // segundos que faltan (se graba en tiempo real)
  const [phase, setPhase] = useState<"bajando" | "uniendo">("bajando");
  const [out, setOut] = useState<(MontageResult & { url: string }) | null>(null);
  const [err, setErr] = useState<string | null>(null); // queda a la vista (un toast se pierde)
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => { abort.current?.abort(); if (out) URL.revokeObjectURL(out.url); }, [out]);

  const format: Format = size === "16:9" ? "16:9" : size === "1:1" ? "3:4" : "9:16";
  const build = async () => {
    if (busy) return;
    setBusy(true); setProgress(0); setLeft(null); setPhase("bajando"); setErr(null);
    abort.current = new AbortController();
    try {
      const clips = await Promise.all(jobIds.map(id => fetchJobFile(id)));
      setPhase("uniendo");
      const res = await stitchClips(clips, {
        format, signal: abort.current.signal,
        onProgress: (e, t) => { setProgress(t ? Math.round((e / t) * 100) : 0); setLeft(t ? Math.max(0, Math.ceil(t - e)) : null); },
      });
      setOut({ ...res, url: URL.createObjectURL(res.blob) });
      track("video_final_armado", { tomas: jobIds.length });
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        const msg = e instanceof Error ? e.message : "No se pudo armar el video final.";
        // ClipOpenError ya dice qué hacer (misión R2-05: antes se grababa negro sin avisar).
        const hint = e instanceof ClipOpenError ? "" : /navegador/i.test(msg) ? "Abre esta pantalla en Chrome o Safari actualizados, o descarga cada toma y únelas en CapCut." : "Prueba otra vez en unos segundos. Si sigue igual, descarga cada toma abajo y únelas en CapCut.";
        setErr([msg, hint].filter(Boolean).join(" "));
        toast.error(msg, hint ? { description: hint } : undefined);
      }
    } finally { setBusy(false); }
  };
  const busyLabel = phase === "bajando" ? "Bajando las tomas…" : `Uniendo… ${progress} %${left !== null ? ` · faltan ${left} s` : ""}`;

  return (
    <div className="rounded-2xl border border-border p-4 space-y-3 bg-card/40">
      <div className="flex flex-wrap items-center gap-3">
        <Film className="w-4 h-4 text-primary" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Tu anuncio en un solo video</p>
          <p className="text-[12px] text-muted-foreground">
            {out ? `Listo: un solo archivo de ${Math.round(out.seconds)} s con sus ${jobIds.length} tomas y su sonido.`
              : `Unimos las ${jobIds.length} tomas con su sonido en un archivo listo para subir. Gratis; tarda unos ${jobIds.length * 5 + 5} segundos (se graba en tiempo real: no cambies de pestaña).`}
          </p>
        </div>
        {!out && (
          <button onClick={() => void build()} disabled={busy} className="inline-flex items-center gap-2 h-10 px-4 rounded-full gradient-brand text-[13px] font-semibold text-primary-foreground disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />} {busy ? busyLabel : "Armar video final"}
          </button>
        )}
      </div>
      {err && !busy && !out && <p role="alert" className="text-[12px] text-muted-foreground border-l-2 border-primary/60 pl-3">{err}</p>}
      {out && (
        <div className="space-y-2">
          {/* Vertical: ancho de celular, no un bloque negro de pared a pared (prueba 11-oct-2026). */}
          <video src={out.url} controls playsInline className={`rounded-xl bg-black ${format === "16:9" ? "w-full aspect-video" : "w-full max-w-[300px] mx-auto aspect-[9/16]"}`} />
          <div className="flex flex-wrap items-center gap-2">
            <a href={out.url} download={`supernova-${name}.${out.ext}`} className="inline-flex items-center gap-2 h-10 px-4 rounded-full gradient-brand text-[13px] font-semibold text-primary-foreground">
              <Download className="w-4 h-4" /> Descargar video ({out.ext.toUpperCase()})
            </a>
            <button onClick={() => setOut(null)} className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full border border-border text-[12px] text-foreground hover:border-foreground/30">
              Armar de nuevo
            </button>
            <span className="text-[11px] text-muted-foreground">Descárgalo hoy: el archivo vive en este navegador.{out.ext === "webm" ? " Tu navegador lo grabó en WebM; para Meta y TikTok es mejor Chrome o Safari actualizados (MP4)." : ""}</span>
          </div>
        </div>
      )}
    </div>
  );
}
