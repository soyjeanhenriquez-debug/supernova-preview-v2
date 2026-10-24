import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, Copy, Download, ImagePlus, Loader2, Plus, RefreshCw, Settings2, Sparkles, Trash2, UserRound, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeErrorMessage } from "@/lib/fnAuth";
import { useCredits } from "@/hooks/useCredits";
import { useCreditsLeft } from "@/hooks/useCreditsLeft";
import { track } from "@/lib/analytics";
import { STOCK_INFLUENCERS, stockById } from "@/lib/influencers";
import { refForServer, uploadStudioImage, type StudioRef } from "@/lib/studioUpload";
import {
  ACCENTS, AVATAR_PROMPT_MAX, CAMERAS, GESTURES, LOOK_MAX, PROMPT_TAGS, VIDEO_FORMATS, VIDEO_MODELS, VOICES,
  fitLen, imageCredits, isTestimonial, maxWords, videoCredits, videoModel, videoPromptParts, videoSeconds, wordCount,
  type PromptTag, type VideoFormat, type VideoLen, type VideoModel,
} from "@/lib/avatarStudio";
import { Avatar6CForm } from "@/components/video/Avatar6C";
import { publishText, type Shot, type VideoBrief, type VideoSize } from "@/lib/videoTemplates";
import { AdFinalVideo } from "@/components/video/AdFinalVideo";
import { ReadyToPublish } from "@/components/video/ReadyToPublish";
import { downloadVideo, waitForVideo, type VideoJob } from "@/components/video/videoApi";

/**
 * Video UGC paso a paso (24-oct-2026, Jean: "no sé dónde empiezo"): los 4 pasos del curso de UGC, uno a la vez.
 *   1 Tu avatar (y tu producto, si lo muestra) · 2 Imágenes (opcional: la misma persona en otros lugares)
 *   3 Los clips (lo que dice, cómo se ve, segundos; lo avanzado en "Ajustes") · 4 Video final (crear, unir, publicar)
 *
 * Dos plantillas: "Con tu producto" y "UGC sin producto" (24-oct-2026, del curso de UGC de Jean: solo la persona
 * hablando a cámara; avatar creado con el método 6C; cada clip con cámara, micro-acción, guion, voz y acento, y su
 * prompt a la vista por partes de colores).
 *
 * Anuncio en video por escenas, estilo Higgsfield (22-oct-2026, tras la prueba de Cindy: frases de 20 palabras en
 * tomas fijas de 5 s y sin poder poner su producto). Una sola pantalla:
 *   1) Tu producto (foto) · 2) Quién lo presenta (avatar de SUPERNOVA, tu foto, una imagen de tu estudio o nadie)
 *   3) Escenas: cada una con lo que dice, "cómo se ve" (su propio prompt), motor y segundos. Al final se unen gratis.
 * Usa la función avatar-studio (el mismo motor del Estudio de avatar): el servidor arma el prompt, cobra ANTES de
 * generar (costo × 6) y devuelve los créditos si una escena falla. Con producto y persona, primero se crea UNA foto
 * de inicio (la persona con tu producto en la mano) y todas las escenas parten de ella: misma cara, ropa y lugar.
 */

type Cfg = { open: boolean; apimart: boolean; higgsfield: boolean };
type Billing = { charged: number; balance: number | null };
type SceneCfg = {
  key: string; label: string; line: string; look: string; format: VideoFormat;
  model: string; seconds: VideoLen; camera: string; extra?: boolean; off?: boolean;
  role?: string; touched?: boolean; // touched: la persona eligió el formato; ya no se cambia solo
  before?: string; after?: string;  // micro-acción: gesto antes de hablar y al terminar
  image?: string;                   // ruta de una foto del paso 2 para empezar este clip (si no, la foto base)
};
type Step = 1 | 2 | 3 | 4;
const STEPS: { n: Step; label: string; line: string }[] = [
  { n: 1, label: "Tu avatar", line: "Elige quién habla. Es la base de todo: esta cara sale en todos los clips." },
  { n: 2, label: "Imágenes", line: "Opcional: la misma persona en otros lugares o con otra ropa, para variar los clips." },
  { n: 3, label: "Los clips", line: "Qué dice y cómo se ve cada clip. Lo avanzado (motor, cámara, gestos, prompt) está en Ajustes." },
  { n: 4, label: "Video final", line: "Creamos los clips, los unimos en un solo video y lo descargas o lo publicas." },
];
type Plantilla = "producto" | "ugc";
/** Color de cada parte del prompt (como en el curso): suave, para leer, no para llamar la atención. */
const TAG_CLS: Record<PromptTag, string> = {
  camara: "bg-sky-500/10 border-sky-500/30", escena: "bg-violet-500/10 border-violet-500/30", guion: "bg-lime-500/10 border-lime-500/30",
  voz: "bg-cyan-500/10 border-cyan-500/30", acento: "bg-pink-500/10 border-pink-500/30", reglas: "bg-secondary/40 border-border",
};
type SceneRun = { job?: VideoJob; error?: string; progress?: number | null };

const MAX_SCENES = 6;
const PRODUCT_FORMATS: VideoFormat[] = ["sostiene", "senala", "broll-producto"];
const needsProduct = (f: VideoFormat) => PRODUCT_FORMATS.includes(f);
const talksFmt = (f: VideoFormat) => VIDEO_FORMATS.find(x => x.id === f)?.talks ?? false;
const FORMAT_LABEL: Record<VideoFormat, string> = {
  camara: "Habla a cámara", sostiene: "Habla y muestra el producto", senala: "Habla y señala el producto",
  "sin-hablar": "Sin hablar", "broll-producto": "Solo el producto",
};
const LOOK_HINT: Record<string, string> = {
  gancho: "Ej.: cocina luminosa de día, ella con delantal, cara de cansancio, cámara en mano.",
  demo: "Ej.: abre el congelador y saca los tápers ordenados, luz cálida, plano medio.",
  llamada: "Ej.: sonríe a cámara en la sala, fondo desenfocado, se acerca un poco al final.",
};

async function invokeStudio<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("avatar-studio", { body });
  if (error) throw new Error(await invokeErrorMessage(error, "No se pudo completar."));
  return data as T;
}

/** Voz sugerida según el avatar elegido (las voces son del estudio: hombre/mujer y edad). */
function voiceFor(presenter: StudioRef | null): string {
  const s = presenter && "stock" in presenter ? stockById(presenter.stock) : null;
  if (!s) return "m28";
  return s.genero === "hombre" ? (s.edad === "mayor" ? "h50" : "h28") : s.edad === "mayor" ? "m50" : "m28";
}

function defaults(role: string | undefined, hasPresenter: boolean, hasProduct: boolean, models: VideoModel[]): Pick<SceneCfg, "format" | "model" | "seconds" | "camera"> {
  const format: VideoFormat = !hasPresenter ? "broll-producto"
    : role === "demo" && hasProduct ? "sostiene"
    : role === "llamada" && hasProduct ? "senala" : "camara";
  return { format, model: pickModel(format, models)?.id ?? "seedance-mini", seconds: 5, camera: role === "gancho" ? "zoom-rapido" : role === "demo" ? "en-mano" : "quieta-gestos" };
}

/** Motor por defecto: el más económico que sirve para esa escena (habla → Seedance Mini; muda → Grok). */
function pickModel(format: VideoFormat, models: VideoModel[]): VideoModel | null {
  const ok = models.filter(m => !talksFmt(format) || m.talks);
  return ok.find(m => m.id === (talksFmt(format) ? "seedance-mini" : "grok")) ?? ok[0] ?? null;
}

export function AdStudio({ uid, productId, brief, shots, onLine, cfg, size, onSize, toolbar, busy, setBusy }: {
  uid: string; productId: string | null; brief: VideoBrief; shots: Shot[]; onLine: (i: number, v: string) => void;
  cfg: Cfg; size: VideoSize; onSize: (s: VideoSize) => void; toolbar: ReactNode; busy: boolean; setBusy: (b: boolean) => void;
}) {
  const { applyServerCharge, balance } = useCredits();
  const creditsLeft = useCreditsLeft().label;
  const models = useMemo(() => VIDEO_MODELS.filter(m => (m.provider === "apimart" ? cfg.apimart : cfg.higgsfield)), [cfg]);

  // ---------- Plantilla ----------
  const [plantilla, setPlantilla] = useState<Plantilla>("ugc"); // por defecto: solo la persona hablando (lo más simple)
  const ugc = plantilla === "ugc";

  // ---------- Producto y presentador ----------
  const [product, setProduct] = useState<StudioRef | null>(null);
  useEffect(() => { if (ugc) setProduct(null); }, [ugc]);
  // Crear avatar (6C) y otra foto del mismo avatar: imágenes del estudio (GPT Image 2), cobra el servidor.
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarPrompt, setAvatarPrompt] = useState("");
  const [variation, setVariation] = useState("");
  const [variants, setVariants] = useState<StudioRef[]>([]); // paso 2: la misma persona en otros lugares
  const [step, setStep] = useState<Step>(1);
  const [openCfg, setOpenCfg] = useState<string | null>(null); // "Ajustes" abiertos de un clip
  const [imaging, setImaging] = useState<"avatar" | "variacion" | null>(null);
  const makeImage = async (kind: "avatar" | "variacion") => {
    if (imaging || busy) return;
    const cost = imageCredits("gpt");
    if (balance < cost) { toast.error(`Te faltan créditos: la imagen cuesta ${cost}.`); return; }
    setImaging(kind);
    try {
      const body = kind === "avatar"
        ? { action: "image", template: "avatar-base", model: "gpt", fill: avatarPrompt, aspect: size }
        : { action: "image", template: "misma-persona", model: "gpt", fill: variation, aspect: size, refs: { persona: refForServer(presenter!) } };
      const r = await invokeStudio<{ path: string; url: string; billing?: Billing }>(body);
      if (r.billing) applyServerCharge("gen_media", r.billing, kind === "avatar" ? "Avatar 6C · foto" : "Avatar · otra foto");
      const ref: StudioRef = { bucket: "estudio-avatar", path: r.path, url: r.url };
      setGallery(g => [{ path: r.path, url: r.url }, ...g].slice(0, 8));
      if (kind === "avatar") { setPresenter(ref); setAvatarOpen(false); } else { setVariants(v => [...v, ref].slice(-6)); setVariation(""); }
      track("estudio_avatar_imagen", { plantilla: kind === "avatar" ? "avatar-base" : "misma-persona", modelo: "gpt" });
      toast.success(kind === "avatar" ? "Tu avatar está listo: ya es quien habla." : "Lista: puedes usarla en cualquier clip del paso 3.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo crear la imagen."); }
    finally { setImaging(null); }
  };
  const [presenter, setPresenter] = useState<StudioRef | null>({ stock: STOCK_INFLUENCERS[0].id, url: STOCK_INFLUENCERS[0].foto });
  const [composite, setComposite] = useState<StudioRef | null>(null); // la persona con tu producto (foto de inicio)
  const [gallery, setGallery] = useState<{ path: string; url: string }[]>([]);
  const [uploading, setUploading] = useState<"producto" | "persona" | null>(null);
  const productInput = useRef<HTMLInputElement>(null);
  const personInput = useRef<HTMLInputElement>(null);
  const [voice, setVoice] = useState("m28");
  const [accent, setAccent] = useState("latam");
  useEffect(() => { setComposite(null); setVariants([]); }, [product, presenter]);
  useEffect(() => { setVoice(voiceFor(presenter)); }, [presenter]);
  useEffect(() => { void invokeStudio<{ items: { path: string; url: string }[] }>({ action: "gallery" }).then(r => setGallery(r.items.slice(0, 8))).catch(() => undefined); }, []);

  const upload = async (file: File, kind: "producto" | "persona") => {
    setUploading(kind);
    try {
      const r = await uploadStudioImage(uid, productId ?? "anuncio", file, kind);
      if (kind === "producto") setProduct(r); else setPresenter(r);
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo subir."); }
    finally { setUploading(null); }
  };

  // ---------- Escenas ----------
  const [scenes, setScenes] = useState<SceneCfg[]>([]);
  const [showPrompt, setShowPrompt] = useState<string | null>(null);
  useEffect(() => {
    // La plantilla (o «Mejorar con IA») cambia el texto; los ajustes de cada escena se quedan.
    setScenes(prev => [
      ...shots.map((s, i) => ({
        ...(prev[i] && !prev[i].extra ? prev[i] : { key: `t${i}-${Date.now()}`, look: "", ...defaults(s.role, !!presenter, !!product, models) }),
        label: s.label, line: s.line, role: s.role,
      })),
      ...prev.filter(x => x.extra),
    ]);
  }, [shots]); // eslint-disable-line react-hooks/exhaustive-deps
  // Cambió el producto o la persona: las escenas que la persona no tocó toman el formato que les toca (con
  // producto, la demostración lo muestra y la llamada lo señala); las demás solo cambian si ya no se pueden hacer.
  useEffect(() => {
    setScenes(prev => prev.map(s => {
      const auto = defaults(s.role, !!presenter, !!product, models).format;
      const bad = presenter ? s.format === "broll-producto" || (needsProduct(s.format) && !product) : s.format !== "broll-producto";
      if (s.touched ? !bad : s.format === auto) return s;
      const format: VideoFormat = s.touched ? (presenter ? "camara" : "broll-producto") : auto;
      const m = videoModel(s.model);
      return { ...s, format, model: m && (!talksFmt(format) || m.talks) ? s.model : pickModel(format, models)?.id ?? s.model };
    }));
  }, [presenter, product, models]);

  const patch = (i: number, p: Partial<SceneCfg>) => setScenes(cur => cur.map((s, j) => {
    if (j !== i) return s;
    const next = { ...s, ...p };
    const m = videoModel(next.model);
    // Formato que habla con un motor mudo: se cambia al motor por defecto que habla.
    if (m && talksFmt(next.format) && !m.talks) next.model = pickModel(next.format, models)?.id ?? next.model;
    const mm = videoModel(next.model);
    if (mm) next.seconds = fitLen(mm, next.seconds);
    return next;
  }));
  const setLine = (i: number, v: string) => { patch(i, { line: v }); if (i < shots.length && !scenes[i]?.extra) onLine(i, v); };
  const addScene = () => setScenes(cur => cur.length >= MAX_SCENES ? cur : [...cur, {
    key: `x${Date.now()}`, label: `Escena ${cur.length + 1}`, line: "", look: "", extra: true, ...defaults(undefined, !!presenter, !!product, models),
  }]);
  const allModel = (id: string) => setScenes(cur => cur.map(s => {
    const m = videoModel(id);
    if (!m || (talksFmt(s.format) && !m.talks)) return s; // un motor mudo no se pone en una escena que habla
    return { ...s, model: id, seconds: fitLen(m, s.seconds) };
  }));

  const active = scenes.map((s, i) => ({ s, i })).filter(x => !x.s.off);
  const issue = (s: SceneCfg): { text: string; fix?: VideoLen } | null => {
    const m = videoModel(s.model);
    if (!m || !models.some(x => x.id === m.id)) return { text: "Elige un motor." };
    if (needsProduct(s.format) && !product) return { text: "Sube la foto de tu producto." };
    if (isTestimonial(s.look)) return { text: "La descripción suena a testimonio o promesa: describe solo cómo se ve." };
    if (s.format === "sin-hablar" && s.look.trim().length < 5) return { text: "Describe qué pasa en la escena." };
    if (!talksFmt(s.format)) return null;
    const words = wordCount(s.line);
    if (words < 3) return { text: "Escribe lo que dice (mínimo 3 palabras)." };
    if (isTestimonial(s.line)) return { text: "Suena a testimonio o promesa. La persona solo presenta o explica." };
    const real = videoSeconds(m, s.seconds);
    if (words > maxWords(real)) {
      const fix = m.seconds.find(x => x > s.seconds && words <= maxWords(videoSeconds(m, x)));
      return { text: `En ${real} s caben unas ${maxWords(real)} palabras y tienes ${words}.`, fix };
    }
    return null;
  };
  const usesComposite = !!presenter && !!product && active.some(({ s }) => needsProduct(s.format) && !videoModel(s.model)?.productRef);
  const compositeCost = usesComposite && !composite ? imageCredits("gpt") : 0;

  /** Paso 1: la foto base con tu producto en la mano (la misma que se haría sola al crear, pero a la vista). */
  const makeComposite = async () => {
    if (!presenter || !product || composite || imaging || busy) return;
    const cost = imageCredits("gpt");
    if (balance < cost) { toast.error(`Te faltan créditos: la foto cuesta ${cost}.`); return; }
    setImaging("avatar");
    try {
      const r = await invokeStudio<{ path: string; url: string; billing?: Billing }>({
        action: "image", template: "sosteniendo", model: "gpt", aspect: size,
        refs: { persona: refForServer(presenter), producto: refForServer(product) },
      });
      if (r.billing) applyServerCharge("gen_media", r.billing, "Video UGC · foto base con tu producto");
      setComposite({ bucket: "estudio-avatar", path: r.path, url: r.url });
      toast.success("Foto base lista: todos los clips parten de aquí.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo crear la foto."); }
    finally { setImaging(null); }
  };

  // ---------- Crear ----------
  const [run, setRun] = useState<SceneRun[]>([]);
  const [runKeys, setRunKeys] = useState<string[]>([]);
  const sceneCost = (s: SceneCfg) => { const m = videoModel(s.model); return m ? videoCredits(m, fitLen(m, s.seconds)) : 0; };
  const failedIdx = run.length && run.length === runKeys.length ? run.map((r, k) => (r.job ? -1 : k)).filter(k => k >= 0) : [];
  const total = compositeCost + active.reduce((n, { s }) => n + sceneCost(s), 0);

  const create = async (retry = false) => {
    if (busy) return;
    const list = retry ? failedIdx.map(k => ({ s: scenes.find(x => x.key === runKeys[k])!, k })).filter(x => x.s) : active.map(({ s }, k) => ({ s, k }));
    if (!list.length) { toast.error("Agrega al menos una escena."); return; }
    const bad = list.map(({ s }) => ({ s, p: issue(s) })).find(x => x.p);
    if (bad) { toast.error(`${bad.s.label}: ${bad.p!.text}`); return; }
    const cost = (retry ? 0 : compositeCost) + list.reduce((n, { s }) => n + sceneCost(s), 0);
    if (balance < cost) { toast.error(`Te faltan créditos: ${retry ? "lo que falta" : "este anuncio"} cuesta ${cost}.`); return; }
    setBusy(true);
    if (!retry) { setRun(list.map(() => ({}))); setRunKeys(list.map(({ s }) => s.key)); }
    else setRun(cur => cur.map((r, k) => (failedIdx.includes(k) ? {} : r)));

    // 1) Foto de inicio: la persona con tu producto en la mano. Una sola vez; todas las escenas parten de ella.
    let start = composite;
    if (usesComposite && !start) {
      try {
        const r = await invokeStudio<{ path: string; url: string; billing?: Billing }>({
          action: "image", template: "sosteniendo", model: "gpt", aspect: size,
          refs: { persona: refForServer(presenter!), producto: refForServer(product!) },
        });
        if (r.billing) applyServerCharge("gen_media", r.billing, "Anuncio · foto de inicio con tu producto");
        start = { bucket: "estudio-avatar", path: r.path, url: r.url };
        setComposite(start);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "No se pudo crear la foto de inicio.";
        setRun(cur => cur.map(r => (r.job ? r : { error: `${msg} No se creó ninguna escena.` })));
        setBusy(false);
        return;
      }
    }

    // 2) Escenas a la vez, todas desde la misma imagen (misma persona y lugar).
    const n = active.length;
    await Promise.allSettled(list.map(async ({ s, k }) => {
      const m = videoModel(s.model)!;
      const seconds = fitLen(m, s.seconds);
      // Sin persona: parte de la foto del producto. Con una foto del paso 2 elegida: de esa. Si no: la foto base.
      const chosen = s.image ? variants.find(v => "path" in v && v.path === s.image) : undefined;
      const image = !presenter ? product! : chosen ?? start ?? presenter;
      const index = active.findIndex(x => x.s.key === s.key);
      try {
        const r = await invokeStudio<{ job: VideoJob; billing?: Billing }>({
          action: "video", model: m.id, seconds, aspect: size, image: refForServer(image),
          product: m.productRef && needsProduct(s.format) && product ? refForServer(product) : undefined,
          product_id: productId ?? undefined, label: `Escena ${index + 1} de ${n} · ${s.label}`,
          parts: { format: s.format, camera: s.camera, script: s.line, look: s.look.trim() || undefined, voice, accent, surface: "", before: s.before, after: s.after },
        });
        if (r.billing) applyServerCharge("gen_media", r.billing, `Video anuncio · ${s.label} · ${videoSeconds(m, seconds)} s`);
        const done = await waitForVideo(r.job.id, p => setRun(cur => cur.map((x, j) => (j === k ? { ...x, progress: p } : x))), { check: b => invokeStudio(b) });
        if (done.status !== "done") throw new Error("Esta escena falló. Te devolvimos sus créditos.");
        setRun(cur => cur.map((x, j) => (j === k ? { job: done } : x)));
      } catch (e) {
        setRun(cur => cur.map((x, j) => (j === k ? { error: e instanceof Error ? e.message : "Falló esta escena." } : x)));
      }
    }));
    track("video_generado", { modo: "anuncio_escenas", escenas: list.length, motores: [...new Set(list.map(({ s }) => s.model))].join(","), producto: !!product, persona: !!presenter });
    setBusy(false);
    void loadRecent();
  };

  // ---------- Tus videos de hoy (los del estudio) ----------
  const [recent, setRecent] = useState<VideoJob[]>([]);
  const loadRecent = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = () => (supabase as any).from("video_jobs").select("id,status,result_url,prompt,seconds,created_at,kind")
      .eq("user_id", uid).eq("kind", "avatar").gte("created_at", since).order("created_at", { ascending: false }).limit(8);
    const { data } = await q();
    const list = (data ?? []) as VideoJob[];
    const pending = list.filter(j => j.status === "running" || j.status === "queued");
    if (pending.length) {
      // Los que quedaron a medias (se cerró la pantalla): se pregunta su estado. Si fallaron, el servidor devuelve.
      await Promise.all(pending.map(j => invokeStudio({ action: "status", job_id: j.id }).catch(() => null)));
      setRecent((((await q()).data ?? []) as VideoJob[]).filter(j => j.status === "done"));
    } else setRecent(list.filter(j => j.status === "done"));
  }, [uid]);
  useEffect(() => { void loadRecent(); }, [loadRecent]);

  // ---------- Vista ----------
  const chip = (on: boolean) => `h-9 px-3 rounded-full border text-[12px] transition-colors ${on ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground hover:text-foreground"}`;
  const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60";
  const select = "h-9 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground min-w-0";
  const aspectCls = size === "16:9" ? "aspect-video" : size === "1:1" ? "aspect-square" : "aspect-[9/16] max-h-[520px] mx-auto";
  const isStock = (id: string) => !!presenter && "stock" in presenter && presenter.stock === id;
  const isPath = (path: string) => !!presenter && "path" in presenter && presenter.path === path;
  const runDone = run.filter(r => r.job?.result_url);
  const higgsOff = !cfg.higgsfield && VIDEO_MODELS.some(m => m.provider === "higgsfield");
  const base = composite ?? presenter ?? product; // la foto con la que empiezan los clips
  const totalSec = active.reduce((n, { s }) => { const m = videoModel(s.model); return n + (m ? videoSeconds(m, fitLen(m, s.seconds)) : 0); }, 0);
  const problems = active.map(({ s }) => ({ s, p: issue(s) })).filter(x => x.p);
  const canNext: Record<Step, boolean> = { 1: !!presenter || !!product, 2: true, 3: active.length > 0 && !problems.length, 4: true };
  const go = (n: Step) => { setStep(n); try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* sin scroll (pruebas) */ } };
  const now = STEPS[step - 1];

  // Función y no componente: un componente definido aquí dentro se desmontaría en cada render y el clic se perdería.
  const nav = (next?: string) => (
    <div className="flex items-center justify-between gap-2 pt-1">
      {step > 1
        ? <button type="button" onClick={() => go((step - 1) as Step)} disabled={busy} className={chip(false)}><ArrowLeft className="inline w-3.5 h-3.5 mr-1" />Atrás</button>
        : <span />}
      {next && (
        <button type="button" onClick={() => go((step + 1) as Step)} disabled={busy || !canNext[step]}
          className="btn-primary-nova inline-flex items-center gap-2 rounded-xl px-5 h-11 text-[14px] font-semibold disabled:opacity-60">
          {next}<ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-5 min-w-0">
      {/* Pasos */}
      <nav aria-label="Pasos" className="grid grid-cols-4 gap-1.5">
        {STEPS.map(x => {
          const reachable = x.n <= step || STEPS.slice(0, x.n - 1).every(y => canNext[y.n]);
          return (
            <button key={x.n} type="button" onClick={() => reachable && go(x.n)} disabled={busy || !reachable} aria-current={x.n === step ? "step" : undefined}
              className={`text-left rounded-xl border px-2.5 py-2 min-w-0 ${x.n === step ? "border-primary/60 bg-card" : x.n < step ? "border-border bg-card/40" : "border-border opacity-70"}`}>
              <span className={`block text-[10px] uppercase tracking-wider ${x.n === step ? "text-primary" : "text-muted-foreground"}`}>Paso {x.n}</span>
              <span className="block text-[12px] font-semibold text-foreground truncate">{x.n < step ? <Check className="inline w-3 h-3 mr-1" /> : null}{x.label}</span>
            </button>
          );
        })}
      </nav>
      <p className="text-[13px] text-muted-foreground">{now.line}</p>

      {/* ---------- Paso 1 · Tu avatar ---------- */}
      {step === 1 && (
        <div className="rounded-2xl border border-border p-4 sm:p-5 space-y-5 min-w-0">
          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-foreground">¿Tu video muestra un producto?</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ["ugc", "No, solo la persona hablando", "UGC sin producto: habla a cámara y el producto no aparece."],
                ["producto", "Sí, lo muestra", "La persona lo sostiene o lo señala mientras habla."],
              ] as [Plantilla, string, string][]).map(([id, label, desc]) => (
                <button key={id} type="button" onClick={() => setPlantilla(id)} disabled={busy}
                  className={`text-left rounded-xl border px-3 py-2.5 min-h-[44px] ${plantilla === id ? "border-foreground/40 bg-card" : "border-border hover:border-foreground/30"}`}>
                  <span className="block text-[13px] font-semibold text-foreground">{label}</span>
                  <span className="block text-[11px] text-muted-foreground">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {!ugc && (
            <div className="space-y-2">
              <p className="text-[13px] font-semibold text-foreground">Tu producto</p>
              <div className="flex items-center gap-3">
                {product ? <img src={product.url} alt="Tu producto" className="w-16 h-16 rounded-xl object-cover border border-border" />
                  : <div className="w-16 h-16 rounded-xl border border-dashed border-border grid place-items-center text-muted-foreground"><ImagePlus className="w-5 h-5" /></div>}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => productInput.current?.click()} disabled={busy || !!uploading} className={chip(false)}>
                      {uploading === "producto" ? <Loader2 className="inline w-3.5 h-3.5 animate-spin mr-1" /> : <Camera className="inline w-3.5 h-3.5 mr-1" />}
                      {product ? "Cambiar foto" : "Subir foto del producto"}
                    </button>
                    {product && <button type="button" onClick={() => setProduct(null)} disabled={busy} className={chip(false)}><X className="inline w-3.5 h-3.5 mr-1" />Quitar</button>}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Sale con su etiqueta tal cual. Si vendes un curso o una guía, sube la portada o tu celular con la app abierta.</p>
                </div>
                <input ref={productInput} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f, "producto"); }} />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-foreground">Quién habla</p>
            <div className="flex flex-wrap items-center gap-2">
              {STOCK_INFLUENCERS.map(s => (
                <button key={s.id} type="button" onClick={() => setPresenter({ stock: s.id, url: s.foto })} disabled={busy} aria-label={s.personaje.nombre}
                  className={`relative w-12 h-12 rounded-full overflow-hidden border-2 ${isStock(s.id) ? "border-primary" : "border-border"}`}>
                  <img src={s.foto} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
              {gallery.map(g => (
                <button key={g.path} type="button" onClick={() => setPresenter({ bucket: "estudio-avatar", path: g.path, url: g.url })} disabled={busy} aria-label="Imagen de tu estudio"
                  className={`w-12 h-12 rounded-full overflow-hidden border-2 ${isPath(g.path) ? "border-primary" : "border-border"}`}>
                  <img src={g.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
              {presenter && "bucket" in presenter && presenter.bucket === "personajes" && (
                <span className="w-12 h-12 rounded-full overflow-hidden border-2 border-primary"><img src={presenter.url} alt="" className="w-full h-full object-cover" /></span>
              )}
              <button type="button" onClick={() => personInput.current?.click()} disabled={busy || !!uploading} className={chip(false)}>
                {uploading === "persona" ? <Loader2 className="inline w-3.5 h-3.5 animate-spin mr-1" /> : <UserRound className="inline w-3.5 h-3.5 mr-1" />}Tu foto
              </button>
              <button type="button" onClick={() => setAvatarOpen(v => !v)} disabled={busy} className={chip(avatarOpen)}>
                <Wand2 className="inline w-3.5 h-3.5 mr-1" />Crear avatar
              </button>
              {!ugc && <button type="button" onClick={() => setPresenter(null)} disabled={busy || !product} className={chip(!presenter)}
                title={product ? "" : "Primero sube la foto del producto"}>Sin persona</button>}
              <input ref={personInput} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f, "persona"); }} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {presenter ? "Los avatares de SUPERNOVA son personajes creados con IA. Si usas tu foto, la persona eres tú." : "Solo tu producto, sin personas: clips mudos para poner tu voz o música después."}
            </p>
            {avatarOpen && (
              <div className="rounded-xl border border-border p-3 space-y-3">
                <p className="text-[12px] text-muted-foreground">Describe a tu avatar y la IA escribe el prompt con el método 6C (personaje, cámara, ropa, lugar, luz y realismo). Puedes editarlo antes de crear la foto.</p>
                <Avatar6CForm onPrompt={setAvatarPrompt} disabled={busy || !!imaging} />
                <textarea value={avatarPrompt} rows={6} onChange={e => setAvatarPrompt(e.target.value.slice(0, AVATAR_PROMPT_MAX))} disabled={busy || !!imaging}
                  placeholder="A candid iPhone photo of… (o escríbelo tú)" className={`${field} font-mono text-[12px] leading-relaxed`} />
                <button type="button" onClick={() => void makeImage("avatar")} disabled={busy || !!imaging || avatarPrompt.trim().length < 40}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border text-[12px] text-foreground hover:border-foreground/30 disabled:opacity-50">
                  {imaging === "avatar" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Crear mi avatar · {imageCredits("gpt")} créditos
                </button>
              </div>
            )}
          </div>

          {presenter && (
            <div className="flex flex-wrap gap-2">
              <select className={select} value={voice} onChange={e => setVoice(e.target.value)} disabled={busy} aria-label="Voz">
                {VOICES.map(v => <option key={v.id} value={v.id}>Voz: {v.label}</option>)}
              </select>
              <select className={select} value={accent} onChange={e => setAccent(e.target.value)} disabled={busy} aria-label="Acento">
                {ACCENTS.map(a => <option key={a.id} value={a.id}>Acento: {a.label}</option>)}
              </select>
            </div>
          )}

          {base && (
            <div className="flex items-start gap-3">
              <img src={base.url} alt="Foto base" className="w-20 h-28 rounded-xl object-cover border border-border" />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-[12px] text-foreground font-semibold">{composite ? "Foto base con tu producto" : "Foto base"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {composite ? "Todos los clips parten de aquí: misma persona, mismo lugar." : presenter && product ? "Con tu producto, crea la foto base con la persona sosteniéndolo. Si no, se crea sola al final." : "Todos los clips parten de esta foto."}
                </p>
                {presenter && product && !composite && (
                  <button type="button" onClick={() => void makeComposite()} disabled={busy || !!imaging} className={chip(false)}>
                    {imaging ? <Loader2 className="inline w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="inline w-3.5 h-3.5 mr-1" />}Crear foto base con tu producto · {imageCredits("gpt")} cr
                  </button>
                )}
              </div>
            </div>
          )}
          {nav("Siguiente: imágenes")}
        </div>
      )}

      {/* ---------- Paso 2 · Imágenes ---------- */}
      {step === 2 && (
        <div className="rounded-2xl border border-border p-4 sm:p-5 space-y-4 min-w-0">
          {presenter ? (
            <>
              <div className="flex flex-wrap items-end gap-3">
                {[base, ...variants].filter(Boolean).map((v, k) => (
                  <div key={k} className="space-y-1">
                    <img src={v!.url} alt="" className="w-20 h-28 rounded-xl object-cover border border-border" />
                    <p className="text-[10px] text-muted-foreground text-center">{k === 0 ? "Base" : `Foto ${k + 1}`}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input value={variation} onChange={e => setVariation(e.target.value.slice(0, 220))} disabled={busy || !!imaging}
                  placeholder="Ej.: en el baño, foto muy cerca de su cara, con camiseta blanca" className={`${field} h-10 py-0 flex-1 min-w-[220px]`} />
                <button type="button" onClick={() => void makeImage("variacion")} disabled={busy || !!imaging || variation.trim().length < 3} className={chip(false)}>
                  {imaging === "variacion" ? <Loader2 className="inline w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="inline w-3.5 h-3.5 mr-1" />}Crear foto · {imageCredits("gpt")} cr
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">Misma cara, otra escena. En el paso 3 eliges con qué foto empieza cada clip. Si no quieres más fotos, sigue: todos usan la base.</p>
            </>
          ) : <p className="text-[13px] text-muted-foreground">Sin persona no hace falta este paso: los clips muestran tu producto.</p>}
          {nav("Siguiente: los clips")}
        </div>
      )}

      {/* ---------- Paso 3 · Los clips ---------- */}
      {step === 3 && (
        <div className="rounded-2xl border border-border p-4 sm:p-5 space-y-4 min-w-0">
          {toolbar}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-foreground">{active.length} clips · {totalSec} s</p>
            <select className={select} value="" onChange={e => e.target.value && allModel(e.target.value)} disabled={busy} aria-label="Motor para todos">
              <option value="">Motor para todos…</option>
              {models.map(m => <option key={m.id} value={m.id}>{m.label}{m.talks ? "" : " (sin voz)"}</option>)}
            </select>
          </div>
          {scenes.map((s, i) => {
            const m = videoModel(s.model);
            const p = issue(s);
            const talks = talksFmt(s.format);
            const allowed = models.filter(x => !talks || x.talks);
            const formats = (presenter ? (["camara", "sostiene", "senala", "sin-hablar"] as VideoFormat[]) : (["broll-producto"] as VideoFormat[]))
              .filter(f => !needsProduct(f) || product);
            const pp = showPrompt === s.key ? videoPromptParts({
              format: s.format, camera: s.camera, script: s.line, look: s.look, voice, accent, before: s.before, after: s.after,
              seconds: m ? videoSeconds(m, fitLen(m, s.seconds)) : s.seconds, surface: "",
            }) : null;
            const real = m ? videoSeconds(m, fitLen(m, s.seconds)) : s.seconds;
            const cfgOpen = openCfg === s.key;
            return (
              <div key={s.key} className={`rounded-xl border border-border p-3 space-y-2.5 ${s.off ? "opacity-50" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-foreground">Clip {i + 1} · {s.label}</span>
                  <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    {!s.off && <span>{sceneCost(s)} créditos</span>}
                    {s.extra
                      ? <button type="button" onClick={() => setScenes(cur => cur.filter(x => x.key !== s.key))} disabled={busy} aria-label="Quitar clip" className="hover:text-foreground"><Trash2 className="w-3.5 h-3.5" /></button>
                      : <button type="button" onClick={() => patch(i, { off: !s.off })} disabled={busy} className="underline underline-offset-2 hover:text-foreground">{s.off ? "Incluir" : "Saltar"}</button>}
                  </span>
                </div>
                {!s.off && (
                  <>
                    {talks && (
                      <label className="block space-y-1">
                        <span className="flex justify-between text-[11px] text-muted-foreground"><span>Lo que dice</span><span>{wordCount(s.line)}/{maxWords(real)} palabras</span></span>
                        <textarea value={s.line} rows={2} disabled={busy} onChange={e => setLine(i, e.target.value.slice(0, 400))} className={field} />
                      </label>
                    )}
                    <label className="block space-y-1">
                      <span className="flex justify-between text-[11px] text-muted-foreground"><span>Cómo se ve {s.format === "sin-hablar" ? "" : "(opcional)"}</span><span>{s.look.length}/{LOOK_MAX}</span></span>
                      <textarea value={s.look} rows={2} disabled={busy} onChange={e => patch(i, { look: e.target.value.slice(0, LOOK_MAX) })}
                        placeholder={LOOK_HINT[shots[i]?.role ?? ""] ?? "Describe el lugar, la luz, la ropa, qué hace y cómo se mueve la cámara."} className={field} />
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {m && m.seconds.map(len => (
                        <button key={len} type="button" onClick={() => patch(i, { seconds: len })} disabled={busy} className={chip(fitLen(m, s.seconds) === len)}>{videoSeconds(m, len)} s</button>
                      ))}
                      {variants.length > 0 && presenter && (
                        <span className="flex items-center gap-1.5">
                          {[{ path: "", url: base?.url ?? "" }, ...variants.map(v => ("path" in v ? { path: v.path, url: v.url } : null)).filter(Boolean) as { path: string; url: string }[]].map(v => (
                            <button key={v.path || "base"} type="button" onClick={() => patch(i, { image: v.path || undefined })} disabled={busy} aria-label={v.path ? "Empezar con esta foto" : "Empezar con la foto base"}
                              className={`w-8 h-10 rounded-md overflow-hidden border-2 ${(s.image ?? "") === v.path ? "border-primary" : "border-border"}`}>
                              <img src={v.url} alt="" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </span>
                      )}
                      <button type="button" onClick={() => setOpenCfg(k => (k === s.key ? null : s.key))} className={`${chip(cfgOpen)} ml-auto`}>
                        <Settings2 className="inline w-3.5 h-3.5 mr-1" />Ajustes
                      </button>
                    </div>
                    {cfgOpen && (
                      <div className="rounded-lg border border-border p-2.5 space-y-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          {formats.map(f => <button key={f} type="button" onClick={() => patch(i, { format: f, touched: true })} disabled={busy} className={chip(s.format === f)}>{FORMAT_LABEL[f]}</button>)}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <select className={select} value={s.model} onChange={e => patch(i, { model: e.target.value })} disabled={busy} aria-label="Motor">
                            {allowed.map(x => <option key={x.id} value={x.id}>{x.label} · {videoCredits(x, fitLen(x, s.seconds))} cr</option>)}
                          </select>
                          {s.format !== "broll-producto" && (
                            <select className={select} value={s.camera} onChange={e => patch(i, { camera: e.target.value })} disabled={busy} aria-label="Cámara">
                              {CAMERAS.map(c => <option key={c.id} value={c.id}>Cámara: {c.label}</option>)}
                            </select>
                          )}
                        </div>
                        {talks && (
                          <div className="flex flex-wrap gap-2">
                            <select className={select} value={s.before ?? ""} onChange={e => patch(i, { before: e.target.value || undefined })} disabled={busy} aria-label="Gesto antes de hablar">
                              <option value="">Antes de hablar: nada</option>{GESTURES.map(g => <option key={g.id} value={g.id}>Antes: {g.label}</option>)}
                            </select>
                            <select className={select} value={s.after ?? ""} onChange={e => patch(i, { after: e.target.value || undefined })} disabled={busy} aria-label="Gesto al terminar">
                              <option value="">Al terminar: nada</option>{GESTURES.map(g => <option key={g.id} value={g.id}>Al terminar: {g.label}</option>)}
                            </select>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          {m ? <p className="text-[11px] text-muted-foreground">{m.note}</p> : <span />}
                          <button type="button" onClick={() => setShowPrompt(k => (k === s.key ? null : s.key))} className="shrink-0 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
                            {showPrompt === s.key ? "Ocultar prompt" : "Ver prompt"}
                          </button>
                        </div>
                        {pp && ("error" in pp
                          ? <p className="text-[11px] text-muted-foreground">El prompt aparece cuando el clip esté completo: {pp.error}</p>
                          : (
                            <div className="space-y-1.5">
                              {pp.parts.map((x, k) => (
                                <div key={k} className={`rounded-lg border px-2.5 py-1.5 ${TAG_CLS[x.tag]}`}>
                                  <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">{PROMPT_TAGS[x.tag]}</span>
                                  <span className="block text-[12px] font-mono text-foreground leading-relaxed break-words">{x.text}</span>
                                </div>
                              ))}
                              <button type="button" onClick={() => { void navigator.clipboard.writeText(pp.parts.map(x => x.text).join("\n")).then(() => toast.success("Prompt copiado.")); }}
                                className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" />Copiar prompt</button>
                            </div>
                          ))}
                      </div>
                    )}
                    {p && (
                      <p className="text-[11px] text-primary">
                        {p.text}{" "}
                        {p.fix && <button type="button" onClick={() => patch(i, { seconds: p.fix })} className="font-semibold underline underline-offset-2">Usar {m ? videoSeconds(m, p.fix) : p.fix} s</button>}
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
          {scenes.length < MAX_SCENES && (
            <button type="button" onClick={addScene} disabled={busy} className={chip(false)}><Plus className="inline w-3.5 h-3.5 mr-1" />Agregar clip</button>
          )}
          <div className="flex flex-wrap gap-2">
            {(["9:16", "1:1", "16:9"] as VideoSize[]).map(sz => <button key={sz} onClick={() => onSize(sz)} disabled={busy} className={chip(size === sz)}>{sz === "9:16" ? "Vertical" : sz === "16:9" ? "Horizontal" : "Cuadrado"}</button>)}
          </div>
          <p className="text-[11px] text-muted-foreground">La persona presenta o explica: nada de "lo compré", "me funcionó" ni promesas de resultados.{higgsOff ? " Más motores llegan pronto." : ""}</p>
          {problems.length > 0 && <p className="text-[12px] text-primary">Revisa {problems.length === 1 ? "el clip marcado" : `los ${problems.length} clips marcados`} para seguir.</p>}
          {nav("Siguiente: video final")}
        </div>
      )}

      {/* ---------- Paso 4 · Video final ---------- */}
      {step === 4 && (
        <div className="rounded-2xl border border-border p-4 sm:p-5 space-y-4 min-w-0">
          <div className="flex items-center gap-3">
            {base && <img src={base.url} alt="" className="w-14 h-20 rounded-lg object-cover border border-border" />}
            <div className="min-w-0 text-[13px] text-foreground space-y-0.5">
              <p className="font-semibold">{active.length} clips · {totalSec} s · {size === "9:16" ? "vertical" : size === "16:9" ? "horizontal" : "cuadrado"}</p>
              <p className="text-[12px] text-muted-foreground">{active.map(({ s }) => s.label).join(" · ")}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <button onClick={() => void create()} disabled={busy || !active.length || problems.length > 0}
              className="btn-primary-nova inline-flex items-center justify-center gap-2 rounded-xl px-5 h-12 text-[14px] font-semibold disabled:opacity-60 w-full sm:w-auto">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {busy ? `Creando ${runDone.length} de ${run.length || active.length} clips…` : `Crear video · ${total} créditos`}
            </button>
            <p className="text-[11px] text-muted-foreground">
              {creditsLeft}.{compositeCost ? ` Incluye ${compositeCost} de la foto base con tu producto.` : ""} Si un clip falla, te devolvemos sus créditos.
            </p>
          </div>

          {run.length > 0 && (
            <section className="space-y-4">
              <div className={`grid gap-3 ${size === "16:9" ? "sm:grid-cols-2" : run.length === 1 ? "max-w-sm" : "grid-cols-2 lg:grid-cols-3"}`}>
                {run.map((r, k) => {
                  const label = scenes.find(x => x.key === runKeys[k])?.label ?? `Clip ${k + 1}`;
                  return (
                    <div key={k} className="rounded-2xl border border-border overflow-hidden bg-card/40 min-w-0">
                      <div className={`relative bg-black ${aspectCls}`}>
                        {r.job?.result_url ? <video src={r.job.result_url} controls playsInline className="w-full h-full object-contain" />
                          : r.error ? <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-[12px] text-muted-foreground">{r.error}</div>
                          : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground px-4 text-center">
                              <Loader2 className="w-6 h-6 animate-spin" />
                              <span className="text-[12px] font-semibold text-foreground">Clip {k + 1} de {run.length}</span>
                              <span className="text-[11px]">{typeof r.progress === "number" && r.progress > 0 ? `Creando… ${r.progress} %` : "Creando… 1 a 5 min"}</span>
                            </div>
                          )}
                      </div>
                      <div className="p-3 flex items-center gap-2">
                        <span className="text-[12px] text-foreground truncate flex-1">{label}</span>
                        {r.job?.result_url && (
                          <button onClick={() => void downloadVideo(r.job!.result_url!, `supernova-${label.replace(/\W+/g, "-").toLowerCase()}.mp4`)} aria-label="Descargar" className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground">
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {busy && <p className="text-[12px] text-muted-foreground">Los clips se crean a la vez (1 a 5 min). Puedes seguir usando la app: si cierras esta pantalla, los encuentras en "Tus videos de hoy".</p>}
              {!busy && failedIdx.length > 0 && (
                <button onClick={() => void create(true)} className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-border text-[13px] text-foreground">
                  <RefreshCw className="w-4 h-4" />Rehacer {failedIdx.length === 1 ? "el clip que falló" : `los ${failedIdx.length} clips que fallaron`}
                </button>
              )}
              {!busy && runDone.length === run.length && runDone.length > 1 && (
                <AdFinalVideo jobIds={runDone.map(x => x.job!.id)} size={size} name="anuncio" />
              )}
              {!busy && runDone.length === run.length && (
                <ReadyToPublish name="anuncio" text={publishText(brief, "anuncio")}
                  clips={runDone.map((r, k) => ({ url: r.job!.result_url!, label: scenes.find(x => x.key === runKeys[k])?.label ?? "Clip" }))} />
              )}
            </section>
          )}
          {nav()}
        </div>
      )}

      {recent.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Tus videos de hoy</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {recent.map(j => j.result_url && (
              <div key={j.id} className="rounded-xl border border-border overflow-hidden">
                <video src={j.result_url} controls playsInline className="w-full aspect-[9/16] bg-black object-cover" />
                <button type="button" onClick={() => void downloadVideo(j.result_url!, `supernova-${j.id.slice(0, 8)}.mp4`)}
                  className="w-full h-9 text-[12px] inline-flex items-center justify-center gap-1.5 hover:bg-secondary/40"><Download className="w-3.5 h-3.5" />Descargar</button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground"><Check className="inline w-3 h-3 mr-1" />Descárgalos pronto: el enlace caduca.</p>
        </section>
      )}
    </div>
  );
}
