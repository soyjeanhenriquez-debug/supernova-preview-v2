import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { blockingIssue } from "@/lib/webRender";
import { Player } from "@remotion/player";
import { Camera, Check, Clapperboard, Copy, Download, Loader2, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/hooks/useCredits";
import { fnErrorMessage, fnHeaders, readBilling } from "@/lib/fnAuth";
import { audioSeconds, compressImage } from "@/lib/montage";
import { getMedia, putMedia } from "@/lib/productionStore";
import type { Word } from "@/lib/subtitleStyles";
import { uploadStudioImage, refForServer, type StudioRef } from "@/lib/studioUpload";
import { sliceWavBase64 } from "@/lib/audioSlice";
import { streamGenerator } from "@/components/video/videoApi";
import { ToolShell } from "@/components/tool/ToolShell";
import { ToolReel, type ReelProps, type ReelScene } from "@/remotion/ToolReel";
import {
  CON_IMAGEN, GENERATOR_ID, MAX_ANIMADAS, PALETAS, PRICES, SYSTEM, TIPOS, bloquesPresentador, costo, parsePlan, planRequest,
  textoPublicacion, tiempos, wordsFromAlignment, type Datos, type Plan, type Tipo,
} from "@/lib/reelIa";

/**
 * Reel "Esta IA hace X" (24-oct-2026, solo la cuenta de Jean; formato "Voz en off" del curso). Del guion al MP4:
 * 1 Datos (guion, herramienta, URL, palabra, paleta, tu foto) · 2 Escenas (la IA las planea; editables)
 * · 3 Producir (tu voz de ElevenLabs con tiempos, capturas reales, tu cara en 2 escenas, imágenes, animaciones y
 * el presentador con labios) · 4 Vista previa y descarga armada en el navegador (ToolReel + renderMediaOnWeb).
 * Lo pagado se guarda en el navegador (IndexedDB): recargar no pierde nada ni vuelve a cobrar.
 * Servidor: reel-ia (voz, capturas, presentador; sin créditos), yt-produce (imágenes), avatar-studio (tu cara),
 * video-studio (animaciones). Lógica pura: src/lib/reelIa.ts.
 */
const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const FPS = 30;
const SIZE = { width: 720, height: 1280 };
const VOZ = 900, CAP_PC = 800, CAP_CEL = 801, PROPIA = (k: number) => 810 + k, CARA = (k: 0 | 1) => 700 + k, HABLA = (k: number) => 600 + k;
const MAX_PROPIAS = 6;

/**
 * Reel de SUPERNOVA (pedido de Jean, 24-oct-2026: "el mismo reel, pero para nuestra app"). Borrador modelado sobre la
 * estructura del reel de referencia (gancho → qué es → cómo funciona → qué más hace → prueba gratis → comenta), con
 * datos reales: ~148.000 filas en winning_ads (estimado de Postgres el 24-oct) → "más de 140.000", redondeado abajo.
 * Las pantallas de la app están tras el login: las capturas las sube Jean ("Tus capturas").
 */
const SUPERNOVA: Datos = {
  herramienta: "SUPERNOVA",
  url: "https://supernova-six-eta.vercel.app",
  palabra: "SUPERNOVA",
  paleta: "azul-naranja",
  guion: "Hay una IA que encuentra negocios digitales que ya están vendiendo y te ayuda a crear tu propia versión. Se llama SUPERNOVA. Revisa más de 140.000 anuncios reales de la Biblioteca de Meta y te muestra los que llevan más días pagando publicidad, que es la mejor prueba de que venden. Eliges una oferta y la IA te arma tu versión: el producto, el precio en tu moneda, los textos de venta y hasta videos con IA. Sin saber de diseño y sin grabarte si no quieres. Puedes probar todas las herramientas gratis. Comenta SUPERNOVA y te mando el enlace por privado.",
};

type Estado = "pendiente" | "trabajando" | "listo" | "falló";
type Meta = {
  id: string;
  datos: Datos;
  foto: StudioRef | null;
  plan: Plan | null;
  voz: { words: Word[]; seconds: number } | null;
  capturas: [Estado, Estado];
  caras: [string | null, string | null];     // rutas en estudio-avatar: tu cara en el gancho y en el cierre
  imagenes: Estado[];
  clips: Estado[];
  jobs: (string | null)[];
  habla: Estado[];                           // presentador con labios, por bloque
  hablaJobs: (string | null)[];
  /** Capturas que sube Jean (pantallas reales de la app, que están tras el login). */
  propias: number;
  /** Cuáles de esas capturas son verticales (versión celular): salen en un celular grande. */
  propiasV: boolean[];
  /** Cuáles son grabaciones de pantalla (video) en vez de fotos (25-oct-2026, Jean: "mejor videos de cómo funciona"). */
  propiasVideo: boolean[];
};
const nuevo = (): Meta => ({
  id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
  datos: { guion: "", herramienta: "", url: "", palabra: "", paleta: "azul-naranja" },
  foto: null, plan: null, voz: null, capturas: ["pendiente", "pendiente"], caras: [null, null],
  imagenes: [], clips: [], jobs: [], habla: [], hablaJobs: [], propias: 0, propiasV: [], propiasVideo: [],
});
const KEY = (uid: string) => `supernova.reelia.${uid}`;
function cargar(uid: string): Meta {
  try { const m = JSON.parse(localStorage.getItem(KEY(uid)) ?? "null"); if (m?.id) return { ...nuevo(), ...m }; } catch { /* sin almacenamiento */ }
  return nuevo();
}
const guardar = (uid: string, m: Meta) => { try { localStorage.setItem(KEY(uid), JSON.stringify(m)); } catch { /* sin almacenamiento */ } };

class ApiError extends Error { constructor(m: string, public status: number) { super(m); } }
async function post(fn: string, body: Record<string, unknown>) {
  const resp = await fetch(`${FN}/${fn}`, { method: "POST", headers: await fnHeaders(), body: JSON.stringify(body) });
  if (!resp.ok) throw new ApiError(await fnErrorMessage(resp, "No se pudo completar."), resp.status);
  return resp;
}
const b64Blob = async (b64: string, mime: string) => (await fetch(`data:${mime};base64,${b64}`)).blob();
const download = (blob: Blob, name: string) => {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
/** Ancho y alto de un video (para saber si es vertical). */
function videoSize(file: Blob): Promise<{ w: number; h: number }> {
  return new Promise(resolve => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (w: number, h: number) => { URL.revokeObjectURL(url); resolve({ w, h }); };
    v.preload = "metadata"; v.muted = true;
    v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight);
    v.onerror = () => done(9, 16); // sin metadatos: se asume vertical (grabación del celular)
    v.src = url;
  });
}

export function ReelIA({ onHome, onNavigate }: { onHome: () => void; onNavigate: (page: string) => void }) {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const { applyServerCharge, balance } = useCredits();
  const [meta, setMeta] = useState<Meta>(() => (uid ? cargar(uid) : nuevo()));
  const metaRef = useRef(meta);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "foto" | "plan" | "producir" | "render">("");
  const [paso, setPaso] = useState("");
  const [progress, setProgress] = useState(0);
  const [cfg, setCfg] = useState<{ eleven: boolean; fal: boolean } | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const commit = useCallback((patch: Partial<Meta> | ((m: Meta) => Partial<Meta>)) => {
    const m = { ...metaRef.current, ...(typeof patch === "function" ? patch(metaRef.current) : patch) };
    metaRef.current = m; setMeta(m); if (uid) guardar(uid, m);
  }, [uid]);
  const setUrl = useCallback((k: string, blob: Blob | null) => setUrls(u => {
    if (u[k]) URL.revokeObjectURL(u[k]);
    const n = { ...u }; if (blob) n[k] = URL.createObjectURL(blob); else delete n[k];
    return n;
  }), []);
  const saldo = useCallback((resp: Response, data?: { billing?: { charged: number; balance: number | null } }) => {
    const b = data?.billing ?? readBilling(resp);
    if (typeof b.balance === "number") applyServerCharge("gen_media", { charged: 0, balance: b.balance });
  }, [applyServerCharge]);

  // Al abrir: config y lo que ya se pagó vuelve desde el navegador.
  useEffect(() => {
    if (!uid) return;
    void post("reel-ia", { action: "config" }).then(r => r.json()).then(setCfg).catch(() => setCfg({ eleven: false, fal: false }));
    const m = cargar(uid); metaRef.current = m; setMeta(m);
    void (async () => {
      const load = async (k: string, idx: number, kind: "image" | "clip" | "voice") => { const b = await getMedia(m.id, idx, kind); if (b) setUrl(k, b); };
      await load("voz", VOZ, "voice"); await load("pc", CAP_PC, "image"); await load("cel", CAP_CEL, "image");
      await load("cara0", CARA(0), "image"); await load("cara1", CARA(1), "image");
      for (let i = 0; i < (m.plan?.escenas.length ?? 0); i++) { await load(`i${i}`, i, "image"); await load(`c${i}`, i, "clip"); }
      for (let k = 0; k < m.habla.length; k++) await load(`h${k}`, HABLA(k), "clip");
      for (let k = 0; k < m.propias; k++) await load(`p${k}`, PROPIA(k), m.propiasVideo?.[k] ? "clip" : "image");
    })();
  }, [uid, setUrl]);

  const d = meta.datos;
  const p = meta.plan;
  const setDatos = (patch: Partial<Datos>) => commit(m => ({ datos: { ...m.datos, ...patch } }));
  const palabras = d.guion.trim() ? d.guion.trim().split(/\s+/).length : 0;

  // ---------- 1 · Tu foto ----------
  const subirFoto = async (file: File) => {
    if (!uid || busy) return;
    setBusy("foto");
    try {
      const ref = await uploadStudioImage(uid, "reel-ia", file, "tu-foto");
      commit({ foto: ref, caras: [null, null], habla: [], hablaJobs: [] });
      setUrl("cara0", null); setUrl("cara1", null);
      toast.success("Foto lista: con ella creamos tu cara en el gancho y en el cierre.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo subir tu foto."); }
    finally { setBusy(""); }
  };

  // ---------- Tus capturas (pantallas reales de la app) ----------
  const capRef = useRef<HTMLInputElement>(null);
  const subirCapturas = async (files: FileList) => {
    const m = metaRef.current;
    const list = Array.from(files).filter(f => f.type.startsWith("image/") || f.type.startsWith("video/")).slice(0, MAX_PROPIAS - m.propias);
    if (!list.length) { toast.error(`Máximo ${MAX_PROPIAS} capturas o videos.`); return; }
    let n = m.propias;
    const vert = [...(m.propiasV ?? [])];
    const vid = [...(m.propiasVideo ?? [])];
    for (const f of list) {
      if (f.type.startsWith("video/")) {
        if (f.size > 80 * 1024 * 1024) { toast.error(`${f.name}: máximo 80 MB por video. Recórtalo a unos segundos.`); continue; }
        const dims = await videoSize(f);
        vert[n] = dims.h > dims.w * 1.2; vid[n] = true;
        await putMedia(m.id, PROPIA(n), "clip", f); setUrl(`p${n}`, f); n++;
        continue;
      }
      const blob = await compressImage(f, 1600).catch(() => f);
      const bmp = await createImageBitmap(blob).catch(() => null);
      vert[n] = !!bmp && bmp.height > bmp.width * 1.2; vid[n] = false;
      await putMedia(m.id, PROPIA(n), "image", blob); setUrl(`p${n}`, blob); n++;
    }
    commit({ propias: n, propiasV: vert, propiasVideo: vid });
    toast.success(`${list.length} captura${list.length > 1 ? "s" : ""} lista${list.length > 1 ? "s" : ""}.`);
  };
  const quitarCapturas = () => { for (let k = 0; k < metaRef.current.propias; k++) setUrl(`p${k}`, null); commit({ propias: 0, propiasV: [], propiasVideo: [] }); };
  const usarSupernova = () => {
    if (d.guion.trim() && !confirm("¿Cambiar tu guion por el borrador de SUPERNOVA?")) return;
    commit({ datos: { ...SUPERNOVA }, capturas: ["pendiente", "pendiente"] });
    toast.success("Listo: guion borrador de SUPERNOVA", { description: "Revísalo con tus palabras y sube capturas de la app." });
  };

  // ---------- 2 · Escenas ----------
  const planear = async () => {
    if (busy || palabras < 20) return;
    if (balance < PRICES.plan) { toast.error(`Te faltan créditos: planear cuesta ${PRICES.plan}.`); return; }
    setBusy("plan");
    try {
      const { text, billing } = await streamGenerator(GENERATOR_ID, "Reel IA · escenas", SYSTEM, planRequest(d));
      applyServerCharge("gen_light", billing, "Reel IA · escenas");
      const plan = parsePlan(text);
      if (!plan) throw new Error("La IA no devolvió escenas que sirvan. Intenta de nuevo.");
      const old = metaRef.current.plan?.escenas.length ?? 0;
      for (let i = 0; i < Math.max(old, plan.escenas.length); i++) { setUrl(`i${i}`, null); setUrl(`c${i}`, null); }
      for (let k = 0; k < metaRef.current.habla.length; k++) setUrl(`h${k}`, null);
      const n = plan.escenas.length;
      commit({ plan, imagenes: Array(n).fill("pendiente"), clips: Array(n).fill("pendiente"), jobs: Array(n).fill(null), habla: [], hablaJobs: [], caras: [null, null] });
      setUrl("cara0", null); setUrl("cara1", null);
      toast.success(`Listo: ${n} escenas`, { description: "Revísalas y cambia lo que quieras antes de producir." });
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo planear."); }
    finally { setBusy(""); }
  };
  const editEscena = (i: number, patch: Partial<Plan["escenas"][number]>) => commit(m => {
    if (!m.plan) return {};
    const escenas = m.plan.escenas.map((e, k) => (k === i ? { ...e, ...patch } : e));
    const imagenes = [...m.imagenes], clips = [...m.clips];
    if (patch.visual !== undefined || patch.tipo !== undefined) { imagenes[i] = "pendiente"; clips[i] = "pendiente"; }
    return { plan: { ...m.plan, escenas }, imagenes, clips };
  });

  // ---------- 3 · Producir ----------
  const t = useMemo(() => (p && meta.voz ? tiempos(p.escenas, meta.voz.words, meta.voz.seconds) : null), [p, meta.voz]);
  const bloques = useMemo(() => (p && t ? bloquesPresentador(p.escenas, t) : []), [p, t]);
  const setEstado = (k: "imagenes" | "clips" | "habla", i: number, v: Estado) => commit(m => { const a = [...m[k]]; a[i] = v; return { [k]: a } as Partial<Meta>; });

  const pollClip = useCallback(async (i: number) => {
    for (let tries = 0; tries < 80 && alive.current; tries++) {
      await sleep(6000);
      const jobId = metaRef.current.jobs[i];
      if (!jobId) return;
      const { data, error } = await supabase.functions.invoke("video-studio", { body: { action: "status", job_id: jobId } });
      if (error) continue;
      const st = data?.job?.status;
      if (st === "failed") { setEstado("clips", i, "falló"); commit(m => { const j = [...m.jobs]; j[i] = null; return { jobs: j }; }); return; }
      if (st !== "done") continue;
      try {
        const blob = await (await post("video-studio", { action: "file", job_id: jobId })).blob();
        await putMedia(metaRef.current.id, i, "clip", blob); setUrl(`c${i}`, blob); setEstado("clips", i, "listo");
      } catch { setEstado("clips", i, "falló"); }
      return;
    }
  }, [commit, setUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const pollHabla = useCallback(async (k: number) => {
    for (let tries = 0; tries < 100 && alive.current; tries++) {
      await sleep(6000);
      const id = metaRef.current.hablaJobs[k];
      if (!id) return;
      try {
        const st = (await (await post("reel-ia", { action: "status", request_id: id })).json())?.status;
        if (st === "failed") { setEstado("habla", k, "falló"); commit(m => { const j = [...m.hablaJobs]; j[k] = null; return { hablaJobs: j }; }); return; }
        if (st !== "done") continue;
        const blob = await (await post("reel-ia", { action: "file", request_id: id })).blob();
        await putMedia(metaRef.current.id, HABLA(k), "clip", blob); setUrl(`h${k}`, blob); setEstado("habla", k, "listo");
        return;
      } catch { /* red: se vuelve a preguntar */ }
    }
  }, [commit, setUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lo que quedó en camino al recargar: se sigue esperando (ya está pagado o encolado).
  useEffect(() => {
    meta.jobs.forEach((j, i) => { if (j && meta.clips[i] !== "listo") void pollClip(i); });
    meta.hablaJobs.forEach((j, k) => { if (j && meta.habla[k] !== "listo") void pollHabla(k); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const producir = async () => {
    const m0 = metaRef.current;
    if (busy || !m0.plan) return;
    const hayPresentador = m0.plan.escenas.some(e => e.tipo === "presentador");
    if (hayPresentador && !m0.foto) { toast.error("Sube tu foto en Datos: con ella sale tu cara en el gancho y el cierre."); return; }
    setBusy("producir");
    try {
      // 1) Tu voz (ElevenLabs) con los tiempos de cada palabra.
      if (!metaRef.current.voz || !urls.voz) {
        setPaso("Tu voz…");
        const data = await (await post("reel-ia", { action: "voice", text: d.guion })).json();
        const blob = await b64Blob(data.audio, "audio/mpeg");
        await putMedia(m0.id, VOZ, "voice", blob); setUrl("voz", blob);
        const words = wordsFromAlignment(data.alignment);
        const seconds = Math.max(await audioSeconds(blob).catch(() => 0), words.length ? words[words.length - 1].t1 + 0.3 : 0);
        commit({ voz: { words, seconds }, habla: [], hablaJobs: [] });
      }
      // 2) Capturas reales de la web (computadora y celular).
      if (d.url.trim()) {
        for (const [k, idx, mobile] of [[0, CAP_PC, false], [1, CAP_CEL, true]] as const) {
          if (metaRef.current.capturas[k] === "listo") continue;
          setPaso(mobile ? "Captura en celular…" : "Captura de la web…");
          try {
            const data = await (await post("reel-ia", { action: "capture", url: d.url, mobile })).json();
            const raw = await b64Blob(data.image, data.mime || "image/png");
            const blob = await compressImage(raw, 1600).catch(() => raw);
            await putMedia(m0.id, idx, "image", blob); setUrl(k ? "cel" : "pc", blob);
            commit(m => { const c = [...m.capturas] as Meta["capturas"]; c[k] = "listo"; return { capturas: c }; });
          } catch (e) {
            commit(m => { const c = [...m.capturas] as Meta["capturas"]; c[k] = "falló"; return { capturas: c }; });
            toast.error(e instanceof Error ? e.message : "No se pudo sacar la captura.");
          }
        }
      }
      // 3) Tu cara en el gancho y en el cierre (misma cara, otra escena).
      if (hayPresentador && m0.foto) {
        for (const k of [0, 1] as const) {
          if (metaRef.current.caras[k]) continue;
          setPaso(k ? "Tu cara en el cierre…" : "Tu cara en el gancho…");
          const { data, error } = await supabase.functions.invoke("avatar-studio", {
            body: { action: "image", template: "misma-persona", model: "gpt", aspect: "9:16", fill: (k ? m0.plan.cierre : m0.plan.gancho).slice(0, 220), refs: { persona: refForServer(m0.foto) } },
          });
          if (error || !data?.path) throw new ApiError(data?.error || "No se pudo crear tu cara en la escena.", 502);
          if (data.billing) applyServerCharge("gen_media", data.billing, `Reel IA · tu cara (${k ? "cierre" : "gancho"})`);
          const blob = await (await fetch(data.url)).blob();
          await putMedia(m0.id, CARA(k), "image", blob); setUrl(`cara${k}`, blob);
          commit(m => { const c = [...m.caras] as Meta["caras"]; c[k] = data.path; return { caras: c }; });
        }
      }
      // 4) Imágenes de las escenas (concepto, función, resultado).
      const plan = metaRef.current.plan!;
      for (let i = 0; i < plan.escenas.length && alive.current; i++) {
        const e = plan.escenas[i];
        if (!CON_IMAGEN.includes(e.tipo) || metaRef.current.imagenes[i] === "listo") continue;
        setPaso(`Imagen ${i + 1} de ${plan.escenas.length}…`);
        setEstado("imagenes", i, "trabajando");
        try {
          const resp = await post("yt-produce", { action: "scene_image", visual: e.visual.slice(0, 600), style: "Cinematográfico", aspect: "9:16", scene: Math.min(40, i + 1) });
          const data = await resp.json(); saldo(resp, data);
          const raw = await (await fetch(data.image)).blob();
          const blob = await compressImage(raw).catch(() => raw);
          await putMedia(m0.id, i, "image", blob); setUrl(`i${i}`, blob); setEstado("imagenes", i, "listo");
        } catch (err) {
          setEstado("imagenes", i, "falló");
          if (err instanceof ApiError && [401, 402, 403, 429].includes(err.status)) throw err;
        }
      }
      // 5) Animaciones (máximo 4): parten de su imagen.
      for (let i = 0; i < plan.escenas.length; i++) {
        const e = plan.escenas[i];
        if (!e.animar || metaRef.current.imagenes[i] !== "listo" || metaRef.current.clips[i] === "listo" || metaRef.current.jobs[i]) continue;
        const img = await getMedia(m0.id, i, "image");
        if (!img) continue;
        setPaso(`Animando la escena ${i + 1}…`);
        const path = `${uid}/reel-ia/${m0.id}/s${i + 1}.webp`;
        const up = await supabase.storage.from("creativos").upload(path, img, { upsert: true, contentType: img.type || "image/webp" });
        if (up.error) { setEstado("clips", i, "falló"); continue; }
        const resp = await post("video-studio", {
          prompt: `Animate this scene with smooth, natural motion and a slow camera move: ${e.visual.slice(0, 400)}. Same style, no cuts, no text.`,
          seconds: 5, size: "9:16", image_path: path, image_bucket: "creativos", audio: false, kind: "yt_scene",
        });
        const data = await resp.json(); saldo(resp, data);
        setEstado("clips", i, "trabajando");
        commit(m => { const j = [...m.jobs]; j[i] = data?.job?.id ?? null; return { jobs: j }; });
        void pollClip(i);
      }
      // 6) Presentador con labios: el trozo de tu voz de cada bloque (gancho y cierre).
      const mm = metaRef.current;
      const voz = await getMedia(m0.id, VOZ, "voice");
      if (voz && mm.voz && hayPresentador) {
        const tt = tiempos(mm.plan!.escenas, mm.voz.words, mm.voz.seconds);
        const bl = bloquesPresentador(mm.plan!.escenas, tt);
        for (let k = 0; k < bl.length; k++) {
          if (metaRef.current.habla[k] === "listo" || metaRef.current.hablaJobs[k]) continue;
          const cara = metaRef.current.caras[bl[k].cierre ? 1 : 0] ?? metaRef.current.caras[0];
          if (!cara) continue;
          setPaso(bl[k].cierre ? "Tú hablando en el cierre…" : "Tú hablando en el gancho…");
          const { b64, seconds } = await sliceWavBase64(voz, bl[k].desde, Math.min(bl[k].hasta, bl[k].desde + 12));
          const data = await (await post("reel-ia", { action: "presenter", image: { bucket: "estudio-avatar", path: cara }, audio: b64, seconds })).json();
          commit(m => { const j = [...m.hablaJobs]; j[k] = data.request_id; const h = [...m.habla]; h[k] = "trabajando"; return { hablaJobs: j, habla: h }; });
          void pollHabla(k);
        }
      }
      toast.success("Producción en marcha", { description: "Las animaciones y tu presentador tardan 2 a 6 min. Mira la vista previa." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo producir.");
    } finally { setBusy(""); setPaso(""); }
  };

  // ---------- 4 · Vista previa ----------
  const plan = useMemo<{ props: ReelProps; frames: number } | null>(() => {
    if (!p || !t || !meta.voz) return null;
    const scenes: ReelScene[] = [];
    let capturas = 0;
    // Primero tus capturas (pantallas reales de la app); después las automáticas de la web.
    // Si hay capturas verticales (versión celular), solo esas: el reel se ve más fluido sin mezclar formatos.
    const propias = Array.from({ length: meta.propias }, (_, k) => ({ url: urls[`p${k}`], v: !!meta.propiasV?.[k], video: !!meta.propiasVideo?.[k] })).filter(x => x.url);
    // Los videos de la app (grabaciones de pantalla) van primero: se ven funcionando.
    propias.sort((a, b) => Number(b.video) - Number(a.video));
    const pool: { url: string; v: boolean; video?: boolean }[] = propias.some(x => x.v)
      ? propias.filter(x => x.v)
      : [...propias, ...(urls.pc ? [{ url: urls.pc, v: false }] : []), ...(urls.cel ? [{ url: urls.cel, v: true }] : [])];
    p.escenas.forEach((e, i) => {
      const bloque = bloques.findIndex(b => b.escenas.includes(i));
      if (e.tipo === "presentador" && bloque >= 0) {
        const b = bloques[bloque];
        if (b.escenas[0] !== i) return; // el bloque entero es UN plano (los labios no se cortan)
        scenes.push({ t0: b.desde, t1: b.hasta, tipo: "presentador", img: urls[`cara${b.cierre ? 1 : 0}`] ?? urls.cara0 ?? null, clip: urls[`h${bloque}`] ?? null, shot: null });
        return;
      }
      const pick = e.tipo === "marca" ? (pool.find(x => x.v) ?? pool[0]) : e.tipo === "captura" && pool.length ? pool[capturas++ % pool.length] : undefined;
      scenes.push({ ...t[i], tipo: e.tipo, img: urls[`i${i}`] ?? null, clip: urls[`c${i}`] ?? null, shot: pick?.url ?? null, shotV: pick?.v ?? false, shotVideo: pick?.video ?? false });
    });
    const props: ReelProps = { scenes, audio: urls.voz ?? null, words: meta.voz.words, titulo: p.titulo, palabra: d.palabra, fondo: urls.cara0 ?? urls.i0 ?? null };
    return { props, frames: Math.max(FPS, Math.round(meta.voz.seconds * FPS) + 6) };
  }, [p, t, bloques, urls, meta.voz, meta.propias, meta.propiasV, meta.propiasVideo, d.palabra]);

  const faltan = p ? p.escenas.filter((e, i) => CON_IMAGEN.includes(e.tipo) && meta.imagenes[i] !== "listo").length : 0;
  const listo = !!plan && !!urls.voz && faltan === 0;

  const render = async () => {
    if (!plan || busy) return;
    setBusy("render"); setProgress(0);
    try {
      const { canRenderMediaOnWeb, renderMediaOnWeb } = await import("@remotion/web-renderer");
      const check = await canRenderMediaOnWeb({ ...SIZE, container: "mp4", videoCodec: "h264" });
      { const why = blockingIssue(check); if (why) throw new Error(why); }
      const out = await renderMediaOnWeb({
        composition: { id: "reel-ia", component: ToolReel, durationInFrames: plan.frames, fps: FPS, ...SIZE, defaultProps: plan.props },
        inputProps: plan.props, container: "mp4", videoCodec: "h264",
        onProgress: x => setProgress(Math.round(x.progress * 100)),
      });
      download(await out.getBlob(), "reel-ia.mp4");
      toast.success("Tu reel se descargó");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo armar el video en este navegador. Prueba con Chrome.");
    } finally { setBusy(""); }
  };

  const reiniciar = () => {
    if (!confirm("¿Empezar otro reel? Este se borra de tu navegador.")) return;
    Object.keys(urls).forEach(k => setUrl(k, null));
    const m = { ...nuevo(), foto: metaRef.current.foto }; metaRef.current = m; setMeta(m); if (uid) guardar(uid, m);
  };

  const step = !p ? (palabras < 20 ? 0 : 1) : !listo ? 2 : 3;
  const field = "w-full rounded-lg border border-border bg-background px-3 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none";
  const animadas = p?.escenas.filter(e => e.animar).length ?? 0;

  const preview = (
    <div className="space-y-3">
      {plan ? (
        <Player component={ToolReel} inputProps={plan.props} durationInFrames={plan.frames} fps={FPS} compositionWidth={SIZE.width} compositionHeight={SIZE.height}
          controls style={{ width: "100%", maxHeight: "62dvh", aspectRatio: "9 / 16", borderRadius: 16, overflow: "hidden", background: "#000" }} />
      ) : (
        <div className="card-surface flex aspect-[9/16] max-h-[62dvh] flex-col items-center justify-center gap-3 rounded-2xl p-6 text-center">
          <Clapperboard className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Aquí verás tu reel cuando tengas la voz. Empieza por el guion.</p>
        </div>
      )}
      {plan && (
        <>
          <label className="block text-[12px] text-muted-foreground">Título arriba (las palabras entre *asteriscos* van en azul)
            <input value={p?.titulo ?? ""} onChange={e => commit(m => (m.plan ? { plan: { ...m.plan, titulo: e.target.value.slice(0, 70) } } : {}))}
              className={`${field} mt-1 min-h-[44px]`} />
          </label>
          <button type="button" onClick={render} disabled={!listo || !!busy}
            className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy === "render" ? <><Loader2 className="w-4 h-4 animate-spin" /> Armando tu reel… {progress} %</> : <><Download className="w-4 h-4" /> Descargar mi reel (MP4)</>}
          </button>
          <p className="text-[11px] text-muted-foreground">{listo ? "Se arma en tu navegador: no cuesta créditos. No cierres la pestaña." : `Faltan ${faltan} imágenes${urls.voz ? "" : " y tu voz"} para descargar.`}</p>
          {p && (
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(textoPublicacion(p, d)).then(() => toast.success("Texto copiado")); }}
              className="inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"><Copy className="w-3.5 h-3.5" /> Copiar el texto para publicar</button>
          )}
        </>
      )}
    </div>
  );

  const aside = (
    <>
      {cfg && !cfg.eleven && <p className="card-surface rounded-2xl p-4 text-[12px] text-muted-foreground">Falta tu voz de ElevenLabs en los secretos de Supabase (ELEVENLABS_API_KEY y ELEVENLABS_VOICE_ID).</p>}
      <Card label="1 · Datos">
        <button type="button" onClick={usarSupernova} disabled={!!busy}
          className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm text-foreground hover:bg-secondary/40 disabled:opacity-50">
          <Sparkles className="w-4 h-4 text-primary" /> Usar SUPERNOVA (guion borrador)
        </button>
        <label className="block text-[12px] text-muted-foreground">Guion (lo que dices, tal cual)
          <textarea value={d.guion} rows={7} onChange={e => setDatos({ guion: e.target.value.slice(0, 3000) })} disabled={!!busy}
            placeholder="Hay una IA que encuentra negocios digitales que ya están vendiendo…" className={`${field} mt-1 py-2`} />
          <span className="block mt-1">{palabras} palabras · unos {Math.round(palabras / 2.9)} s de voz</span>
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-[12px] text-muted-foreground">Herramienta
            <input value={d.herramienta} onChange={e => setDatos({ herramienta: e.target.value.slice(0, 80) })} disabled={!!busy} placeholder="Vulcania" className={`${field} mt-1 min-h-[44px]`} />
          </label>
          <label className="block text-[12px] text-muted-foreground">Palabra para comentar
            <input value={d.palabra} onChange={e => setDatos({ palabra: e.target.value.slice(0, 30) })} disabled={!!busy} placeholder="WEB" className={`${field} mt-1 min-h-[44px]`} />
          </label>
        </div>
        <label className="block text-[12px] text-muted-foreground">Web de la herramienta (para las capturas reales)
          <input value={d.url} onChange={e => { setDatos({ url: e.target.value.slice(0, 300) }); commit({ capturas: ["pendiente", "pendiente"] }); }} disabled={!!busy}
            placeholder="https://…" className={`${field} mt-1 min-h-[44px]`} />
        </label>
        <div className="space-y-1.5">
          <p className="text-[12px] text-muted-foreground">Tus capturas o videos de la app (lo mejor: grabaciones de pantalla del celular de 3 a 8 s usándola). Salen dentro de un celular en las escenas de la app.</p>
          <div className="flex flex-wrap items-center gap-2">
            {Array.from({ length: meta.propias }, (_, k) => urls[`p${k}`] && (meta.propiasVideo?.[k]
              ? <video key={k} src={urls[`p${k}`]} muted playsInline className="w-12 h-12 rounded-lg object-cover object-top border border-border" />
              : <img key={k} src={urls[`p${k}`]} alt="" className="w-12 h-12 rounded-lg object-cover object-top border border-border" />))}
            <input ref={capRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={e => { const f = e.target.files; if (f?.length) void subirCapturas(f); e.target.value = ""; }} />
            {meta.propias < MAX_PROPIAS && (
              <button type="button" onClick={() => capRef.current?.click()} disabled={!!busy}
                className="h-9 px-3 rounded-full border border-border text-[12px] text-foreground hover:bg-secondary/40 disabled:opacity-50">+ Subir capturas o videos</button>
            )}
            {meta.propias > 0 && <button type="button" onClick={quitarCapturas} disabled={!!busy} className="text-[12px] text-muted-foreground hover:text-foreground">Quitar</button>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {PALETAS.map(x => (
            <button key={x.id} type="button" onClick={() => setDatos({ paleta: x.id })} disabled={!!busy}
              className={`h-9 px-3 rounded-full border text-[12px] ${d.paleta === x.id ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground"}`}>{x.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {meta.foto ? <img src={meta.foto.url} alt="Tu foto" className="w-14 h-14 rounded-xl object-cover border border-border" /> : null}
          <input ref={fotoRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void subirFoto(f); }} />
          <button type="button" onClick={() => fotoRef.current?.click()} disabled={!!busy}
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 text-sm text-foreground hover:bg-secondary/40 disabled:opacity-50">
            {busy === "foto" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}{meta.foto ? "Cambiar tu foto" : "Subir tu foto (de frente)"}
          </button>
        </div>
        <button type="button" onClick={() => void planear()} disabled={!!busy || palabras < 20}
          className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy === "plan" ? <><Loader2 className="w-4 h-4 animate-spin" /> Planeando escenas…</> : <><Wand2 className="w-4 h-4" /> {p ? "Volver a planear" : "Planear escenas"} · {PRICES.plan} créditos</>}
        </button>
      </Card>

      {p && (
        <Card label={`2 · Escenas (${p.escenas.length})`}>
          <div className="space-y-2 max-h-[52dvh] overflow-y-auto pr-1">
            {p.escenas.map((e, i) => (
              <div key={i} className="rounded-xl border border-border p-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground w-5">{i + 1}</span>
                  <select value={e.tipo} onChange={ev => editEscena(i, { tipo: ev.target.value as Tipo, animar: false })} disabled={!!busy}
                    className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground">
                    {(Object.keys(TIPOS) as Tipo[]).map(k => <option key={k} value={k}>{TIPOS[k]}</option>)}
                  </select>
                  <Dot e={CON_IMAGEN.includes(e.tipo) ? meta.imagenes[i] : undefined} />
                  {CON_IMAGEN.includes(e.tipo) && (
                    <label className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                      <input type="checkbox" checked={e.animar} disabled={!!busy || (!e.animar && animadas >= MAX_ANIMADAS)} onChange={ev => editEscena(i, { animar: ev.target.checked })} />Animar
                    </label>
                  )}
                </div>
                <p className="text-[13px] text-foreground">«{e.texto}»</p>
                {CON_IMAGEN.includes(e.tipo) && (
                  <textarea value={e.visual} rows={2} onChange={ev => editEscena(i, { visual: ev.target.value.slice(0, 400) })} disabled={!!busy}
                    className={`${field} py-1.5 text-[12px] font-mono`} />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {p && (
        <Card label="3 · Producir">
          <p className="text-[12px] text-muted-foreground">
            Tu voz · {meta.datos.url ? "2 capturas reales · " : ""}tu cara en 2 escenas · {p.escenas.filter(e => CON_IMAGEN.includes(e.tipo)).length} imágenes · {animadas} animadas · tú hablando en el gancho y el cierre.
            Créditos: <span className="text-foreground font-medium">{costo(p)}</span>. La voz (ElevenLabs) y tu presentador con labios no cobran créditos: van por tus cuentas de esos servicios (unos US$0,50 por reel).
          </p>
          <button type="button" onClick={() => void producir()} disabled={!!busy || (cfg !== null && !cfg.eleven)}
            className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy === "producir" ? <><Loader2 className="w-4 h-4 animate-spin" /> {paso || "Produciendo…"}</> : listo ? <><RefreshCw className="w-4 h-4" /> Producir lo que falte</> : <><Sparkles className="w-4 h-4" /> Producir todo</>}
          </button>
          <ul className="text-[12px] text-muted-foreground space-y-0.5">
            <li><Dot e={urls.voz ? "listo" : "pendiente"} /> Tu voz{meta.voz ? ` · ${Math.round(meta.voz.seconds)} s` : ""}</li>
            {d.url && <li><Dot e={meta.capturas[0]} /> Capturas de la web</li>}
            <li><Dot e={meta.caras[0] && meta.caras[1] ? "listo" : "pendiente"} /> Tu cara en el gancho y el cierre</li>
            {bloques.map((b, k) => <li key={k}><Dot e={meta.habla[k] ?? "pendiente"} /> Tú hablando en el {b.cierre ? "cierre" : "gancho"} ({Math.round(b.hasta - b.desde)} s)</li>)}
            {meta.clips.some((c, i) => p.escenas[i]?.animar && c === "trabajando") && <li><Loader2 className="inline w-3 h-3 animate-spin mr-1" />Animaciones en camino</li>}
          </ul>
          <button type="button" onClick={reiniciar} disabled={!!busy} className="text-[12px] text-muted-foreground hover:text-foreground">Empezar otro reel</button>
        </Card>
      )}
    </>
  );

  return (
    <ToolShell onNavigate={onNavigate} previewFirst
      crumbs={[{ label: "Crear" }, { label: "Con tu cara", onClick: onHome }, { label: "Reel de herramienta IA" }]}
      title="Reel de herramienta IA"
      line="Del guion al reel: tu voz, capturas reales, imágenes al ritmo de cada frase y tú hablando al inicio y al final."
      onBack={onHome}
      steps={["Datos", "Escenas", "Producir", "Descarga"]} step={step}
      aside={aside}>
      {preview}
    </ToolShell>
  );
}

function Dot({ e }: { e?: Estado }) {
  if (!e) return null;
  if (e === "listo") return <Check className="inline w-3.5 h-3.5 text-primary mr-1" />;
  if (e === "trabajando") return <Loader2 className="inline w-3.5 h-3.5 animate-spin mr-1" />;
  if (e === "falló") return <span className="text-[11px] text-primary mr-1">falló</span>;
  return <span className="inline-block w-3.5 h-3.5 rounded-full border border-border mr-1 align-middle" />;
}

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="card-surface rounded-2xl p-4 space-y-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
