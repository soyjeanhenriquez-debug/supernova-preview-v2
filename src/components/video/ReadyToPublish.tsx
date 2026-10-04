import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Play, Send } from "lucide-react";
import { toast } from "sonner";
import { PUBLISH_STEPS } from "@/lib/videoTemplates";
import { downloadVideo } from "./videoApi";

/**
 * "Listo para publicar" (gratis): ver todas las tomas seguidas, descargar cada una, copiar el texto
 * sugerido (siempre con "Personaje creado con IA") y 3 pasos para subirlo a Meta o TikTok.
 */
export function ReadyToPublish({ clips, text, name }: { clips: { url: string; label: string }[]; text: string; name: string }) {
  const [playing, setPlaying] = useState<number | null>(null);
  const [tab, setTab] = useState<"meta" | "tiktok">("meta");
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (playing === null || !ref.current) return;
    ref.current.src = clips[playing]?.url ?? "";
    void ref.current.play().catch(() => {});
  }, [playing, clips]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { toast.error("No se pudo copiar. Mantén presionado el texto para copiarlo."); }
  };
  const slug = name.replace(/\W+/g, "-").toLowerCase().replace(/^-|-$/g, "") || "video";

  return (
    <section className="rounded-2xl border border-border p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Send className="w-4 h-4 text-primary" />
        <h2 className="font-display text-lg font-semibold text-foreground">Listo para publicar</h2>
      </div>

      {clips.length > 1 && (
        <div className="space-y-2">
          <button onClick={() => setPlaying(0)} className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-border text-[13px] font-semibold text-foreground hover:border-foreground/30">
            <Play className="w-4 h-4" /> Ver todo seguido
          </button>
          {playing !== null && (
            <video ref={ref} controls playsInline className="w-full max-h-[520px] bg-black rounded-xl"
              onEnded={() => setPlaying(i => (i !== null && i + 1 < clips.length ? i + 1 : null))} />
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {clips.map((c, i) => (
          <button key={c.url} onClick={() => void downloadVideo(c.url, `supernova-${slug}-${i + 1}.mp4`)}
            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full border border-border text-[12px] text-foreground hover:border-foreground/30">
            <Download className="w-3.5 h-3.5" /> {clips.length > 1 ? c.label : "Descargar video"}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Texto sugerido</p>
          <button onClick={() => void copy()} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border text-[12px] text-foreground">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
        <p className="whitespace-pre-line rounded-xl bg-card/50 border border-border px-3 py-2.5 text-[13px] text-foreground/90 break-words">{text}</p>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          {(["meta", "tiktok"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`h-9 px-3.5 rounded-full border text-[12px] ${tab === t ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground"}`}>
              {t === "meta" ? "Subir a Meta" : "Subir a TikTok"}
            </button>
          ))}
        </div>
        <ol className="space-y-1.5">
          {PUBLISH_STEPS[tab].map((s, i) => (
            <li key={i} className="flex gap-2.5 text-[13px] text-foreground/85">
              <span className="shrink-0 w-5 h-5 rounded-full border border-border text-[11px] flex items-center justify-center text-muted-foreground">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="text-[11px] text-muted-foreground">El enlace de cada video dura 24 horas: descárgalos hoy.</p>
    </section>
  );
}
