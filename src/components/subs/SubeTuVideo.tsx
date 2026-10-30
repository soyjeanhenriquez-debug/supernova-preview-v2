import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { blockingIssue } from "@/lib/webRender";
import { Player } from "@remotion/player";
import { CalendarClock, Captions, Check, ChevronDown, Clapperboard, Copy, Download, Image as ImageIcon, Loader2, MessageSquare, Mic, Send, Sparkles, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeErrorMessage } from "@/lib/fnAuth";
import { useBusinessProfile } from "@/lib/businessProfile";
import { CREDIT_COSTS, useCredits } from "@/hooks/useCredits";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { extractAudio, MAX_VIDEO_SECONDS, NO_IMAGE_MSG, toSrt, videoHasImage, type Subtitle } from "@/lib/burnSubtitles";
import { SUB_STYLE_BY_ID, SUB_STYLES, wordsFromSubs, type StyleId } from "@/lib/subtitleStyles";
import { deepVoice } from "@/lib/voiceFx";
import { ToolShell } from "@/components/tool/ToolShell";
import { SiguientePaso } from "@/components/agentes/SiguientePaso";
import { ToolFeedback } from "@/components/ToolFeedback";
import { FONTS, SubsVideo, type SubsProps } from "@/remotion/SubsVideo";
import { palabraDelCierre, tomarToma } from "@/lib/grabacion";
import { duracion, palabrasRecortadas, repetidas, tramos, type Tramo } from "@/lib/recorte";
import { useAuth } from "@/contexts/AuthContext";
import { EDITAR_OPCIONES, audioMono, momentosBroll, reelDinamicoConTuVideo, tomarEncargo, tramosPorAudio, visualBroll, type Encargo, type ModoEdicion } from "@/lib/edicionVideo";
import { entender, type Accion, type ModoEditar } from "@/lib/agenteEditor";
import { ReelDinamico } from "@/remotion/ReelDinamico";
import { PlantillaVideo, type PlantillaProps } from "@/remotion/PlantillaVideo";
import { PLANTILLAS, clavesDe, momentosFinales, type Momento, type PlantillaId } from "@/lib/plantillasVideo";
import { ElegirEdicion } from "@/components/subs/ElegirEdicion";

/**
 * Sube tu video (Fase A, 16-oct-2026): tu video + subtítulos con estilo, portada, título arriba,
 * cierre "COMENTA PALABRA" y voz grave. La vista previa (Remotion Player) es la misma plantilla que se
 * descarga: se arma gratis en tu navegador (renderMediaOnWeb). Solo el audio va a la IA (20 créditos).
 * Mobile first: en el teléfono la vista previa va arriba y las opciones debajo.
 */
type SubsResult = { subtitulos: Subtitle[]; gancho?: { detiene?: boolean; por_que?: string; propuestas?: string[] }; pie?: string; hashtags?: string[]; nota?: string;
  /** Plan para las plantillas (la misma escucha, sin cobro extra). */
  letrero?: string; momentos?: Momento[] };
type Meta = { w: number; h: number; dur: number };
const FPS = 30;

const copy = (t: string) => { void navigator.clipboard?.writeText(t).then(() => toast.success("Copiado")); };
const download = (blob: Blob, name: string) => {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

/** Tamaño y duración del video (si el navegador no ve la imagen, se usa vertical 1080×1920). */
function readMeta(url: string): Promise<Meta> {
  return new Promise(resolve => {
    const v = document.createElement("video");
    v.preload = "metadata"; v.muted = true; v.playsInline = true;
    const done = () => resolve({ w: v.videoWidth || 1080, h: v.videoHeight || 1920, dur: Number.isFinite(v.duration) ? v.duration : 0 });
    v.onloadedmetadata = done; v.onerror = done;
    setTimeout(done, 6000);
    v.src = url;
  });
}

/** Salida con el lado mayor en 1080 como máximo y medidas pares (lo piden los códecs). */
const outSize = (m: Meta) => {
  const k = Math.min(1, 1080 / Math.max(m.w, m.h));
  return { width: Math.round((m.w * k) / 2) * 2, height: Math.round((m.h * k) / 2) * 2 };
};

export function SubeTuVideo({ onHome, onNavigate }: { onHome: () => void; onNavigate: (page: string) => void }) {
  const { profile } = useBusinessProfile();
  const { applyServerCharge } = useCredits();
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [hasImage, setHasImage] = useState<boolean | null>(null);
  const [res, setRes] = useState<SubsResult | null>(null);
  const [busy, setBusy] = useState<"" | "audio" | "ia" | "voz" | "render" | "portada" | "silencios" | "broll">("");
  const [progress, setProgress] = useState(0);
  const [style, setStyle] = useState<StyleId>("impacto");
  const [portadaOn, setPortadaOn] = useState(false);
  const [portada, setPortada] = useState({ titulo: "", acento: "" });
  const [tituloArriba, setTituloArriba] = useState("");
  const [cierre, setCierre] = useState("");
  const [zoom, setZoom] = useState(true);
  const { isAdmin } = useIsAdmin();
  const styles = SUB_STYLES.filter(s => !s.soloAdmin || isAdmin);
  const conTitulo = !!SUB_STYLE_BY_ID[style].tituloArriba;
  const [voz, setVoz] = useState(false);
  const [vozUrl, setVozUrl] = useState<string | null>(null);
  const [webIssue, setWebIssue] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Quitar silencios y frases repetidas (27-oct-2026): corta en el navegador, sin IA ni créditos.
  const [recortar, setRecortar] = useState(false);
  const [mantener, setMantener] = useState<Set<number>>(new Set());
  const [desdeGuion, setDesdeGuion] = useState(false);
  // Para publicar (30-oct-2026): el video que subiste a una casilla llega aquí con lo que pediste y vuelve a su casilla.
  const { user } = useAuth();
  const [encargo, setEncargo] = useState<Omit<Encargo, "file"> | null>(null);
  // Silencios sin subtítulos: se buscan en el audio, en tu navegador, sin IA ni créditos.
  const [tsAudio, setTsAudio] = useState<Tramo[] | null>(null);
  const [brolls, setBrolls] = useState<{ t: number; dur: number; src: string }[]>([]);
  // Las 2 secciones (30-oct-2026, Jean): al elegir el video se pregunta qué hacer y se abre Subtítulos o Editar.
  const [seccion, setSeccion] = useState<"subtitulos" | "editar" | null>(null);
  const [modoEd, setModoEd] = useState<ModoEditar>("simple");
  const [plantillaId, setPlantillaId] = useState<PlantillaId>("dinamico");
  const [letrero, setLetrero] = useState("");
  const brollPedido = useRef(false);
  const subsEnCurso = useRef(false);
  const [guardarPend, setGuardarPend] = useState(false);
  // El agente editor: le escribes lo que quieres y la app lo hace (sin IA: entiende el pedido en tu navegador).
  const [chat, setChat] = useState<{ de: "tu" | "editor"; texto: string }[]>([]);
  const [pedido, setPedido] = useState("");

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => () => { if (vozUrl) URL.revokeObjectURL(vozUrl); }, [vozUrl]);

  const pick = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) { toast.error("Elige un video (MP4 o MOV)."); return; }
    const u = URL.createObjectURL(f);
    setFile(f); setUrl(u); setRes(null); setHasImage(null); setMeta(null); setVoz(false); setVozUrl(null); setDone(false); setWebIssue(null); setMantener(new Set());
    setTsAudio(null); setBrolls([]); setSeccion(null); brollPedido.current = false;
    void readMeta(u).then(setMeta);
    void videoHasImage(f).then(setHasImage);
  };
  // La toma que grabaste con tu guion en Reel Studio llega aquí sola, con la palabra del cierre.
  useEffect(() => {
    const t = tomarToma();
    if (!t) return;
    pick(t.file);
    const w = palabraDelCierre(t.guion);
    if (w) setCierre(w);
    setRecortar(true); setDesdeGuion(true); setSeccion("subtitulos");
    toast.success("Tu toma está lista", { description: "Ahora toca «Hacer mis subtítulos»." });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const e = tomarEncargo();
    if (!e) return;
    const { file: f, ...resto } = e;
    pick(f);
    setEncargo(resto);
    elegir(e.modo, f);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Lo que la persona eligió para su video: se abre su sección y arranca solo lo que pidió (con su precio a la vista). */
  const elegir = (m: Exclude<ModoEdicion, "programar">, f: File | null = file) => {
    setRecortar(true);
    if (m === "subtitulos") { setSeccion("subtitulos"); void makeSubs(f); return; }
    setSeccion("editar"); setModoEd(m); setZoom(true);
    if (m === "simple") void buscarSilencios(f);
    else void makeSubs(f);
  };

  const buscarSilencios = async (f: File | null = file) => {
    if (!f) return;
    setBusy("silencios");
    try {
      const ts = tramosPorAudio(await audioMono(f), 16_000);
      if (!ts.length) { toast("No encontramos pausas que cortar", { description: "Tu video ya va sin silencios largos." }); setTsAudio([]); return; }
      setTsAudio(ts);
      setRecortar(true);
    } catch (e) { toast.error(e instanceof Error && e.message ? e.message : "No se pudo leer el audio."); }
    finally { setBusy(""); }
  };

  const makeSubs = async (f: File | null = file) => {
    // Un solo pedido a la vez (el agente puede pedir subtítulos y B-roll en la misma frase: se cobra una vez).
    if (!f || subsEnCurso.current) return;
    subsEnCurso.current = true;
    try {
      setBusy("audio");
      const { audio, seconds } = await extractAudio(f);
      setBusy("ia");
      const { data, error } = await supabase.functions.invoke("video-subtitles", {
        body: { audio, seconds, plan: true, brief: { product: profile.product ?? "", who: profile.who ?? "" } },
      });
      if (error || !Array.isArray(data?.subtitulos)) throw new Error(error ? await invokeErrorMessage(error, "No se pudieron hacer los subtítulos. No se te cobró.") : (data?.error || "No se pudieron hacer los subtítulos. No se te cobró."));
      if (data.billing) applyServerCharge("video_subtitles", data.billing, "Subtítulos y gancho");
      setRes(data as SubsResult);
      if (typeof data.letrero === "string") setLetrero(l => l || data.letrero);
      const first = (data.subtitulos as Subtitle[])[0]?.texto ?? "";
      setPortada(p => p.titulo ? p : { titulo: first.split(/\s+/).slice(0, 3).join(" ").replace(/[.,;:]+$/, ""), acento: "" });
      if (!data.subtitulos.length) toast("No escuchamos voz en ese video", { description: data.nota || "Prueba con un video donde hables." });
      else toast.success("Listo: tus subtítulos", { description: "Elige el estilo y mira cómo queda." });
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo procesar el video.");
    } finally { setBusy(""); subsEnCurso.current = false; }
  };

  const toggleVoz = async () => {
    if (voz) { setVoz(false); return; }
    if (!file) return;
    if (vozUrl) { setVoz(true); return; }
    setBusy("voz");
    try {
      const wav = await deepVoice(file);
      setVozUrl(URL.createObjectURL(wav));
      setVoz(true);
      toast.success("Voz grave lista", { description: "Escúchala en la vista previa." });
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo procesar la voz.");
    } finally { setBusy(""); }
  };

  const editSub = (i: number, texto: string) => setRes(r => r ? { ...r, subtitulos: r.subtitulos.map((s, k) => k === i ? { ...s, texto } : s) } : r);
  const words = useMemo(() => wordsFromSubs(res?.subtitulos ?? []), [res?.subtitulos]);
  const rep = useMemo(() => repetidas(res?.subtitulos ?? []), [res?.subtitulos]);
  const ts = useMemo(() => (!recortar ? [] : res?.subtitulos.length ? tramos(res.subtitulos, meta?.dur ?? 0, new Set(rep.filter(i => !mantener.has(i)))) : tsAudio ?? []),
    [recortar, res?.subtitulos, meta?.dur, rep, mantener, tsAudio]);
  const quitados = ts.length && meta?.dur ? Math.max(0, meta.dur - duracion(ts)) : 0;
  const nRep = rep.filter(i => !mantener.has(i)).length;
  const size = meta ? outSize(meta) : { width: 1080, height: 1920 };
  const durationInFrames = Math.max(FPS, Math.round((ts.length ? duracion(ts) : meta?.dur ?? 1) * FPS));
  const wordsFinal = useMemo(() => (ts.length ? palabrasRecortadas(words, ts) : words), [words, ts]);
  const props: SubsProps = {
    src: url ?? "", audioSrc: voz ? vozUrl : null, words: wordsFinal, style, tramos: ts.length ? ts : undefined,
    portada: portadaOn ? portada : null, tituloArriba: conTitulo ? tituloArriba : "", cierre,
    zoom: (style === "conversacion" || seccion === "editar") && zoom, brolls,
  };
  const composition = { id: "subs", component: SubsVideo, durationInFrames, fps: FPS, ...size, defaultProps: props };
  // Plantilla Reel dinámico con TU video: cortes cada ~2 s, transiciones con sonido, subtítulos cortos y el B-roll.
  const conPlantilla = seccion === "editar" && modoEd === "plantilla" && !!res?.subtitulos.length && !!url && !!meta;
  const rd = useMemo(() => (conPlantilla && plantillaId === "dinamico" && url && meta
    ? reelDinamicoConTuVideo({ src: url, dur: meta.dur, ts, words: wordsFinal, brolls, palabra: cierre }) : null),
    [conPlantilla, plantillaId, url, meta, ts, wordsFinal, brolls, cierre]);
  // Las otras 6 plantillas: tu toma sin silencios + el diseño de cada una con los momentos clave de lo que dices.
  const pv = useMemo((): PlantillaProps | null => (conPlantilla && plantillaId !== "dinamico" && url && res
    ? { plantilla: plantillaId, src: url, tramos: ts, words: wordsFinal, claves: clavesDe(res.subtitulos), letrero, cierre,
      momentos: momentosFinales(res.momentos ?? [], plantillaId, ts, durationInFrames / FPS, !!cierre) }
    : null), [conPlantilla, plantillaId, url, res, ts, wordsFinal, letrero, cierre, durationInFrames]);
  const final = pv
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? { id: "plantilla", component: PlantillaVideo as React.FC<any>, inputProps: pv as unknown as Record<string, unknown>, frames: durationInFrames }
    : rd
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? { id: "reel-dinamico", component: ReelDinamico as React.FC<any>, inputProps: rd.props as Record<string, unknown>, frames: Math.max(FPS, Math.round(rd.segundos * FPS)) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : { id: "subs", component: SubsVideo as React.FC<any>, inputProps: props as unknown as Record<string, unknown>, frames: durationInFrames };
  // El armador de video (web-renderer) pesa: se baja recién al tocar "Descargar".
  const renderer = () => import("@remotion/web-renderer");

  const render = async () => {
    if (!url || busy) return;
    setBusy("render"); setProgress(0); setWebIssue(null);
    try {
      const { canRenderMediaOnWeb, renderMediaOnWeb } = await renderer();
      const check = await canRenderMediaOnWeb({ ...size, container: "mp4", videoCodec: "h264" });
      { const why = blockingIssue(check); if (why) throw new Error(why); }
      const out = await renderMediaOnWeb({
        composition: { id: final.id, component: final.component, durationInFrames: final.frames, fps: FPS, ...size, defaultProps: final.inputProps },
        inputProps: final.inputProps, container: "mp4", videoCodec: "h264",
        onProgress: p => setProgress(Math.round(p.progress * 100)),
      });
      const blob = await out.getBlob();
      if (encargo) {
        try { await guardarEnCasilla(blob); } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo guardar en tu casilla."); }
        return;
      }
      download(blob, "mi-video-con-subtitulos.mp4");
      setDone(true);
      toast.success("Tu video está descargado", { description: "Es un MP4 que se abre en cualquier celular o computadora." });
    } catch (e) {
      console.error("render", e);
      setWebIssue("Tu navegador no pudo armar este video. Pronto podrás hacerlo en la nube; mientras, ábrelo en Safari o en Chrome actualizado, o baja el .srt y úsalo en CapCut.");
    } finally { setBusy(""); }
  };

  /** El video editado vuelve a su casilla de Para publicar: queda primero (es el que se programa) y el crudo se guarda detrás. */
  const guardarEnCasilla = async (blob: Blob) => {
    if (!encargo || !user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { data: it } = await db.from("content_items").select("media_paths, caption").eq("id", encargo.itemId).maybeSingle();
    if (!it) throw new Error("No encontramos la casilla de este video.");
    const path = `${user.id}/${crypto.randomUUID()}/editado.mp4`;
    const up = await supabase.storage.from("publicaciones").upload(path, blob, { contentType: "video/mp4", upsert: false });
    if (up.error) throw new Error("No se pudo guardar el video editado.");
    const pie = res?.pie ? `${res.pie}\n\n${(res.hashtags ?? []).map(h => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`.trim() : "";
    const { error } = await db.from("content_items").update({
      media_paths: [path, ...((it.media_paths ?? []) as string[])].slice(0, 3), pub_estado: "listo", pub_error: null,
      caption: (it.caption ?? "").trim() ? it.caption : pie || null, updated_at: new Date().toISOString(),
    }).eq("id", encargo.itemId);
    if (error) throw new Error("No se pudo poner el video en su casilla.");
    setDone(true);
    toast.success("Listo en su casilla", { description: "Revisa el copy y toca Programar." });
    window.location.hash = "#/contenido";
  };

  /** B-roll con IA: una imagen por momento (cobra el servidor, 6 créditos cada una) que tapa el video 1,8 s. */
  const ponerBroll = async () => {
    if (!res?.subtitulos.length || busy) return;
    const durFinal = ts.length ? duracion(ts) : meta?.dur ?? 0;
    const momentos = momentosBroll(res.subtitulos, durFinal, ts);
    if (!momentos.length) { toast("Tu video es muy corto para B-roll", { description: "Hace falta que dure más de 10 segundos." }); return; }
    const tema = res.subtitulos.slice(0, 3).map(x => x.texto).join(" ");
    setBusy("broll"); setProgress(0);
    const hechos: { t: number; dur: number; src: string }[] = [];
    try {
      for (const [k, m] of momentos.entries()) {
        const { data, error } = await supabase.functions.invoke("yt-produce", {
          body: { action: "scene_image", visual: visualBroll(m, tema), style: "Cinematográfico", aspect: "9:16", scene: `broll-${k + 1}` },
        });
        if (error || typeof data?.image !== "string") {
          if (!hechos.length) throw new Error(error ? await invokeErrorMessage(error, "No se pudo hacer el B-roll. No se te cobró.") : "No se pudo hacer el B-roll. No se te cobró.");
          break;
        }
        if (data.billing) applyServerCharge("yt_scene_image", data.billing, "B-roll de tu video");
        hechos.push({ t: m.t, dur: m.dur, src: data.image });
        setBrolls([...hechos]);
        setProgress(Math.round(((k + 1) / momentos.length) * 100));
      }
      toast.success(`${hechos.length} B-roll en tu video`, { description: "Míralo en la vista previa." });
    } catch (e) { toast.error(e instanceof Error && e.message ? e.message : "No se pudo hacer el B-roll."); }
    finally { setBusy(""); }
  };

  const savePortada = async () => {
    if (!url || busy || !portada.titulo.trim()) return;
    setBusy("portada");
    try {
      const { renderStillOnWeb } = await renderer();
      const withPortada = { ...props, portada };
      const still = await renderStillOnWeb({ composition: { ...composition, defaultProps: withPortada }, frame: 8, inputProps: withPortada });
      download(await still.blob({ format: "jpeg", quality: 0.92 }), "portada.jpg");
    } catch {
      toast.error("No se pudo guardar la portada en este navegador.");
    } finally { setBusy(""); }
  };

  const ready = !!res?.subtitulos.length || (seccion === "editar" && modoEd === "simple" && tsAudio !== null);
  const step = !file ? 0 : !ready ? 1 : done ? 3 : 2;

  // Con B-roll o plantilla, el B-roll sale solo en cuanto están los subtítulos (la persona lo eligió con su precio).
  useEffect(() => {
    if (seccion === "editar" && (modoEd === "broll" || (modoEd === "plantilla" && plantillaId === "dinamico")) && res?.subtitulos.length && meta && !brolls.length && !brollPedido.current && !busy) {
      brollPedido.current = true;
      void ponerBroll();
    }
  }, [seccion, modoEd, plantillaId, res, meta, brolls.length, busy]); // eslint-disable-line react-hooks/exhaustive-deps
  // «Guárdalo» del agente: espera a que termine lo que esté haciendo.
  useEffect(() => {
    if (guardarPend && !busy && ready) { setGuardarPend(false); void render(); }
  }, [guardarPend, busy, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiarModo = (m: ModoEditar) => {
    setModoEd(m); setSeccion("editar");
    if (m === "simple") { if (!res && tsAudio === null) void buscarSilencios(); }
    else if (!res) void makeSubs();
  };

  /** Aplica lo que el agente entendió. Lo que gasta (subtítulos, B-roll) se pide una sola vez al final. */
  const aplicar = (acciones: Accion[]) => {
    let subs = false, sil = false;
    for (const a of acciones) {
      switch (a.tipo) {
        case "seccion": setSeccion(a.v); break;
        case "modo": setModoEd(a.v); setSeccion("editar"); if (a.v === "simple") sil = true; else subs = true; break;
        case "plantilla": setPlantillaId(a.v); break;
        case "silencios": setRecortar(a.on); if (a.on) sil = true; break;
        case "subtitulos": subs = true; break;
        case "estilo": setStyle(a.v); break;
        case "broll": setBrolls([]); brollPedido.current = false; setModoEd(m => (m === "simple" ? "broll" : m)); subs = true; break;
        case "portada": setPortadaOn(true); if (a.titulo) setPortada({ titulo: a.titulo, acento: a.acento }); break;
        case "portadaOff": setPortadaOn(false); break;
        case "cierre": setCierre(a.palabra); break;
        case "titulo": setTituloArriba(a.texto); if (!SUB_STYLE_BY_ID[style].tituloArriba) setStyle("impacto"); break;
        case "voz": if (a.on && !voz) void toggleVoz(); else if (!a.on) setVoz(false); break;
        case "zoom": setZoom(a.on); break;
        case "guardar": setGuardarPend(true); break;
      }
    }
    if (subs && !res) void makeSubs();
    else if (sil && !res && tsAudio === null) void buscarSilencios();
  };

  const hablar = () => {
    const txt = pedido.trim();
    if (!txt) return;
    setPedido("");
    const { acciones, respuesta } = entender(txt);
    let resp = respuesta;
    if (acciones.length && !file) resp = "Primero elige tu video y después dime qué hacerle.";
    else aplicar(acciones);
    setChat(c => [...c.slice(-6), { de: "tu", texto: txt }, { de: "editor", texto: resp }]);
  };

  const preview = (
    <div className="card-surface rounded-2xl p-3 sm:p-4">
      {url ? (
        <div className="mx-auto overflow-hidden rounded-xl bg-black [--pv-h:46dvh] lg:[--pv-h:68dvh]"
          style={{ aspectRatio: `${size.width} / ${size.height}`, width: `min(100%, 360px, calc(var(--pv-h) * ${size.width / size.height}))` }}>
          <Player component={final.component} inputProps={final.inputProps} durationInFrames={final.frames} fps={FPS}
            compositionWidth={size.width} compositionHeight={size.height} controls loop clickToPlay
            style={{ width: "100%", height: "100%" }} />
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()}
          className="mx-auto flex aspect-[9/16] w-[min(100%,300px,calc(46dvh*0.5625))] lg:w-[min(100%,300px)] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-secondary/30 p-6 text-center hover:border-primary/50">
          <Upload className="w-6 h-6 text-primary" />
          <span className="font-display text-base font-semibold text-foreground">Elige tu video</span>
          <span className="text-[12px] text-muted-foreground">El que grabaste con tu celular, de hasta {MAX_VIDEO_SECONDS} segundos.</span>
        </button>
      )}
      <p className="mt-2 text-center text-[11px] text-muted-foreground">{url ? (ready ? "Vista previa: así queda tu video." : !seccion ? "Elige qué hacemos con tu video." : "Aquí lo verás editado en cuanto esté.") : "Aquí verás tu video con el estilo que elijas."}</p>
    </div>
  );

  const subtitulosCard = !res ? (
    <>
      <button type="button" onClick={() => void makeSubs()} disabled={!file || !!busy}
        className="btn-primary-nova inline-flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:opacity-50">
        {busy === "audio" ? <><Loader2 className="w-4 h-4 animate-spin" /> Leyendo el audio…</> : busy === "ia" ? <><Loader2 className="w-4 h-4 animate-spin" /> Escuchando tu video…</> : <><Captions className="w-4 h-4" /> Hacer mis subtítulos · {CREDIT_COSTS.video_subtitles} créditos</>}
      </button>
      <p className="text-[11px] text-muted-foreground">Solo mandamos el audio a la IA. Si falla, no se cobra.</p>
    </>
  ) : (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm text-foreground">
        <span className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-primary" /> {res.subtitulos.length} subtítulos · revisar textos</span>
        <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <ol className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
        {res.subtitulos.map((s, i) => (
          <li key={i} className="grid grid-cols-[52px_1fr] items-center gap-2">
            <span className="text-[11px] tabular-nums text-muted-foreground">{s.desde.toFixed(1)} s</span>
            <input value={s.texto} onChange={e => editSub(i, e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-base sm:text-sm text-foreground focus:border-primary/60 focus:outline-none" />
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => download(new Blob([toSrt(res.subtitulos)], { type: "text/plain" }), "subtitulos.srt")} className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"><Download className="w-3.5 h-3.5" /> Bajar .srt (CapCut)</button>
    </details>
  );

  // Quitar silencios: con subtítulos usa sus tiempos (y quita frases repetidas); sin ellos, el volumen del audio. Gratis.
  const silenciosToggle = (
    <>
      <Toggle on={recortar} busy={busy === "silencios"} disabled={!res && tsAudio === null && busy !== ""}
        onClick={() => { if (!recortar && !res && tsAudio === null) void buscarSilencios(); setRecortar(v => !v); }}
        title="Quitar silencios y repeticiones"
        line={busy === "silencios" ? "Buscando las pausas…" : recortar && (res || tsAudio) ? `Se quitan ${quitados.toFixed(1).replace(".", ",")} s: pausas largas${nRep ? ` y ${nRep} frase${nRep > 1 ? "s" : ""} que repetiste` : ""}. Gratis.` : "Corta las pausas largas y, si repetiste una frase, deja solo la última. Gratis."} />
      {recortar && rep.length > 0 && (
        <ul className="space-y-1.5">
          {rep.map(i => (
            <li key={i}>
              <label className="flex items-start gap-2 rounded-lg border border-border p-2 text-[12px]">
                <input type="checkbox" className="mt-0.5" checked={!mantener.has(i)} onChange={() => setMantener(m => { const n = new Set(m); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                <span><span className="text-muted-foreground">Quitar el intento repetido: </span><span className="text-foreground">«{res?.subtitulos[i]?.texto}»</span></span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  const aside = (
    <>
      <input ref={inputRef} type="file" accept="video/*" className="sr-only" onChange={e => pick(e.target.files?.[0] ?? null)} />

      {/* 1 · Video */}
      <Card label="1 · Tu video">
        {file ? (
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm text-foreground">{file.name}</p>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={!!busy} className="shrink-0 text-[12px] text-primary hover:underline">Cambiar</button>
          </div>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()} className="btn-primary-nova inline-flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl text-sm font-semibold"><Upload className="w-4 h-4" /> Elegir mi video</button>
        )}
        {hasImage === false && <p role="alert" className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-[12px] text-foreground">{NO_IMAGE_MSG}</p>}
      </Card>

      {file && !seccion && <ElegirEdicion onElegir={m => { if (m !== "programar") elegir(m); }} />}

      {file && seccion && (
        <div role="tablist" aria-label="Sección" className="grid grid-cols-2 rounded-full border border-border p-0.5">
          {(["subtitulos", "editar"] as const).map(x => (
            <button key={x} type="button" role="tab" aria-selected={seccion === x} onClick={() => setSeccion(x)}
              className={`h-10 rounded-full text-sm transition-colors ${seccion === x ? "bg-foreground text-background font-semibold" : "text-muted-foreground hover:text-foreground"}`}>
              {x === "subtitulos" ? "Subtítulos" : "Editar"}
            </button>
          ))}
        </div>
      )}

      {seccion === "subtitulos" && (
        <>
          <Card label="Subtítulos">{subtitulosCard}</Card>
          <section aria-labelledby="estilos-titulo" className="space-y-3">
            <div>
              <h2 id="estilos-titulo" className="font-display text-lg font-semibold text-foreground">Estilos de subtítulos</h2>
              <p className="text-[12px] text-muted-foreground">Toca uno y míralo en tu video.</p>
            </div>
            <div role="radiogroup" aria-label="Estilo de subtítulos" className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:grid lg:grid-cols-2 lg:overflow-visible lg:px-0">
              {styles.map(s => (
                <button key={s.id} type="button" role="radio" aria-checked={style === s.id} onClick={() => setStyle(s.id)}
                  className={`group w-[42vw] max-w-[180px] shrink-0 snap-start overflow-hidden rounded-xl border text-left transition-colors lg:w-auto lg:max-w-none ${style === s.id ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/30"}`}>
                  <StyleThumb id={s.id} />
                  <span className="block px-2.5 pb-2.5 pt-2">
                    <span className="block text-[13px] font-semibold text-foreground">{s.nombre}</span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">{s.linea}</span>
                  </span>
                </button>
              ))}
            </div>
            <Card label="Detalles">
              {silenciosToggle}
              <Toggle on={portadaOn} onClick={() => setPortadaOn(v => !v)} title="Portada" line="Título grande y una palabra a mano en el primer segundo." />
              {portadaOn && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Título" value={portada.titulo} max={28} onChange={v => setPortada(p => ({ ...p, titulo: v }))} placeholder="GRACIAS" />
                  <Field label="Palabra a mano" value={portada.acento} max={18} onChange={v => setPortada(p => ({ ...p, acento: v }))} placeholder="Dios" />
                </div>
              )}
              {conTitulo && (
                <Field label="Título arriba (opcional; las palabras entre *asteriscos* van en azul)" value={tituloArriba} max={70} onChange={setTituloArriba} placeholder="3 errores que *frenan tus ventas*" />
              )}
              {style === "conversacion" && (
                <Toggle on={zoom} onClick={() => setZoom(v => !v)} title="Acercamientos" line="Entre frases la cámara se acerca y se aleja, como cortes de edición." />
              )}
              <Field label="Cierre: palabra que comentan (opcional)" value={cierre} max={20} onChange={v => setCierre(v.replace(/\s+/g, "").toUpperCase())} placeholder="GEMELO" />
              <Toggle on={voz} onClick={toggleVoz} busy={busy === "voz"} icon={<Mic className="w-4 h-4" />} title="Voz grave" line="Tu voz más grave y con cuerpo, como de locutor." disabled={!file} />
            </Card>
          </section>
        </>
      )}

      {seccion === "editar" && (
        <Card label="Cómo lo edito">
          <div role="radiogroup" aria-label="Tipo de edición" className="grid gap-1.5">
            {EDITAR_OPCIONES.map(o => (
              <button key={o.id} type="button" role="radio" aria-checked={modoEd === o.id} disabled={!!busy && modoEd !== o.id} onClick={() => cambiarModo(o.id)}
                className={`rounded-xl border p-2.5 text-left disabled:opacity-50 ${modoEd === o.id ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/30"}`}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-foreground">{o.titulo}</span>
                  <span className={`shrink-0 text-[10px] ${o.precio === "Gratis" ? "text-emerald-400" : "text-muted-foreground"}`}>{o.precio}</span>
                </span>
                <span className="block text-[11px] text-muted-foreground">{o.linea}</span>
              </button>
            ))}
          </div>
          {modoEd === "plantilla" && (
            <div role="radiogroup" aria-label="Plantilla" className="grid grid-cols-2 gap-1.5">
              {PLANTILLAS.map(x => (
                <button key={x.id} type="button" role="radio" aria-checked={plantillaId === x.id} onClick={() => { setPlantillaId(x.id); if (!res) void makeSubs(); }}
                  className={`rounded-lg border p-2 text-left ${plantillaId === x.id ? "border-primary ring-1 ring-primary" : "border-border hover:border-foreground/30"}`}>
                  <span className="block text-[12px] font-semibold text-foreground">{x.nombre}</span>
                  <span className="block text-[10px] leading-snug text-muted-foreground">{x.linea}</span>
                  <span className="mt-1 block text-[10px] text-muted-foreground/70">{x.origen}</span>
                </button>
              ))}
            </div>
          )}
          {modoEd === "plantilla" && plantillaId !== "dinamico" && (
            <>
              <Field label="Letrero (arriba o en la portada de la plantilla)" value={letrero} max={50} onChange={setLetrero} placeholder="Faltan 2 meses" />
              {res && !res.momentos?.length && <p className="text-[11px] text-muted-foreground">No encontramos cifras, pasos ni casos en lo que dices: la plantilla va con tus subtítulos y su estilo.</p>}
            </>
          )}
          {silenciosToggle}
          {modoEd !== "plantilla" && (
            <Toggle on={zoom} onClick={() => setZoom(v => !v)} title="Acercamientos" line="La cámara se acerca y se aleja entre frases, como cortes de edición." />
          )}
          {!res ? (
            <div className="space-y-2">
              {subtitulosCard}
              {modoEd === "simple" && <p className="text-[11px] text-muted-foreground">En la edición simple los subtítulos son opcionales.</p>}
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              <Check className="mr-1 inline w-3.5 h-3.5 text-primary" />{res.subtitulos.length} subtítulos{modoEd === "plantilla" ? " cortos, al ritmo de la plantilla." : <> estilo {SUB_STYLE_BY_ID[style].nombre}. <button type="button" onClick={() => setSeccion("subtitulos")} className="text-primary hover:underline">Cambiar estilo o textos</button></>}
            </p>
          )}
          {res?.subtitulos.length ? (
            <button type="button" onClick={() => void ponerBroll()} disabled={!!busy}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left hover:bg-secondary/40 disabled:opacity-50 ${modoEd !== "simple" && !brolls.length ? "border-primary/60" : "border-border"}`}>
              <span className="text-muted-foreground">{busy === "broll" ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Clapperboard className="w-4 h-4" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{brolls.length ? `B-roll listo (${brolls.length}) · hacerlo de nuevo` : "Poner B-roll con IA"}</span>
                <span className="block text-[11px] text-muted-foreground">{busy === "broll" ? `Creando las imágenes… ${progress} %` : `Imágenes que ilustran lo que dices, una cada ~7 s. ${CREDIT_COSTS.yt_scene_image} créditos cada una.`}</span>
              </span>
            </button>
          ) : null}
          <Field label={modoEd === "plantilla" ? "Cierre con golpe: palabra que comentan (opcional)" : "Cierre: palabra que comentan (opcional)"} value={cierre} max={20} onChange={v => setCierre(v.replace(/\s+/g, "").toUpperCase())} placeholder="GEMELO" />
        </Card>
      )}

      {file && seccion && (
        <Card label="Habla con tu editor">
          {chat.length > 0 && (
            <ul className="max-h-48 space-y-1.5 overflow-y-auto" aria-live="polite">
              {chat.map((m, k) => (
                <li key={k} className={`rounded-lg px-2.5 py-1.5 text-[12px] ${m.de === "tu" ? "ml-6 bg-secondary/60 text-foreground" : "mr-6 border border-border text-foreground"}`}>{m.texto}</li>
              ))}
            </ul>
          )}
          <form onSubmit={e => { e.preventDefault(); hablar(); }} className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 shrink-0 text-muted-foreground" />
            <input value={pedido} onChange={e => setPedido(e.target.value.slice(0, 300))} placeholder="Ej.: quita los silencios, subtítulos Impacto y B-roll"
              aria-label="Pídele algo a tu editor" className="min-h-[44px] w-full rounded-lg border border-border bg-background px-3 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none" />
            <button type="submit" aria-label="Enviar" disabled={!pedido.trim()} className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground inline-flex items-center justify-center disabled:opacity-50"><Send className="w-4 h-4" /></button>
          </form>
          <p className="text-[11px] text-muted-foreground">Dile qué quieres con tus palabras: silencios, subtítulos y su estilo, B-roll, plantilla, portada, cierre, voz grave o «guárdalo».</p>
        </Card>
      )}

      {/* Descargar o guardar en la casilla */}
      {seccion && <Card label={encargo ? "A tu casilla" : "Descarga"}>
        <button type="button" onClick={render} disabled={!ready || !!busy}
          className="btn-primary-nova inline-flex w-full min-h-[52px] items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:opacity-50">
          {busy === "render" ? <><Loader2 className="w-4 h-4 animate-spin" /> Armando tu video… {progress} %</> : encargo ? <><CalendarClock className="w-4 h-4" /> Guardar en mi casilla · gratis</> : <><Sparkles className="w-4 h-4" /> Descargar mi video · gratis</>}
        </button>
        {busy === "render" && <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>}
        {portadaOn && (
          <button type="button" onClick={savePortada} disabled={!ready || !!busy || !portada.titulo.trim()}
            className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border text-sm text-foreground hover:bg-secondary/60 disabled:opacity-50">
            {busy === "portada" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />} Bajar la portada (imagen)
          </button>
        )}
        {webIssue && <p role="alert" className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-[12px] text-foreground">{webIssue}</p>}
        <p className="text-[11px] text-muted-foreground">Se arma en tu navegador: tarda más o menos lo que dura tu video. No cierres la pestaña.</p>
      </Card>}

      {res && (res.pie || res.hashtags?.length) ? (
        <details className="card-surface group rounded-2xl p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-foreground">Texto para publicarlo <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" /></summary>
          <p className="mt-2 whitespace-pre-line text-sm text-foreground">{res.pie}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{(res.hashtags ?? []).map(h => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>
          <button type="button" onClick={() => copy(`${res.pie ?? ""}\n\n${(res.hashtags ?? []).map(h => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`)} className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"><Copy className="w-3.5 h-3.5" /> Copiar texto</button>
        </details>
      ) : null}
      {res?.gancho && (
        <details className="card-surface group rounded-2xl p-4">
          <summary className="cursor-pointer list-none text-sm text-foreground"><span className="font-semibold">¿Vas a regrabar el inicio?</span> <span className="text-muted-foreground">{res.gancho.detiene ? "Tu inicio ya engancha; aquí tienes 3 ganchos más." : "Tu inicio se puede mejorar: mira 3 ganchos."}</span></summary>
          <ul className="mt-3 space-y-2">
            {(res.gancho.propuestas ?? []).filter(Boolean).map(g => (
              <li key={g} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm text-foreground">
                <span>«{g}»</span>
                <button type="button" onClick={() => copy(g)} aria-label="Copiar gancho" className="shrink-0 text-muted-foreground hover:text-foreground"><Copy className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {/* Misión de Pegaso (29-oct-2026): con el video descargado, una sola pregunta de avance hacia Argos. */}
      {done && !busy && <SiguientePaso agente="editor" />}
      {ready && <ToolFeedback tool="subtitulos" />}
    </>
  );

  return (
    <ToolShell toolId="sube-tu-video" agente="editor" onNavigate={onNavigate} previewFirst
      crumbs={[{ label: "Crear" }, { label: "Con tu cara", onClick: onHome }, { label: "Sube tu video" }]}
      title={encargo ? "Edita tu video para tu casilla" : desdeGuion ? "Tu toma con subtítulos" : "Sube tu video y ponle estilo"}
      line="Subtítulos con estilo, portada, cierre y voz grave. Lo ves en tu video antes de descargarlo."
      onBack={onHome}
      steps={["Elige tu video", "Subtítulos", "Estilo", "Descarga"]} step={step}
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

function Field({ label, value, onChange, placeholder, max }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; max: number }) {
  return (
    <label className="block text-[12px] text-muted-foreground">{label}
      <input value={value} onChange={e => onChange(e.target.value.slice(0, max))} placeholder={placeholder}
        className="mt-1 w-full min-h-[44px] rounded-lg border border-border bg-background px-3 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none" />
    </label>
  );
}

function Toggle({ on, onClick, title, line, icon, busy, disabled }: { on: boolean; onClick: () => void; title: string; line: string; icon?: React.ReactNode; busy?: boolean; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} disabled={disabled || busy}
      className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-secondary/40 disabled:opacity-50">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-[11px] text-muted-foreground">{line}</span>
      </span>
      {busy ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : (
        <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-secondary"}`} aria-hidden>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
        </span>
      )}
    </button>
  );
}

/** Miniatura de cada estilo (con sus letras reales) sobre un fondo de video oscuro. */
function StyleThumb({ id }: { id: StyleId }) {
  const base = "relative flex aspect-[4/5] items-center justify-center bg-[linear-gradient(160deg,#2a2a2e_0%,#121214_60%,#000_100%)]";
  if (id === "impacto") return (
    <span className={base}>
      <span className="absolute top-3 bg-black px-1.5 text-[10px] text-white" style={{ fontFamily: FONTS.anton }}>3 ERRORES QUE <span className="text-sky-400">FRENAN</span></span>
      <span className="absolute bottom-6 text-[22px] text-white" style={{ fontFamily: FONTS.anton, WebkitTextStroke: "1px #000", paintOrder: "stroke" }}>TUS VENTAS</span>
    </span>
  );
  if (id === "conversacion") return (
    <span className={base}>
      <span className="absolute top-3 text-[10px] font-extrabold text-white" style={{ fontFamily: FONTS.manrope, textShadow: "0 1px 4px rgba(0,0,0,.6)" }}>1- Tu título</span>
      <span className="absolute top-[56%] text-[11px] font-bold text-white" style={{ fontFamily: FONTS.manrope, textShadow: "0 1px 3px rgba(0,0,0,.55)" }}>primera, la persona</span>
    </span>
  );
  if (id === "minimal") return <span className={base}><span className="absolute top-[58%] text-[12px] font-semibold text-white" style={{ fontFamily: FONTS.manrope }}>gracias a</span></span>;
  if (id === "brillo") return <span className={base}><span className="text-[30px] italic text-white" style={{ fontFamily: FONTS.serif, textShadow: "0 0 12px rgba(255,255,255,.55)" }}>increíble</span></span>;
  if (id === "resaltado") return <span className={base}><span className="absolute bottom-7 text-[17px] font-extrabold text-white" style={{ fontFamily: FONTS.manrope, WebkitTextStroke: "1px #000", paintOrder: "stroke" }}>lo que <span className="text-primary">dices</span> hoy</span></span>;
  if (id === "clasico") return <span className={base}><span className="absolute bottom-7 text-[16px] font-extrabold text-white" style={{ fontFamily: FONTS.manrope, WebkitTextStroke: "2px #000", paintOrder: "stroke" }}>se lee en todo</span></span>;
  return <span className={base}><span className="absolute bottom-7 rounded-md bg-black/75 px-2 py-1 text-[14px] font-extrabold text-white" style={{ fontFamily: FONTS.manrope }}>limpio y serio</span></span>;
}
