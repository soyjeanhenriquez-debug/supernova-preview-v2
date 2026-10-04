import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft, Captions, Check, ChevronDown, Clapperboard, Copy, Download, Film, ImageIcon, Loader2, Mic, Monitor, Palette,
  Pause, Play, RefreshCw, Sparkles, Square, Upload, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCredits } from "@/hooks/useCredits";
import { fnHeaders, fnErrorMessage, readBilling } from "@/lib/fnAuth";
import { track } from "@/lib/analytics";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  buildDescription, chapters, checkLimits, estimateCost, parseScenes, pickAnimated, PRICES, suggestVoice, tagsFrom,
  timecode, VOICE_LABEL, VOICES, YT_STYLES, narrationSeconds, type Voice,
} from "@/lib/ytScenes";
import {
  deleteProduction, getMedia, getProduction, progressOf, putMedia, resumeState, saveProduction, storeAvailable,
  type MediaKind, type PieceStatus, type ProductionMeta, type SceneState,
} from "@/lib/productionStore";
import { audioSeconds, canRecord, compressImage, decodeAudio, renderMontage, type Format, type MontageResult } from "@/lib/montage";

/**
 * "Producir video" del Creador de YouTube (04-oct-2026): del guion por escenas a un video
 * terminado, con producción en vivo sobre un storyboard.
 *  1) Plan: la IA ya eligió voz, estilo, % animado y formato; se ve el costo exacto y el botón
 *     "Producir mi video · N créditos" (ese toque es el pedido explícito).
 *  2) En vivo: una tarjeta por escena (voz, imagen, animación), 2 a la vez. Cada pieza la cobra el
 *     servidor (yt-produce / video-studio) antes de gastar y la devuelve si falla. Todo lo pagado
 *     se guarda en el navegador (IndexedDB): recargar no pierde nada ni vuelve a cobrar.
 *  3) Montaje gratis en el navegador (montage.ts) y descarga. No se guarda en el servidor.
 *  4) "Listo para publicar": título, descripción con capítulos, etiquetas, miniatura y 3 pasos.
 */

export type ProduceStart = { script: string; title: string; topic?: string; thumbnail?: string; style: string; format: Format; lang: string };
type Phase = "plan" | "live" | "montage" | "ready";
type Task = { i: number; kind: "voice" | "image" | "clip" };

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const PLAN_CREDITS = 2000;
const CONCURRENCY = 2;
const PCTS = [0, 20, 40];
const FORMATS: { id: Format; label: string }[] = [
  { id: "16:9", label: "16:9 — Horizontal (YouTube)" },
  { id: "9:16", label: "9:16 — Vertical (Shorts)" },
  { id: "3:4", label: "3:4 — Vertical suave (feed)" },
];

class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

async function post(fn: string, body: Record<string, unknown>) {
  const resp = await fetch(`${FN_URL}/${fn}`, { method: "POST", headers: await fnHeaders(), body: JSON.stringify(body) });
  if (!resp.ok) {
    let code: string | undefined;
    try { code = (await resp.clone().json())?.code; } catch { /* sin cuerpo */ }
    throw new ApiError(await fnErrorMessage(resp, "No se pudo completar."), resp.status, code);
  }
  return resp;
}

/** El servidor cobra; aquí solo se refleja el saldo (sin un aviso por cada pieza). */
function billingOf(resp: Response, data?: { billing?: { charged: number; balance: number | null } }): [number, number | null] {
  const b = data?.billing ?? readBilling(resp);
  return [Number(b.charged) || 0, typeof b.balance === "number" ? b.balance : null];
}

const b64ToBlob = (b64: string, mime: string) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

/** ¿video-studio ya tiene la acción "file" (bajar el MP4 propio con CORS)? Prueba gratis, sin cobro. */
let clipProbe: Promise<boolean> | null = null;
function probeClipFile(): Promise<boolean> {
  if (clipProbe) return clipProbe;
  clipProbe = (async () => {
    try {
      const resp = await fetch(`${FN_URL}/video-studio`, {
        method: "POST", headers: await fnHeaders(),
        body: JSON.stringify({ action: "file", job_id: "00000000-0000-4000-8000-000000000000" }),
      });
      // Con "file": trabajo inexistente → 404. Sin "file", la función lo trata como "crear" sin
      // descripción y responde 400 antes de cobrar nada.
      return resp.status === 404;
    } catch { return false; }
  })();
  return clipProbe;
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
/** 2000 → "2.000" (formato español; toLocaleString("es") no agrupa números de 4 cifras). */
const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const fmtMB = (b: number) => `${(b / 1048576).toLocaleString("es", { maximumFractionDigits: 1 })} MB`;

function Chip({ icon: Icon, label, value, children, disabled }: { icon: typeof Mic; label: string; value: string; children: ReactNode; disabled?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button className="inline-flex items-center gap-2 h-10 px-3.5 rounded-xl border border-border bg-card/40 text-[13px] hover:border-foreground/30 disabled:opacity-50 max-w-full">
          <Icon className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.7} />
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
          <span className="text-foreground font-medium truncate">{value}</span>
          {!disabled && <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px]">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

function Pill({ icon: Icon, label, status }: { icon: typeof Mic; label: string; status: PieceStatus | "none" }) {
  if (status === "none") return null;
  const cls = status === "done" ? "text-foreground border-border" : status === "failed" ? "text-destructive border-destructive/40" : "text-muted-foreground border-border/60";
  return (
    <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-full border text-[11px] ${cls}`}>
      {status === "working" ? <Loader2 className="w-3 h-3 animate-spin" /> : status === "done" ? <Check className="w-3 h-3" /> : status === "failed" ? <AlertTriangle className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
      {label}
    </span>
  );
}

export function ProduceStudio({ uid, start, resumeId, onBack, onNavigate }: {
  uid: string; start: ProduceStart | null; resumeId?: string | null; onBack: () => void; onNavigate: (p: string) => void;
}) {
  const { applyServerCharge, balance, refresh: refreshCredits } = useCredits();
  const balanceRef = useRef(balance);
  balanceRef.current = balance;

  // ---------- Plan (antes de gastar) ----------
  const scenes = useMemo(() => (start ? parseScenes(start.script) : []), [start]);
  const limitError = start ? checkLimits(scenes) : null;
  const [voice, setVoice] = useState<Voice>(() => suggestVoice(start?.style ?? "", start?.topic ?? start?.title ?? ""));
  const [style, setStyle] = useState(start?.style ?? "Cinematográfico");
  const [format, setFormat] = useState<Format>(start?.format ?? "16:9");
  const [pct, setPct] = useState(20);
  const [subtitles, setSubtitles] = useState(true);
  const [clipOk, setClipOk] = useState<boolean | null>(null);
  const [persist, setPersist] = useState(true);
  const recordOk = useMemo(() => canRecord(), []);
  const effPct = clipOk ? pct : 0;
  const cost = estimateCost(scenes, effPct);
  const estSeconds = scenes.reduce((a, s) => a + narrationSeconds(s.narration), 0);

  useEffect(() => { void probeClipFile().then(setClipOk); void storeAvailable().then(setPersist); }, []);

  // ---------- Producción ----------
  const [phase, setPhase] = useState<Phase>("plan");
  const [meta, setMeta] = useState<ProductionMeta | null>(null);
  const metaRef = useRef<ProductionMeta | null>(null);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const pausedRef = useRef(false);
  const inflight = useRef(new Set<string>());
  const polling = useRef(new Set<number>());
  const [stopMsg, setStopMsg] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const saveTimer = useRef<number | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const commit = useCallback((next: ProductionMeta, immediate = false) => {
    metaRef.current = next;
    if (alive.current) setMeta(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const save = () => { if (metaRef.current) void saveProduction(metaRef.current); };
    if (immediate) save(); else saveTimer.current = window.setTimeout(save, 400);
  }, []);

  const patchScene = useCallback((i: number, patch: Partial<SceneState>, immediate = true) => {
    const m = metaRef.current;
    if (!m) return;
    commit({ ...m, scenes: m.scenes.map((s, k) => (k === i ? { ...s, ...patch } : s)) }, immediate);
  }, [commit]);

  const addSpent = useCallback((charged: number, bal: number | null) => {
    if (bal !== null) applyServerCharge("gen_media", { charged: 0, balance: bal }); // solo sincroniza el saldo
    const m = metaRef.current;
    if (m && charged) commit({ ...m, spent: m.spent + charged });
  }, [applyServerCharge, commit]);

  const setThumb = useCallback((i: number, blob: Blob | null) => {
    setThumbs(t => {
      if (t[i]) URL.revokeObjectURL(t[i]);
      const n = { ...t };
      if (blob) n[i] = URL.createObjectURL(blob); else delete n[i];
      return n;
    });
  }, []);
  useEffect(() => () => { Object.values(thumbs).forEach(u => URL.revokeObjectURL(u)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Aviso al salir si hay algo pagándose o grabándose.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (inflight.current.size || phase === "montage") { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [phase]);

  const saveServer = useCallback(async (m: ProductionMeta, status: string) => {
    const plan = {
      status, voice: m.voice, style: m.style, pct: m.pct, subtitles: m.subtitles, spent: m.spent,
      narration_seconds: Math.round(m.scenes.reduce((a, s) => a + (s.voiceSec ?? narrationSeconds(s.narration)), 0)),
      scenes: m.scenes.map(s => ({ n: s.n, voice: s.voice, image: s.image, clip: s.clip })),
    };
    try {
      // yt_productions es nueva (migración 20261004060000): si aún no existe, no pasa nada.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = (supabase as any).from("yt_productions");
      if (!m.serverId) {
        const { data } = await t.insert({ title: m.title.slice(0, 200), format: m.format, script: (start?.script ?? "").slice(0, 60000), plan }).select("id").single();
        if (data?.id && metaRef.current) commit({ ...metaRef.current, serverId: data.id }, true);
      } else {
        await t.update({ plan }).eq("id", m.serverId);
      }
    } catch { /* solo metadatos */ }
  }, [commit, start]);

  // ---------- Piezas ----------
  const pollClip = useCallback(async (i: number) => {
    if (polling.current.has(i)) return;
    polling.current.add(i);
    try {
      const jobId = metaRef.current?.scenes[i]?.jobId;
      if (!jobId) return;
      for (let tries = 0; tries < 80 && alive.current; tries++) {
        await new Promise(r => setTimeout(r, 6000));
        const { data, error } = await supabase.functions.invoke("video-studio", { body: { action: "status", job_id: jobId } });
        if (error) continue;
        const st = data?.job?.status;
        if (st === "failed") { patchScene(i, { clip: "failed", error: "La animación falló. Te devolvimos los créditos; la escena usa la imagen con movimiento." }); return; }
        if (st !== "done") continue;
        // Bajar el MP4 con la acción "file" (mismo origen para el lienzo; sin cobro).
        try {
          const resp = await post("video-studio", { action: "file", job_id: jobId });
          if (!/^video\//.test(resp.headers.get("content-type") ?? "")) throw new Error("sin video");
          const blob = await resp.blob();
          await putMedia(metaRef.current!.id, i, "clip", blob);
          patchScene(i, { clip: "done", error: null });
          const m = metaRef.current;
          if (m) void supabase.storage.from("creativos").remove([`${uid}/yt/${m.id}/s${i + 1}.webp`]); // imagen temporal
        } catch (e) {
          // El servidor devuelve los créditos cuando no puede entregar el MP4 (code file_unavailable).
          if (e instanceof ApiError && e.code === "file_unavailable") {
            patchScene(i, { clip: "failed", error: `${e.message} La escena usa la imagen con movimiento.` });
            void refreshCredits();
          } else {
            patchScene(i, { clip: "failed", error: "No pudimos bajar la animación. La escena usa la imagen con movimiento." });
          }
        }
        return;
      }
      if (alive.current) patchScene(i, { error: "La animación está tardando. Vuelve en unos minutos: seguirá aquí." }, false);
    } finally { polling.current.delete(i); }
  }, [patchScene, uid, refreshCredits]);

  const runTask = useCallback(async ({ i, kind }: Task): Promise<"ok" | "stop"> => {
    const m = metaRef.current!;
    const s = m.scenes[i];
    const price = kind === "voice" ? PRICES.voice : kind === "image" ? PRICES.image : PRICES.clip;
    if (balanceRef.current < price) { setStopMsg(`Te faltan créditos para seguir (esta pieza cuesta ${price}). Lo hecho queda guardado.`); return "stop"; }
    patchScene(i, { [kind]: "working", error: null } as Partial<SceneState>, false);
    try {
      if (kind === "voice") {
        const resp = await post("yt-produce", { action: "voice", text: s.narration, voice: m.voice, lang: m.lang, scene: Math.min(40, i + 1) });
        const data = await resp.json();
        addSpent(...billingOf(resp, data));
        const blob = b64ToBlob(data.audio, data.mime || "audio/mpeg");
        const secs = await audioSeconds(blob);
        await putMedia(m.id, i, "voice", blob);
        patchScene(i, { voice: "done", voiceSec: secs || narrationSeconds(s.narration) });
      } else if (kind === "image") {
        const resp = await post("yt-produce", { action: "scene_image", visual: s.visual.slice(0, 600), style: m.style, aspect: m.format, scene: Math.min(40, i + 1) });
        const data = await resp.json();
        addSpent(...billingOf(resp, data));
        const raw = await (await fetch(data.image)).blob();
        const blob = await compressImage(raw).catch(() => raw);
        await putMedia(m.id, i, "image", blob);
        setThumb(i, blob);
        patchScene(i, { image: "done" });
      } else {
        // Animación: la imagen de la escena se sube a la carpeta del usuario y video-studio la anima.
        const img = await getMedia(m.id, i, "image");
        if (!img) throw new ApiError("Falta la imagen de la escena.", 400);
        const path = `${uid}/yt/${m.id}/s${i + 1}.webp`;
        const up = await supabase.storage.from("creativos").upload(path, img, { upsert: true, contentType: img.type || "image/webp" });
        if (up.error) throw new ApiError("No se pudo preparar la imagen para animarla.", 400);
        const resp = await post("video-studio", {
          prompt: `Anima esta imagen con movimiento suave y natural: ${s.visual.slice(0, 400)}. Cámara lenta y estable, sin cortes, sin texto.`,
          seconds: 5, size: m.format === "16:9" ? "16:9" : "9:16", image_path: path, image_bucket: "creativos", audio: false, kind: "yt_scene",
        });
        const data = await resp.json();
        addSpent(...billingOf(resp, data));
        patchScene(i, { clip: "working", jobId: data?.job?.id ?? null });
        void pollClip(i);
      }
      return "ok";
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : "No se pudo completar.", 0);
      // Sin créditos, tope de uso, sesión o servicio caído: no se cobró; queda pendiente y se pausa.
      const blocking = [401, 402, 403, 429, 503].includes(err.status);
      patchScene(i, { [kind]: blocking ? "pending" : "failed", error: blocking ? null : err.message } as Partial<SceneState>);
      if (blocking) { setStopMsg(err.message); return "stop"; }
      return "ok";
    }
  }, [addSpent, patchScene, pollClip, setThumb, uid]);

  const nextTask = useCallback((): Task | null => {
    const m = metaRef.current;
    if (!m) return null;
    for (let i = 0; i < m.scenes.length; i++) {
      const s = m.scenes[i];
      for (const kind of ["voice", "image", "clip"] as const) {
        const key = `${i}:${kind}`;
        if (inflight.current.has(key)) continue;
        if (kind === "clip" && (s.clip !== "pending" || s.image !== "done")) continue;
        if (kind !== "clip" && s[kind] !== "pending") continue;
        return { i, kind };
      }
    }
    return null;
  }, []);

  const runQueue = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true); setStopMsg(null); pausedRef.current = false;
    let stop = false;
    const worker = async () => {
      while (!stop && !pausedRef.current && alive.current) {
        const t = nextTask();
        if (!t) return;
        const key = `${t.i}:${t.kind}`;
        inflight.current.add(key);
        try { if ((await runTask(t)) === "stop") stop = true; }
        finally { inflight.current.delete(key); }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    runningRef.current = false;
    if (alive.current) setRunning(false);
    const m = metaRef.current;
    if (m) {
      commit(m, true);
      const p = progressOf(m);
      if (p.ready && !p.pending) { void saveServer(m, "piezas_listas"); toast.success("Escenas listas. Ya puedes armar tu video."); }
    }
  }, [commit, nextTask, runTask, saveServer]);

  // ---------- Abrir una producción guardada ----------
  useEffect(() => {
    if (!resumeId) return;
    let cancelled = false;
    (async () => {
      const saved = await getProduction(resumeId).catch(() => null);
      if (cancelled) return;
      // Sin la producción (se borró en otra pestaña o falló el almacenamiento): volver, nunca dejar
      // al usuario en "Abriendo tu producción…" para siempre.
      if (!saved) { toast.error("No encontramos esa producción en este navegador."); onBack(); return; }
      const m = resumeState(saved);
      commit(m, true);
      setPhase("live");
      for (let i = 0; i < m.scenes.length; i++) {
        const img = m.scenes[i].image === "done" ? await getMedia(m.id, i, "image") : null;
        if (cancelled) return;
        if (img) setThumb(i, img);
        else if (m.scenes[i].image === "done") patchScene(i, { image: "pending" }, false); // el navegador lo borró
        if (m.scenes[i].voice === "done" && !(await getMedia(m.id, i, "voice"))) patchScene(i, { voice: "pending" }, false);
        if (m.scenes[i].clip === "working" && m.scenes[i].jobId) void pollClip(i);
      }
    })();
    return () => { cancelled = true; };
  }, [resumeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const startProduction = async () => {
    if (!start || limitError || runningRef.current) return;
    if (balance < cost.total) { toast.error(`Te faltan ${cost.total - balance} créditos para producir este video.`); return; }
    const animated = new Set(pickAnimated(scenes, effPct));
    const m: ProductionMeta = {
      id: newId(), uid, serverId: null, title: start.title || scenes[0]?.narration.slice(0, 60) || "Mi video",
      topic: start.topic, thumbnail: start.thumbnail, format, style, voice, lang: start.lang, pct: effPct, subtitles,
      scenes: scenes.map((s, i) => ({ ...s, voice: "pending", image: "pending", clip: animated.has(i) ? "pending" : "none", jobId: null })),
      spent: 0, createdAt: Date.now(), updatedAt: Date.now(),
    };
    commit(m, true);
    setPhase("live");
    void saveServer(m, "produciendo");
    setTimeout(() => void runQueue(), 0);
  };

  const redo = (i: number, kind: MediaKind) => {
    const m = metaRef.current;
    if (!m || inflight.current.has(`${i}:${kind}`)) return;
    const price = kind === "voice" ? PRICES.voice : kind === "image" ? PRICES.image : PRICES.clip;
    if (balance < price) { toast.error(`Te faltan créditos: cuesta ${price}.`); return; }
    patchScene(i, { [kind]: "pending", ...(kind === "clip" ? { jobId: null } : {}) } as Partial<SceneState>);
    if (!runningRef.current) setTimeout(() => void runQueue(), 0);
  };

  const playVoice = async (i: number) => {
    const m = metaRef.current;
    if (!m) return;
    const blob = await getMedia(m.id, i, "voice");
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.onended = () => URL.revokeObjectURL(url);
    void a.play().catch(() => toast.error("No se pudo reproducir la voz."));
  };

  // ---------- Montaje ----------
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [rec, setRec] = useState<{ elapsed: number; total: number } | null>(null);
  const [result, setResult] = useState<(MontageResult & { url: string }) | null>(null);
  const [durations, setDurations] = useState<number[]>([]);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const assemble = async () => {
    const m = metaRef.current;
    if (!m || !canvasRef.current) return;
    setPhase("montage"); setRec({ elapsed: 0, total: 0 });
    const ctx = new AudioContext();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const items = [];
      for (let i = 0; i < m.scenes.length; i++) {
        const [img, vo, clip] = await Promise.all([getMedia(m.id, i, "image"), getMedia(m.id, i, "voice"), m.scenes[i].clip === "done" ? getMedia(m.id, i, "clip") : null]);
        if (!img || !vo) throw new Error(`Falta la ${!img ? "imagen" : "voz"} de la escena ${m.scenes[i].n}.`);
        items.push({ image: img, clip, audio: await decodeAudio(ctx, vo), text: m.scenes[i].narration });
      }
      setDurations(items.map(x => x.audio.duration + 0.45));
      const out = await renderMontage(items, {
        format: m.format, subtitles: m.subtitles, ctx, canvas: canvasRef.current, signal: ac.signal,
        onProgress: (elapsed, total) => setRec(r => (r && Math.floor(r.elapsed) === Math.floor(elapsed) && r.total === total ? r : { elapsed, total })),
      });
      setResult({ ...out, url: URL.createObjectURL(out.blob) });
      setPhase("ready");
      track("video_generado", { kind: "yt_faceless", scenes: m.scenes.length, pct: m.pct, ext: out.ext });
      void saveServer(m, "armado");
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") toast("Montaje cancelado. Puedes armarlo otra vez gratis.");
      else toast.error(e instanceof Error ? e.message : "No se pudo armar el video.");
      setPhase("live");
    } finally {
      abortRef.current = null;
      void ctx.close();
      setRec(null);
    }
  };

  const download = () => {
    if (!result || !meta) return;
    const a = document.createElement("a");
    a.href = result.url;
    a.download = `${(meta.title || "mi-video").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "mi-video"}.${result.ext}`;
    a.click();
  };

  // ---------- Listo para publicar ----------
  const publish = useMemo(() => {
    if (!meta) return null;
    const ds = durations.length === meta.scenes.length ? durations : meta.scenes.map(s => (s.voiceSec ?? narrationSeconds(s.narration)) + 0.45);
    const chs = chapters(meta.scenes, ds);
    const tags = tagsFrom(meta.title, meta.topic ?? "");
    return { chapters: chs, tags, description: buildDescription({ title: meta.title, topic: meta.topic, chapters: chs, tags }) };
  }, [meta, durations]);
  const [title, setTitle] = useState("");
  useEffect(() => { if (meta && !title) setTitle(meta.title); }, [meta, title]);

  const copy = (text: string, what: string) => { void navigator.clipboard.writeText(text).then(() => toast.success(`${what} copiado`)).catch(() => toast.error("No se pudo copiar.")); };

  const makeThumbnail = () => {
    if (!meta) return;
    try {
      // Semilla para el Estudio de imágenes (contrato de src/lib/creativeSeed.ts, clave "supernova.seed").
      sessionStorage.setItem("supernova.seed", JSON.stringify({
        v: 1, source: "manual", target: "miniaturas", title: (title || meta.title).slice(0, 80),
        product: (title || meta.title).slice(0, 200), who: "Personas que ven videos de este tema en YouTube",
        promise: (meta.topic || meta.title).slice(0, 200), hook: (meta.thumbnail || title || meta.title).slice(0, 140),
        aspect: "16:9", autostart: true, at: Date.now(),
      }));
    } catch { /* sin almacenamiento: abre el estudio vacío */ }
    onNavigate("Miniaturas");
  };

  const removeProduction = async () => {
    const m = metaRef.current;
    if (!m) return;
    if (!window.confirm("¿Borrar esta producción de tu navegador? Se pierden la voz, las imágenes y las animaciones (no se devuelven créditos).")) return;
    pausedRef.current = true;
    await deleteProduction(m.id);
    toast.success("Producción borrada de este navegador.");
    onBack();
  };

  // ================= Render =================
  const header = (
    <button onClick={() => { if (phase === "montage") abortRef.current?.abort(); onBack(); }} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground h-10">
      <ArrowLeft className="w-4 h-4" /> Volver al guion
    </button>
  );

  if (phase === "plan" && !start) {
    return <div className="max-w-[920px] mx-auto py-10 text-[13px] text-muted-foreground inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Abriendo tu producción…</div>;
  }

  if (phase === "plan") {
    const fits = cost.total > 0 ? Math.floor(PLAN_CREDITS / cost.total) : 0;
    return (
      <div className="max-w-[920px] mx-auto space-y-6 py-4">
        {header}
        <div className="space-y-1.5">
          <h2 className="font-display font-semibold text-[22px] md:text-[28px] tracking-[-0.02em] text-foreground">Producir tu video</h2>
          <p className="text-[14px] text-muted-foreground">Voz, una imagen por escena, movimiento y subtítulos. Tú solo descargas y subes.</p>
        </div>

        {limitError ? (
          <div className="rounded-2xl border border-border p-4 text-[14px] text-foreground">{limitError}</div>
        ) : (<>
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">La IA eligió por ti</p>
            <div className="flex flex-wrap gap-2">
              <Chip icon={Mic} label="Voz" value={VOICE_LABEL[voice]}>
                {VOICES.map(v => <DropdownMenuItem key={v} onClick={() => setVoice(v)}>{VOICE_LABEL[v]} {voice === v && <Check className="w-3.5 h-3.5 ml-auto" />}</DropdownMenuItem>)}
              </Chip>
              <Chip icon={Palette} label="Estilo" value={style}>
                {YT_STYLES.map(s => <DropdownMenuItem key={s} onClick={() => setStyle(s)}>{s} {style === s && <Check className="w-3.5 h-3.5 ml-auto" />}</DropdownMenuItem>)}
              </Chip>
              <Chip icon={Clapperboard} label="Animado" value={clipOk === false ? "Pronto" : clipOk === null ? "…" : `${pct} %`} disabled={!clipOk}>
                {PCTS.map(p => <DropdownMenuItem key={p} onClick={() => setPct(p)} className="flex-col items-start gap-0"><span className="font-medium">{p === 0 ? "Sin animación" : `${p} % de las escenas`}</span><span className="text-[11px] text-muted-foreground">{p === 0 ? "Solo imágenes con movimiento suave" : `${pickAnimated(scenes, p).length} clips de 5 s (gancho, clímax y cierre primero)`}</span></DropdownMenuItem>)}
              </Chip>
              <Chip icon={Monitor} label="Formato" value={format}>
                {FORMATS.map(f => <DropdownMenuItem key={f.id} onClick={() => setFormat(f.id)}>{f.label} {format === f.id && <Check className="w-3.5 h-3.5 ml-auto" />}</DropdownMenuItem>)}
              </Chip>
              <button onClick={() => setSubtitles(s => !s)} className="inline-flex items-center gap-2 h-10 px-3.5 rounded-xl border border-border bg-card/40 text-[13px] hover:border-foreground/30">
                <Captions className="w-4 h-4 text-muted-foreground" strokeWidth={1.7} />
                <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Subtítulos</span>
                <span className="text-foreground font-medium">{subtitles ? "Sí" : "No"}</span>
              </button>
            </div>
            {clipOk === false && <p className="text-[12px] text-muted-foreground">Las escenas animadas llegan pronto. Por ahora cada escena lleva su imagen con movimiento suave.</p>}
          </div>

          <div className="rounded-2xl border border-border p-4 md:p-5 space-y-3">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <p className="text-[14px] text-foreground font-medium">{scenes.length} escenas · unos {timecode(estSeconds)} de video</p>
              <p className="text-[12px] text-muted-foreground">Te quedan {num(balance)} créditos</p>
            </div>
            <dl className="text-[13px] space-y-1.5">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Voz · {scenes.length} × {PRICES.voice}</dt><dd className="text-foreground tabular-nums">{cost.voice}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Imágenes · {scenes.length} × {PRICES.image}</dt><dd className="text-foreground tabular-nums">{cost.images}</dd></div>
              {cost.animated > 0 && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Animación · {cost.animated} clips × {PRICES.clip}</dt><dd className="text-foreground tabular-nums">{cost.clips}</dd></div>}
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Montaje, subtítulos y descarga</dt><dd className="text-foreground">Gratis</dd></div>
              <div className="flex justify-between gap-3 pt-2 border-t border-border/60"><dt className="text-foreground font-medium">Total</dt><dd className="text-foreground font-semibold tabular-nums">{num(cost.total)} créditos</dd></div>
            </dl>
            {fits > 0 && <p className="text-[12px] text-muted-foreground">Así rinde tu plan: con los {num(PLAN_CREDITS)} créditos al mes del plan PRO te alcanza para unos {fits} videos como este.</p>}
          </div>

          {!recordOk && <p className="text-[12px] text-muted-foreground">Este navegador no puede grabar el video final. Puedes producir las escenas aquí y armarlo desde Chrome, Edge o Safari actualizados en esta misma computadora.</p>}
          {!persist && <p className="text-[12px] text-muted-foreground">Tu navegador no deja guardar el avance (¿modo privado?). No cierres esta pestaña hasta descargar el video.</p>}

          <div className="space-y-2">
            <button onClick={() => void startProduction()} disabled={balance < cost.total || !scenes.length}
              className="btn-primary-nova w-full sm:w-auto h-12 px-6 rounded-xl text-[15px] font-semibold inline-flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4" /> Producir mi video · {num(cost.total)} créditos
            </button>
            <p className="text-[12px] text-muted-foreground">
              {balance < cost.total ? `Te faltan ${num(cost.total - balance)} créditos. Baja el % animado o acorta el guion.` : "Cada pieza se cobra al crearse. Si una falla, te devolvemos sus créditos. Lo hecho se guarda en este navegador."}
            </p>
          </div>

          <details className="rounded-2xl border border-border/70 p-4">
            <summary className="text-[13px] text-muted-foreground cursor-pointer">Ver las {scenes.length} escenas</summary>
            <ol className="mt-3 space-y-2 text-[13px]">
              {scenes.map(s => <li key={s.n} className="text-foreground"><span className="text-muted-foreground">{s.n}.</span> {s.narration.slice(0, 160)}{s.narration.length > 160 ? "…" : ""}</li>)}
            </ol>
          </details>
        </>)}
      </div>
    );
  }

  const prog = meta ? progressOf(meta) : null;
  const remaining = meta ? meta.scenes.reduce((a, s) => a + (s.voice === "pending" || s.voice === "failed" ? PRICES.voice : 0) + (s.image === "pending" || s.image === "failed" ? PRICES.image : 0) + (s.clip === "pending" ? PRICES.clip : 0), 0) : 0;

  return (
    <div className="max-w-[1100px] mx-auto space-y-5 py-4">
      {header}

      {phase === "live" && meta && prog && (<>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-[20px] md:text-[24px] text-foreground truncate">{meta.title}</h2>
            <p className="text-[13px] text-muted-foreground">{prog.done} de {prog.total} piezas listas · usados {num(meta.spent)} créditos · te quedan {num(balance)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {running ? (
              <button onClick={() => { pausedRef.current = true; toast("Se pausa al terminar lo que está en curso."); }} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-border text-[13px] text-foreground hover:border-foreground/30"><Pause className="w-4 h-4" /> Pausar</button>
            ) : prog.pending > 0 ? (
              <button onClick={() => void runQueue()} disabled={balance < Math.min(PRICES.voice, remaining)} className={`${prog.ready ? "border border-border text-foreground" : "btn-primary-nova font-semibold"} inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-[13px] disabled:opacity-50`}><Play className="w-4 h-4" /> Continuar · {remaining} créditos</button>
            ) : null}
            {prog.ready && (
              <button onClick={() => void assemble()} disabled={!recordOk || running} className="btn-primary-nova inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-[13px] font-semibold disabled:opacity-50">
                <Film className="w-4 h-4" /> {prog.clipsWorking ? "Armar sin esperar animaciones" : "Armar mi video"} · gratis
              </button>
            )}
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-foreground/70 transition-all" style={{ width: `${prog.total ? (prog.done / prog.total) * 100 : 0}%` }} /></div>
        {stopMsg && <p className="text-[13px] text-foreground rounded-xl border border-border p-3">{stopMsg}</p>}
        {!running && prog.ready && <p className="text-[12px] text-muted-foreground">El montaje se hace en tu navegador y tarda lo mismo que dura el video (unos {timecode(meta.scenes.reduce((a, s) => a + (s.voiceSec ?? 0) + 0.45, 0))}).</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {meta.scenes.map((s, i) => (
            <div key={`${s.n}-${i}`} className="rounded-2xl border border-border overflow-hidden bg-card/30 min-w-0">
              <div className={`relative bg-secondary/40 ${meta.format === "16:9" ? "aspect-video" : meta.format === "9:16" ? "aspect-[9/16] max-h-[340px] mx-auto" : "aspect-[3/4] max-h-[340px] mx-auto"}`}>
                {thumbs[i] ? <img src={thumbs[i]} alt={`Escena ${s.n}`} className="absolute inset-0 w-full h-full object-cover" />
                  : <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">{s.image === "working" ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}</div>}
                <span className="absolute top-2 left-2 h-6 px-2 rounded-full bg-black/60 text-white text-[11px] inline-flex items-center">Escena {s.n}</span>
              </div>
              <div className="p-3 space-y-2">
                <p className="text-[12px] text-foreground line-clamp-3">{s.narration}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Pill icon={Mic} label={s.voiceSec && s.voice === "done" ? `Voz ${Math.round(s.voiceSec)} s` : "Voz"} status={s.voice} />
                  <Pill icon={ImageIcon} label="Imagen" status={s.image} />
                  <Pill icon={Clapperboard} label="Animación" status={s.clip} />
                </div>
                {s.error && <p className="text-[11px] text-muted-foreground">{s.error}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {s.voice === "done" && <button onClick={() => void playVoice(i)} className="inline-flex items-center gap-1 h-10 px-3 rounded-lg border border-border text-[12px] text-foreground hover:border-foreground/30"><Play className="w-3.5 h-3.5" /> Escuchar</button>}
                  {(s.voice === "done" || s.voice === "failed") && <button onClick={() => redo(i, "voice")} className="inline-flex items-center gap-1 h-10 px-3 rounded-lg border border-border text-[12px] text-foreground hover:border-foreground/30"><RefreshCw className="w-3.5 h-3.5" /> {s.voice === "failed" ? "Reintentar voz" : "Rehacer voz"} · {PRICES.voice}</button>}
                  {(s.image === "done" || s.image === "failed") && <button onClick={() => redo(i, "image")} className="inline-flex items-center gap-1 h-10 px-3 rounded-lg border border-border text-[12px] text-foreground hover:border-foreground/30"><RefreshCw className="w-3.5 h-3.5" /> {s.image === "failed" ? "Reintentar imagen" : "Rehacer imagen"} · {PRICES.image}</button>}
                  {s.clip === "failed" && clipOk && <button onClick={() => redo(i, "clip")} className="inline-flex items-center gap-1 h-10 px-3 rounded-lg border border-border text-[12px] text-foreground hover:border-foreground/30"><RefreshCw className="w-3.5 h-3.5" /> Reintentar animación · {PRICES.clip}</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => void removeProduction()} className="text-[12px] text-muted-foreground hover:text-foreground h-10">Borrar esta producción de mi navegador</button>
      </>)}

      {/* El lienzo existe siempre (oculto fuera del montaje) para poder grabar en él. */}
      <div className={phase === "montage" ? "space-y-4" : "hidden"}>
        <h2 className="font-display font-semibold text-[20px] md:text-[24px] text-foreground">Armando tu video</h2>
        <canvas ref={canvasRef} className={`block w-full rounded-2xl border border-border bg-black ${meta?.format === "16:9" ? "aspect-video" : "max-w-[360px] mx-auto"}`} />
        <div className="space-y-2">
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${rec && rec.total ? (rec.elapsed / rec.total) * 100 : 0}%` }} /></div>
          <p className="text-[13px] text-foreground">{rec && rec.total ? `Grabando ${timecode(rec.elapsed)} de ${timecode(rec.total)}` : "Preparando escenas…"}</p>
          <p className="text-[12px] text-muted-foreground">Tarda lo mismo que dura el video. Deja esta pestaña abierta y a la vista: si cambias de pestaña, el navegador puede frenar la grabación.</p>
          <button onClick={() => abortRef.current?.abort()} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-border text-[13px] text-foreground hover:border-foreground/30"><Square className="w-4 h-4" /> Cancelar</button>
        </div>
      </div>

      {phase === "ready" && meta && result && publish && (
        <div className="space-y-6">
          <div className="space-y-3">
            <h2 className="font-display font-semibold text-[20px] md:text-[24px] text-foreground">Tu video está listo</h2>
            <video src={result.url} controls playsInline className={`block w-full rounded-2xl border border-border bg-black ${meta.format === "16:9" ? "aspect-video" : "max-w-[360px] mx-auto"}`} />
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={download} className="btn-primary-nova inline-flex items-center gap-2 h-12 px-5 rounded-xl text-[14px] font-semibold"><Download className="w-4 h-4" /> Descargar {result.ext.toUpperCase()} · {fmtMB(result.blob.size)}</button>
              <button onClick={() => { setPhase("live"); }} className="inline-flex items-center gap-1.5 h-12 px-4 rounded-xl border border-border text-[13px] text-foreground hover:border-foreground/30"><RefreshCw className="w-4 h-4" /> Cambiar escenas</button>
            </div>
            <p className="text-[12px] text-muted-foreground">El video no se guarda en nuestros servidores: descárgalo ahora. Las escenas quedan en este navegador y puedes volver a armarlo gratis.{result.ext === "webm" ? " YouTube acepta WebM sin problema." : ""}</p>
          </div>

          <div className="rounded-2xl border border-border p-4 md:p-5 space-y-4">
            <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">Listo para publicar</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2"><label htmlFor="yt-title" className="text-[13px] text-foreground font-medium">Título</label><button onClick={() => copy(title, "Título")} className="inline-flex items-center gap-1 h-10 px-3 text-[12px] text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /> Copiar</button></div>
              <input id="yt-title" value={title} onChange={e => setTitle(e.target.value.slice(0, 100))} className="w-full rounded-xl border border-border bg-background px-3 h-11 text-[14px] text-foreground focus:outline-none focus:border-primary/60" />
              <p className="text-[11px] text-muted-foreground">{title.length}/100 · los títulos de menos de 70 caracteres se leen completos.</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2"><span className="text-[13px] text-foreground font-medium">Descripción con capítulos</span><button onClick={() => copy(publish.description, "Descripción")} className="inline-flex items-center gap-1 h-10 px-3 text-[12px] text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /> Copiar</button></div>
              <textarea readOnly value={publish.description} rows={8} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] leading-relaxed text-foreground focus:outline-none" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2"><span className="text-[13px] text-foreground font-medium">Etiquetas</span><button onClick={() => copy(publish.tags.join(", "), "Etiquetas")} className="inline-flex items-center gap-1 h-10 px-3 text-[12px] text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /> Copiar</button></div>
              <div className="flex flex-wrap gap-1.5">{publish.tags.map(t => <span key={t} className="h-7 px-2.5 rounded-full border border-border text-[12px] text-foreground inline-flex items-center">{t}</span>)}</div>
            </div>
            <button onClick={makeThumbnail} className="inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-border text-[13px] text-foreground hover:border-foreground/30"><ImageIcon className="w-4 h-4" /> Hacer la miniatura · {PRICES.image * 2} créditos</button>
            <div className="space-y-2 pt-2 border-t border-border/60">
              <p className="text-[13px] text-foreground font-medium inline-flex items-center gap-2"><Upload className="w-4 h-4" /> Súbelo a YouTube en 3 pasos</p>
              <ol className="text-[13px] text-muted-foreground space-y-1.5 list-decimal pl-5">
                <li>Entra a YouTube Studio (studio.youtube.com), toca <span className="text-foreground">Crear → Subir videos</span> y elige el archivo que descargaste.</li>
                <li>Pega el título, la descripción y las etiquetas. En <span className="text-foreground">"Contenido alterado o sintético"</span> marca lo que corresponda: la voz y las imágenes son de IA.</li>
                <li>Sube la miniatura, elige "No es contenido para niños" si aplica y publícalo o prográmalo.</li>
              </ol>
              <p className="text-[11px] text-muted-foreground">YouTube no paga por contenido repetitivo o sin aporte propio: revisa el guion, ponle tu toque y verifica los datos antes de publicar.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
