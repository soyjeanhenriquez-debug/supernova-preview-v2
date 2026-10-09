import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Download, FileArchive, Loader2, Mic, Pause, Play, Sparkles, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useCredits, CREDIT_COSTS } from "@/hooks/useCredits";
import { useCreditsLeft } from "@/hooks/useCreditsLeft";
import { fnErrorMessage, fnHeaders, readBilling } from "@/lib/fnAuth";
import { track } from "@/lib/analytics";
import { AddToTracker } from "@/components/AddToTracker";
import { ToolFeedback } from "@/components/ToolFeedback";
import { VOICES, VOICE_LABEL, type Voice } from "@/lib/ytScenes";
import {
  MOTION_PRESETS, buildTimeline, drawMotionFrame, fontWeightFor, framesFromImages, framesFromVideo, loadMotionFont,
  loadSavedStyles, motionPackage, motionSize, playMotion, sanitizeStyle, saveStyle, styleForServer, timelineTotal, voiceChunks,
  type Beat, type Layout, type MotionFormat, type MotionPlan, type MotionStyle, type PlayHandle, type VoiceChunk,
} from "@/lib/motionGraphics";

/**
 * Motion graphics con estilo (08-oct-2026). El flujo del tutorial "estilo de referencia → prompt
 * maestro → escenas → voz → edición", hecho dentro de la app y en un solo lugar:
 * Usa el prompt maestro de Jean (docs/prompts/motion-graphics-prompt-maestro.md), en español:
 *   1. Estilo: uno listo (gratis) o "modelar" el de UNA referencia (video o capturas) → desglose,
 *      ADN del estilo y prompt listo para pegar en Omni Flash / Veo / Seedance.
 *   2. Qué dice: anuncio de tu producto o tu propio guion → escenas (la app las dibuja) y clips de
 *      10 s con su prompt, todos con la biblia de estilo bloqueada.
 *   3. Voz opcional (la misma del Creador de YouTube) → las escenas se ajustan a lo que dura.
 *   4. Se dibuja y graba en tu navegador (texto perfecto, sin costo de video con IA) y se bajan
 *      todas las partes en un .zip para terminar en CapCut o Remotion.
 * Todo cobro lo hace el servidor (motion-graphics y yt-produce); aquí solo se refleja el saldo.
 */
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const VOICE_PRICE = CREDIT_COSTS.yt_voice_scene;
const LAYOUT_LABEL: Record<Layout, string> = {
  statement: "Frase", big_word: "Palabra grande", list: "Lista", question: "Pregunta", contrast: "Antes / después", quote: "Cita", cta: "Llamada a la acción",
};
const DEMO: Beat[] = [
  { layout: "big_word", text: "Detente", emphasis: ["Detente"], items: [], narration: "", seconds: 1.6 },
  { layout: "statement", text: "Lo que ya vende no se inventa: se modela", emphasis: ["modela"], items: [], narration: "", seconds: 2.8 },
  { layout: "list", text: "Así se ve tu estilo", emphasis: ["estilo"], items: ["Tus colores", "Tu letra", "Tu ritmo"], narration: "", seconds: 3.2 },
  { layout: "cta", text: "Pega tu guion y créalo", emphasis: ["guion"], items: [], narration: "", seconds: 2.4 },
];

async function post(fn: string, body: Record<string, unknown>) {
  const resp = await fetch(`${FN_URL}/${fn}`, { method: "POST", headers: await fnHeaders(), body: JSON.stringify(body) });
  if (!resp.ok) throw new Error(await fnErrorMessage(resp, "No se pudo completar."));
  return resp;
}
const b64ToBlob = (b64: string, mime: string) => {
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

type VoiceTake = { key: string; chunks: VoiceChunk[]; buffers: AudioBuffer[] };

export function MotionStudio({ productId, hasProduct, hook }: { productId?: string | null; hasProduct: boolean; hook?: string }) {
  const { applyServerCharge, balance } = useCredits();
  const creditsLeft = useCreditsLeft().label;

  // 1. Estilo
  const [saved, setSaved] = useState<MotionStyle[]>(() => loadSavedStyles());
  const [style, setStyle] = useState<MotionStyle>(() => loadSavedStyles()[0] ?? MOTION_PRESETS[0]);
  const [reading, setReading] = useState(false);
  const [changes, setChanges] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 2. Contenido
  const [source, setSource] = useState<"anuncio" | "guion">(hasProduct ? "anuncio" : "guion");
  const [script, setScript] = useState("");
  const [seconds, setSeconds] = useState<15 | 30 | 45 | 60>(30);
  const [format, setFormat] = useState<MotionFormat>("9:16");
  const [plan, setPlan] = useState<MotionPlan | null>(null);
  const [planning, setPlanning] = useState(false);

  // 3. Voz
  const [voiceOn, setVoiceOn] = useState(true);
  const [voice, setVoice] = useState<Voice>("onyx");
  const [take, setTake] = useState<VoiceTake | null>(null);
  const [voicing, setVoicing] = useState(false);

  // 4. Ver y grabar
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const handle = useRef<PlayHandle | null>(null);
  const [playing, setPlaying] = useState<"preview" | "record" | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ url: string; ext: string; blob: Blob } | null>(null);
  const [packing, setPacking] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (!hasProduct && source === "anuncio") setSource("guion"); }, [hasProduct, source]);

  const beats = plan?.beats ?? DEMO;
  const chunks = useMemo(() => voiceChunks(beats), [beats]);
  const voiceKey = `${voice}|${chunks.map(c => c.text).join("¶")}`;
  const voiceReady = !!take && take.key === voiceKey;
  const tl = useMemo(() => (voiceOn && voiceReady && take ? buildTimeline(beats, take.chunks, take.buffers.map(b => b.duration)) : buildTimeline(beats)), [beats, voiceOn, voiceReady, take]);
  const total = timelineTotal(tl);
  const { width: W, height: H } = motionSize(format);

  const stop = useCallback(() => { handle.current?.stop(); handle.current = null; setPlaying(null); }, []);
  useEffect(() => () => { handle.current?.stop(); void audioCtx.current?.close(); }, []);
  useEffect(() => { if (result) return () => URL.revokeObjectURL(result.url); }, [result]);

  // Cuadro fijo (al cambiar estilo, formato o escenas): se ve la mitad de la primera escena.
  useEffect(() => {
    let alive = true;
    if (playing) return;
    void loadMotionFont(style.font, fontWeightFor(style)).then(() => {
      const c = canvasRef.current;
      if (!alive || !c) return;
      c.width = W; c.height = H;
      const g = c.getContext("2d", { alpha: false });
      if (g) drawMotionFrame(g, W, H, style, beats, tl, Math.min(total, (tl[0]?.dur ?? 2) * 0.75));
    });
    return () => { alive = false; };
  }, [style, beats, tl, total, W, H, playing]);

  const ctx = () => {
    if (!audioCtx.current || audioCtx.current.state === "closed") {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx.current = new Ctx();
    }
    return audioCtx.current;
  };
  const audioPlan = () => (voiceOn && voiceReady && take ? take.chunks.map((c, k) => ({ buffer: take.buffers[k], at: tl[c.beats[0]].start })) : []);

  const run = async (record: boolean) => {
    if (playing) { stop(); return; }
    const c = canvasRef.current;
    if (!c) return;
    await loadMotionFont(style.font, fontWeightFor(style));
    c.width = W; c.height = H;
    setResult(null); setProgress(0);
    try {
      const h = playMotion({ canvas: c, ctx: ctx(), style, beats, tl, audio: audioPlan(), record, onProgress: (t, tot) => setProgress(tot ? t / tot : 0) });
      handle.current = h;
      setPlaying(record ? "record" : "preview");
      const out = await h.done;
      if (out) {
        setResult({ url: URL.createObjectURL(out.blob), ext: out.ext, blob: out.blob });
        track("motion_grabado", { segundos: Math.round(total), voz: voiceOn && voiceReady, estilo: style.name });
        toast.success("Tu video está listo para descargar.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo reproducir.");
    } finally {
      handle.current = null;
      setPlaying(null);
    }
  };

  // ---------- 1. Modelar el estilo de una referencia ----------
  const readReference = async (files: FileList | null) => {
    if (!files?.length || reading) return;
    const list = Array.from(files);
    const video = list.find(f => f.type.startsWith("video/"));
    const images = list.filter(f => f.type.startsWith("image/"));
    if (!video && images.length < 2) { toast.error("Sube un video o al menos 2 capturas de la referencia."); return; }
    if (video && video.size > 300 * 1024 * 1024) { toast.error("Ese video pesa demasiado. Usa uno de menos de 300 MB."); return; }
    if (balance < CREDIT_COSTS.motion_style) { toast.error(`Te faltan créditos: modelar un estilo cuesta ${CREDIT_COSTS.motion_style}.`); return; }
    setReading(true);
    try {
      const frames = video ? await framesFromVideo(video) : await framesFromImages(images);
      if (frames.length < 2) throw new Error("No pudimos sacar cuadros de esa referencia.");
      const resp = await post("motion-graphics", { action: "style", frames, changes: changes.trim() || undefined });
      const data = await resp.json();
      applyServerCharge("motion_style", data.billing ?? readBilling(resp), "Estilo de motion");
      const s = sanitizeStyle(data.style, style);
      setSaved(saveStyle(s));
      setStyle(s);
      track("motion_estilo_modelado", { fuente: video ? "video" : "capturas" });
      toast.success(`Estilo "${s.name}" listo. Queda guardado para tus próximos videos.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pudimos leer el estilo.");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ---------- 2. Escenas ----------
  const makePlan = async () => {
    if (planning || playing) return;
    if (source === "guion" && script.trim().length < 40) { toast.error("Pega tu guion (al menos un par de frases)."); return; }
    if (balance < CREDIT_COSTS.motion_ad) { toast.error(`Te faltan créditos: armar las escenas cuesta ${CREDIT_COSTS.motion_ad}.`); return; }
    setPlanning(true);
    try {
      const resp = await post("motion-graphics", {
        action: "plan", source, seconds, style: styleForServer(style),
        ...(source === "guion" ? { script: script.trim() } : { product_id: productId ?? undefined, hook: hook || undefined }),
      });
      const data = await resp.json();
      applyServerCharge("motion_ad", data.billing ?? readBilling(resp), data.plan?.title ?? "Motion graphics");
      setPlan(data.plan as MotionPlan);
      setResult(null);
      track("motion_escenas", { fuente: source, segundos: seconds, escenas: data.plan?.beats?.length ?? 0 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pudimos armar las escenas.");
    } finally { setPlanning(false); }
  };
  const editBeat = (i: number, patch: Partial<Beat>) => setPlan(p => (p ? { ...p, beats: p.beats.map((b, j) => (j === i ? { ...b, ...patch } : b)) } : p));

  // ---------- 3. Voz ----------
  const makeVoice = async () => {
    if (voicing || !plan) return;
    const cost = chunks.length * VOICE_PRICE;
    if (balance < cost) { toast.error(`Te faltan créditos: la voz cuesta ${cost}.`); return; }
    setVoicing(true);
    try {
      const ac = ctx();
      const buffers: AudioBuffer[] = [];
      for (let k = 0; k < chunks.length; k++) {
        const resp = await post("yt-produce", { action: "voice", text: chunks[k].text, voice, lang: "es", scene: k + 1 });
        const data = await resp.json();
        applyServerCharge("yt_voice_scene", data.billing ?? readBilling(resp), `Voz del motion ${k + 1}`);
        buffers.push(await ac.decodeAudioData(await b64ToBlob(data.audio, data.mime || "audio/mpeg").arrayBuffer()));
      }
      setTake({ key: voiceKey, chunks, buffers });
      setResult(null);
      toast.success("Voz lista: las escenas ya van al ritmo de la voz.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear la voz.");
    } finally { setVoicing(false); }
  };

  const copyText = async (t: string) => {
    try { await navigator.clipboard.writeText(t); toast.success("Copiado."); } catch { toast.error("No se pudo copiar."); }
  };
  const downloadParts = async () => {
    if (!plan || packing) return;
    setPacking(true);
    try {
      const zip = await motionPackage({ style, plan, tl, format, video: result ? { blob: result.blob, ext: result.ext } : null, voice: audioPlan() });
      const href = URL.createObjectURL(zip);
      const a = document.createElement("a");
      a.href = href; a.download = `supernova-motion-${plan.title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase().slice(0, 40) || "partes"}.zip`; a.click();
      setTimeout(() => URL.revokeObjectURL(href), 5000);
      track("motion_partes", { video: !!result, voz: voiceOn && voiceReady });
    } catch { toast.error("No se pudo armar el paquete."); }
    finally { setPacking(false); }
  };

  const chip = (on: boolean) => `h-9 px-3 rounded-full border text-[12px] transition-colors ${on ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground hover:text-foreground"}`;
  const step = (n: number, title: string, sub?: string) => (
    <div>
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Paso {n}</p>
      <h2 className="font-display text-[17px] font-semibold text-foreground">{title}</h2>
      {sub && <p className="text-[12px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
  const Swatch = ({ s }: { s: MotionStyle }) => (
    <span className="inline-flex rounded-full overflow-hidden border border-border shrink-0">
      {[s.palette.bg, s.palette.fg, s.palette.accent].map((c, i) => <span key={i} className="w-3 h-3" style={{ background: c }} />)}
    </span>
  );
  const styleList = [...saved, ...MOTION_PRESETS.filter(p => !saved.some(s => s.name === p.name))];
  const busy = reading || planning || voicing || !!playing;
  const fmtSec = (s: number) => `${Math.round(s)} s`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] min-w-0">
      <div className="space-y-6 min-w-0">
        {/* 1. Estilo */}
        <section className="rounded-2xl border border-border p-4 sm:p-5 space-y-3 min-w-0">
          {step(1, "Elige el estilo", "Uno listo, o modela el de un video que te guste: tomamos sus colores, letra, ritmo y transiciones (nunca su marca ni sus caras).")}
          <div className="flex flex-wrap gap-2">
            {styleList.map(s => (
              <button key={s.name} onClick={() => { setStyle(s); setResult(null); }} disabled={busy} className={`${chip(style.name === s.name)} inline-flex items-center gap-2`}>
                <Swatch s={s} /> {s.name}
              </button>
            ))}
          </div>
          {style.summary && <p className="text-[12px] text-muted-foreground">{style.summary}{style.motif ? ` Motivo: ${style.motif}.` : ""}</p>}
          {style.master_prompt && (
            <div className="rounded-xl border border-border">
              <button onClick={() => setShowPrompt(v => !v)} className="w-full flex items-center justify-between gap-2 px-3 h-10 text-[12px] text-foreground">
                Prompt del estilo para Omni Flash, Veo o Seedance <ChevronDown className={`w-4 h-4 transition-transform ${showPrompt ? "rotate-180" : ""}`} />
              </button>
              {showPrompt && (
                <div className="px-3 pb-3 space-y-2">
                  {!!style.breakdown?.length && <ul className="text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">{style.breakdown.map((l, i) => <li key={i}>{l}</li>)}</ul>}
                  <pre className="text-[11px] text-foreground whitespace-pre-wrap break-words max-h-56 overflow-auto rounded-lg bg-card p-2">{style.master_prompt}</pre>
                  <button onClick={() => void copyText(style.master_prompt!)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border text-[12px] text-foreground"><Copy className="w-3.5 h-3.5" /> Copiar prompt</button>
                </div>
              )}
            </div>
          )}
          <input value={changes} onChange={e => setChanges(e.target.value.slice(0, 400))} disabled={busy}
            placeholder="Cambios al modelar (opcional): tu marca, tus colores, otro tono…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-primary/60" />
          <input ref={fileRef} type="file" accept="video/*,image/*" multiple className="hidden" onChange={e => void readReference(e.target.files)} />
          <button onClick={() => fileRef.current?.click()} disabled={busy}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-border text-[13px] text-foreground hover:border-foreground/30 disabled:opacity-60">
            {reading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {reading ? "Leyendo el estilo…" : `Modelar el estilo de un video · ${CREDIT_COSTS.motion_style} créditos`}
          </button>
          <p className="text-[11px] text-muted-foreground">Sube el video (o 2 a 6 capturas). El video no sale de tu equipo: solo mandamos 6 cuadros pequeños para leer el estilo.</p>
        </section>

        {/* 2. Qué dice */}
        <section className="rounded-2xl border border-border p-4 sm:p-5 space-y-3 min-w-0">
          {step(2, "Qué dice tu video", "La IA lo parte en escenas cortas: texto en pantalla, palabras resaltadas y lo que dice la voz.")}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setSource("anuncio")} disabled={busy || !hasProduct} className={chip(source === "anuncio")}>Anuncio de mi producto</button>
            <button onClick={() => setSource("guion")} disabled={busy} className={chip(source === "guion")}>Tengo mi guion</button>
          </div>
          {!hasProduct && <p className="text-[11px] text-muted-foreground">Para el anuncio de tu producto, primero créalo en Mi negocio. Mientras, pega tu guion.</p>}
          {source === "guion" && (
            <textarea value={script} onChange={e => setScript(e.target.value.slice(0, 3000))} rows={5} disabled={busy}
              placeholder="Pega aquí tu guion: una idea por frase. Ej.: Siempre esperas el momento perfecto. Pero la confianza no llega antes de actuar: llega después…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60" />
          )}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex flex-wrap gap-2">{([15, 30, 45, 60] as const).map(n => <button key={n} onClick={() => setSeconds(n)} disabled={busy} className={chip(seconds === n)}>{n} s</button>)}</div>
            <div className="flex flex-wrap gap-2">{(["9:16", "1:1", "16:9"] as MotionFormat[]).map(f => <button key={f} onClick={() => { setFormat(f); setResult(null); }} disabled={!!playing} className={chip(format === f)}>{f === "9:16" ? "Vertical" : f === "1:1" ? "Cuadrado" : "Horizontal"}</button>)}</div>
          </div>
          <button onClick={() => void makePlan()} disabled={busy}
            className="btn-primary-nova inline-flex items-center justify-center gap-2 rounded-xl px-5 h-12 text-[14px] font-semibold disabled:opacity-60 w-full sm:w-auto">
            {planning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {planning ? "Armando las escenas…" : `${plan ? "Armar de nuevo" : "Armar mi motion"} · ${CREDIT_COSTS.motion_ad} créditos`}
          </button>
          <p className="text-[11px] text-muted-foreground">{creditsLeft}. Si la IA falla, no se te cobra. Ver y descargar el video es gratis.</p>
        </section>

        {/* Escenas editables */}
        {plan && (
          <section className="rounded-2xl border border-border p-4 sm:p-5 space-y-3 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-[17px] font-semibold text-foreground truncate">{plan.title}</h2>
              <span className="text-[12px] text-muted-foreground shrink-0">{plan.beats.length} escenas · {fmtSec(total)}</span>
            </div>
            {plan.beats.map((b, i) => (
              <div key={i} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>Escena {i + 1} · {LAYOUT_LABEL[b.layout]}</span>
                  <span>{fmtSec(tl[i]?.dur ?? b.seconds)}</span>
                </div>
                <input value={b.text} disabled={busy} onChange={e => editBeat(i, { text: e.target.value.slice(0, 90) })}
                  aria-label={`Texto en pantalla de la escena ${i + 1}`}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
                {b.items.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-3">
                    {b.items.map((it, k) => (
                      <input key={k} value={it} disabled={busy} onChange={e => editBeat(i, { items: b.items.map((x, j) => (j === k ? e.target.value.slice(0, 40) : x)) })}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-primary/60" />
                    ))}
                  </div>
                )}
                <textarea value={b.narration} rows={2} disabled={busy} onChange={e => editBeat(i, { narration: e.target.value.slice(0, 240) })}
                  aria-label={`Lo que dice la voz en la escena ${i + 1}`} placeholder="Lo que dice la voz"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-muted-foreground focus:outline-none focus:border-primary/60" />
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">Puedes cambiar cualquier texto gratis. Si cambias lo que dice la voz, hay que volver a crearla.</p>
          </section>
        )}

        {/* Prompts de 10 s (prompt maestro universal) */}
        {!!plan?.clips?.length && (
          <section className="rounded-2xl border border-border p-4 sm:p-5 space-y-3 min-w-0">
            <div>
              <h2 className="font-display text-[17px] font-semibold text-foreground">Prompts de 10 segundos (opcional)</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">Por si quieres generar tomas con IA en Google Flow (Omni Flash), Veo o Seedance con el mismo estilo. Tu video ya sale sin esto.</p>
            </div>
            {plan.clips.map((c, k) => (
              <details key={k} className="rounded-xl border border-border">
                <summary className="cursor-pointer list-none px-3 py-2.5 text-[13px] text-foreground flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">Clip {k + 1} · {c.headline}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">escenas {c.beats.map(b => b + 1).join(", ")}</span>
                </summary>
                <div className="px-3 pb-3 space-y-2">
                  {c.subline && <p className="text-[12px] text-muted-foreground">{c.subline}</p>}
                  <pre className="text-[11px] text-foreground whitespace-pre-wrap break-words max-h-56 overflow-auto rounded-lg bg-card p-2">{c.prompt}</pre>
                  <button onClick={() => void copyText(c.prompt)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border text-[12px] text-foreground"><Copy className="w-3.5 h-3.5" /> Copiar</button>
                </div>
              </details>
            ))}
          </section>
        )}

        {/* 3. Voz */}
        {plan && (
          <section className="rounded-2xl border border-border p-4 sm:p-5 space-y-3 min-w-0">
            {step(3, "Voz (opcional)", "Una voz en español latino narra tu video y las escenas se ajustan a su ritmo.")}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setVoiceOn(true)} disabled={busy} className={chip(voiceOn)}><Mic className="w-3.5 h-3.5 inline mr-1" />Con voz</button>
              <button onClick={() => setVoiceOn(false)} disabled={busy} className={chip(!voiceOn)}>Sin voz</button>
            </div>
            {voiceOn && (
              <>
                <div className="flex flex-wrap gap-2">{VOICES.map(v => <button key={v} onClick={() => setVoice(v)} disabled={busy} className={chip(voice === v)}>{VOICE_LABEL[v]}</button>)}</div>
                {voiceReady
                  ? <p className="inline-flex items-center gap-1.5 text-[12px] text-foreground"><Check className="w-4 h-4 text-primary" /> Voz lista ({fmtSec(total)})</p>
                  : (
                    <button onClick={() => void makeVoice()} disabled={busy}
                      className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-border text-[13px] text-foreground hover:border-foreground/30 disabled:opacity-60">
                      {voicing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      {voicing ? "Creando la voz…" : `${take ? "Rehacer la voz" : "Crear la voz"} · ${chunks.length * VOICE_PRICE} créditos`}
                    </button>
                  )}
              </>
            )}
            {!voiceOn && <p className="text-[11px] text-muted-foreground">El video sale sin audio: ponle la música que quieras al subirlo a Instagram o TikTok.</p>}
          </section>
        )}
      </div>

      {/* 4. Ver y descargar */}
      <aside className="space-y-3 min-w-0 lg:sticky lg:top-4 self-start">
        <div className={`relative rounded-2xl border border-border overflow-hidden bg-black ${format === "16:9" ? "aspect-video" : format === "1:1" ? "aspect-square" : "aspect-[9/16] max-h-[70vh] mx-auto"}`}>
          <canvas ref={canvasRef} width={W} height={H} className="w-full h-full object-contain" aria-label="Vista previa del motion graphics" />
          {playing && <div className="absolute left-0 bottom-0 h-1 bg-primary transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />}
          {!plan && !playing && <span className="absolute top-3 left-3 text-[11px] px-2 py-1 rounded-full bg-black/60 text-white">Muestra del estilo</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void run(false)} disabled={playing === "record" || reading || planning || voicing}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-border text-[13px] text-foreground hover:border-foreground/30 disabled:opacity-60">
            {playing === "preview" ? <><Pause className="w-4 h-4" /> Parar</> : <><Play className="w-4 h-4" /> Ver{voiceOn && voiceReady ? " con voz" : ""} · gratis</>}
          </button>
          {plan && (
            <button onClick={() => void run(true)} disabled={playing === "preview" || reading || planning || voicing || (voiceOn && !voiceReady)}
              className="btn-primary-nova inline-flex items-center gap-2 h-10 px-4 rounded-full text-[13px] font-semibold disabled:opacity-60">
              {playing === "record" ? <><Loader2 className="w-4 h-4 animate-spin" /> Grabando… (parar)</> : <><Download className="w-4 h-4" /> Crear video · gratis</>}
            </button>
          )}
        </div>
        {plan && voiceOn && !voiceReady && <p className="text-[11px] text-muted-foreground">Crea la voz (paso 3) o elige "Sin voz" para grabar.</p>}
        {playing === "record" && <p className="text-[11px] text-muted-foreground">Se graba en tiempo real ({fmtSec(total)}). No cierres esta pestaña.</p>}
        {plan && !playing && (
          <div className="space-y-1">
            <button onClick={() => void downloadParts()} disabled={packing}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-border text-[13px] text-foreground hover:border-foreground/30 disabled:opacity-60">
              {packing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />} Bajar todas las partes · gratis
            </button>
            <p className="text-[11px] text-muted-foreground">{result ? "Video, voz, subtítulos, prompts y plan" : "Voz, subtítulos, prompts y plan (crea el video para incluirlo)"} en un .zip, para terminar en CapCut o Remotion.</p>
          </div>
        )}

        {result && plan && (
          <div className="rounded-2xl border border-border p-4 space-y-3">
            <a href={result.url} download={`supernova-motion.${result.ext}`}
              className="btn-primary-nova inline-flex items-center justify-center gap-2 rounded-xl px-4 h-11 text-[14px] font-semibold w-full">
              <Download className="w-4 h-4" /> Descargar video ({result.ext.toUpperCase()})
            </a>
            {plan.caption && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">Texto para publicar</p>
                <p className="text-[13px] text-foreground whitespace-pre-line">{plan.caption}</p>
                <button onClick={async () => { try { await navigator.clipboard.writeText(plan.caption); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { toast.error("No se pudo copiar."); } }}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border text-[12px] text-foreground">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copiado" : "Copiar texto"}
                </button>
              </div>
            )}
            <AddToTracker kind="corto" title={plan.title.slice(0, 120)} source="video-motion" className="h-9 min-h-0 rounded-full px-3 text-[12px]" />
            <ToolFeedback tool="motion" context={{ estilo: style.name, modelado: !!style.master_prompt, fuente: source, segundos: seconds, voz: voiceOn && voiceReady, formato: format }} />
            {result.ext === "webm" && <p className="text-[11px] text-muted-foreground">Tu navegador lo guarda en WebM: Instagram, TikTok y YouTube lo aceptan. Si necesitas MP4, ábrelo en Chrome o Safari actualizados.</p>}
          </div>
        )}
      </aside>
    </div>
  );
}
