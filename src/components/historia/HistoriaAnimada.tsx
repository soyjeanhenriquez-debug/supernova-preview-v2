import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Player } from "@remotion/player";
import { Check, Clapperboard, Copy, Download, ImageIcon, Loader2, Mic, RefreshCw, Sparkles, Upload, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/hooks/useCredits";
import { fnErrorMessage, fnHeaders, invokeErrorMessage, readBilling } from "@/lib/fnAuth";
import { extractAudio, MAX_VIDEO_SECONDS, type Subtitle } from "@/lib/burnSubtitles";
import { audioSeconds, compressImage } from "@/lib/montage";
import { getMedia, putMedia } from "@/lib/productionStore";
import { wordsFromSubs, type Word } from "@/lib/subtitleStyles";
import { VOICE_LABEL, VOICES, type Voice } from "@/lib/ytScenes";
import {
  bloquesDeVoz, costo, GENERATOR_ID, historiaRequest, MAX_ANIMADAS, palabrasVozIA, parseHistoria, PRICES, textoDeBloque,
  tiemposTuVoz, tiemposVozIA, type Escena, type Historia, type Tiempo,
} from "@/lib/historia";
import { ToolShell } from "@/components/tool/ToolShell";
import { StoryVideo, type StoryProps } from "@/remotion/StoryVideo";

/**
 * Mi historia animada (20-oct-2026, por ahora solo la cuenta de Jean): tu historia real contada con tu
 * personaje animado en 3D. 1) tu personaje desde tu foto · 2) la IA arma capítulos y escenas (editables)
 * · 3) voz IA o tu voz grabada · 4) producir: cada imagen, voz y animación la cobra el servidor ANTES y
 * la devuelve si falla (yt-produce, video-studio) · 5) vista previa y descarga armada gratis en tu
 * navegador (StoryVideo + renderMediaOnWeb). Lo pagado se guarda en el navegador (IndexedDB): recargar
 * no pierde nada ni vuelve a cobrar. Lógica pura y precios en src/lib/historia.ts.
 */
const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const FPS = 30;
const SIZE = { width: 720, height: 1280 };
const PERSONAJE = 999;          // índice del personaje en el almacén del navegador
const TU_VOZ = 900;             // tu narración grabada
const VOZ_IA = (k: number) => 500 + k;

type Estado = "pendiente" | "trabajando" | "listo" | "falló";
type Meta = {
  id: string;
  texto: string;
  historia: Historia | null;
  personaje: boolean;
  vozIA: boolean;
  voz: Voice;
  titulo: string;
  imagenes: Estado[];
  clips: Estado[];
  jobs: (string | null)[];
  voces: Estado[];
  vozSeg: number[];
  /** Tu voz: palabras con sus tiempos (de los subtítulos) y duración. */
  tuVoz: { words: Word[]; seconds: number } | null;
};

const nuevo = (): Meta => ({
  id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`, texto: "", historia: null, personaje: false, vozIA: true, voz: "onyx",
  titulo: "", imagenes: [], clips: [], jobs: [], voces: [], vozSeg: [], tuVoz: null,
});
const KEY = (uid: string) => `supernova.historia.${uid}`;
function cargar(uid: string): Meta {
  try { const m = JSON.parse(localStorage.getItem(KEY(uid)) ?? "null"); if (m?.id) return { ...nuevo(), ...m }; } catch { /* sin almacenamiento */ }
  return nuevo();
}
const guardar = (uid: string, m: Meta) => { try { localStorage.setItem(KEY(uid), JSON.stringify(m)); } catch { /* sin almacenamiento */ } };

class ApiError extends Error { constructor(m: string, public status: number, public code?: string) { super(m); } }
async function post(fn: string, body: Record<string, unknown>) {
  const resp = await fetch(`${FN}/${fn}`, { method: "POST", headers: await fnHeaders(), body: JSON.stringify(body) });
  if (!resp.ok) {
    let code: string | undefined;
    try { code = (await resp.clone().json())?.code; } catch { /* sin cuerpo */ }
    throw new ApiError(await fnErrorMessage(resp, "No se pudo completar."), resp.status, code);
  }
  return resp;
}
const b64Blob = async (dataUrl: string) => (await fetch(dataUrl)).blob();
const download = (blob: Blob, name: string) => {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

export function HistoriaAnimada({ onHome, onNavigate }: { onHome: () => void; onNavigate: (page: string) => void }) {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const { applyServerCharge } = useCredits();
  const [meta, setMeta] = useState<Meta>(() => (uid ? cargar(uid) : nuevo()));
  const metaRef = useRef(meta);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "foto" | "guion" | "tuvoz" | "producir" | "render">("");
  const [progress, setProgress] = useState(0);
  const fotoRef = useRef<HTMLInputElement>(null);
  const vozRef = useRef<HTMLInputElement>(null);
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
  const sync = useCallback((resp: Response, data?: { billing?: { charged: number; balance: number | null } }) => {
    const b = data?.billing ?? readBilling(resp);
    if (typeof b.balance === "number") applyServerCharge("gen_media", { charged: 0, balance: b.balance }); // solo el saldo
  }, [applyServerCharge]);

  // Al abrir: lo que ya se pagó vuelve desde el navegador.
  useEffect(() => {
    if (!uid) return;
    const m = cargar(uid); metaRef.current = m; setMeta(m);
    void (async () => {
      const id = m.id;
      const pc = await getMedia(id, PERSONAJE, "image"); if (pc) setUrl("personaje", pc);
      const tv = await getMedia(id, TU_VOZ, "voice"); if (tv) setUrl("tuvoz", tv);
      for (let i = 0; i < (m.historia?.escenas.length ?? 0); i++) {
        const img = await getMedia(id, i, "image"); if (img) setUrl(`i${i}`, img);
        const clip = await getMedia(id, i, "clip"); if (clip) setUrl(`c${i}`, clip);
      }
      for (let k = 0; k < m.voces.length; k++) { const v = await getMedia(id, VOZ_IA(k), "voice"); if (v) setUrl(`v${k}`, v); }
    })();
  }, [uid, setUrl]);

  const h = meta.historia;
  const bloques = useMemo(() => (h ? bloquesDeVoz(h.escenas) : []), [h]);

  // ---------- 1 · Personaje ----------
  const crearPersonaje = async (file: File) => {
    if (!uid || busy) return;
    if (!file.type.startsWith("image/")) { toast.error("Elige una foto (JPG o PNG)."); return; }
    setBusy("foto");
    try {
      const small = await compressImage(file, 1024, 0.9).catch(() => file);
      const fotoPath = `${uid}/historia/${meta.id}/foto.webp`;
      const up = await supabase.storage.from("creativos").upload(fotoPath, small, { upsert: true, contentType: small.type || "image/webp" });
      if (up.error) throw new Error("No se pudo subir tu foto.");
      const resp = await post("yt-produce", { action: "character", photo_path: fotoPath });
      const data = await resp.json(); sync(resp, data);
      const blob = await compressImage(await b64Blob(data.image)).catch(async () => b64Blob(data.image));
      const refPath = `${uid}/historia/${meta.id}/personaje.webp`;
      const up2 = await supabase.storage.from("creativos").upload(refPath, blob, { upsert: true, contentType: blob.type || "image/webp" });
      if (up2.error) throw new Error("No se pudo guardar tu personaje.");
      await putMedia(meta.id, PERSONAJE, "image", blob);
      setUrl("personaje", blob);
      void supabase.storage.from("creativos").remove([fotoPath]); // la foto original no se queda en el servidor
      commit({ personaje: true });
      toast.success("Tu personaje está listo", { description: "Saldrá igual en todas las escenas." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear tu personaje.");
    } finally { setBusy(""); }
  };

  // ---------- 2 · Guion ----------
  const escribirGuion = async () => {
    if (busy || meta.texto.trim().length < 80) return;
    setBusy("guion");
    try {
      const resp = await fetch(`${FN}/ai-chat`, {
        method: "POST", headers: await fnHeaders(),
        body: JSON.stringify({ generator_id: GENERATOR_ID, generator_title: "Mi historia animada · guion", messages: [{ role: "user", content: historiaRequest(meta.texto) }] }),
      });
      if (!resp.ok || !resp.body) throw new Error(await fnErrorMessage(resp, "La IA no respondió. No se te cobró: intenta de nuevo."));
      const b = readBilling(resp);
      if (b.charged || typeof b.balance === "number") applyServerCharge("gen_light", { charged: b.charged, balance: b.balance }, "Mi historia animada · guion");
      const reader = resp.body.getReader(); const dec = new TextDecoder();
      let buf = "", text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).replace(/\r$/, ""); buf = buf.slice(nl + 1);
          if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
          try { const c = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content; if (c) text += c; } catch { /* trozo incompleto */ }
        }
      }
      const parsed = parseHistoria(text);
      if (!parsed) throw new Error("La IA no devolvió escenas que sirvan. Intenta de nuevo con más detalles de tu historia.");
      const n = parsed.escenas.length;
      for (let i = 0; i < Math.max(n, metaRef.current.historia?.escenas.length ?? 0); i++) { setUrl(`i${i}`, null); setUrl(`c${i}`, null); }
      commit({ historia: parsed, imagenes: Array(n).fill("pendiente"), clips: Array(n).fill("pendiente"), jobs: Array(n).fill(null), voces: [], vozSeg: [], titulo: parsed.titulo });
      toast.success(`Listo: ${parsed.capitulos.length} capítulos y ${n} escenas`, { description: "Revísalas y cambia lo que quieras antes de producir." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo escribir el guion.");
    } finally { setBusy(""); }
  };

  const editEscena = (i: number, patch: Partial<Escena>) => commit(m => {
    if (!m.historia) return {};
    const escenas = m.historia.escenas.map((e, k) => (k === i ? { ...e, ...patch } : e));
    // Cambiar lo que se ve o lo que se dice obliga a rehacer esa imagen o la voz de su bloque.
    const imagenes = [...m.imagenes]; const clips = [...m.clips];
    if (patch.visual !== undefined) { imagenes[i] = "pendiente"; clips[i] = "pendiente"; }
    return { historia: { ...m.historia, escenas }, imagenes, clips, ...(patch.narracion !== undefined ? { voces: [], vozSeg: [] } : {}) };
  });
  const editRotulo = (c: number, v: string) => commit(m => (m.historia ? { historia: { ...m.historia, capitulos: m.historia.capitulos.map((x, k) => (k === c ? v : x)) } } : {}));
  const animadas = h?.escenas.filter(e => e.animar).length ?? 0;

  // ---------- 3 · Tu voz ----------
  const subirTuVoz = async (file: File) => {
    if (busy || !h) return;
    setBusy("tuvoz");
    try {
      const { audio, seconds } = await extractAudio(file);
      const { data, error } = await supabase.functions.invoke("video-subtitles", { body: { audio, seconds, brief: { product: "", who: "" } } });
      if (error || !Array.isArray(data?.subtitulos)) throw new Error(error ? await invokeErrorMessage(error, "No se pudieron leer tus palabras. No se te cobró.") : (data?.error || "No se pudieron leer tus palabras. No se te cobró."));
      if (data.billing) applyServerCharge("video_subtitles", data.billing, "Mi historia animada · tu voz");
      await putMedia(meta.id, TU_VOZ, "voice", file);
      setUrl("tuvoz", file);
      commit({ tuVoz: { words: wordsFromSubs(data.subtitulos as Subtitle[]), seconds }, vozIA: false });
      toast.success("Tu voz está lista", { description: "Las escenas se acomodan a lo que dices." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo usar tu audio.");
    } finally { setBusy(""); }
  };

  // ---------- 4 · Producir ----------
  type Tarea = { kind: "voz" | "imagen" | "clip"; i: number };
  const pendientes = useCallback((): Tarea[] => {
    const m = metaRef.current; const hh = m.historia;
    if (!hh) return [];
    const out: Tarea[] = [];
    if (m.vozIA) bloquesDeVoz(hh.escenas).forEach((_, k) => { if (m.voces[k] !== "listo") out.push({ kind: "voz", i: k }); });
    hh.escenas.forEach((e, i) => { if (e.tipo === "imagen" && m.imagenes[i] !== "listo") out.push({ kind: "imagen", i }); });
    hh.escenas.forEach((e, i) => { if (e.tipo === "imagen" && e.animar && m.clips[i] !== "listo" && !m.jobs[i]) out.push({ kind: "clip", i }); });
    return out;
  }, []);

  const setEstado = (kind: "imagenes" | "clips" | "voces", i: number, v: Estado) => commit(m => { const a = [...m[kind]]; a[i] = v; return { [kind]: a } as Partial<Meta>; });

  const pollClip = useCallback(async (i: number) => {
    for (let tries = 0; tries < 80 && alive.current; tries++) {
      await new Promise(r => setTimeout(r, 6000));
      const jobId = metaRef.current.jobs[i];
      if (!jobId) return;
      const { data, error } = await supabase.functions.invoke("video-studio", { body: { action: "status", job_id: jobId } });
      if (error) continue;
      const st = data?.job?.status;
      if (st === "failed") { setEstado("clips", i, "falló"); commit(m => { const j = [...m.jobs]; j[i] = null; return { jobs: j }; }); toast.error(`La animación de la escena ${i + 1} falló. Te devolvimos los créditos; usa la imagen con movimiento.`); return; }
      if (st !== "done") continue;
      try {
        const resp = await post("video-studio", { action: "file", job_id: jobId });
        const blob = await resp.blob();
        await putMedia(metaRef.current.id, i, "clip", blob);
        setUrl(`c${i}`, blob);
        setEstado("clips", i, "listo");
      } catch { setEstado("clips", i, "falló"); }
      return;
    }
  }, [commit, setUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Animaciones que quedaron en camino al recargar: se siguen esperando (ya están pagadas).
  useEffect(() => { meta.jobs.forEach((j, i) => { if (j && meta.clips[i] !== "listo") void pollClip(i); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const correr = async ({ kind, i }: Tarea) => {
    const m = metaRef.current; const hh = m.historia!;
    if (kind === "voz") {
      setEstado("voces", i, "trabajando");
      const b = bloquesDeVoz(hh.escenas)[i];
      const resp = await post("yt-produce", { action: "voice", text: textoDeBloque(hh.escenas, b).slice(0, 600), voice: m.voz, lang: "es", scene: Math.min(40, i + 1) });
      const data = await resp.json(); sync(resp, data);
      const blob = await b64Blob(`data:${data.mime || "audio/mpeg"};base64,${data.audio}`);
      await putMedia(m.id, VOZ_IA(i), "voice", blob); setUrl(`v${i}`, blob);
      const sec = await audioSeconds(blob);
      commit(mm => { const s = [...mm.vozSeg]; s[i] = sec; const v = [...mm.voces]; v[i] = "listo"; return { vozSeg: s, voces: v }; });
    } else if (kind === "imagen") {
      setEstado("imagenes", i, "trabajando");
      const resp = await post("yt-produce", {
        action: "scene_image", visual: hh.escenas[i].visual.slice(0, 600), style: "Animación 3D", aspect: "9:16", scene: Math.min(40, i + 1),
        ...(m.personaje ? { ref_path: `${uid}/historia/${m.id}/personaje.webp` } : {}),
      });
      const data = await resp.json(); sync(resp, data);
      const raw = await b64Blob(data.image);
      const blob = await compressImage(raw).catch(() => raw);
      await putMedia(m.id, i, "image", blob); setUrl(`i${i}`, blob);
      setEstado("imagenes", i, "listo");
    } else {
      const img = await getMedia(m.id, i, "image");
      if (!img) return; // la imagen va primero; se anima en la siguiente vuelta
      setEstado("clips", i, "trabajando");
      const path = `${uid}/historia/${m.id}/s${i + 1}.webp`;
      const up = await supabase.storage.from("creativos").upload(path, img, { upsert: true, contentType: img.type || "image/webp" });
      if (up.error) throw new ApiError("No se pudo preparar la imagen para animarla.", 400);
      const resp = await post("video-studio", {
        prompt: `Anima esta escena con movimiento natural y suave: ${hh.escenas[i].visual.slice(0, 400)}. Mismo estilo de animación 3D, cámara estable, sin cortes, sin texto.`,
        seconds: 5, size: "9:16", image_path: path, image_bucket: "creativos", audio: false, kind: "yt_scene",
      });
      const data = await resp.json(); sync(resp, data);
      commit(mm => { const j = [...mm.jobs]; j[i] = data?.job?.id ?? null; return { jobs: j }; });
      void pollClip(i);
    }
  };

  const producir = async () => {
    if (busy || !h) return;
    if (!meta.vozIA && !meta.tuVoz) { toast.error("Elige la voz: voz IA o sube tu narración."); return; }
    setBusy("producir");
    try {
      for (let vuelta = 0; vuelta < 2; vuelta++) { // 2 vueltas: las animaciones esperan a su imagen
        const cola = pendientes();
        if (!cola.length) break;
        let stop = false;
        const worker = async () => {
          while (!stop && cola.length && alive.current) {
            const t = cola.shift()!;
            try { await correr(t); } catch (e) {
              const err = e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : "No se pudo completar.", 0);
              setEstado(t.kind === "voz" ? "voces" : t.kind === "imagen" ? "imagenes" : "clips", t.i, [401, 402, 403, 429, 503].includes(err.status) ? "pendiente" : "falló");
              if ([401, 402, 403, 429, 503].includes(err.status)) { stop = true; toast.error(err.message); }
            }
          }
        };
        await Promise.all([worker(), worker()]);
        if (stop) break;
      }
      if (!pendientes().filter(t => t.kind !== "clip").length) toast.success("Tus escenas están listas", { description: "Mira la vista previa y descarga tu video." });
    } finally { setBusy(""); }
  };

  // ---------- 5 · Vista previa ----------
  const plan = useMemo(() => {
    if (!h) return null;
    let tiempos: Tiempo[]; let audios: StoryProps["audios"] = []; let words: Word[] = []; let total = 0;
    if (meta.vozIA) {
      const durs = bloques.map((b, k) => meta.vozSeg[k] || b.reduce((a, i) => a + h.escenas[i].narracion.split(/\s+/).length / 2.6, 0));
      const t = tiemposVozIA(h.escenas, bloques, durs);
      tiempos = t.escenas; words = palabrasVozIA(h.escenas, tiempos);
      audios = bloques.map((_, k) => (urls[`v${k}`] ? { src: urls[`v${k}`], at: t.audios[k] } : null)).filter(Boolean) as StoryProps["audios"];
    } else {
      const tv = meta.tuVoz;
      tiempos = tiemposTuVoz(h.escenas, tv?.words ?? [], tv?.seconds ?? 60);
      words = tv?.words ?? [];
      if (urls.tuvoz) audios = [{ src: urls.tuvoz, at: 0 }];
    }
    total = tiempos.length ? tiempos[tiempos.length - 1].t1 : 1;
    const props: StoryProps = {
      scenes: h.escenas.map((e, i) => ({
        ...tiempos[i], tipo: e.tipo, img: urls[`i${i}`] ?? null, clip: urls[`c${i}`] ?? null, texto: e.narracion,
        rotulo: i === h.escenas.findIndex(x => x.capitulo === e.capitulo) ? h.capitulos[e.capitulo] ?? "" : "",
      })),
      audios, words, titulo: meta.titulo,
    };
    return { props, frames: Math.max(FPS, Math.round(total * FPS) + 6) };
  }, [h, meta.vozIA, meta.vozSeg, meta.tuVoz, meta.titulo, bloques, urls]);

  const listas = h ? h.escenas.filter((e, i) => e.tipo === "imagen" && meta.imagenes[i] === "listo").length : 0;
  const totalImg = h ? h.escenas.filter(e => e.tipo === "imagen").length : 0;
  const vozLista = meta.vozIA ? bloques.length > 0 && bloques.every((_, k) => meta.voces[k] === "listo") : !!meta.tuVoz;
  const ready = !!plan && listas === totalImg && vozLista;

  const render = async () => {
    if (!plan || busy) return;
    setBusy("render"); setProgress(0);
    try {
      const { canRenderMediaOnWeb, renderMediaOnWeb } = await import("@remotion/web-renderer");
      const check = await canRenderMediaOnWeb({ ...SIZE, container: "mp4", videoCodec: "h264" });
      if (!check.canRender) throw new Error(check.issues.find(i => i.severity === "error")?.message || "Tu navegador no puede armar el video.");
      const out = await renderMediaOnWeb({
        composition: { id: "historia", component: StoryVideo, durationInFrames: plan.frames, fps: FPS, ...SIZE, defaultProps: plan.props },
        inputProps: plan.props, container: "mp4", videoCodec: "h264",
        onProgress: p => setProgress(Math.round(p.progress * 100)),
      });
      download(await out.getBlob(), "mi-historia-animada.mp4");
      toast.success("Tu video se descargó");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo armar el video en este navegador. Prueba con Chrome.");
    } finally { setBusy(""); }
  };

  const reiniciar = () => {
    if (!confirm("¿Empezar otra historia? Esta se borra de tu navegador.")) return;
    Object.keys(urls).forEach(k => setUrl(k, null));
    const m = nuevo(); metaRef.current = m; setMeta(m); if (uid) guardar(uid, m);
  };

  const cost = h ? costo(h, { vozIA: meta.vozIA, conPersonaje: true }) : 0;
  const falta = h ? pendientes().length : 0;
  const step = !meta.personaje ? 0 : !h ? 1 : !vozLista && !ready ? 2 : !ready ? 3 : 4;

  const preview = (
    <div className="space-y-3">
      {plan && (listas > 0 || urls.personaje) ? (
        <Player component={StoryVideo} inputProps={plan.props} durationInFrames={plan.frames} fps={FPS} compositionWidth={SIZE.width} compositionHeight={SIZE.height}
          controls style={{ width: "100%", maxHeight: "62dvh", aspectRatio: "9 / 16", borderRadius: 16, overflow: "hidden", background: "#000" }} />
      ) : (
        <div className="card-surface flex aspect-[9/16] max-h-[62dvh] flex-col items-center justify-center gap-3 rounded-2xl p-6 text-center">
          {urls.personaje ? <img src={urls.personaje} alt="Tu personaje" className="max-h-[48dvh] rounded-xl" /> : <Clapperboard className="w-8 h-8 text-muted-foreground" />}
          <p className="text-sm text-muted-foreground">{urls.personaje ? "Tu personaje. Ahora escribe tu historia." : "Aquí verás tu historia escena por escena."}</p>
        </div>
      )}
      {plan && (
        <>
          <label className="block text-[12px] text-muted-foreground">Título arriba (opcional; las palabras entre *asteriscos* van en azul)
            <input value={meta.titulo} onChange={e => commit({ titulo: e.target.value.slice(0, 70) })} placeholder="De *perdido* a enfocado"
              className="mt-1 w-full min-h-[44px] rounded-lg border border-border bg-background px-3 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none" />
          </label>
          <button type="button" onClick={render} disabled={!ready || !!busy}
            className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy === "render" ? <><Loader2 className="w-4 h-4 animate-spin" /> Armando tu video… {progress} %</> : <><Download className="w-4 h-4" /> Descargar mi video (MP4)</>}
          </button>
          <p className="text-[11px] text-muted-foreground">{ready ? "Se arma en tu navegador: no cuesta créditos. No cierres la pestaña." : `Faltan ${totalImg - listas} imágenes${vozLista ? "" : " y la voz"} para descargar.`}</p>
        </>
      )}
    </div>
  );

  const aside = (
    <>
      <Card label="1 · Tu personaje">
        <p className="text-[12px] text-muted-foreground">Sube una foto tuya, de frente y con buena luz. La IA te convierte en personaje de animación 3D y sales igual en todas las escenas. La foto se borra al terminar.</p>
        <input ref={fotoRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void crearPersonaje(f); }} />
        <button type="button" onClick={() => fotoRef.current?.click()} disabled={!!busy}
          className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm text-foreground hover:bg-secondary/40 disabled:opacity-50">
          {busy === "foto" ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando tu personaje…</> : meta.personaje ? <><RefreshCw className="w-4 h-4" /> Otra versión · {PRICES.personaje} créditos</> : <><Upload className="w-4 h-4" /> Subir mi foto · {PRICES.personaje} créditos</>}
        </button>
      </Card>

      <Card label="2 · Tu historia">
        <p className="text-[12px] text-muted-foreground">Cuéntala como se la contarías a un amigo: de dónde vienes, qué pasó, qué cambió y qué haces hoy. Solo hechos reales.</p>
        <textarea value={meta.texto} onChange={e => commit({ texto: e.target.value.slice(0, 6000) })} rows={6} placeholder="A los 18 no sabía qué hacer con mi vida. Mis papás me dieron un año para encontrar algo…"
          className="w-full rounded-lg border border-border bg-background p-3 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none" />
        <button type="button" onClick={escribirGuion} disabled={!!busy || meta.texto.trim().length < 80}
          className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy === "guion" ? <><Loader2 className="w-4 h-4 animate-spin" /> Armando capítulos y escenas…</> : <><Sparkles className="w-4 h-4" /> {h ? "Rehacer el guion" : "Armar mi guion"} · {PRICES.guion} créditos</>}
        </button>
        {meta.texto.trim().length < 80 && <p className="text-[11px] text-muted-foreground">Escribe al menos unas líneas ({meta.texto.trim().length}/80).</p>}
        {h && (
          <details className="group" open>
            <summary className="cursor-pointer list-none text-[13px] text-foreground">{h.capitulos.length} capítulos · {h.escenas.length} escenas · {animadas} animadas (máx. {MAX_ANIMADAS}) <span className="text-muted-foreground">— toca para editar</span></summary>
            <div className="mt-3 space-y-3">
              {h.capitulos.map((rot, c) => (
                <div key={c} className="space-y-2">
                  <input value={rot} onChange={e => editRotulo(c, e.target.value.slice(0, 60))} aria-label={`Rótulo del capítulo ${c + 1}`}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-base sm:text-sm font-semibold text-foreground focus:border-primary/60 focus:outline-none" />
                  {h.escenas.map((e, i) => e.capitulo !== c ? null : (
                    <div key={i} className="flex gap-2 rounded-lg border border-border p-2">
                      <div className="h-16 w-9 shrink-0 overflow-hidden rounded bg-secondary/60">
                        {e.tipo === "negro" ? <div className="h-full w-full bg-black" /> : urls[`i${i}`] ? <img src={urls[`i${i}`]} alt="" className="h-full w-full object-cover" /> : null}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <input value={e.narracion} onChange={ev => editEscena(i, { narracion: ev.target.value.slice(0, 220) })} aria-label={`Narración de la escena ${i + 1}`}
                          className="w-full rounded border border-border bg-background px-2 py-1 text-base sm:text-[13px] text-foreground focus:border-primary/60 focus:outline-none" />
                        {e.tipo === "imagen" ? (
                          <>
                            <input value={e.visual} onChange={ev => editEscena(i, { visual: ev.target.value.slice(0, 400) })} aria-label={`Lo que se ve en la escena ${i + 1}`}
                              className="w-full rounded border border-border bg-background px-2 py-1 text-base sm:text-[12px] text-muted-foreground focus:border-primary/60 focus:outline-none" />
                            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <input type="checkbox" checked={e.animar} disabled={!e.animar && animadas >= MAX_ANIMADAS} onChange={ev => editEscena(i, { animar: ev.target.checked })} />
                              Animar · {PRICES.animar} créditos {meta.clips[i] === "listo" ? "· lista" : meta.jobs[i] ? "· animándose…" : ""}
                            </label>
                          </>
                        ) : <p className="text-[11px] text-muted-foreground">Pantalla negra con esta frase</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </details>
        )}
      </Card>

      {h && (
        <Card label="3 · La voz">
          <div className="grid grid-cols-2 gap-2">
            {([[true, "Voz IA", `${PRICES.voz} créditos por bloque`], [false, "Mi voz", `${PRICES.subtitulos} créditos los subtítulos`]] as const).map(([v, t, d]) => (
              <button key={t} type="button" onClick={() => commit({ vozIA: v })} aria-pressed={meta.vozIA === v}
                className={`rounded-xl border p-3 text-left ${meta.vozIA === v ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/30"}`}>
                <span className="block text-sm font-medium text-foreground">{t}</span>
                <span className="block text-[11px] text-muted-foreground">{d}</span>
              </button>
            ))}
          </div>
          {meta.vozIA ? (
            <label className="block text-[12px] text-muted-foreground">Voz
              <select value={meta.voz} onChange={e => commit({ voz: e.target.value as Voice, voces: [], vozSeg: [] })}
                className="mt-1 w-full min-h-[44px] rounded-lg border border-border bg-background px-3 text-base sm:text-sm text-foreground">
                {VOICES.map(v => <option key={v} value={v}>{VOICE_LABEL[v]}</option>)}
              </select>
            </label>
          ) : (
            <>
              <p className="text-[12px] text-muted-foreground">Graba la narración leyendo tu guion (máximo {MAX_VIDEO_SECONDS} s). Puedes leerla en el Teleprompter.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { void navigator.clipboard?.writeText(h.escenas.map(e => e.narracion).join("\n")).then(() => toast.success("Narración copiada")); }}
                  className="inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"><Copy className="w-3.5 h-3.5" /> Copiar narración</button>
                <button type="button" onClick={() => { window.location.hash = "#/con-tu-cara/teleprompter"; }} className="inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline">Abrir el Teleprompter</button>
              </div>
              <input ref={vozRef} type="file" accept="audio/*,video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void subirTuVoz(f); }} />
              <button type="button" onClick={() => vozRef.current?.click()} disabled={!!busy}
                className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm text-foreground hover:bg-secondary/40 disabled:opacity-50">
                {busy === "tuvoz" ? <><Loader2 className="w-4 h-4 animate-spin" /> Escuchando tu voz…</> : meta.tuVoz ? <><Check className="w-4 h-4 text-primary" /> Tu voz está lista · cambiar</> : <><Mic className="w-4 h-4" /> Subir mi narración · {PRICES.subtitulos} créditos</>}
              </button>
            </>
          )}
        </Card>
      )}

      {h && (
        <Card label="4 · Producir">
          <p className="text-[12px] text-muted-foreground">
            {totalImg} imágenes · {animadas} animadas · {meta.vozIA ? `${bloques.length} bloques de voz` : "tu voz"}. Total de la historia: <span className="text-foreground font-medium">{cost} créditos</span>. Cada pieza se cobra al hacerla y se devuelve si falla.
          </p>
          <button type="button" onClick={producir} disabled={!!busy || !falta || (!meta.vozIA && !meta.tuVoz)}
            className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy === "producir" ? <><Loader2 className="w-4 h-4 animate-spin" /> Produciendo escenas… {listas}/{totalImg}</> : falta ? <><Wand2 className="w-4 h-4" /> Producir lo que falta</> : <><Check className="w-4 h-4" /> Todo producido</>}
          </button>
          {meta.imagenes.some(s => s === "falló") && <p className="text-[11px] text-muted-foreground">Algunas imágenes fallaron y se devolvieron los créditos. Toca "Producir lo que falta" para reintentarlas.</p>}
          {!meta.personaje && <p className="text-[11px] text-muted-foreground"><ImageIcon className="mr-1 inline w-3.5 h-3.5" />Sin personaje, cada escena puede salir con otra cara. Crea tu personaje primero.</p>}
          <button type="button" onClick={reiniciar} disabled={!!busy} className="text-[12px] text-muted-foreground hover:text-foreground">Empezar otra historia</button>
        </Card>
      )}
    </>
  );

  return (
    <ToolShell onNavigate={onNavigate} previewFirst
      crumbs={[{ label: "Crear" }, { label: "Con tu cara", onClick: onHome }, { label: "Mi historia animada" }]}
      title="Mi historia animada"
      line="Tu historia real contada con tu personaje en 3D, escena por escena, con tu voz o voz IA."
      onBack={onHome}
      steps={["Personaje", "Historia", "Voz", "Producir", "Descarga"]} step={step}
      aside={aside}>
      {preview}
    </ToolShell>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="card-surface rounded-2xl p-4 space-y-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
