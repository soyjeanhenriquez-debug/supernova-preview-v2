import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Crop, Download, Eraser, Eye, Loader2, Pause, Play, RotateCcw, Upload, X } from "lucide-react";
import { ToolShell } from "@/components/tool/ToolShell";
import { ToolFeedback } from "@/components/ToolFeedback";
import {
  computeResidue, CORNER_LABEL, detectAuto, drawClean, exportClean, LOW_CONFIDENCE, MAX_SECONDS, MIN_CONFIDENCE, modelFromRect,
  PRESETS, workSize, type CleanParams, type Engine, type MarkModel, type PresetId, type Rect,
} from "@/lib/watermark";

/**
 * Quitar marca de agua (20-oct-2026, pedido de Jean; misma pantalla que la de AvatarHype Academy con
 * el estilo de SUPERNOVA). Para los videos que la persona generó con Gemini, Omni Flash o Veo: la
 * marca se encuentra sola; en "General" se marca un recuadro. Todo en el navegador (src/lib/watermark.ts):
 * el video no sale del equipo y no gasta créditos.
 */
type Mode = "auto" | "general";
type EngineChoice = "auto" | Engine;

const PRESET_CARDS: { id: PresetId; title: string; line: string }[] = [
  { id: "recomendado", title: "Recomendado", line: "El equilibrio que deja los clips limpios." },
  { id: "limpieza", title: "Más limpieza", line: "Si aún se ve una marca levísima." },
  { id: "fidelidad", title: "Máxima fidelidad", line: "Si notas la zona borrosa." },
];
const MBPS = [4, 8, 12, 16];
const fmt = (n: number, d = 1) => n.toLocaleString("es", { minimumFractionDigits: d, maximumFractionDigits: d });

export function QuitarMarca({ onNavigate }: { onNavigate: (page: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const exportCanvas = useRef<HTMLCanvasElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [size, setSize] = useState<{ W: number; H: number; dur: number } | null>(null);
  const [mode, setMode] = useState<Mode>("auto");
  const [preset, setPreset] = useState<PresetId>("recomendado");
  const [params, setParams] = useState<CleanParams>({ ...PRESETS.recomendado, adaptive: false });
  const [engine, setEngine] = useState<EngineChoice>("auto");
  const [lowConf, setLowConf] = useState(false);
  const [mbps, setMbps] = useState(8);
  const [found, setFound] = useState<MarkModel | null>(null);
  const [searched, setSearched] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; r: Rect } | null>(null);
  const [busy, setBusy] = useState<"" | "buscar" | "video">("");
  const [progress, setProgress] = useState(0);
  const [original, setOriginal] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const threshold = lowConf ? LOW_CONFIDENCE : MIN_CONFIDENCE;
  const model = found && (found.engine === "rellenar" || found.confidence >= threshold) ? found : null;
  const residue = useMemo(() => (model ? computeResidue(model, params.gain) : null), [model, params.gain]);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Color de marca para el recuadro (el ámbar del sistema).
  const amber = useMemo(() => {
    const v = typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() : "";
    return v ? `hsl(${v})` : "#f5a524";
  }, []);

  const render = useCallback(() => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c || !size || !v.videoWidth) return;
    if (c.width !== size.W) c.width = size.W;
    if (c.height !== size.H) c.height = size.H;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return;
    drawClean(g, v, size.W, size.H, original ? null : model, params, residue);
    const r = drag?.r ?? (mode === "general" ? rect : null);
    if (r && (busy !== "video")) {
      g.save();
      g.strokeStyle = amber; g.lineWidth = Math.max(2, size.W / 360); g.setLineDash([g.lineWidth * 4, g.lineWidth * 3]);
      g.strokeRect(r.x, r.y, r.w, r.h);
      g.restore();
    }
  }, [size, original, model, params, residue, drag, mode, rect, busy, amber]);

  const renderRef = useRef(render);
  renderRef.current = render;
  useEffect(() => { if (!playing) render(); }, [render, playing]);

  // Mientras se reproduce, cada cuadro se limpia en vivo.
  useEffect(() => {
    const v = videoRef.current as (HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number; cancelVideoFrameCallback?: (h: number) => void }) | null;
    if (!playing || !v) return;
    let id = 0, stop = false;
    const tick = () => {
      if (stop) return;
      renderRef.current();
      setTime(v.currentTime);
      id = v.requestVideoFrameCallback ? v.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
    };
    tick();
    return () => { stop = true; if (v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(id); else cancelAnimationFrame(id); };
  }, [playing]);

  const reset = () => { setFound(null); setSearched(false); setRect(null); setDone(false); setError(""); };

  const pick = (f: File | null) => {
    if (!f || busy) return;
    if (!f.type.startsWith("video/") && !/\.(mp4|mov|webm|m4v)$/i.test(f.name)) { toast.error("Ese archivo no es un video. Sube un MP4, MOV o WebM."); return; }
    videoRef.current?.pause(); setPlaying(false);
    reset(); setSize(null); setTime(0);
    setFile(f);
    setUrl(URL.createObjectURL(f));
  };

  const search = useCallback(async (m: Mode, r: Rect | null, eng: EngineChoice) => {
    if (!url || !size) return;
    if (m === "general" && !r) return;
    setBusy("buscar"); setError(""); setDone(false);
    try {
      const res = m === "auto" ? await detectAuto(url, size.W, size.H) : await modelFromRect(url, size.W, size.H, r!, eng);
      setFound(res);
    } catch (e) {
      setFound(null);
      setError(e instanceof Error ? e.message : "No pudimos leer el video.");
    } finally { setSearched(true); setBusy(""); }
  }, [url, size]);

  const onLoaded = () => {
    const v = videoRef.current;
    if (!v) return;
    if (!v.videoWidth || !v.videoHeight) { setError("Tu navegador puede abrir este archivo pero no ver la imagen (pasa con videos HEVC en Chrome). Ábrelo en Safari o expórtalo como MP4 (H.264)."); return; }
    if (v.duration > MAX_SECONDS + 1) { setError(`El video dura ${Math.round(v.duration)} s. El máximo es ${MAX_SECONDS} s: recórtalo y vuelve a subirlo.`); return; }
    const { W, H } = workSize(v.videoWidth, v.videoHeight);
    setSize({ W, H, dur: v.duration });
  };

  // Al tener el video listo, en modo Gemini se busca la marca sin pedir nada.
  useEffect(() => { if (size && mode === "auto" && !searched && !busy) void search("auto", null, engine); }, [size]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeMode = (m: Mode) => {
    if (m === mode || busy) return;
    setMode(m); reset();
    if (m === "auto" && size) void search("auto", null, engine);
  };
  const changeEngine = (e: EngineChoice) => {
    setEngine(e);
    if (mode === "general" && rect) void search("general", rect, e);
  };
  const choosePreset = (id: PresetId) => { setPreset(id); setParams(p => ({ ...p, ...PRESETS[id] })); };
  const restore = () => { setPreset("recomendado"); setParams({ ...PRESETS.recomendado, adaptive: false }); setLowConf(false); setMbps(8); changeEngine("auto"); };

  // Modo General: arrastrar sobre el video marca el recuadro.
  const toVideo = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(size!.W, (e.clientX - b.left) / b.width * size!.W)),
      y: Math.max(0, Math.min(size!.H, (e.clientY - b.top) / b.height * size!.H)),
    };
  };
  const span = (x0: number, y0: number, x1: number, y1: number): Rect => ({
    x: Math.round(Math.min(x0, x1)), y: Math.round(Math.min(y0, y1)), w: Math.round(Math.abs(x1 - x0)), h: Math.round(Math.abs(y1 - y0)),
  });
  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (mode !== "general" || !size || busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toVideo(e);
    setDrag({ x0: p.x, y0: p.y, r: { x: p.x, y: p.y, w: 0, h: 0 } });
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drag) return;
    const p = toVideo(e);
    setDrag({ ...drag, r: span(drag.x0, drag.y0, p.x, p.y) });
  };
  const onUp = () => {
    if (!drag) return;
    const r = drag.r;
    setDrag(null);
    if (r.w < 8 || r.h < 8) return;
    setRect(r); setFound(null); setSearched(false);
    void search("general", r, engine);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v || !size) return;
    if (playing) { v.pause(); setPlaying(false); }
    else { void v.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
  };
  const scrub = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause(); setPlaying(false);
    v.currentTime = t; setTime(t);
  };

  const save = (blob: Blob, name: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  };

  const download = async () => {
    if (!model || !url || !size || busy) return;
    videoRef.current?.pause(); setPlaying(false);
    setBusy("video"); setProgress(0); setError("");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      exportCanvas.current ??= document.createElement("canvas");
      const res = await exportClean(url, model, params, residue, {
        canvas: exportCanvas.current, W: size.W, H: size.H, mbps, signal: ac.signal,
        onProgress: (t, total) => setProgress(total ? Math.min(99, Math.round(t / total * 100)) : 0),
      });
      const base = (file?.name ?? "video").replace(/\.[^.]+$/, "");
      save(res.blob, `${base}-sin-marca.${res.ext}`);
      setDone(true);
      toast.success("Tu video limpio está descargado", { description: res.ext === "mp4" ? "Es un MP4 que se abre en cualquier celular o computadora." : "Es un WebM: si tu celular no lo abre, pásalo por CapCut." });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") toast("Cancelaste la descarga.");
      else { console.error("quitar marca", e); setError(e instanceof Error && e.message.startsWith("Tu navegador") ? e.message : "Tu navegador no pudo armar el video. Ábrelo en Chrome o Safari actualizados."); }
    } finally { setBusy(""); abortRef.current = null; }
  };

  const step = !file ? 0 : !model ? 1 : 2;
  const ratio = size ? size.W / size.H : 9 / 16;

  const status = (() => {
    if (!file || !size) return null;
    if (busy === "buscar") return <Note icon={<Loader2 className="w-4 h-4 animate-spin text-primary" />}>{mode === "auto" ? "Buscando la marca en tu video…" : "Analizando el recuadro…"}</Note>;
    if (mode === "general" && !rect) return <Note icon={<Crop className="w-4 h-4 text-primary" />}>Arrastra sobre el video para marcar dónde está la marca. Cúbrela completa, con un poco de margen.</Note>;
    if (!searched) return null;
    if (model) {
      return (
        <Note icon={<Check className="w-4 h-4 text-primary" />}>
          {model.engine === "rellenar" ? "Listo: el recuadro se rellena desde sus bordes." : model.corner ? `Marca encontrada ${CORNER_LABEL[model.corner]}.` : "Listo: se recupera lo que hay debajo de la marca."}
          {" "}Mantén presionado <span className="font-semibold">Ver original</span> para comparar.
        </Note>
      );
    }
    return (
      <p role="alert" className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-[12px] text-foreground">
        {mode === "auto"
          ? <>No encontramos una marca clara. Activa <span className="font-semibold">Aceptar marcas dudosas</span> en Más opciones o cambia a <span className="font-semibold">General</span> y márcala tú.</>
          : <>No pudimos limpiar ese recuadro. Prueba en Más opciones con el motor <span className="font-semibold">Rellenar desde los bordes</span>.</>}
      </p>
    );
  })();

  const preview = (
    <div className="card-surface rounded-2xl p-3 sm:p-4 space-y-3">
      <video ref={videoRef} src={url ?? undefined} className="pointer-events-none absolute h-px w-px opacity-0" aria-hidden muted playsInline preload="auto"
        onLoadedData={onLoaded} onSeeked={() => renderRef.current()} onEnded={() => setPlaying(false)} />
      {url && !error.startsWith("Tu navegador puede") ? (
        <>
          <div className="relative mx-auto overflow-hidden rounded-xl bg-black [--pv-h:52dvh] lg:[--pv-h:68dvh]"
            style={{ aspectRatio: `${ratio}`, width: `min(100%, calc(var(--pv-h) * ${ratio}))` }}>
            <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}
              className={`block h-full w-full ${mode === "general" && !busy ? "cursor-crosshair touch-none" : ""}`}
              aria-label={mode === "general" ? "Vista previa: arrastra para marcar la marca de agua" : "Vista previa del video sin marca"} />
            {!size && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}
            {busy === "video" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-sm text-foreground">Armando tu video… {progress} %</span>
              </div>
            )}
          </div>
          {size && (
            <div className="flex items-center gap-3">
              <button type="button" onClick={togglePlay} disabled={busy === "video"} aria-label={playing ? "Pausar" : "Reproducir"}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-foreground hover:bg-secondary/60 disabled:opacity-50">
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <input type="range" min={0} max={size.dur} step={0.01} value={time} onChange={e => scrub(Number(e.target.value))} disabled={busy === "video"}
                aria-label="Mover a otro momento del video" className="min-w-0 flex-1 accent-[hsl(var(--primary))]" />
              <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{fmt(time)} s</span>
              <button type="button" disabled={!model || busy === "video"}
                onPointerDown={() => setOriginal(true)} onPointerUp={() => setOriginal(false)} onPointerLeave={() => setOriginal(false)}
                onKeyDown={e => { if (e.key === " " || e.key === "Enter") setOriginal(true); }} onKeyUp={() => setOriginal(false)}
                className="inline-flex min-h-[40px] shrink-0 select-none items-center gap-1.5 rounded-full border border-border px-3 text-[12px] text-foreground hover:bg-secondary/60 disabled:opacity-40">
                <Eye className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Ver</span> original
              </button>
            </div>
          )}
        </>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files?.[0] ?? null); }}
          className="mx-auto flex min-h-[320px] w-full max-w-md flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-secondary/30 p-6 text-center hover:border-primary/50">
          <Upload className="w-6 h-6 text-primary" />
          <span className="font-display text-base font-semibold text-foreground">Arrastra tu video aquí</span>
          <span className="text-[12px] text-muted-foreground">o toca para elegirlo · MP4, MOV o WebM, hasta {MAX_SECONDS} segundos</span>
        </button>
      )}
      <p className="text-center text-[11px] text-muted-foreground">
        {!url ? "Aquí verás tu video sin la marca." : mode === "general" ? "Arrastra sobre el video para marcar el recuadro." : "Así queda tu video. Dale play para verlo en movimiento."}
      </p>
    </div>
  );

  const aside = (
    <>
      <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,video/webm,video/*" className="sr-only" onChange={e => { pick(e.target.files?.[0] ?? null); e.target.value = ""; }} />

      <Card label="1 · Tu video">
        <div role="radiogroup" aria-label="Tipo de marca" className="grid grid-cols-2 gap-2">
          {([
            ["auto", "Gemini · Omni · Veo", "La encuentra sola"],
            ["general", "General", "Otra marca: tú la marcas"],
          ] as const).map(([id, title, line]) => (
            <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => changeMode(id)} disabled={!!busy}
              className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${mode === id ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/30"}`}>
              <span className="block text-[13px] font-semibold text-foreground">{title}</span>
              <span className="block text-[11px] text-muted-foreground">{line}</span>
            </button>
          ))}
        </div>
        <p className="text-[12px] text-muted-foreground">
          {mode === "auto"
            ? "¿Tu video es de Gemini, Omni Flash o Veo? Este modo encuentra la marca y la borra solo. Si es de otra herramienta (Kling, Runway…) o es un logo fijo, cambia a General."
            : "Para marcas que no se mueven. Si son transparentes se recupera lo de debajo; si son opacas, se rellena desde los bordes."}
        </p>
        {file ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
            <p className="min-w-0 truncate text-sm text-foreground">{file.name}</p>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={!!busy} className="shrink-0 text-[12px] text-primary hover:underline disabled:opacity-50">Cambiar</button>
          </div>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()} className="btn-primary-nova inline-flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl text-sm font-semibold"><Upload className="w-4 h-4" /> Elegir mi video</button>
        )}
        {status}
        {error && <p role="alert" className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-[12px] text-foreground">{error}</p>}
      </Card>

      <Card label="2 · Elige un ajuste">
        <p className="text-[12px] text-muted-foreground">Empieza por Recomendado: funciona solo, no hace falta tocar nada más.</p>
        <div role="radiogroup" aria-label="Ajuste" className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
          {PRESET_CARDS.map(c => (
            <button key={c.id} type="button" role="radio" aria-checked={preset === c.id} onClick={() => choosePreset(c.id)}
              className={`rounded-xl border p-3 text-left transition-colors ${preset === c.id ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/30"}`}>
              <span className="flex items-center justify-between gap-2 text-[13px] font-semibold text-foreground">{c.title}
                {preset === c.id && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">Activo</span>}</span>
              <span className="block text-[11px] text-muted-foreground">{c.line}</span>
            </button>
          ))}
        </div>

        <div className="space-y-3 rounded-xl border border-border p-3">
          <p className="text-[12px] font-semibold text-foreground">¿Todavía se ve algo de la marca?</p>
          <p className="-mt-2 text-[11px] text-muted-foreground">Mueve estos dos y mira la vista previa: el cambio es al instante y no gasta nada.</p>
          <Slider label="Limpieza de bordes" value={params.edge} min={0} max={3} step={0.1}
            help="Súbelo si aún se ve un halo alrededor. Bájalo si se ve borroso." onChange={v => setParams(p => ({ ...p, edge: v }))} />
          {(!model || model.engine === "recuperar") && (
            <Slider label="Limpieza de residuo" value={params.residue} min={0} max={2} step={0.1}
              help="Quita el brillo fijo que a veces queda donde estaba la marca." onChange={v => setParams(p => ({ ...p, residue: v }))} />
          )}
        </div>

        <details className="group">
          <summary className="flex min-h-[40px] cursor-pointer list-none items-center justify-between text-sm text-foreground">
            Más opciones (avanzado) <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 space-y-4">
            <label className="block text-[12px] text-muted-foreground">Motor de limpieza
              <select value={engine} onChange={e => changeEngine(e.target.value as EngineChoice)} disabled={mode === "auto" || !!busy}
                className="mt-1 w-full min-h-[44px] rounded-lg border border-border bg-background px-3 text-base sm:text-sm text-foreground focus:border-primary/60 focus:outline-none disabled:opacity-60">
                <option value="auto">Automático (recomendado)</option>
                <option value="recuperar">Recuperar lo de debajo (marcas transparentes)</option>
                <option value="rellenar">Rellenar desde los bordes (logos opacos)</option>
              </select>
              <span className="mt-1 block text-[11px]">{mode === "auto" ? "En Gemini · Omni · Veo siempre se recupera lo de debajo." : "Cómo se reconstruye el hueco de la marca."}</span>
            </label>
            {(!model || model.engine === "recuperar") && (
              <Slider label="Fuerza del borrado" value={params.gain} min={0.8} max={1.3} step={0.01} digits={2}
                help="Cuánto se resta de la marca. Súbelo si queda clara, bájalo si queda una mancha oscura." onChange={v => setParams(p => ({ ...p, gain: v }))} />
            )}
            <div className="grid gap-2">
              <Toggle on={params.adaptive} onClick={() => setParams(p => ({ ...p, adaptive: !p.adaptive }))}
                title="Ajustar cuadro a cuadro" line="Reajusta el borrado en cada cuadro (más lento)." />
              <Toggle on={lowConf} onClick={() => setLowConf(v => !v)}
                title="Aceptar marcas dudosas" line="Procesa aunque no esté claro dónde está la marca." />
            </div>
            <div>
              <p className="text-[12px] text-muted-foreground">Calidad del video</p>
              <div role="radiogroup" aria-label="Calidad del video" className="mt-1 grid grid-cols-4 gap-1.5">
                {MBPS.map(m => (
                  <button key={m} type="button" role="radio" aria-checked={mbps === m} onClick={() => setMbps(m)}
                    className={`min-h-[40px] rounded-lg border text-[12px] ${mbps === m ? "border-primary text-foreground ring-1 ring-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{m} Mbps</button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Más alto = archivo más pesado y más nítido.</p>
            </div>
            <button type="button" onClick={restore} className="inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline">
              <RotateCcw className="w-3.5 h-3.5" /> Volver a lo recomendado
            </button>
          </div>
        </details>
      </Card>

      <div className="space-y-2">
        {busy === "video" ? (
          <>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
            <button type="button" onClick={() => abortRef.current?.abort()}
              className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border text-sm text-foreground hover:bg-secondary/60">
              <X className="w-4 h-4" /> Cancelar
            </button>
          </>
        ) : (
          <button type="button" onClick={download} disabled={!model || !!busy}
            className="btn-primary-nova inline-flex w-full min-h-[52px] items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:opacity-50">
            {done ? <><Download className="w-4 h-4" /> Descargar otra vez</> : <><Eraser className="w-4 h-4" /> Descargar sin marca · gratis</>}
          </button>
        )}
        <p className="text-[11px] text-muted-foreground">Se procesa en tu navegador: tu video no sale de tu equipo. Tarda más o menos lo que dura el video; si cambias de pestaña, se pausa y sigue al volver.</p>
        <p className="text-[11px] text-muted-foreground">Úsalo con videos que generaste tú, no con videos ni logos de otras personas. La marca invisible de Google (SynthID) sigue dentro del video, y TikTok, YouTube y Meta piden indicar que un video está hecho con IA cuando parece real.</p>
      </div>

      {done && <ToolFeedback tool="quitar_marca" context={{ modo: mode, motor: model?.engine, ajuste: preset, cuadro_a_cuadro: params.adaptive, mbps }} />}
    </>
  );

  return (
    <ToolShell onNavigate={onNavigate} previewFirst
      crumbs={[{ label: "Crear" }, { label: "Video con IA", onClick: () => onNavigate("Video anuncio") }, { label: "Quitar marca de agua" }]}
      title="Quitar marca de agua"
      line="Sube un video que hiciste con IA, quita la marca y descárgalo limpio. Se procesa en tu navegador: no gasta créditos."
      onBack={() => onNavigate("Video anuncio")} backLabel="Video con IA"
      steps={["Sube tu video", "Quita la marca", "Descárgalo"]} step={step}
      aside={aside}>
      {preview}
    </ToolShell>
  );
}

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="card-surface rounded-2xl p-4 space-y-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function Note({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <p className="flex items-start gap-2 rounded-lg border border-border bg-secondary/30 p-3 text-[12px] text-foreground"><span className="mt-0.5 shrink-0">{icon}</span><span>{children}</span></p>;
}

function Slider({ label, value, min, max, step, help, onChange, digits = 1 }: {
  label: string; value: number; min: number; max: number; step: number; help: string; onChange: (v: number) => void; digits?: number;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[12px] text-foreground">{label}<span className="tabular-nums text-muted-foreground">{fmt(value, digits)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[hsl(var(--primary))]" />
      <span className="block text-[11px] text-muted-foreground">{help}</span>
    </label>
  );
}

function Toggle({ on, onClick, title, line }: { on: boolean; onClick: () => void; title: string; line: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-secondary/40">
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-foreground">{title}</span>
        <span className="block text-[11px] text-muted-foreground">{line}</span>
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-secondary"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

export default QuitarMarca;
