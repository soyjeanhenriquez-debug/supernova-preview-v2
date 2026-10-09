import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Box, Loader2, Orbit, Plus, RefreshCw, Replace, Shirt, Sparkles, UserRound, Video, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { GENJUTSU_OWNER_ID as OWNER_ID } from "@/lib/genjutsuOwner";

/**
 * Genjutsu (07-oct-2026): laboratorio oculto SOLO para Jean. Video de referencia con Seedance 2.0
 * (Higgsfield o APIMart). Sin créditos, sin planes, sin pulir. La compuerta real está en el servidor
 * (genjutsu-generate / genjutsu-status) y en la RLS; esto solo esconde la pantalla a los demás.
 */
const BUCKET = "genjutsu";
const MAX_BYTES = 50 * 1024 * 1024;
type Provider = "higgsfield" | "apimart";
type Mode = "movimiento" | "objetos";
type Job = { id: string; provider: Provider; mode: Mode; task_id: string | null; status: string; prompt: string; result_url: string | null; error: string | null; created_at: string };
const MAX_IMAGES = 9;
const MODES: Record<Mode, { label: string; icon: typeof Orbit; video: string; images: string; hint: string }> = {
  movimiento: { label: "Transferencia de movimiento", icon: Orbit, video: "Añade el video a modelar para extraer el movimiento", images: "Añade tus personajes, productos o ropa", hint: "Tus personajes hacen exactamente los movimientos del video." },
  objetos: { label: "Intercambio de objetos", icon: Replace, video: "Añade el video donde quieres cambiar el objeto", images: "Añade el producto, objeto o ropa nuevo", hint: "El video queda igual y solo cambia el objeto por el tuyo." },
};
const STATUS: Record<string, string> = { queued: "En cola", in_progress: "Creando…", completed: "Listo", failed: "Falló" };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;

/** Lee duración y tamaño del video en el navegador. */
function videoMeta(file: File): Promise<{ seconds: number; w: number; h: number }> {
  return new Promise((res, rej) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    v.preload = "metadata"; v.muted = true;
    v.onloadedmetadata = () => { res({ seconds: v.duration, w: v.videoWidth, h: v.videoHeight }); URL.revokeObjectURL(url); };
    v.onerror = () => { rej(new Error("No se pudo leer el video.")); URL.revokeObjectURL(url); };
    v.src = url;
  });
}

async function errMsg(error: unknown, fallback: string) {
  const ctx = (error as { context?: Response })?.context;
  try { const j = await ctx?.json(); if (j?.error) return String(j.error); } catch { /* sin cuerpo */ }
  return fallback;
}

export default function GenjutsuPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("movimiento");
  const [video, setVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ seconds: number; w: number; h: number } | null>(null);
  const [videoErr, setVideoErr] = useState("");
  const [images, setImages] = useState<{ file: File; url: string }[]>([]);
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState<Provider>("higgsfield");
  const [duration, setDuration] = useState(5);
  const [aspect, setAspect] = useState("9:16");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const polling = useRef(false);
  const videoInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await db().from("genjutsu_jobs").select("id,provider,mode,task_id,status,prompt,result_url,error,created_at").order("created_at", { ascending: false }).limit(30);
    setJobs((data ?? []) as Job[]);
  }, []);
  useEffect(() => { if (user?.id === OWNER_ID) void load(); }, [user, load]);

  // Mientras haya trabajos pendientes, consulta al proveedor cada 10 s.
  const pending = jobs.some(j => j.task_id && (j.status === "queued" || j.status === "in_progress"));
  const refresh = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try { await supabase.functions.invoke("genjutsu-status", { body: {} }); await load(); } finally { polling.current = false; }
  }, [load]);
  useEffect(() => {
    if (!pending) return;
    const t = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(t);
  }, [pending, refresh]);

  if (!user || user.id !== OWNER_ID) return <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">Página no encontrada.</div>;

  const pickVideo = async (f: File | null) => {
    setVideoErr("");
    if (!f) return;
    if (!/\.(mp4|mov)$/i.test(f.name) && !/^video\/(mp4|quicktime)$/.test(f.type)) { setVideoErr("Solo mp4 o mov."); return; }
    if (f.size > MAX_BYTES) { setVideoErr("Pesa más de 50 MB."); return; }
    try {
      const m = await videoMeta(f);
      if (!(m.seconds >= 2 && m.seconds <= 15)) { setVideoErr(`Dura ${m.seconds.toFixed(1)} s: tiene que durar de 2 a 15 s.`); return; }
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideo(f); setMeta(m); setVideoUrl(URL.createObjectURL(f));
    } catch (e) { setVideoErr(e instanceof Error ? e.message : "No se pudo leer el video."); }
  };
  const addImages = (list: FileList | null) => {
    const files = [...(list ?? [])].filter(f => /^image\/(jpeg|png|webp)$/.test(f.type));
    setImages(cur => [...cur, ...files.map(file => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX_IMAGES));
  };
  const removeImage = (i: number) => setImages(cur => { URL.revokeObjectURL(cur[i].url); return cur.filter((_, k) => k !== i); });

  const upload = async (f: File, kind: string) => {
    const ext = (f.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") || (kind === "ref" ? "mp4" : "jpg");
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${kind}.${ext}`;
    const type = f.type || (ext === "mov" ? "video/quicktime" : ext === "mp4" ? "video/mp4" : "image/jpeg");
    const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: type, upsert: false });
    if (error) throw new Error(`No se pudo subir ${kind === "ref" ? "el video" : "una imagen"}: ${error.message}`);
    return path;
  };

  const generate = async () => {
    if (busy) return;
    if (!video) { setMsg("Añade el video primero."); return; }
    if (mode === "objetos" && !images.length) { setMsg("Añade la imagen del objeto nuevo."); return; }
    setMsg("");
    try {
      setBusy("Subiendo el video…");
      const ref = await upload(video, "ref");
      setBusy(images.length ? "Subiendo las imágenes…" : "Mandando…");
      const imgs = await Promise.all(images.map(x => upload(x.file, "img")));
      setBusy("Mandando al proveedor…");
      const { data, error } = await supabase.functions.invoke("genjutsu-generate", {
        body: { mode, prompt: prompt.trim(), ref_video_path: ref, image_paths: imgs, duration, aspect_ratio: aspect, provider },
      });
      if (error) throw new Error(await errMsg(error, "No se pudo generar."));
      setMsg(`Enviado. Tarda unos minutos; aparece abajo cuando esté listo.${data?.task_id ? "" : ""}`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo generar.");
      await load();
    } finally { setBusy(""); }
  };

  const shortSide = meta ? Math.min(meta.w, meta.h) : 0;
  const M = MODES[mode];
  const chip = (on: boolean) => `h-9 px-3.5 rounded-full border text-[13px] ${on ? "border-primary text-foreground bg-primary/10" : "border-border text-muted-foreground"}`;
  const zone = "rounded-2xl border border-dashed border-border bg-card/40 p-5";
  const roundIcon = "w-14 h-14 rounded-full border border-border bg-card flex items-center justify-center";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-xl mx-auto px-4 pt-6 pb-32 space-y-4">
        <a href="/app#/video-anuncio" className="inline-flex items-center gap-1.5 h-10 text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Volver a Video con IA
        </a>
        <div className="text-center space-y-1">
          <p className="font-display text-[28px] font-bold tracking-tight">Genjutsu</p>
          <p className="text-[12px] text-muted-foreground">Seedance 2.0 · solo para ti · sin créditos</p>
        </div>

        {/* Modos */}
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border p-1">
          {(Object.keys(MODES) as Mode[]).map(id => {
            const Icon = MODES[id].icon;
            return (
              <button key={id} type="button" onClick={() => setMode(id)}
                className={`min-h-[48px] rounded-xl px-3 flex items-center justify-center gap-2 text-[13px] ${mode === id ? "bg-card text-foreground border border-border" : "text-muted-foreground"}`}>
                <Icon className="w-4 h-4 shrink-0" /> <span className="truncate">{MODES[id].label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[12px] text-muted-foreground text-center">{M.hint}</p>

        {/* Video a modelar */}
        <input ref={videoInput} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="hidden" onChange={e => { void pickVideo(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        {video && videoUrl ? (
          <div className="rounded-2xl border border-border overflow-hidden bg-black">
            <video src={videoUrl} controls playsInline muted className="w-full max-h-[50vh]" />
            <div className="flex items-center justify-between px-4 py-2.5 bg-card text-[12px]">
              <span className="text-muted-foreground">{meta?.seconds.toFixed(1)} s · {meta?.w}×{meta?.h}</span>
              <button type="button" onClick={() => videoInput.current?.click()} className="text-foreground underline underline-offset-4">Cambiar</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => videoInput.current?.click()} className={`${zone} w-full flex flex-col items-center text-center gap-3 py-8`}>
            <span className={roundIcon}><Video className="w-6 h-6" /></span>
            <span className="text-[17px] font-semibold leading-snug">{M.video}</span>
            <span className="text-[13px] text-muted-foreground">mp4 o mov · de 2 a 15 segundos · máx. 50 MB</span>
          </button>
        )}
        {videoErr && <p className="text-[12px] text-red-400 text-center">{videoErr}</p>}
        {provider === "apimart" && meta && (shortSide < 480 || shortSide > 720) && (
          <p className="text-[12px] text-amber-400 text-center">APIMart pide el video entre 480p y 720p (este tiene {shortSide}p): puede rechazarlo. Higgsfield lo acepta.</p>
        )}

        {/* Imágenes de referencia */}
        <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e => { addImages(e.target.files); e.target.value = ""; }} />
        {images.length ? (
          <div className={`${zone} space-y-3`}>
            <p className="text-[13px] text-muted-foreground">{images.length} de {MAX_IMAGES} imágenes</p>
            <div className="grid grid-cols-3 gap-2">
              {images.map((x, i) => (
                <div key={x.url} className="relative aspect-square rounded-xl overflow-hidden border border-border">
                  <img src={x.url} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeImage(i)} aria-label="Quitar imagen" className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center"><X className="w-4 h-4" /></button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <button type="button" onClick={() => imageInput.current?.click()} aria-label="Añadir imágenes" className="aspect-square rounded-xl border border-dashed border-border flex items-center justify-center text-muted-foreground"><Plus className="w-6 h-6" /></button>
              )}
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => imageInput.current?.click()} className={`${zone} w-full flex flex-col items-center text-center gap-3 py-8`}>
            <span className="flex -space-x-2">
              {[UserRound, Shirt, Box].map((I, k) => <span key={k} className={roundIcon}><I className="w-5 h-5" /></span>)}
            </span>
            <span className="text-[17px] font-semibold leading-snug">{M.images}</span>
            <span className="text-[13px] text-muted-foreground">Hasta {MAX_IMAGES} imágenes{mode === "movimiento" ? " · opcional" : ""}</span>
          </button>
        )}

        {/* Detalles y ajustes */}
        <div className="rounded-2xl border border-border p-4 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-[13px]">Detalles <span className="text-muted-foreground">(opcional)</span></span>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} maxLength={3000} placeholder="Ej.: de noche, luz de neón, cámara un poco más cerca"
              className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-[14px] placeholder:text-muted-foreground" />
          </label>
          <div className="space-y-1.5">
            <p className="text-[13px]">Proveedor</p>
            <div className="flex flex-wrap gap-2">
              {(["higgsfield", "apimart"] as Provider[]).map(p => (
                <button key={p} type="button" onClick={() => { setProvider(p); if (p === "higgsfield" && aspect === "adaptive") setAspect("9:16"); }} className={chip(provider === p)}>{p === "higgsfield" ? "Higgsfield" : "APIMart"}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-[13px]">Duración</p>
            <div className="flex flex-wrap gap-2">{[5, 8, 10, 15].map(d => <button key={d} type="button" onClick={() => setDuration(d)} className={chip(duration === d)}>{d} s</button>)}</div>
          </div>
          <div className="space-y-1.5">
            <p className="text-[13px]">Formato</p>
            <div className="flex flex-wrap gap-2">
              {["9:16", "16:9", "1:1", "4:3", "3:4", "21:9", ...(provider === "apimart" ? ["adaptive"] : [])].map(a => (
                <button key={a} type="button" onClick={() => setAspect(a)} className={chip(aspect === a)}>{a === "adaptive" ? "Como el video" : a}</button>
              ))}
            </div>
          </div>
        </div>
        {msg && <p className="text-[13px] text-muted-foreground text-center">{msg}</p>}

        {/* Trabajos */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-semibold">Tus videos</h2>
            <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground"><RefreshCw className="w-3.5 h-3.5" /> Actualizar</button>
          </div>
          {jobs.length === 0 && <p className="text-[13px] text-muted-foreground">Todavía no hay videos.</p>}
          {jobs.map(j => (
            <div key={j.id} className="rounded-2xl border border-border p-3 space-y-2">
              <p className="text-[12px] text-muted-foreground">{new Date(j.created_at).toLocaleString("es")} · {j.provider === "higgsfield" ? "Higgsfield" : "APIMart"} · {MODES[j.mode]?.label ?? ""} · <span className={j.status === "completed" ? "text-emerald-400" : j.status === "failed" ? "text-red-400" : "text-foreground"}>{STATUS[j.status] ?? j.status}</span></p>
              {j.error && <p className="text-[12px] text-red-400">{j.error}</p>}
              {j.result_url && (
                <>
                  <video src={j.result_url} controls playsInline className="w-full max-h-[70vh] rounded-xl bg-black" />
                  <a href={j.result_url} target="_blank" rel="noreferrer" className="text-[12px] underline text-muted-foreground">Abrir o descargar</a>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Generar, siempre a mano */}
      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-background via-background to-transparent pt-6 pb-[calc(16px+env(safe-area-inset-bottom))] px-4">
        <div className="max-w-xl mx-auto">
          <button type="button" onClick={() => void generate()} disabled={!!busy}
            className="w-full min-h-[56px] rounded-full bg-primary text-primary-foreground text-[17px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {busy ? <><Loader2 className="w-5 h-5 animate-spin" /> {busy}</> : <>Generar <Sparkles className="w-5 h-5" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
