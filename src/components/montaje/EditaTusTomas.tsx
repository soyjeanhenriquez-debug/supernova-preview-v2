import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Download, Eraser, Film, Loader2, Mic, Pause, Play, Plus, Sparkles, Trash2, Upload, Volume2, Wand2, X } from "lucide-react";
import { Player } from "@remotion/player";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CREDIT_COSTS, useCredits } from "@/hooks/useCredits";
import { fnErrorMessage, fnHeaders, readBilling } from "@/lib/fnAuth";
import { blockingIssue } from "@/lib/webRender";
import { track } from "@/lib/analytics";
import { toolEvent } from "@/lib/toolEvents";
import { exportClean, computeResidue, PRESETS } from "@/lib/watermark";
import { ajustarAVoz, aLocal, duracionMontaje, segundosDe, DUR_NUEVA, MAX_GUION, MAX_TOMAS, montajeSimple, prepararToma, sinPendientes, type ModoVoz, type PlanMontaje, type Segmento, type TomaPreparada } from "@/lib/montaje";
import { wordsFromAlignment } from "@/lib/reelIa";
import type { Word } from "@/lib/subtitleStyles";
import { createVideo, waitForVideo } from "@/components/video/videoApi";
import { MontajeVideo, MONTAJE_FPS, MONTAJE_SIZE, totalFrames, type MontajeProps } from "@/remotion/MontajeVideo";
import { ToolShell } from "@/components/tool/ToolShell";
import { takeMontaje } from "@/lib/intentHandoff";

/**
 * «Edita tus tomas como tu referencia» (06-nov-2026, pedido de Jean con el caso de Cindy): la persona ya hizo sus
 * tomas (en la app o en otro lado) y tiene un video de referencia y/o sabe cómo lo quiere. Elige sus tomas, la IA
 * mira la referencia y propone el montaje, se quitan las marcas de agua que haya y se arma con Remotion en su equipo.
 * Cobro (Jean, 06-nov-2026: «cobrar al descargar»): proponer y ver la vista previa es gratis; armar y descargar
 * cuesta montaje_tomas (50), con o sin IA. Lo cobra reel-ia («montaje_descarga») ANTES de entregar el archivo; si
 * cambia algo y vuelve a armar en esta misma sesión, no se cobra otra vez.
 * Nativo (06-nov-2026, Jean: «con lo que ella quiere decir, todo en la misma voz, y usar también las tomas del video
 * de referencia»): la persona elige qué se escucha (el sonido de sus tomas, su texto con una voz nueva o un texto que
 * escribe la IA) y los planos de la referencia que no tiene se RECREAN con IA (nunca se usa el video de otra persona).
 * Precios de Jean: armar 50 + voz aparte (reel_voz_600 / reel_voz_1200) + vid_mini_5 por cada plano nuevo, y el
 * total se ve antes de gastar. Cada cobro lo hace el servidor (reel-ia «voice», video-studio «create»).
 */
type Toma = { key: string; nombre: string; origen: string; src?: string; prep?: TomaPreparada; quitar: boolean; error?: string };
type Job = { id: string; result_url: string; prompt: string | null; created_at: string; kind: string | null };

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const BIBLIO = "biblioteca";
const fmt = (n: number) => n.toLocaleString("es", { maximumFractionDigits: 1 });
const card = "card-surface rounded-2xl p-4 space-y-3";
// Una toma de la app sirve si ya está en nuestro almacenamiento o es de los últimos 2 días (los enlaces del proveedor caducan).
const usable = (j: Job) => j.result_url.includes("/videos-creados/") || Date.now() - new Date(j.created_at).getTime() < 2 * 864e5;
// Espejo de credit_prices (reel_voz_600 / reel_voz_1200): el cobro real lo decide el servidor.
const VOZ_600 = 99, VOZ_1200 = 198;
const precioVoz = (t: string) => (t.length <= 600 ? VOZ_600 : VOZ_1200);
type Voz = { id: string; nombre: string; muestra: string | null };
type VozLista = { src: string; words: Word[]; guion: string; vozId: string };
type Creada = { estado: "creando" | "lista" | "error"; src?: string; progress?: number | null; error?: string };
const MODOS: { id: ModoVoz; icono: string; titulo: string; linea: string }[] = [
  { id: "tomas", icono: "🎬", titulo: "El sonido de mis tomas", linea: "Lo que ya grabaste, tal cual." },
  { id: "propio", icono: "✍️", titulo: "Mi texto con una voz nueva", linea: "Pegas lo que quieres decir y eliges la voz." },
  { id: "ia", icono: "✨", titulo: "Que la IA escriba el texto", linea: "Lo escribe como la referencia, para lo que vendes." },
];

export function EditaTusTomas({ onHome, onNavigate }: { onHome: () => void; onNavigate: (page: string) => void }) {
  const { user } = useAuth();
  const { balance, applyServerCharge } = useCredits();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [tomas, setTomas] = useState<Toma[]>([]);
  const [ref, setRef] = useState<File | null>(null);
  const [pedido, setPedido] = useState("");
  const [plan, setPlan] = useState<PlanMontaje | null>(null);
  const [busy, setBusy] = useState<"" | "preparar" | "analizar" | "limpiar" | "armar">("");
  const [paso, setPaso] = useState("");
  const [progress, setProgress] = useState(0);
  const [hecho, setHecho] = useState<Blob | null>(null);
  const [pagado, setPagado] = useState(false); // ya pagó la descarga de este montaje en esta sesión
  const [modo, setModo] = useState<ModoVoz>("tomas");
  const [texto, setTexto] = useState("");
  const [voces, setVoces] = useState<Voz[] | null>(null);
  const [vozId, setVozId] = useState("");
  const [voz, setVoz] = useState<VozLista | null>(null);
  const [creandoVoz, setCreandoVoz] = useState(false);
  const [subs, setSubs] = useState(true);
  const [creadas, setCreadas] = useState<Record<number, Creada>>({});
  const [oyendo, setOyendo] = useState("");
  const muestraRef = useRef<HTMLAudioElement | null>(null);
  const vocesPedidas = useRef(false);
  const subirRef = useRef<HTMLInputElement>(null);
  const refRef = useRef<HTMLInputElement>(null);

  // Tus videos hechos en la app (los más nuevos primero).
  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase as any).from("video_jobs").select("id,result_url,prompt,created_at,kind").eq("user_id", user.id).eq("status", "done")
      .not("result_url", "is", null).order("created_at", { ascending: false }).limit(40)
      .then(({ data }: { data: Job[] | null }) => setJobs((data ?? []).filter(usable)));
  }, [user]);

  // Desde la guía de Video: su referencia y/o cómo lo quiere.
  useEffect(() => {
    const enc = takeMontaje();
    if (enc?.file) setRef(enc.file);
    if (enc?.texto) setPedido(enc.texto);
  }, []);

  // Las voces se piden solo si la persona quiere una voz nueva.
  useEffect(() => {
    if (modo === "tomas" || vocesPedidas.current || !user) return;
    vocesPedidas.current = true;
    void (async () => {
      try {
        const r = await fetch(`${FN}/reel-ia`, { method: "POST", headers: await fnHeaders(), body: JSON.stringify({ action: "voices" }) });
        const d = r.ok ? await r.json() as { voices?: Voz[] } : null;
        const lista = Array.isArray(d?.voices) ? d!.voices : [];
        setVoces(lista);
        // La app elige una voz de entrada: la persona solo la cambia si quiere.
        setVozId(v => v || lista[0]?.id || "");
      } catch { setVoces([]); }
    })();
  }, [modo, user]);

  const oir = (v: Voz) => {
    muestraRef.current?.pause();
    if (oyendo === v.id || !v.muestra) { setOyendo(""); return; }
    const a = new Audio(v.muestra); muestraRef.current = a; setOyendo(v.id);
    a.onended = () => setOyendo(""); void a.play().catch(() => setOyendo(""));
  };

  const elegidas = useMemo(() => new Set(tomas.map(t => t.key)), [tomas]);
  const agregar = (t: Toma) => setTomas(ts => (ts.length >= MAX_TOMAS || ts.some(x => x.key === t.key) ? ts : [...ts, t]));
  const quitarToma = (key: string) => { setTomas(ts => ts.filter(t => t.key !== key)); setPlan(null); };
  const mover = (i: number, d: -1 | 1) => setTomas(ts => {
    const j = i + d; if (j < 0 || j >= ts.length) return ts;
    const c = [...ts]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });
  const alternarJob = (j: Job, k: number) => {
    if (elegidas.has(j.id)) { quitarToma(j.id); return; }
    agregar({ key: j.id, nombre: `Video de la app ${k + 1}`, origen: j.result_url, quitar: true });
  };
  const subirTomas = (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      if (!f.type.startsWith("video/")) continue;
      agregar({ key: `${f.name}-${f.size}-${f.lastModified}`, nombre: f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 40), origen: "", src: URL.createObjectURL(f), quitar: true });
    }
  };

  /** Baja y mira cada toma: duración, 2 cuadros para la IA y si trae marca de agua. No cobra. */
  const preparar = useCallback(async (lista: Toma[]): Promise<Toma[]> => {
    const out: Toma[] = [];
    for (let i = 0; i < lista.length; i++) {
      const t = lista[i];
      if (t.prep && t.src) { out.push(t); continue; }
      setPaso(`Revisando tu toma ${i + 1} de ${lista.length}…`); setProgress(i / lista.length);
      try {
        const src = t.src ?? await aLocal(t.origen);
        out.push({ ...t, src, prep: await prepararToma(src), error: undefined });
      } catch (e) { out.push({ ...t, error: e instanceof Error ? e.message : "No se pudo abrir." }); }
    }
    setTomas(out);
    return out;
  }, []);

  const listas = (ts: Toma[]) => ts.filter(t => t.prep && t.src && !t.error);

  const analizar = async (conIA: boolean) => {
    if (busy || !user) return;
    if (!tomas.length) { toast.error("Elige o sube al menos una toma."); return; }
    const t = texto.replace(/\s+/g, " ").trim();
    if (modo === "propio" && t.split(" ").length < 5) { toast.error("Pega tu texto completo (al menos una frase)."); return; }
    if (conIA && !ref && pedido.trim().length < 10 && modo !== "propio") { toast.error("Sube tu video de referencia o cuéntanos cómo lo quieres."); return; }
    setBusy(conIA ? "analizar" : "preparar"); setHecho(null); setVoz(null); setCreadas({});
    try {
      const ts = listas(await preparar(tomas));
      if (!ts.length) throw new Error("No pudimos abrir tus tomas. Súbelas de nuevo.");
      const info = ts.map((t, i) => ({ n: i + 1, dur: t.prep!.dur, nombre: t.nombre }));
      if (!conIA) {
        const simple = montajeSimple(info);
        setPlan(modo === "propio" ? { ...simple, guion: t.slice(0, MAX_GUION), segmentos: simple.segmentos.map(s => ({ ...s, frase: "" })) } : simple);
        track("montaje_plan", { ia: false, tomas: ts.length, voz: modo }); return;
      }
      let path: string | undefined;
      if (ref) {
        if (ref.size > 18 * 1024 * 1024) throw new Error("Tu referencia pesa más de 18 MB. Recórtala o bájale la calidad.");
        setPaso("Subiendo tu referencia…");
        path = `${user.id}/ref/${Date.now()}-${ref.name.replace(/[^\w.-]+/g, "-").slice(-50)}`;
        const up = await supabase.storage.from(BIBLIO).upload(path, ref, { contentType: ref.type || "video/mp4", upsert: false });
        if (up.error) throw new Error("No se pudo subir tu referencia.");
      }
      setPaso(ref ? "Mirando tu referencia y tus tomas…" : "Leyendo cómo lo quieres y mirando tus tomas…"); setProgress(0.9);
      const resp = await fetch(`${FN}/reel-ia`, { method: "POST", headers: await fnHeaders(),
        body: JSON.stringify({ action: "montaje", path, pedido: pedido.trim(), voz: modo, texto: modo === "propio" ? t : undefined, tomas: ts.map((x, i) => ({ ...info[i], frames: x.prep!.frames })) }) });
      if (!resp.ok) throw new Error(await fnErrorMessage(resp, "No se pudo armar el montaje."));
      const data = await resp.json() as { plan: PlanMontaje };
      setPlan(data.plan);
      track("montaje_plan", { ia: true, tomas: ts.length, referencia: !!ref, voz: modo, nuevas: data.plan.nuevas?.length ?? 0 });
      toast.success("Tu montaje está listo", { description: modo === "tomas" ? "Míralo gratis. Puedes cambiar el texto de arriba, quitar trozos o reordenar." : "Míralo gratis. Revisa el texto y crea la voz cuando te guste." });
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo armar el montaje."); }
    finally { setBusy(""); setPaso(""); setProgress(0); }
  };

  const ts = listas(tomas);
  const conVoz = !!plan?.guion;
  const nuevas = plan?.nuevas ?? [];
  const creadasSrc = nuevas.map((_, k) => (creadas[k]?.estado === "lista" ? creadas[k].src ?? null : null));
  const durDe = useCallback((s: Segmento) => (s.toma === 0 ? DUR_NUEVA : ts[s.toma - 1]?.prep?.dur ?? DUR_NUEVA), [ts]);
  // Con voz lista, cada trozo dura lo que tarda su frase (si la persona cambió el texto, se crea la voz otra vez).
  const vozVigente = voz && plan && voz.guion === plan.guion ? voz : null;
  const planVisto = useMemo(() => (plan && vozVigente ? ajustarAVoz(plan, vozVigente.words, durDe) : plan), [plan, vozVigente, durDe]);
  const props: MontajeProps | null = planVisto && ts.length
    ? { clips: ts.map(t => t.src!), plan: planVisto, nuevas: creadasSrc, voz: vozVigente ? { src: vozVigente.src, words: vozVigente.words } : null, subs }
    : null;
  const marcas = ts.filter(t => t.prep?.marca).length;
  const pendientes = nuevas.filter((_, k) => creadas[k]?.estado !== "lista").length;
  const guionActual = plan?.guion ?? "";
  // Lo que falta pagar, antes de gastar (norma de Jean: el total se ve primero).
  const costoVoz = conVoz && !vozVigente ? precioVoz(guionActual) : 0;
  const costoArmar = pagado ? 0 : CREDIT_COSTS.montaje_tomas;
  const costoNuevas = pendientes * CREDIT_COSTS.vid_mini_5;

  /** La voz nueva (ElevenLabs, con el tiempo de cada palabra). La cobra el servidor antes de crearla. */
  const crearVoz = async () => {
    if (!plan?.guion || creandoVoz || busy) return;
    if (!vozId) { toast.error("Elige una voz."); return; }
    const precio = precioVoz(plan.guion);
    if (balance < precio) { toast.error(`Te faltan créditos: la voz cuesta ${precio}.`); return; }
    setCreandoVoz(true);
    try {
      const r = await fetch(`${FN}/reel-ia`, { method: "POST", headers: await fnHeaders(), body: JSON.stringify({ action: "voice", text: plan.guion, voice_id: vozId, speed: 1.1 }) });
      if (!r.ok) throw new Error(await fnErrorMessage(r, "No se pudo crear la voz. No se te cobró."));
      const d = await r.json() as { audio: string; alignment: Parameters<typeof wordsFromAlignment>[0]; billing?: { charged: number; balance: number | null } };
      applyServerCharge("gen_media", d.billing ?? readBilling(r), "Edita tus tomas · voz");
      const blob = await (await fetch(`data:audio/mpeg;base64,${d.audio}`)).blob();
      setVoz({ src: URL.createObjectURL(blob), words: wordsFromAlignment(d.alignment), guion: plan.guion, vozId });
      track("montaje_voz", { caracteres: plan.guion.length });
      toast.success("Tu voz está lista", { description: "Ya suena en la vista previa. Cada trozo dura lo que dura su frase." });
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo crear la voz."); }
    finally { setCreandoVoz(false); }
  };

  /** Recrea con IA un plano de la referencia que la persona no tiene (5 s, vertical, sin audio). Lo cobra video-studio. */
  const crearNueva = async (k: number) => {
    const n = nuevas[k];
    if (!n || creadas[k]?.estado === "creando") return;
    if (balance < CREDIT_COSTS.vid_mini_5) { toast.error(`Te faltan créditos: cada plano con IA cuesta ${CREDIT_COSTS.vid_mini_5}.`); return; }
    const set = (c: Creada) => setCreadas(cur => ({ ...cur, [k]: c }));
    set({ estado: "creando", progress: null });
    try {
      const job = await createVideo({
        prompt: `${n.prompt} Vertical 9:16, realistic, smooth camera movement, no text on screen, no logos, no recognizable people.`.slice(0, 1500),
        seconds: 5, size: "9:16", audio: false, kind: "clip", label: `Edita tus tomas · ${n.desc}`.slice(0, 80),
      });
      if (job.billing) applyServerCharge("vid_mini_5", job.billing, `Plano con IA · ${n.desc}`);
      const done = await waitForVideo(job.job.id, p => setCreadas(cur => ({ ...cur, [k]: { estado: "creando", progress: p } })));
      if (done.status !== "done" || !done.result_url) throw new Error("No se pudo crear el plano. Te devolvimos los créditos.");
      set({ estado: "lista", src: await aLocal(done.result_url) });
      track("montaje_plano_ia", { plano: k + 1 });
    } catch (e) { set({ estado: "error", error: e instanceof Error ? e.message : "No se pudo crear el plano." }); }
  };

  /** Quita las marcas (si las hay y la persona lo dejó marcado) y arma el MP4 en el navegador. Gratis. */
  const armar = async () => {
    if (!props || !plan || busy) return;
    if (conVoz && !vozVigente) { toast.error("Primero crea la voz: es lo que se va a escuchar."); return; }
    if (nuevas.some((_, k) => creadas[k]?.estado === "creando")) { toast.error("Espera a que terminen los planos con IA."); return; }
    if (!pagado && balance < CREDIT_COSTS.montaje_tomas) { toast.error(`Te faltan créditos: armar y descargar cuesta ${CREDIT_COSTS.montaje_tomas}.`); return; }
    setBusy("limpiar"); setHecho(null);
    try {
      const clips = [...props.clips];
      const sucias = ts.map((t, i) => ({ t, i })).filter(({ t }) => t.quitar && t.prep?.marca);
      for (let k = 0; k < sucias.length; k++) {
        const { t, i } = sucias[k];
        setPaso(`Quitando la marca de agua de la toma ${i + 1} (${k + 1} de ${sucias.length})…`);
        const m = t.prep!.marca!;
        const p = { ...PRESETS.recomendado, adaptive: false };
        const out = await exportClean(t.src!, m, p, computeResidue(m, p.gain), {
          canvas: document.createElement("canvas"), W: t.prep!.W, H: t.prep!.H, mbps: 8,
          onProgress: (x, total) => setProgress(total ? x / total : 0),
        });
        clips[i] = URL.createObjectURL(out.blob);
      }
      setBusy("armar"); setPaso("Armando tu video…"); setProgress(0);
      const { canRenderMediaOnWeb, renderMediaOnWeb } = await import("@remotion/web-renderer");
      const check = await canRenderMediaOnWeb({ ...MONTAJE_SIZE, container: "mp4", videoCodec: "h264" });
      { const why = blockingIssue(check); if (why) throw new Error(why); }
      // Los planos de IA que no se crearon se cambian por la toma de al lado: en el video final no quedan avisos.
      let final = sinPendientes(plan, creadasSrc);
      if (vozVigente) final = ajustarAVoz(final, vozVigente.words, durDe);
      const inputProps = { ...props, clips, plan: final } as unknown as Record<string, unknown>;
      const res = await renderMediaOnWeb({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        composition: { id: "montaje", component: MontajeVideo as React.FC<any>, durationInFrames: totalFrames(final), fps: MONTAJE_FPS, ...MONTAJE_SIZE, defaultProps: inputProps },
        inputProps, container: "mp4", videoCodec: "h264", onProgress: p => setProgress(p.progress),
      });
      const blob = await res.getBlob();
      // El cobro va en el servidor y ANTES de entregar el archivo (una sola vez por sesión).
      if (!pagado) {
        setPaso("Confirmando tu descarga…");
        const pay = await fetch(`${FN}/reel-ia`, { method: "POST", headers: await fnHeaders(), body: JSON.stringify({ action: "montaje_descarga" }) });
        if (!pay.ok) throw new Error(await fnErrorMessage(pay, "No se pudo cobrar la descarga. No se te cobró."));
        const d = await pay.json() as { billing?: { charged: number; balance: number | null } };
        applyServerCharge("montaje_tomas", d.billing ?? readBilling(pay), "Edita tus tomas");
        setPagado(true);
      }
      setHecho(blob);
      toolEvent("edita-tus-tomas", "resultado");
      track("montaje_armado", { segundos: Math.round(duracionMontaje(final)), marcas: sucias.length, voz: conVoz, nuevas: nuevas.length - pendientes });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "mi-video.mp4"; a.click();
      toast.success("Tu video está listo y descargado", { description: "Es un MP4 que se abre en cualquier celular." });
    } catch (e) {
      console.error("montaje", e);
      toast.error(e instanceof Error ? e.message : "Tu navegador no pudo armar el video. Ábrelo en Chrome o Safari actualizados.");
    } finally { setBusy(""); setPaso(""); setProgress(0); }
  };

  const editarSeg = (i: number, patch: Partial<PlanMontaje["segmentos"][number]>) =>
    setPlan(p => (p ? { ...p, segmentos: p.segmentos.map((s, k) => (k === i ? { ...s, ...patch } : s)) } : p));
  const quitarSeg = (i: number) => setPlan(p => (p && p.segmentos.length > 1 ? { ...p, segmentos: p.segmentos.filter((_, k) => k !== i) } : p));
  const moverSeg = (i: number, d: -1 | 1) => setPlan(p => {
    if (!p) return p; const j = i + d; if (j < 0 || j >= p.segmentos.length) return p;
    const c = [...p.segmentos]; [c[i], c[j]] = [c[j], c[i]]; return { ...p, segmentos: c };
  });

  const step = hecho ? 3 : plan ? 2 : tomas.length ? 1 : 0;
  const ocupado = !!busy;

  const aside = (
    <div className="space-y-4">
      {/* 1. Tus tomas */}
      <section className={card}>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Paso 1 · Tus tomas</p>
        <p className="text-sm text-muted-foreground">Elige los videos que ya hiciste en la app o sube los tuyos. Se usan en el orden de la lista.</p>
        {jobs === null ? <p className="text-[12px] text-muted-foreground"><Loader2 className="inline w-3.5 h-3.5 animate-spin mr-1" />Buscando tus videos…</p>
          : jobs.length > 0 && (
            <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-1">
              {jobs.map((j, k) => {
                const n = tomas.findIndex(t => t.key === j.id);
                return (
                  <button key={j.id} type="button" onClick={() => alternarJob(j, k)} disabled={ocupado} aria-label={n >= 0 ? `Quitar video ${k + 1}` : `Elegir video ${k + 1}`}
                    className={`relative aspect-[9/16] rounded-lg overflow-hidden border ${n >= 0 ? "border-primary ring-2 ring-primary/50" : "border-border"}`}>
                    <video src={`${j.result_url}#t=0.5`} muted playsInline preload="metadata" className="w-full h-full object-cover pointer-events-none" />
                    {n >= 0 && <span className="absolute top-1 left-1 w-6 h-6 rounded-full bg-primary text-primary-foreground text-[12px] font-bold flex items-center justify-center">{n + 1}</span>}
                  </button>
                );
              })}
            </div>
          )}
        <input ref={subirRef} type="file" accept="video/*" multiple className="hidden" onChange={e => { subirTomas(e.target.files); e.target.value = ""; setPlan(null); }} />
        <button type="button" onClick={() => subirRef.current?.click()} disabled={ocupado}
          className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border text-sm text-foreground disabled:opacity-50">
          <Upload className="w-4 h-4" /> Subir tomas desde mi equipo
        </button>
        {tomas.length > 0 && (
          <ol className="space-y-1.5">
            {tomas.map((t, i) => (
              <li key={t.key} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[13px]">
                <span className="w-5 h-5 shrink-0 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-foreground">{t.nombre}{t.prep ? ` · ${fmt(t.prep.dur)} s` : ""}</span>
                {t.error && <span className="text-[11px] text-destructive">{t.error}</span>}
                <button type="button" onClick={() => mover(i, -1)} disabled={ocupado || i === 0} aria-label="Subir" className="p-1 text-muted-foreground disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => mover(i, 1)} disabled={ocupado || i === tomas.length - 1} aria-label="Bajar" className="p-1 text-muted-foreground disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => quitarToma(t.key)} disabled={ocupado} aria-label="Quitar" className="p-1 text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* 2. Cómo lo quieres */}
      <section className={card}>
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Paso 2 · Cómo lo quieres</p>
        <p className="text-sm text-muted-foreground">Sube el video que quieres imitar, escribe cómo lo quieres, o las dos cosas.</p>
        <input ref={refRef} type="file" accept="video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setRef(f); setPlan(null); } }} />
        {ref ? (
          <div className="flex items-center gap-2 rounded-lg border border-primary/50 bg-primary/5 px-3 py-2 text-[13px]">
            <Film className="w-4 h-4 text-primary shrink-0" /><span className="min-w-0 flex-1 truncate text-foreground">Referencia: {ref.name}</span>
            <button type="button" onClick={() => { setRef(null); setPlan(null); }} disabled={ocupado} aria-label="Quitar la referencia" className="p-1 text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <button type="button" onClick={() => refRef.current?.click()} disabled={ocupado}
            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border text-sm text-foreground disabled:opacity-50">
            <Plus className="w-4 h-4" /> Subir video de referencia (hasta 18 MB)
          </button>
        )}
        <textarea value={pedido} onChange={e => setPedido(e.target.value.slice(0, 600))} rows={3} aria-label="Cómo lo quieres" disabled={ocupado}
          placeholder="Ej.: cortes rápidos, el precio arriba todo el video y que empiece con la toma del congelador"
          className="w-full rounded-xl border border-border bg-background/40 p-3 text-[16px] sm:text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/60" />
        <div className="space-y-2" role="radiogroup" aria-label="Qué se escucha en tu video">
          <p className="text-[13px] font-semibold text-foreground">¿Qué se escucha en tu video?</p>
          {MODOS.map(m => (
            <button key={m.id} type="button" role="radio" aria-checked={modo === m.id} disabled={ocupado}
              onClick={() => { setModo(m.id); setPlan(null); setVoz(null); }}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left disabled:opacity-50 ${modo === m.id ? "border-primary bg-primary/5" : "border-border"}`}>
              <span className="text-lg leading-none mt-0.5" aria-hidden>{m.icono}</span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-foreground">{m.titulo}</span>
                <span className="block text-[12px] text-muted-foreground">{m.linea}</span>
              </span>
            </button>
          ))}
          {modo === "propio" && (
            <div className="space-y-1">
              <textarea value={texto} onChange={e => setTexto(e.target.value.slice(0, MAX_GUION))} rows={5} aria-label="Lo que quieres decir" disabled={ocupado}
                placeholder="Pega aquí lo que quieres que diga la voz. Ej.: ¿Cansada de cocinar todos los días? Te enseño a dejar la comida de la semana lista en una tarde…"
                className="w-full rounded-xl border border-border bg-background/40 p-3 text-[16px] sm:text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/60" />
              <p className="text-right text-[11px] text-muted-foreground">{texto.length.toLocaleString("es")} / {MAX_GUION.toLocaleString("es")} · la voz cuesta {precioVoz(texto)} créditos</p>
            </div>
          )}
          {modo === "ia" && <p className="text-[12px] text-muted-foreground">Arriba cuéntale qué vendes y a quién. La IA escribe el texto con la idea de tu referencia; tú lo revisas antes de crear la voz.</p>}
        </div>
        <button type="button" onClick={() => void analizar(true)} disabled={ocupado || !tomas.length}
          className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground text-[15px] font-semibold disabled:opacity-50">
          {busy === "analizar" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Proponer el montaje · gratis
        </button>
        {modo !== "ia" && (
          <button type="button" onClick={() => void analizar(false)} disabled={ocupado || !tomas.length}
            className="w-full min-h-[40px] text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-50">
            {modo === "propio" ? "O poner mi texto sobre mis tomas tal cual, en este orden" : "O unir mis tomas tal cual, en este orden"}
          </button>
        )}
      </section>

      {/* 3. Revisa y arma */}
      {plan && (
        <section className={card}>
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Paso 3 · Revisa y arma</p>
          {plan.resumen && <p className="text-sm text-foreground">{plan.resumen}</p>}
          <label className="block text-[12px] text-muted-foreground">Texto fijo arriba (déjalo vacío si no lo quieres)
            <input value={plan.rotulo} onChange={e => setPlan({ ...plan, rotulo: e.target.value.slice(0, 60) })} disabled={ocupado}
              placeholder="Ej.: Por solo $15.000 pesos"
              className="mt-1 w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-[16px] sm:text-sm text-foreground" />
          </label>
          {conVoz && (
            <div className="rounded-xl border border-border p-3 space-y-2">
              <p className="text-[13px] font-semibold text-foreground"><Mic className="inline w-4 h-4 text-primary mr-1" />Lo que dice la voz</p>
              <textarea value={guionActual} onChange={e => setPlan({ ...plan, guion: e.target.value.slice(0, MAX_GUION) })} rows={5} aria-label="Lo que dice la voz" disabled={ocupado || creandoVoz}
                className="w-full rounded-lg border border-border bg-background/40 p-2.5 text-[16px] sm:text-[13px] text-foreground focus:outline-none focus:border-primary/60" />
              <p className="text-right text-[11px] text-muted-foreground">{guionActual.length.toLocaleString("es")} / {MAX_GUION.toLocaleString("es")}</p>
              <p className="text-[12px] text-muted-foreground">Elige la voz (toca ▶ para oírla):</p>
              {voces === null ? (
                <p className="text-[12px] text-muted-foreground"><Loader2 className="inline w-3.5 h-3.5 animate-spin mr-1" />Cargando voces…</p>
              ) : voces.length === 0 ? (
                <p className="text-[12px] text-destructive">Las voces no cargaron. Recarga la página en un momento.</p>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 max-h-[180px] overflow-y-auto pr-1">
                  {voces.map(v => (
                    <div key={v.id} className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 ${vozId === v.id ? "border-primary bg-primary/5" : "border-border"}`}>
                      <button type="button" onClick={() => oir(v)} disabled={!v.muestra} aria-label={`Oír la voz ${v.nombre}`} className="p-1 text-primary disabled:opacity-30">
                        {oyendo === v.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button type="button" onClick={() => setVozId(v.id)} disabled={creandoVoz} className="min-w-0 flex-1 truncate text-left text-[12px] text-foreground">{v.nombre}</button>
                    </div>
                  ))}
                </div>
              )}
              {vozVigente ? (
                <p className="text-[12px] text-foreground"><Check className="inline w-4 h-4 text-primary mr-1" />Voz lista: ya suena en la vista previa.
                  {vozId !== vozVigente.vozId && <button type="button" onClick={() => void crearVoz()} disabled={creandoVoz || ocupado} className="ml-1 text-primary font-semibold">Usar la voz nueva · {precioVoz(guionActual)} créditos</button>}
                </p>
              ) : (
                <button type="button" onClick={() => void crearVoz()} disabled={creandoVoz || ocupado || !vozId}
                  className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-primary text-primary text-[14px] font-semibold disabled:opacity-50">
                  {creandoVoz ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />} {voz ? "Cambiaste el texto: crear la voz otra vez" : "Crear la voz"} · {precioVoz(guionActual)} créditos
                </button>
              )}
              <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <input type="checkbox" checked={subs} onChange={e => setSubs(e.target.checked)} disabled={ocupado} /> Subtítulos palabra por palabra
              </label>
            </div>
          )}
          {nuevas.length > 0 && (
            <div className="rounded-xl border border-border p-3 space-y-2">
              <p className="text-[13px] font-semibold text-foreground"><Sparkles className="inline w-4 h-4 text-primary mr-1" />Planos de la referencia que no tienes</p>
              <p className="text-[12px] text-muted-foreground">Los creamos nuevos con IA (nunca usamos el video de otra persona). Los que no crees se cambian por tus tomas.</p>
              {nuevas.map((n, k) => {
                const c = creadas[k];
                return (
                  <div key={k} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-[12px]">
                    <span className="min-w-0 flex-1 text-foreground">{n.desc}</span>
                    {c?.estado === "lista" ? <span className="text-primary font-semibold"><Check className="inline w-3.5 h-3.5" /> Listo</span>
                      : c?.estado === "creando" ? <span className="text-muted-foreground"><Loader2 className="inline w-3.5 h-3.5 animate-spin mr-1" />{typeof c.progress === "number" ? `${Math.round(c.progress * 100)} %` : "Creando…"}</span>
                      : (
                        <button type="button" onClick={() => void crearNueva(k)} disabled={ocupado} className="shrink-0 rounded-lg bg-primary/10 px-2.5 py-1.5 text-primary font-semibold disabled:opacity-50">
                          {c?.estado === "error" ? "Probar otra vez" : "Crear con IA"} · {CREDIT_COSTS.vid_mini_5}
                        </button>
                      )}
                  </div>
                );
              })}
              {Object.values(creadas).some(c => c.estado === "error") && <p className="text-[11px] text-destructive">{Object.values(creadas).find(c => c.estado === "error")?.error}</p>}
            </div>
          )}
          <ol className="space-y-1.5">
            {(planVisto ?? plan).segmentos.map((s, i) => (
              <li key={i} className="rounded-lg border border-border p-2 space-y-1.5">
                <div className="flex items-center gap-2 text-[12px] text-foreground">
                  <span className="w-5 h-5 shrink-0 rounded-full bg-muted text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="flex-1">{s.toma === 0 ? `Plano con IA ${s.nueva}` : `Toma ${s.toma}`} · {fmt(segundosDe(s))} s · {s.transicion}</span>
                  <button type="button" onClick={() => moverSeg(i, -1)} disabled={ocupado || i === 0} aria-label="Antes" className="p-1 text-muted-foreground disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => moverSeg(i, 1)} disabled={ocupado || i === plan.segmentos.length - 1} aria-label="Después" className="p-1 text-muted-foreground disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => quitarSeg(i)} disabled={ocupado || plan.segmentos.length < 2} aria-label="Quitar este trozo" className="p-1 text-muted-foreground disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                {s.frase && <p className="text-[12px] italic text-muted-foreground">«{s.frase}»</p>}
                <input value={s.texto} onChange={e => editarSeg(i, { texto: e.target.value.slice(0, 50) })} disabled={ocupado} aria-label={`Texto del trozo ${i + 1}`}
                  placeholder="Texto en pantalla (opcional)" className="w-full rounded-md border border-border bg-background/40 px-2 py-1 text-[16px] sm:text-[12px] text-foreground" />
              </li>
            ))}
          </ol>
          {plan.faltan.length > 0 && (
            <div className="rounded-lg border border-border bg-background/40 p-2.5 text-[12px] text-muted-foreground">
              <p className="text-foreground font-semibold mb-1">Para que quede igual a la referencia te faltan:</p>
              <ul className="list-disc pl-4 space-y-0.5">{plan.faltan.map((f, k) => <li key={k}>{f}</li>)}</ul>
              <span>Grábalas y súbelas arriba en «Tus tomas».</span>
            </div>
          )}
          {marcas > 0 && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-2.5 space-y-1.5">
              <p className="text-[13px] text-foreground"><Eraser className="inline w-4 h-4 text-primary mr-1" />Encontramos una marca de agua en {marcas} {marcas === 1 ? "toma" : "tomas"}. La quitamos al armar.</p>
              {ts.filter(t => t.prep?.marca).map(t => (
                <label key={t.key} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <input type="checkbox" checked={t.quitar} disabled={ocupado} onChange={e => setTomas(xs => xs.map(x => (x.key === t.key ? { ...x, quitar: e.target.checked } : x)))} />
                  Quitarla de «{t.nombre}»
                </label>
              ))}
            </div>
          )}
          {(costoVoz > 0 || costoNuevas > 0 || conVoz || nuevas.length > 0) && (
            <div className="rounded-xl border border-border bg-background/40 p-3 text-[12px] space-y-1">
              <p className="text-[13px] font-semibold text-foreground">Lo que cuesta tu video</p>
              {conVoz && <p className="flex justify-between text-muted-foreground"><span>Voz</span><span>{vozVigente ? "ya pagada" : `${costoVoz} créditos`}</span></p>}
              {nuevas.length > 0 && <p className="flex justify-between text-muted-foreground"><span>Planos con IA ({nuevas.length - pendientes} de {nuevas.length} hechos)</span><span>{pendientes ? `hasta ${costoNuevas} créditos` : "ya pagados"}</span></p>}
              <p className="flex justify-between text-muted-foreground"><span>Armar y descargar</span><span>{costoArmar ? `${costoArmar} créditos` : "ya pagado"}</span></p>
              <p className="flex justify-between border-t border-border pt-1 text-foreground font-semibold"><span>Total por pagar</span><span>{(costoVoz + costoNuevas + costoArmar).toLocaleString("es")} créditos</span></p>
            </div>
          )}
          <button type="button" onClick={() => void armar()} disabled={ocupado}
            className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground text-[15px] font-semibold disabled:opacity-50">
            {busy === "limpiar" || busy === "armar" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} {pagado ? "Volver a armar y descargar · ya pagado" : `Armar y descargar mi video · ${CREDIT_COSTS.montaje_tomas} créditos`}
          </button>
        </section>
      )}
    </div>
  );

  return (
    <ToolShell toolId="edita-tus-tomas" onNavigate={onNavigate} previewFirst
      crumbs={[{ label: "Crear" }, { label: "Con tu cara", onClick: onHome }, { label: "Edita tus tomas" }]}
      title="Edita tus tomas como tu referencia"
      line="Ya tienes tus tomas: las unimos como el video que te gusta, con su ritmo, sus textos y sin marcas de agua."
      onBack={onHome}
      steps={["Tus tomas", "Cómo lo quieres", "Revisa", "Listo"]} step={step}
      aside={aside}>
      <div className="space-y-3">
        {busy && (
          <div className="rounded-xl border border-border bg-card p-3 text-sm text-foreground space-y-2">
            <p><Loader2 className="inline w-4 h-4 animate-spin mr-1.5 text-primary" />{paso || "Trabajando…"}</p>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          </div>
        )}
        {props ? (
          <div className="rounded-2xl overflow-hidden border border-border bg-black mx-auto max-w-[360px]">
            <Player component={MontajeVideo} inputProps={props} durationInFrames={totalFrames(props.plan)} fps={MONTAJE_FPS}
              compositionWidth={MONTAJE_SIZE.width} compositionHeight={MONTAJE_SIZE.height} controls style={{ width: "100%", aspectRatio: "9 / 16" }} />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border aspect-[9/16] max-w-[360px] mx-auto flex flex-col items-center justify-center gap-2 text-center p-6">
            <Sparkles className="w-6 h-6 text-primary" />
            <p className="text-sm text-foreground">Aquí verás tu video antes de armarlo.</p>
            <p className="text-[12px] text-muted-foreground">Elige tus tomas y dinos cómo lo quieres.</p>
          </div>
        )}
        {props && <p className="text-center text-[12px] text-muted-foreground">{plan!.segmentos.length} trozos · {fmt(duracionMontaje(plan!))} s</p>}
        {hecho && <p className="text-center text-sm text-foreground"><Check className="inline w-4 h-4 text-primary mr-1" />Descargado. Si cambias algo, vuelves a armarlo sin pagar otra vez.</p>}
      </div>
    </ToolShell>
  );
}
