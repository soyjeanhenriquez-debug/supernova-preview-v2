import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Captions, Copy, Download, Film, Loader2, Search, Upload, Video } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { ToolFeedback } from "@/components/ToolFeedback";
import { supabase } from "@/integrations/supabase/client";
import { invokeErrorMessage } from "@/lib/fnAuth";
import { useBusinessProfile } from "@/lib/businessProfile";
import { CREDIT_COSTS, useCredits } from "@/hooks/useCredits";
import { burnSubtitles, extractAudio, MAX_VIDEO_SECONDS, toSrt, type Subtitle, type SubStyle } from "@/lib/burnSubtitles";
import { canRecord } from "@/lib/montage";
import { openTool, TOOLS } from "@/lib/tools";

/**
 * "Con tu cara" (13-oct-2026, pedido de Jean): para creadores que salen en sus videos.
 *  · Sube tu video (20 créditos): subtítulos con tiempos + 3 ganchos + texto de la publicación. El
 *    audio se saca en el navegador; los subtítulos se queman en tu video aquí mismo (gratis).
 *  · Analiza un Reel (15 créditos): pega un enlace y te dice por qué funciona y te da tu versión.
 * El cobro lo hace el servidor (video-subtitles / reel-analyze) y devuelve el crédito si falla.
 */
type Tab = "video" | "reel";

type ReelResult = {
  resumen?: string; duracion_s?: number;
  transcripcion?: { s: number; texto: string }[];
  gancho?: { se_ve?: string; se_dice?: string; texto_pantalla?: string; por_que?: string };
  estructura?: { desde: number; hasta: number; tramo: string; que_pasa: string; para_que: string }[];
  por_que_funciona?: string[]; mejorar?: string[];
  tu_version?: { ganchos?: string[]; guion?: { desde: number; hasta: number; dices: string; se_ve: string; texto_pantalla: string }[]; cierre?: string; pie?: string; hashtags?: string[] };
  source?: { owner?: string; views?: number | null; likes?: number | null; comments?: number | null };
};
type SubsResult = { subtitulos: Subtitle[]; gancho?: { detiene?: boolean; por_que?: string; propuestas?: string[] }; pie?: string; hashtags?: string[]; nota?: string };

const fmt = (n: number | null | undefined) => (typeof n === "number" ? n.toLocaleString("es-ES") : "—");
const copy = (t: string) => { void navigator.clipboard?.writeText(t).then(() => toast.success("Copiado")); };
const download = (blob: Blob, name: string) => {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

export function CreadorPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [tab, setTab] = useState<Tab>(() => (location.hash.includes("reel") ? "reel" : "video"));
  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader stage="Crear · Con tu cara" title="Para creadores que salen en sus videos"
        icon={<Video className="w-5 h-5 text-primary" />}
        line="Tú grabas con el celular. Aquí le pones subtítulos y un gancho más fuerte, y aprendes de los Reels que ya funcionan."
        details={[
          "Sube tu video: la IA escucha lo que dices, te da los subtítulos con sus tiempos y 3 ganchos para los primeros 3 segundos. Los subtítulos se ponen en tu video aquí mismo.",
          "Analiza un Reel: pega el enlace de cualquier Reel público y te decimos por qué funciona (o qué le falló) y te damos tu versión para grabarla.",
          "Se modela la estructura y el ritmo, nunca se copian las palabras, la cara ni la marca de otra persona.",
        ]} />

      <div role="tablist" className="scroll-row flex gap-2">
        {([["video", "Sube tu video", Captions], ["reel", "Analiza un Reel", Search]] as const).map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-sm whitespace-nowrap ${tab === id ? "border-primary/60 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "video" ? <SubeTuVideo /> : <AnalizaReel />}

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cost = CREDIT_COSTS.video_subtitles;

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) { toast.error("Elige un video (MP4 o MOV)."); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f); setPreview(URL.createObjectURL(f)); setRes(null);
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
      else toast.success("Listo: subtítulos y ganchos", { description: "Revisa el texto, elige el estilo y descarga tu video." });
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
            <p>2. La IA escucha lo que dices y te da los subtítulos con sus tiempos, 3 ganchos para los primeros 3 segundos y el texto para publicarlo.</p>
            <p>3. Revisa el texto, elige el estilo y descarga tu video con los subtítulos puestos (gratis, se hace en tu navegador).</p>
            <button type="button" onClick={run} disabled={!file || !!busy}
              className="btn-primary-nova inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50">
              {busy === "audio" ? <><Loader2 className="w-4 h-4 animate-spin" /> Leyendo el audio…</>
                : busy === "ia" ? <><Loader2 className="w-4 h-4 animate-spin" /> Escuchando tu video…</>
                : <><Captions className="w-4 h-4" /> Hacer subtítulos y ganchos · {cost} créditos</>}
            </button>
            <p className="text-[12px]">Tu video no se sube a ningún lado: solo mandamos el audio. Si falla, no se cobra.</p>
          </div>
        </div>
      </div>

      {res && res.subtitulos.length > 0 && (
        <>
          {res.gancho && (
            <div className="card-surface rounded-2xl p-5 space-y-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Tus primeros 3 segundos</p>
              <p className="text-sm text-foreground">{res.gancho.detiene ? "Tu inicio ya engancha." : "Tu inicio se puede mejorar."} <span className="text-muted-foreground">{res.gancho.por_que}</span></p>
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
          )}

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
            {canRecord() ? (
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
          <ToolFeedback tool="subtitulos" />
        </>
      )}
    </div>
  );
}

function AnalizaReel() {
  const { profile } = useBusinessProfile();
  const { applyServerCharge } = useCredits();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ReelResult | null>(null);
  const cost = CREDIT_COSTS.reel_analyze;

  const run = async () => {
    if (busy) return;
    if (!/instagram\.com\/(?:[A-Za-z0-9._]+\/)?(?:reel|reels|p)\//i.test(url)) { toast.error("Pega el enlace de un Reel de Instagram (instagram.com/reel/…)."); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("reel-analyze", {
        body: { url: url.trim(), brief: { product: profile.product ?? "", who: profile.who ?? "" } },
      });
      if (error || !data?.tu_version) throw new Error(error ? await invokeErrorMessage(error, "No se pudo analizar el Reel. No se te cobró.") : (data?.error || "No se pudo analizar el Reel. No se te cobró."));
      if (data.billing) applyServerCharge("reel_analyze", data.billing, "Analizar un Reel");
      setRes(data as ReelResult);
      toast.success("Reel analizado", { description: "Abajo: por qué funciona y tu versión para grabar." });
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo analizar el Reel.");
    } finally { setBusy(false); }
  };

  const v = res?.tu_version;
  const guionTexto = v ? [
    ...(v.ganchos?.length ? [`GANCHO: ${v.ganchos[0]}`, ""] : []),
    ...(v.guion ?? []).map(t => `${t.desde}–${t.hasta} s\nDices: ${t.dices}\nSe ve: ${t.se_ve}${t.texto_pantalla ? `\nTexto en pantalla: ${t.texto_pantalla}` : ""}`),
    "", `CIERRE: ${v.cierre ?? ""}`,
  ].join("\n") : "";

  return (
    <div className="space-y-4">
      <div className="card-surface rounded-2xl p-5 space-y-3">
        <p className="text-sm text-foreground font-semibold">Pega el enlace de un Reel que te guste (tuyo o de otra persona).</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.instagram.com/reel/…" inputMode="url"
            className="flex-1 min-h-[44px] rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:border-primary/60" />
          <button type="button" onClick={run} disabled={busy || !url.trim()}
            className="btn-primary-nova inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Mirando el Reel… (≈1 min)</> : <><Search className="w-4 h-4" /> Analizar · {cost} créditos</>}
          </button>
        </div>
        <p className="text-[12px] text-muted-foreground">La cuenta tiene que ser pública y el Reel de hasta 90 segundos. Si falla, no se cobra.</p>
      </div>

      {res && v && (
        <>
          <div className="card-surface rounded-2xl p-5 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Por qué funciona</p>
              {res.source && <p className="text-[12px] text-muted-foreground">{res.source.owner ? `@${res.source.owner} · ` : ""}{fmt(res.source.views)} reproducciones · {fmt(res.source.likes)} me gusta</p>}
            </div>
            {res.resumen && <p className="text-sm text-foreground">{res.resumen}</p>}
            {res.gancho && (
              <div className="rounded-lg border border-border p-3 text-[13px] text-muted-foreground space-y-1">
                <p className="text-foreground font-semibold">El gancho (0–3 s)</p>
                {res.gancho.se_dice && <p>Dice: «{res.gancho.se_dice}»</p>}
                {res.gancho.texto_pantalla && <p>Texto en pantalla: «{res.gancho.texto_pantalla}»</p>}
                {res.gancho.se_ve && <p>Se ve: {res.gancho.se_ve}</p>}
                {res.gancho.por_que && <p className="text-foreground">{res.gancho.por_que}</p>}
              </div>
            )}
            <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">{(res.por_que_funciona ?? []).filter(Boolean).map(x => <li key={x}>{x}</li>)}</ul>
            {!!res.estructura?.length && (
              <ol className="space-y-1.5">
                {res.estructura.map((t, i) => (
                  <li key={i} className="grid grid-cols-[72px_1fr] gap-2 text-[13px]">
                    <span className="tabular-nums text-muted-foreground">{t.desde}–{t.hasta} s</span>
                    <span><b className="text-foreground">{t.tramo}</b> <span className="text-muted-foreground">· {t.que_pasa}</span></span>
                  </li>
                ))}
              </ol>
            )}
            {!!res.mejorar?.length && (
              <div className="text-[13px] text-muted-foreground"><p className="text-foreground font-semibold">Qué mejorar en tu versión</p><ul className="list-disc pl-5">{res.mejorar.filter(Boolean).map(x => <li key={x}>{x}</li>)}</ul></div>
            )}
          </div>

          <div className="card-surface rounded-2xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Tu versión para grabar</p>
              <button type="button" onClick={() => copy(guionTexto)} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] text-foreground hover:bg-secondary/60"><Copy className="w-3.5 h-3.5" /> Copiar guion</button>
            </div>
            <div className="space-y-2">
              <p className="text-[13px] text-muted-foreground">Elige un gancho:</p>
              {(v.ganchos ?? []).filter(Boolean).map(g => (
                <div key={g} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm text-foreground">
                  <span>«{g}»</span>
                  <button type="button" onClick={() => copy(g)} aria-label="Copiar gancho" className="shrink-0 text-muted-foreground hover:text-foreground"><Copy className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <ol className="space-y-2">
              {(v.guion ?? []).map((t, i) => (
                <li key={i} className="rounded-lg border border-border p-3 text-[13px] space-y-1">
                  <p className="tabular-nums text-muted-foreground">{t.desde}–{t.hasta} s</p>
                  <p className="text-foreground">Dices: {t.dices}</p>
                  {t.se_ve && <p className="text-muted-foreground">Se ve: {t.se_ve}</p>}
                  {t.texto_pantalla && <p className="text-muted-foreground">Texto en pantalla: «{t.texto_pantalla}»</p>}
                </li>
              ))}
            </ol>
            {v.cierre && <p className="text-sm text-foreground"><b>Cierre:</b> {v.cierre}</p>}
            {(v.pie || v.hashtags?.length) && (
              <div className="rounded-lg border border-border p-3 text-[13px] space-y-1">
                <p className="text-foreground font-semibold">Texto para publicarlo</p>
                <p className="whitespace-pre-line text-muted-foreground">{v.pie}</p>
                <p className="text-muted-foreground">{(v.hashtags ?? []).map(h => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>
              </div>
            )}
            <p className="text-[12px] text-muted-foreground">Grábalo con tu celular y después súbelo en "Sube tu video" para ponerle subtítulos.</p>
          </div>
          <ToolFeedback tool="analiza-reel" />
        </>
      )}
    </div>
  );
}

export default CreadorPage;
