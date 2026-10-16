import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Captions, ChevronRight, Copy, Download, Film, Loader2, Search, Upload, Video } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ToolFeedback } from "@/components/ToolFeedback";
import { ToolShell } from "@/components/tool/ToolShell";
import { AnalizaReel } from "@/components/reel/AnalizaReel";
import { supabase } from "@/integrations/supabase/client";
import { invokeErrorMessage } from "@/lib/fnAuth";
import { useBusinessProfile } from "@/lib/businessProfile";
import { useSubRoute } from "@/lib/useSubRoute";
import { CREDIT_COSTS, useCredits } from "@/hooks/useCredits";
import { burnSubtitles, extractAudio, MAX_VIDEO_SECONDS, NO_IMAGE_MSG, toSrt, videoHasImage, type Subtitle, type SubStyle } from "@/lib/burnSubtitles";
import { canRecord } from "@/lib/montage";
import { openTool, TOOLS } from "@/lib/tools";

/**
 * "Con tu cara" (13-oct-2026, pedido de Jean): para creadores que salen en sus videos.
 *  · Sube tu video (20 créditos): subtítulos con tiempos + 3 ganchos + texto de la publicación. El
 *    audio se saca en el navegador; los subtítulos se queman en tu video aquí mismo (gratis).
 *  · Analiza un Reel (25 créditos, otra versión 5): por qué funciona y tu versión según el nivel, con
 *    teleprompter (src/components/reel/AnalizaReel.tsx).
 * Fase 1 de la organización (16-oct-2026): cada herramienta tiene su dirección (#/con-tu-cara/video,
 * #/con-tu-cara/reel/<id>), migas, "Volver" y para qué producto trabaja. El cobro lo hace el servidor.
 */

type SubsResult = { subtitulos: Subtitle[]; gancho?: { detiene?: boolean; por_que?: string; propuestas?: string[] }; pie?: string; hashtags?: string[]; nota?: string };

const copy = (t: string) => { void navigator.clipboard?.writeText(t).then(() => toast.success("Copiado")); };
const download = (blob: Blob, name: string) => {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

export function CreadorPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const { segs, go } = useSubRoute("con-tu-cara");
  const nav = onNavigate ?? (() => undefined);

  // Direcciones viejas (#/analiza-reel, #/subtitulos) y enlaces guardados: se llevan a la nueva.
  useEffect(() => {
    const h = window.location.hash;
    if (h.startsWith("#/analiza-reel")) go(["reel"], true);
    else if (h.startsWith("#/subtitulos")) go(["video"], true);
  }, [go]);

  if (segs[0] === "reel") {
    return <AnalizaReel route={segs.slice(1)} go={(s, r) => go(["reel", ...s], r)} onUpload={() => go(["video"])} onHome={() => go([])} onNavigate={nav} />;
  }
  if (segs[0] === "video") {
    return (
      <ToolShell onNavigate={nav}
        crumbs={[{ label: "Crear" }, { label: "Con tu cara", onClick: () => go([]) }, { label: "Sube tu video" }]}
        title="Sube tu video y ponle subtítulos"
        line="Elige el video que grabaste. La IA escucha lo que dices, te da los subtítulos y el texto para publicarlo."
        onBack={() => go([])}>
        <div className="max-w-3xl"><SubeTuVideo /></div>
      </ToolShell>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader stage="Crear · Con tu cara" title="Para creadores que salen en sus videos"
        icon={<Video className="w-5 h-5 text-primary" />}
        line="Elige qué quieres hacer. Las dos herramientas trabajan para tu producto activo."
        details={[
          "Analiza un Reel: pega el enlace de cualquier Reel público, elige cuánto se parece tu versión y grábala con el teleprompter.",
          "Sube tu video: la IA escucha lo que dices, te da los subtítulos con sus tiempos y 3 ganchos para los primeros 3 segundos.",
          "Se modela la estructura y el ritmo, nunca se copian las palabras, la cara ni la marca de otra persona.",
        ]} />

      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ["reel", Search, "Analiza un Reel", "Pega un Reel que funciona → elige Espejo, Adaptación o Inspiración → grábalo con el teleprompter.", `${CREDIT_COSTS.reel_analyze} créditos`],
          ["video", Captions, "Sube tu video", "Ya grabaste: subtítulos con sus tiempos, el texto para publicar y si tu inicio engancha.", `${CREDIT_COSTS.video_subtitles} créditos`],
        ] as const).map(([id, Icon, title, desc, cost]) => (
          <button key={id} type="button" onClick={() => go([id])}
            className="card-surface group rounded-2xl p-5 text-left hover:border-primary/50 transition-colors">
            <span className="flex items-center gap-2 text-foreground"><Icon className="w-5 h-5 text-primary" /><span className="font-display text-lg font-semibold">{title}</span>
              <ChevronRight className="ml-auto w-4 h-4 text-muted-foreground group-hover:text-foreground" /></span>
            <span className="mt-1.5 block text-[13px] text-muted-foreground">{desc}</span>
            <span className="mt-3 block text-[12px] text-muted-foreground">{cost}</span>
          </button>
        ))}
      </div>

      <div className="card-surface rounded-2xl p-5 space-y-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Más para tu marca personal</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {[
            ["Guiones de Reels", "Generadores", "Guiones cortos con gancho para grabar con tu cara."],
            ["Carrusel con tu foto", "Carrusel", "En \"Tu firma\" subes tu foto y sales en las láminas."],
            ["Creador de YouTube", "Creador YouTube", "Ideas con datos reales y guion con gancho en 5 s."],
            ["Calendario de contenido", "Contenido", "Qué publicar cada día y \"Ya lo publiqué\"."],
          ].map(([label, page, desc]) => (
            <button key={label} type="button" onClick={() => {
              const reels = page === "Generadores" ? TOOLS.find(t => t.id === "reels") : undefined;
              if (reels && onNavigate) openTool(reels, onNavigate); else onNavigate?.(page);
            }}
              className="text-left rounded-xl border border-border p-3 hover:bg-secondary/40 min-h-[44px]">
              <p className="text-sm font-semibold text-foreground">{label}</p>
              <p className="text-[12px] text-muted-foreground">{desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SubeTuVideo() {
  const { profile } = useBusinessProfile();
  const { applyServerCharge } = useCredits();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "audio" | "ia" | "grabando">("");
  const [res, setRes] = useState<SubsResult | null>(null);
  const [style, setStyle] = useState<SubStyle>("resaltado");
  const [progress, setProgress] = useState(0);
  // null = todavía revisando; false = el navegador no ve la imagen (solo audio).
  const [hasImage, setHasImage] = useState<boolean | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cost = CREDIT_COSTS.video_subtitles;

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) { toast.error("Elige un video (MP4 o MOV)."); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f); setPreview(URL.createObjectURL(f)); setRes(null); setHasImage(null);
    void videoHasImage(f).then(setHasImage);
  };

  const run = async () => {
    if (!file || busy) return;
    try {
      setBusy("audio");
      const { audio, seconds } = await extractAudio(file);
      setBusy("ia");
      const { data, error } = await supabase.functions.invoke("video-subtitles", {
        body: { audio, seconds, brief: { product: profile.product ?? "", who: profile.who ?? "" } },
      });
      if (error || !Array.isArray(data?.subtitulos)) throw new Error(error ? await invokeErrorMessage(error, "No se pudieron hacer los subtítulos. No se te cobró.") : (data?.error || "No se pudieron hacer los subtítulos. No se te cobró."));
      if (data.billing) applyServerCharge("video_subtitles", data.billing, "Subtítulos y gancho");
      setRes(data as SubsResult);
      if (!data.subtitulos.length) toast("No escuchamos voz en ese video", { description: data.nota || "Prueba con un video donde hables." });
      else toast.success("Listo: tus subtítulos", { description: "Revisa el texto, elige el estilo y descarga tu video." });
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo procesar el video.");
    } finally { setBusy(""); }
  };

  const editSub = (i: number, texto: string) => setRes(r => r ? { ...r, subtitulos: r.subtitulos.map((s, k) => k === i ? { ...s, texto } : s) } : r);

  const burn = async () => {
    if (!file || !res?.subtitulos.length || !canvasRef.current) return;
    setBusy("grabando"); setProgress(0);
    try {
      const out = await burnSubtitles(file, res.subtitulos, { style, canvas: canvasRef.current, onProgress: (t, total) => setProgress(total ? Math.round((t / total) * 100) : 0) });
      download(out.blob, `mi-video-subtitulado.${out.ext}`);
      toast.success("Tu video con subtítulos está descargado");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo grabar el video.");
    } finally { setBusy(""); }
  };

  return (
    <div className="space-y-4">
      <div className="card-surface rounded-2xl p-5 space-y-4">
        <div className="grid sm:grid-cols-[200px_1fr] gap-4 items-start">
          <label className="relative flex aspect-[9/16] w-full max-w-[200px] cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-secondary/30 hover:border-primary/50">
            {preview
              ? <video src={preview} className="h-full w-full object-cover" muted playsInline controls />
              : <span className="flex flex-col items-center gap-2 p-4 text-center text-[12px] text-muted-foreground"><Upload className="w-5 h-5" /> Toca para elegir tu video<br />(hasta {MAX_VIDEO_SECONDS} s)</span>}
            <input type="file" accept="video/*" className="sr-only" onChange={e => pick(e.target.files?.[0] ?? null)} />
          </label>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p className="text-foreground font-semibold">1. Elige el video que grabaste con tu celular.</p>
            <p>2. La IA escucha lo que dices y te da los subtítulos con sus tiempos y el texto para publicarlo.</p>
            <p>3. Revisa el texto, elige el estilo y descarga tu video con los subtítulos puestos (gratis, se hace en tu navegador).</p>
            <button type="button" onClick={run} disabled={!file || !!busy}
              className="btn-primary-nova inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50">
              {busy === "audio" ? <><Loader2 className="w-4 h-4 animate-spin" /> Leyendo el audio…</>
                : busy === "ia" ? <><Loader2 className="w-4 h-4 animate-spin" /> Escuchando tu video…</>
                : <><Captions className="w-4 h-4" /> Hacer mis subtítulos · {cost} créditos</>}
            </button>
            <p className="text-[12px]">Tu video no se sube a ningún lado: solo mandamos el audio. Si falla, no se cobra.</p>
            {hasImage === false && <p role="alert" className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-[12px] text-foreground">{NO_IMAGE_MSG}</p>}
          </div>
        </div>
      </div>

      {res && res.subtitulos.length > 0 && (
        <>
          <div className="card-surface rounded-2xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Subtítulos (toca para corregir)</p>
              <button type="button" onClick={() => download(new Blob([toSrt(res.subtitulos)], { type: "text/plain" }), "subtitulos.srt")}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] text-foreground hover:bg-secondary/60">
                <Download className="w-3.5 h-3.5" /> Bajar .srt (CapCut)
              </button>
            </div>
            <ol className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              {res.subtitulos.map((s, i) => (
                <li key={i} className="grid grid-cols-[64px_1fr] items-center gap-2">
                  <span className="text-[11px] tabular-nums text-muted-foreground">{s.desde.toFixed(1)}–{s.hasta.toFixed(1)} s</span>
                  <input value={s.texto} onChange={e => editSub(i, e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary/60" />
                </li>
              ))}
            </ol>
          </div>

          <div className="card-surface rounded-2xl p-5 space-y-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Tu video con subtítulos</p>
            <div className="flex flex-wrap gap-2">
              {([["resaltado", "Palabra clave en color"], ["clasico", "Blanco con borde"], ["caja", "En caja oscura"]] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setStyle(id)}
                  className={`min-h-[40px] rounded-full border px-3 text-[13px] ${style === id ? "border-primary/60 bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}>{label}</button>
              ))}
            </div>
            <canvas ref={canvasRef} className={`w-full max-w-[240px] rounded-xl border border-border ${busy === "grabando" ? "block" : "hidden"}`} />
            {hasImage === false ? (
              <p className="text-[13px] text-muted-foreground">{NO_IMAGE_MSG}</p>
            ) : canRecord() ? (
              <button type="button" onClick={burn} disabled={!!busy}
                className="btn-primary-nova inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50">
                {busy === "grabando" ? <><Loader2 className="w-4 h-4 animate-spin" /> Poniendo subtítulos… {progress} %</> : <><Film className="w-4 h-4" /> Descargar mi video con subtítulos · gratis</>}
              </button>
            ) : (
              <p className="text-[13px] text-muted-foreground">Tu navegador no puede grabar video. Baja el .srt y súbelo a CapCut junto con tu video.</p>
            )}
            <p className="text-[12px] text-muted-foreground">Tarda lo mismo que dura tu video. No cambies de pestaña mientras se graba.</p>
          </div>

          {(res.pie || res.hashtags?.length) && (
            <div className="card-surface rounded-2xl p-5 space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Texto para publicarlo</p>
              <p className="whitespace-pre-line text-sm text-foreground">{res.pie}</p>
              <p className="text-[13px] text-muted-foreground">{(res.hashtags ?? []).map(h => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>
              <button type="button" onClick={() => copy(`${res.pie ?? ""}\n\n${(res.hashtags ?? []).map(h => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`)}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] text-foreground hover:bg-secondary/60"><Copy className="w-3.5 h-3.5" /> Copiar texto</button>
            </div>
          )}
          {/* Los ganchos van al final y plegados: sirven si vas a regrabar el inicio, no al descargar. */}
          {res.gancho && (
            <details className="card-surface group rounded-2xl p-5">
              <summary className="cursor-pointer list-none text-sm text-foreground">
                <span className="font-semibold">¿Vas a regrabar el inicio?</span>{" "}
                <span className="text-muted-foreground">{res.gancho.detiene ? "Tu inicio ya engancha; si quieres, aquí tienes 3 ganchos más." : "Tu inicio se puede mejorar: mira 3 ganchos."}</span>
              </summary>
              <div className="mt-3 space-y-3">
                {res.gancho.por_que && <p className="text-[13px] text-muted-foreground">{res.gancho.por_que}</p>}
                <ul className="space-y-2">
                  {(res.gancho.propuestas ?? []).filter(Boolean).map(g => (
                    <li key={g} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm text-foreground">
                      <span>«{g}»</span>
                      <button type="button" onClick={() => copy(g)} aria-label="Copiar gancho" className="shrink-0 text-muted-foreground hover:text-foreground"><Copy className="w-4 h-4" /></button>
                    </li>
                  ))}
                </ul>
                <p className="text-[12px] text-muted-foreground">Dilo al inicio o ponlo como texto en pantalla en los primeros 3 segundos.</p>
              </div>
            </details>
          )}
          <ToolFeedback tool="subtitulos" />
        </>
      )}
    </div>
  );
}


export default CreadorPage;
