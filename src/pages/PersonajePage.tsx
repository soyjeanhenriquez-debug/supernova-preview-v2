import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Copy, Crown, Download, Film, ImageIcon, Loader2, Lock, Mic, RefreshCw, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessProfile, profileReady } from "@/lib/businessProfile";
import { useCredits, generatorCost, CREDIT_COSTS } from "@/hooks/useCredits";
import { fnHeaders, fnErrorMessage, readBilling } from "@/lib/fnAuth";
import { track } from "@/lib/analytics";
import { AFFILIATE_NOTE, HIGGSFIELD_URL } from "@/lib/partners";
import { createVideo, downloadVideo, invokeVideo, loadVideoConfig, waitForVideo, type VideoJob } from "@/components/video/videoApi";
import { VIDEO_PRICE, buildShots, cleanBrief, hasForbiddenClaim, recommendTemplate, shotPrompt } from "@/lib/videoTemplates";
import { SPOKEN_MAX, STOCK_INFLUENCERS, VOICES, guessGenero, lineFromGuion, voicePrompt, type Genero, type StockInfluencer } from "@/lib/influencers";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { ModelPicker } from "@/components/media/ModelPicker";
import { accessOf, hasComunidad, loadMediaModels, type MediaModel } from "@/lib/media";
import { PLANS, checkoutUrl, formatUsd } from "@/lib/plans";
import { COUNTRIES, type CountryCode } from "@/lib/gemelo";
import {
  cleanGuion, cleanPersonaje, parseArray, promptFoto, promptGuiones, promptIdeas,
  type Guion, type Personaje, type PersonajeState,
} from "@/lib/personaje";

/**
 * Influencer IA ("Vende sin mostrar tu cara"): un personaje creado con IA cuenta tu oferta en
 * Reels/TikTok/Shorts. Desde el 05-oct-2026 es el ÚNICO lugar para videos que hablan (UGC con IA
 * vive aquí; antes estaba duplicado en el estudio de video y el paso 3 hacía clips mudos):
 * 1) Tu influencer: uno de los 4 de SUPERNOVA (gratis) o 3 propuestas a tu medida + foto.
 * 2) 10 guiones con ganchos probados.
 * 3) Su video hablando: qué dice + estilo de voz → video-studio kind "ugc" (Seedance 2.0 Mini, con
 *    voz y labios sincronizados), 110 créditos que cobra el servidor y devuelve si falla.
 * Reglas de honestidad: src/lib/personaje.ts. Avatares y voces: src/lib/influencers.ts.
 */
const PRESALE_URL = import.meta.env.VITE_VIDEO_PRESALE_URL as string | undefined;
const PRESALE_DEADLINE = import.meta.env.VITE_VIDEO_PRESALE_DEADLINE as string | undefined; // "30 de noviembre de 2026"

type Step = 1 | 2 | 3;
const TALK_COST = VIDEO_PRICE[10];

async function streamGenerator(generatorId: string, title: string, system: string, user: string): Promise<{ text: string; resp: Response }> {
  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
    method: "POST", headers: await fnHeaders(),
    body: JSON.stringify({ generator_id: generatorId, generator_title: title, systemPrompt: system, messages: [{ role: "user", content: user }] }),
  });
  if (!resp.ok || !resp.body) throw new Error(await fnErrorMessage(resp, "La IA no respondió. No se te cobró: intenta de nuevo."));
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).replace(/\r$/, ""); buf = buf.slice(nl + 1);
      if (!line.startsWith("data: ")) continue;
      const j = line.slice(6).trim();
      if (j === "[DONE]") continue;
      try { const c = JSON.parse(j).choices?.[0]?.delta?.content; if (c) text += c; } catch { /* trozo incompleto */ }
    }
  }
  return { text, resp };
}

/** PNG grande de la IA → WebP ~200 KB (Storage y velocidad). */
async function compress(dataUrl: string): Promise<Blob> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const scale = Math.min(1, 1080 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error("No se pudo preparar la foto."))), "image/webp", 0.85));
}

export function PersonajePage({ onNavigate, initialStep }: { onNavigate: (page: string) => void; initialStep?: Step }) {
  const { user } = useAuth();
  const { profile, savePatch, loaded, productId } = useBusinessProfile();
  const { applyServerCharge, canAfford, balance } = useCredits();
  const state: PersonajeState = profile.journey?.personaje ?? {};
  const [step, setStep] = useState<Step>(initialStep && state.elegido ? initialStep : state.guiones?.length ? 2 : 1);
  const [country, setCountry] = useState<CountryCode>(profile.journey?.gemelo?.country ?? "RD");
  const [busy, setBusy] = useState<"" | "ideas" | "foto" | "guiones">("");
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  // Catálogo de modelos (fal.ai): qué se ve y a qué precio. El servidor decide lo que se puede usar.
  const { isAdmin } = useIsAdmin();
  const [models, setModels] = useState<MediaModel[]>([]);
  const [comunidad, setComunidad] = useState(false);
  const [imgModel, setImgModel] = useState<string | null>(null);
  const [upsell, setUpsell] = useState<MediaModel | null>(null);
  // Video que habla (UGC): abierto según el interruptor del servidor (edge_limits 'video-studio:ugc').
  const [ugcOpen, setUgcOpen] = useState<boolean | null>(null);
  useEffect(() => { let on = true; loadVideoConfig().then(c => { if (on) setUgcOpen(c.ugc); }); return () => { on = false; }; }, []);
  const [line, setLine] = useState("");
  const [talk, setTalk] = useState<{ busy: boolean; progress: number | null; error: string | null }>({ busy: false, progress: null, error: null });
  const [talkJobs, setTalkJobs] = useState<VideoJob[]>([]);
  const [stockBusy, setStockBusy] = useState<string | null>(null);

  useEffect(() => { loadMediaModels().then(setModels); }, []);
  useEffect(() => { if (user) hasComunidad(user.id, user.email).then(setComunidad); }, [user]);
  const opts = useMemo(() => ({ isAdmin: !!isAdmin, comunidad }), [isAdmin, comunidad]);
  const usable = useCallback((kind: MediaModel["kind"]) => models.filter(m => m.kind === kind && accessOf(m, opts) === "ok"), [models, opts]);
  // Modelo de foto por defecto: el recomendado que se pueda usar, o el primero.
  useEffect(() => {
    const im = usable("image"); if (!imgModel && im.length) setImgModel((im.find(m => m.recommended) ?? im[0]).id);
  }, [usable, imgModel]);
  const imgM = models.find(m => m.id === imgModel && accessOf(m, opts) === "ok") ?? null;

  // Videos que habla (últimos 7 días). Los que quedaron a medias se consultan (gratis) para que
  // aparezcan si salieron o se devuelvan si fallaron.
  const uid = user?.id ?? null;
  const loadTalkJobs = useCallback(async () => {
    if (!uid) return;
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = () => (supabase as any).from("video_jobs").select("id,status,prompt,result_url,seconds,created_at,kind")
      .eq("user_id", uid).eq("kind", "ugc").gte("created_at", since).order("created_at", { ascending: false }).limit(6);
    const { data } = await q();
    const list = (data ?? []) as VideoJob[];
    const pending = list.filter(j => j.status === "running" || j.status === "queued");
    if (pending.length) {
      await Promise.all(pending.map(j => invokeVideo({ action: "status", job_id: j.id }).catch(() => null)));
      const again = await q();
      setTalkJobs((again.data ?? []) as VideoJob[]);
    } else setTalkJobs(list);
  }, [uid]);
  useEffect(() => { if (step === 3 && ugcOpen) void loadTalkJobs(); }, [step, ugcOpen, loadTalkJobs]);

  const save = (patch: Partial<PersonajeState>) =>
    savePatch({ journey: { ...(profile.journey ?? {}), personaje: { ...state, ...patch, actualizado: new Date().toISOString() } } });

  // La foto vive en un bucket privado: se pide un enlace temporal para mostrarla.
  useEffect(() => {
    if (!state.foto) { setFotoUrl(null); return; }
    supabase.storage.from("personajes").createSignedUrl(state.foto, 3600).then(({ data }) => setFotoUrl(data?.signedUrl ?? null));
  }, [state.foto]);

  if (!loaded) return null;
  if (!profileReady(profile)) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <UserRound className="w-10 h-10 mx-auto text-primary" />
        <h1 className="font-display text-2xl font-semibold text-foreground">Primero, elige qué vas a vender</h1>
        <p className="text-muted-foreground">Tu personaje necesita una oferta que contar. Elige y clona una en Mi negocio (es gratis) y vuelve aquí.</p>
        <button onClick={() => onNavigate("Dashboard")} className="h-12 px-6 rounded-full btn-primary-nova inline-flex items-center gap-2">Ir a Mi negocio <ArrowRight className="w-4 h-4" /></button>
      </div>
    );
  }

  const pais = COUNTRIES[country].name;
  const ideasCost = generatorCost("personaje-ideas");
  const guionesCost = generatorCost("personaje-guiones");

  const crearIdeas = async () => {
    if (!canAfford(ideasCost.action)) { toast.error(`Te faltan créditos: proponer 3 personajes cuesta ${ideasCost.cost}.`); return; }
    setBusy("ideas");
    try {
      const { system, user: u } = promptIdeas(profile, pais);
      const { text, resp } = await streamGenerator("personaje-ideas", `Personajes · ${profile.product.slice(0, 50)}`, system, u);
      applyServerCharge(ideasCost.action, readBilling(resp), "3 personajes");
      const opciones = parseArray<Partial<Personaje>>(text).map(cleanPersonaje).filter((p): p is Personaje => !!p).slice(0, 3);
      if (!opciones.length) throw new Error("La IA respondió con un formato que no pudimos leer. Prueba otra vez.");
      await save({ opciones, elegido: null });
      track("personaje_ideas", { cantidad: opciones.length, pais: country });
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudieron crear los personajes."); }
    finally { setBusy(""); }
  };

  const elegir = async (p: Personaje) => {
    await save({ elegido: p, foto: null, guiones: [] });
    track("personaje_creado", { pais: country });
  };

  const crearFoto = async () => {
    const pj = state.elegido;
    if (!pj || !user || !productId) return;
    if (imgM) { await crearFotoFal(pj); return; }
    if (!canAfford("gen_ad_image")) { toast.error(`Te faltan créditos: la foto cuesta ${CREDIT_COSTS.gen_ad_image}.`); return; }
    setBusy("foto");
    try {
      const { data, error } = await supabase.functions.invoke("generate-ad-creative", { body: { prompt: promptFoto(pj), aspectRatio: "9:16" } });
      if (error || !data?.image) throw new Error(data?.error || "No se pudo crear la foto. No se te cobró.");
      if (data.billing) applyServerCharge("gen_ad_image", data.billing, `Foto de ${pj.nombre}`);
      const blob = await compress(data.image as string);
      const path = `${user.id}/${productId}/${Date.now()}.webp`;
      const up = await supabase.storage.from("personajes").upload(path, blob, { contentType: "image/webp", upsert: false });
      if (up.error) throw new Error("La foto se creó pero no se pudo guardar. Intenta de nuevo.");
      if (state.foto) void supabase.storage.from("personajes").remove([state.foto]);
      await save({ foto: path });
      track("personaje_foto");
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo crear la foto."); }
    finally { setBusy(""); }
  };

  const crearFotoFal = async (pj: Personaje) => {
    if (!imgM || !productId) return;
    setBusy("foto");
    try {
      const { data, error } = await supabase.functions.invoke("image-generate", { body: { model_id: imgM.id, prompt: promptFoto(pj), product_id: productId } });
      if (error || !data?.path) {
        const body = await (error as { context?: Response } | null)?.context?.json?.().catch(() => null);
        if (body?.code === "comunidad_required") { setUpsell(imgM); return; }
        throw new Error(body?.error || data?.error || "No se pudo crear la foto. No se te cobró.");
      }
      if (data.billing) applyServerCharge("gen_media", data.billing, `Foto de ${pj.nombre} · ${imgM.label}`);
      if (state.foto) void supabase.storage.from("personajes").remove([state.foto]);
      await save({ foto: data.path });
      track("personaje_foto", { modelo: imgM.id });
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo crear la foto."); }
    finally { setBusy(""); }
  };

  // Elegir un avatar de SUPERNOVA: gratis. La foto se copia a la carpeta del usuario para que el
  // servidor la acepte como presentador (solo usa imágenes de la carpeta propia).
  const elegirStock = async (s: StockInfluencer) => {
    if (!user || !productId || stockBusy) return;
    setStockBusy(s.id);
    try {
      const blob = await (await fetch(s.foto)).blob();
      const path = `${user.id}/${productId}/supernova-${s.id}-${Date.now()}.webp`;
      const up = await supabase.storage.from("personajes").upload(path, blob, { contentType: "image/webp", upsert: false });
      if (up.error) throw new Error("No se pudo preparar su foto. Intenta de nuevo.");
      if (state.foto) void supabase.storage.from("personajes").remove([state.foto]);
      await save({ elegido: { ...s.personaje, genero: s.genero, vozId: s.vozId, stock: s.id }, foto: path, guiones: [] });
      track("personaje_creado", { stock: s.id });
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo elegir este influencer."); }
    finally { setStockBusy(null); }
  };

  const setVoz = (patch: { genero?: Genero; vozId?: string }) => { if (state.elegido) void save({ elegido: { ...state.elegido, ...patch } }); };

  // Video que habla: Seedance 2.0 Mini crea voz y labios a la vez; la voz se le describe (influencers.ts).
  const crearVideoHablando = async () => {
    const pj = state.elegido;
    if (!pj || !state.foto || talk.busy) return;
    const said = line.trim();
    if (said.length < 4) { toast.error("Escribe lo que va a decir."); return; }
    if (hasForbiddenClaim(said)) { toast.error("Tu influencer solo presenta o explica: sin testimonios (\"lo compré\", \"me funcionó\"), promesas ni cifras de dinero."); return; }
    if (balance < TALK_COST) { toast.error(`Te faltan créditos: el video que habla cuesta ${TALK_COST}.`); return; }
    const brief = cleanBrief({ product: profile.product, who: profile.who, promise: profile.promise });
    const shot = { ...buildShots("ugc", recommendTemplate(brief, "ugc").id, brief)[0], line: said };
    const genero = guessGenero(pj);
    // La voz va justo después de lo que dice (el servidor recorta el prompt a 1.500 caracteres).
    const parts = shotPrompt(shot, "ugc", { presenter: true }).split("\n");
    const at = parts.findIndex(p => p.startsWith("La persona mira a cámara"));
    parts.splice(at < 0 ? 1 : at + 1, 0, voicePrompt(genero, pj.vozId));
    setTalk({ busy: true, progress: null, error: null });
    try {
      const r = await createVideo({
        prompt: parts.join("\n"), seconds: 10, size: "9:16", audio: true, kind: "ugc",
        image_path: state.foto, image_bucket: "personajes", product_id: productId ?? undefined,
      });
      if (r.billing) applyServerCharge("vid_mini_10", r.billing, `Video de ${pj.nombre} hablando`);
      void loadTalkJobs();
      const done = await waitForVideo(r.job.id, p => setTalk(t => ({ ...t, progress: p })));
      if (done.status !== "done") throw new Error("El video falló. Te devolvimos los créditos.");
      track("video_generado", { modo: "influencer", voz: pj.vozId ?? "calida", stock: pj.stock ?? null });
      toast.success(`¡Listo! ${pj.nombre} ya habla en tu video.`);
      setTalk({ busy: false, progress: null, error: null });
    } catch (e) {
      setTalk({ busy: false, progress: null, error: e instanceof Error ? e.message : "No se pudo crear el video." });
    } finally { void loadTalkJobs(); }
  };

  const crearGuiones = async () => {
    const pj = state.elegido;
    if (!pj) return;
    if (!canAfford(guionesCost.action)) { toast.error(`Te faltan créditos: 10 guiones cuestan ${guionesCost.cost}.`); return; }
    setBusy("guiones");
    try {
      // Ganchos de anuncios reales con más prueba de venta, en español.
      const { data: hooks } = await supabase.from("hook_vault").select("hook_template, hook_text").eq("language", "es")
        .order("winner_score", { ascending: false }).limit(8);
      const ganchos = ((hooks ?? []) as { hook_template: string | null; hook_text: string }[]).map(h => (h.hook_template || h.hook_text).slice(0, 160));
      const { system, user: u } = promptGuiones(profile, pj, ganchos, pais);
      const { text, resp } = await streamGenerator("personaje-guiones", `Guiones · ${pj.nombre}`, system, u);
      applyServerCharge(guionesCost.action, readBilling(resp), `10 guiones de ${pj.nombre}`);
      const guiones = parseArray<Partial<Guion>>(text).map(cleanGuion).filter((g): g is Guion => !!g).slice(0, 10);
      if (!guiones.length) throw new Error("La IA respondió con un formato que no pudimos leer. Prueba otra vez.");
      await save({ guiones });
      track("guiones_generados", { cantidad: guiones.length });
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudieron escribir los guiones."); }
    finally { setBusy(""); }
  };

  const copiar = (t: string, msg = "Copiado") => navigator.clipboard?.writeText(t).then(() => toast.success(msg));
  const pj = state.elegido;

  const genero = pj ? guessGenero(pj) : "mujer";
  const vozId = pj?.vozId ?? "calida";
  const talkReady = talkJobs.filter(j => j.status === "done" && j.result_url);

  return (
    <div className="max-w-5xl mx-auto space-y-6 py-2">
      <div>
        <p className="text-xs uppercase tracking-wider text-primary font-semibold">Crear · Vende sin mostrar tu cara</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground mt-1">Tu influencer IA</h1>
        <p className="text-[15px] text-muted-foreground mt-1.5 max-w-2xl">Elige o crea a tu influencer, dale una voz y hazlo hablar de «{profile.product}» en Reels, TikTok y Shorts. Tú publicas; él da la cara.</p>
      </div>

      <ol className="flex flex-wrap gap-2" aria-label="Pasos">
        {([[1, "Tu influencer", !!pj], [2, "Sus 10 guiones", !!state.guiones?.length], [3, "Su video hablando", talkReady.length > 0]] as const).map(([n, label, done]) => (
          <li key={n}>
            <button onClick={() => (n === 1 || pj) && setStep(n)} disabled={n !== 1 && !pj}
              className={`h-9 pl-1.5 pr-4 rounded-full border text-[13px] font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-50 ${step === n ? "bg-card border-foreground/15 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <span className={`w-6 h-6 rounded-full grid place-items-center text-[11px] ${step === n ? "bg-primary text-primary-foreground" : done ? "bg-success text-black" : "bg-secondary"}`}>
                {done ? <Check className="w-3.5 h-3.5" /> : n}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section key="s1" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {pj ? (
            <div className="grid md:grid-cols-[280px_minmax(0,1fr)] gap-4">
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="aspect-[9/16] bg-secondary/40 grid place-items-center">
                  {fotoUrl ? <img src={fotoUrl} alt={`Foto de ${pj.nombre}`} className="w-full h-full object-cover" />
                    : busy === "foto" ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    : <ImageIcon className="w-8 h-8 text-muted-foreground" />}
                </div>
                {state.foto && (
                  <button onClick={() => setStep(3)} disabled={busy !== ""} className="w-full h-11 border-t border-border text-[13px] font-semibold text-primary hover:bg-secondary/40 inline-flex items-center justify-center gap-2 disabled:opacity-50">
                    <Mic className="w-4 h-4" /> Hazlo hablar en video
                  </button>
                )}
                <button onClick={crearFoto} disabled={busy !== ""} className="w-full h-11 border-t border-border text-[13px] font-semibold text-foreground hover:bg-secondary/40 inline-flex items-center justify-center gap-2 disabled:opacity-50">
                  {busy === "foto" ? <Loader2 className="w-4 h-4 animate-spin" /> : state.foto ? <RefreshCw className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                  {state.foto ? "Otra foto" : "Crear su foto"} <span className="opacity-60 font-medium">· {imgM?.cost ?? CREDIT_COSTS.gen_ad_image} ⚡</span>
                </button>
                {usable("image").length > 0 && (
                  <div className="border-t border-border p-2">
                    <ModelPicker models={models} kinds={["image"]} value={imgModel} onChange={setImgModel} isAdmin={!!isAdmin} comunidad={comunidad} onUpsell={setUpsell} />
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-2xl font-semibold text-foreground">{pj.nombre}</p>
                    <p className="text-sm text-primary font-semibold">{pj.rol}</p>
                  </div>
                  <button onClick={() => save({ elegido: null })} className="text-[13px] text-muted-foreground hover:text-foreground">Cambiar</button>
                </div>
                {[["Su historia", pj.historia], ["Cómo habla", pj.voz], ["Lo que lo hace distinto", pj.gancho]].map(([k, v]) => (
                  <div key={k}><p className="text-[12px] text-muted-foreground">{k}</p><p className="text-[14px] text-foreground/90">{v}</p></div>
                ))}
                <div className="rounded-xl bg-background p-3.5 space-y-1.5">
                  <p className="text-[12px] text-muted-foreground">Bio para Instagram o TikTok</p>
                  <p className="text-[14px] text-foreground" data-ph-mask>{pj.bio}</p>
                  <button onClick={() => { copiar(pj.bio, "Bio copiada"); track("bio_copiada"); }} className="text-[12px] font-semibold text-primary inline-flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Copiar bio</button>
                </div>
                <p className="text-[12px] text-muted-foreground flex gap-2"><ShieldCheck className="w-4 h-4 shrink-0 text-success" /> Es un personaje, no un experto: nunca le pongas títulos, edades o resultados inventados. Instagram y TikTok piden marcar el contenido como hecho con IA; hazlo al publicar.</p>
                <div className="flex flex-wrap gap-2">
                  {state.foto && <button onClick={() => setStep(3)} className="h-11 px-5 rounded-full btn-primary-nova text-[14px] inline-flex items-center gap-2"><Mic className="w-4 h-4" /> Hazlo hablar en video</button>}
                  <button onClick={() => setStep(2)} className={`h-11 px-5 rounded-full text-[14px] inline-flex items-center gap-2 ${state.foto ? "border border-border font-semibold text-foreground hover:border-foreground/30" : "btn-primary-nova"}`}>Sus 10 guiones <ArrowRight className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div>
                  <p className="font-display text-lg font-semibold text-foreground">Elige uno de SUPERNOVA <span className="text-[12px] font-semibold text-success align-middle ml-1">Gratis</span></p>
                  <p className="text-sm text-muted-foreground">Listos para usar: con foto, historia, bio y voz. Todos hablan en español latino neutro.</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {STOCK_INFLUENCERS.map(s => (
                    <div key={s.id} className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col hover:border-foreground/25 transition-colors">
                      <div className="aspect-[4/5] bg-secondary/40">
                        <img src={s.foto} alt={`${s.personaje.nombre}, influencer IA de SUPERNOVA`} loading="lazy" className="w-full h-full object-cover object-top" />
                      </div>
                      <div className="p-3 flex-1 flex flex-col gap-1">
                        <p className="font-display text-[16px] font-semibold text-foreground">{s.personaje.nombre}</p>
                        <p className="text-[12px] text-muted-foreground">{s.genero === "mujer" ? (s.edad === "joven" ? "Mujer joven" : "Mujer mayor") : (s.edad === "joven" ? "Hombre joven" : "Hombre mayor")} · {s.pais}</p>
                        <p className="text-[12px] text-foreground/75 flex-1">{s.personaje.rol}</p>
                        <button onClick={() => void elegirStock(s)} disabled={!!stockBusy || busy !== ""}
                          className="mt-2 h-10 rounded-full border border-border text-[13px] font-semibold text-foreground hover:border-primary hover:text-primary inline-flex items-center justify-center gap-2 disabled:opacity-50">
                          {stockBusy === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Elegir a {s.personaje.nombre}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                <div>
                  <p className="font-display text-lg font-semibold text-foreground">O crea uno a tu medida</p>
                  <p className="text-sm text-muted-foreground">La IA te propone 3 personajes distintos, pensados para tu cliente y tu nicho. Luego creas su foto.</p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                  <label className="block flex-1 max-w-xs">
                    <span className="text-[12px] text-muted-foreground">¿Dónde vive tu cliente?</span>
                    <select value={country} onChange={e => setCountry(e.target.value as CountryCode)}
                      className="mt-1 w-full h-11 rounded-xl bg-background border border-border px-3 text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                      {(Object.keys(COUNTRIES) as CountryCode[]).map(cc => <option key={cc} value={cc}>{COUNTRIES[cc].name}</option>)}
                    </select>
                    <span className="block text-[11px] text-muted-foreground mt-1">Así sus ejemplos y su forma de hablar encajan con tu público.</span>
                  </label>
                  <button onClick={crearIdeas} disabled={busy !== "" || !!stockBusy} className="h-11 px-5 rounded-full btn-primary-nova text-[14px] inline-flex items-center gap-2 self-start sm:self-auto sm:mb-5">
                    {busy === "ideas" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {state.opciones?.length ? "Otras 3" : "Crear 3 personajes"} <span className="opacity-70 font-medium">· {ideasCost.cost} ⚡</span>
                  </button>
                </div>
              </div>
              {busy === "ideas" && <div className="grid md:grid-cols-3 gap-3">{[0, 1, 2].map(i => <div key={i} className="h-64 rounded-2xl bg-card border border-border animate-pulse" />)}</div>}
              {!!state.opciones?.length && busy !== "ideas" && (
                <div className="grid md:grid-cols-3 gap-3">
                  {state.opciones.map(p => (
                    <div key={p.nombre} className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-2 hover:border-foreground/25 transition-colors">
                      <p className="font-display text-xl font-semibold text-foreground">{p.nombre}</p>
                      <p className="text-[13px] text-primary font-semibold">{p.rol}</p>
                      <p className="text-[13px] text-muted-foreground flex-1">{p.gancho}</p>
                      <p className="text-[12px] text-foreground/70 italic">{p.aspecto}</p>
                      <button onClick={() => elegir(p)} className="mt-2 h-10 rounded-full border border-border text-[13px] font-semibold text-foreground hover:border-primary hover:text-primary">Elegir a {p.nombre}</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {step === 2 && pj && (
        <section key="s2" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="rounded-2xl border border-border bg-card p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div>
              <p className="font-display text-lg font-semibold text-foreground">10 guiones para {pj.nombre}</p>
              <p className="text-sm text-muted-foreground">Con ganchos de anuncios que llevan meses funcionando. Solo 1 de cada 3 vende directo: los demás dan valor.</p>
            </div>
            <button onClick={crearGuiones} disabled={busy !== ""} className="h-11 px-5 rounded-full btn-primary-nova text-[14px] inline-flex items-center gap-2 shrink-0">
              {busy === "guiones" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {state.guiones?.length ? "Otros 10" : "Escribir 10 guiones"} <span className="opacity-70 font-medium">· {guionesCost.cost} ⚡</span>
            </button>
          </div>
          {busy === "guiones" && <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-28 rounded-2xl bg-card border border-border animate-pulse" />)}</div>}
          {!!state.guiones?.length && busy !== "guiones" && (
            <div className="grid md:grid-cols-2 gap-3">
              {state.guiones.map((g, i) => (
                <div key={i} className="rounded-2xl border border-border bg-card p-5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12px] font-semibold text-muted-foreground">{i + 1}. {g.titulo}</p>
                    <button onClick={() => copiar(`${g.gancho}\n\n${g.guion}\n\n${g.cta}`, "Guion copiado")} aria-label="Copiar guion" className="text-muted-foreground hover:text-foreground"><Copy className="w-4 h-4" /></button>
                  </div>
                  <p className="font-display text-[16px] font-semibold text-foreground">«{g.gancho}»</p>
                  <p className="text-[14px] text-foreground/85 leading-relaxed">{g.guion}</p>
                  <p className="text-[12px] text-muted-foreground"><b className="text-foreground/80">Texto en pantalla:</b> {g.pantalla}</p>
                  <p className="text-[12px] text-muted-foreground"><b className="text-foreground/80">Cierre:</b> {g.cta}</p>
                  <button onClick={() => { setLine(lineFromGuion(g)); setStep(3); }} className="text-[12px] font-semibold text-primary inline-flex items-center gap-1"><Mic className="w-3.5 h-3.5" /> Que lo diga en video</button>
                </div>
              ))}
            </div>
          )}
          {!!state.guiones?.length && (
            <div className="rounded-2xl border border-border bg-card p-5 text-[14px] text-foreground/85 space-y-1.5">
              <p className="font-semibold text-foreground">Cómo publicarlos esta semana</p>
              <p>1. Crea la cuenta con el nombre y la bio de {pj.nombre}, y su foto de perfil.</p>
              <p>2. Toca «Que lo diga en video» en cualquier guion y {pj.nombre} lo dice a cámara. También puedes grabarlos con la foto en CapCut o Edits (gratis).</p>
              <p>3. Publica 1 o 2 al día. En 10 días mira cuál tuvo más vistas y guardados, y haz más de ese tipo.</p>
              <p className="text-[12px] text-muted-foreground pt-1">Consejo: prueba 2 o 3 personajes a la vez. En la prueba pública que estudiamos, el que parecía ganador no fue el que más creció.</p>
            </div>
          )}
          <button onClick={() => setStep(3)} className="h-11 px-5 rounded-full btn-primary-nova text-[14px] inline-flex items-center gap-2"><Mic className="w-4 h-4" /> Siguiente: su video hablando</button>
        </section>
      )}

      {step === 3 && pj && ugcOpen === null && (
        <div className="h-64 rounded-2xl border border-border bg-card animate-pulse" />
      )}

      {step === 3 && pj && ugcOpen && (
        <section key="s3v" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {!state.foto ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-3">
              <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground" />
              <p className="text-foreground font-semibold">Primero crea la foto de {pj.nombre}</p>
              <p className="text-sm text-muted-foreground">El video sale de esa foto: así tu influencer se ve igual en todos tus videos.</p>
              <button onClick={() => setStep(1)} className="h-11 px-5 rounded-full btn-primary-nova text-[14px] inline-flex items-center gap-2">Crear su foto <ArrowRight className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="grid md:grid-cols-[200px_minmax(0,1fr)] gap-4">
              <div className="rounded-2xl border border-border bg-card overflow-hidden aspect-[9/16] max-md:max-w-[200px]">
                {fotoUrl ? <img src={fotoUrl} alt={`Foto de ${pj.nombre}`} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-secondary/40" />}
              </div>
              <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
                <div>
                  <p className="font-display text-lg font-semibold text-foreground">Haz que {pj.nombre} hable</p>
                  <p className="text-sm text-muted-foreground">Video vertical de 10 segundos, con su voz y los labios sincronizados.</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[13px] font-semibold text-foreground">1 · Qué dice</p>
                  <textarea value={line} onChange={e => setLine(e.target.value.slice(0, SPOKEN_MAX))} rows={3} disabled={talk.busy}
                    placeholder={`Ej.: ¿Te cuesta empezar? Mira ${profile.product}. Te dejo el enlace abajo.`}
                    className="w-full rounded-xl bg-background border border-border px-3.5 py-2.5 text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground mr-1">{line.length}/{SPOKEN_MAX} · unas 25 palabras caben en 10 s</span>
                    {state.guiones?.slice(0, 6).map((g, i) => (
                      <button key={i} onClick={() => setLine(lineFromGuion(g))} disabled={talk.busy}
                        className="text-[12px] rounded-full border border-border px-2.5 py-1 text-foreground/80 hover:border-primary hover:text-primary">Guion {i + 1}</button>
                    ))}
                    {!state.guiones?.length && (
                      <button onClick={() => setStep(2)} className="text-[12px] font-semibold text-primary">¿Sin ideas? Escribe sus 10 guiones</button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-foreground">2 · Su voz</p>
                    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-background" role="radiogroup" aria-label="Voz de mujer u hombre">
                      {(["mujer", "hombre"] as const).map(g => (
                        <button key={g} role="radio" aria-checked={genero === g} onClick={() => setVoz({ genero: g })} disabled={talk.busy}
                          className={`h-8 px-3 rounded-lg text-[12px] font-semibold ${genero === g ? "bg-secondary text-foreground" : "text-muted-foreground"}`}>{g === "mujer" ? "Voz de mujer" : "Voz de hombre"}</button>
                      ))}
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Estilo de voz">
                    {VOICES.map(v => (
                      <button key={v.id} role="radio" aria-checked={vozId === v.id} onClick={() => setVoz({ vozId: v.id })} disabled={talk.busy}
                        className={`text-left rounded-xl border p-3 transition-colors ${vozId === v.id ? "border-primary bg-primary/[0.06]" : "border-border hover:border-foreground/30"}`}>
                        <p className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">{vozId === v.id && <Check className="w-3.5 h-3.5 text-primary" />}{v.label}</p>
                        <p className="text-[12px] text-muted-foreground">{v.desc}</p>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">La IA crea la voz junto con el video, a partir del estilo que elijas. Puede variar un poco de un video a otro; si no te convence, prueba otro estilo.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button onClick={() => void crearVideoHablando()} disabled={talk.busy || line.trim().length < 4}
                    className="h-12 px-6 rounded-full btn-primary-nova text-[15px] inline-flex items-center gap-2 disabled:opacity-60">
                    {talk.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                    {talk.busy ? (typeof talk.progress === "number" && talk.progress > 0 ? `Creando… ${talk.progress} %` : "Creando… 1 a 3 min") : `Crear video que habla · ${TALK_COST} ⚡`}
                  </button>
                  {talk.busy && <span className="text-[12px] text-muted-foreground">Puedes seguir usando la app; aparecerá abajo.</span>}
                </div>
                {talk.error && <p className="text-[13px] text-destructive">{talk.error}</p>}
                <p className="text-[12px] text-muted-foreground flex gap-2"><ShieldCheck className="w-4 h-4 shrink-0 text-success" /> Si el video falla, te devolvemos los créditos solos. Tu influencer presenta o explica, nunca finge ser cliente. Márcalo como contenido hecho con IA al publicarlo.</p>
              </div>
            </div>
          )}
          {!!talkJobs.length && (
            <div className="space-y-2">
              <p className="text-[12px] tracking-widest font-semibold text-muted-foreground">SUS VIDEOS</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {talkJobs.map(j => (
                  <div key={j.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="aspect-[9/16] bg-black grid place-items-center">
                      {j.status === "done" && j.result_url
                        ? <video src={j.result_url} controls playsInline className="w-full h-full object-contain" />
                        : j.status === "failed"
                          ? <p className="text-[12px] text-muted-foreground px-3 text-center">No se pudo crear. Te devolvimos los créditos.</p>
                          : <div className="text-center space-y-2"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /><p className="text-[12px] text-muted-foreground">Creando… 1 a 3 min</p></div>}
                    </div>
                    {j.status === "done" && j.result_url && (
                      <button onClick={() => void downloadVideo(j.result_url!, `${pj.nombre.toLowerCase().replace(/\W+/g, "-")}-${j.id.slice(0, 6)}.mp4`)}
                        className="h-10 border-t border-border text-[13px] font-semibold text-foreground inline-flex w-full items-center justify-center gap-2 hover:bg-secondary/40"><Download className="w-4 h-4" /> Descargar</button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Descárgalos hoy: el enlace del video dura 24 horas.</p>
            </div>
          )}
        </section>
      )}

      {step === 3 && ugcOpen === false && (
        <section key="s3" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="rounded-2xl border border-primary/30 bg-primary/[0.06] p-6 space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl bg-primary/15 text-primary grid place-items-center"><Film className="w-5 h-5" /></span>
              <div>
                <p className="text-[11px] font-bold tracking-widest text-primary">PRONTO</p>
                <p className="font-display text-xl font-semibold text-foreground">Tu personaje en video, sin salir de SUPERNOVA</p>
              </div>
            </div>
            <p className="text-[14px] text-foreground/85 max-w-2xl">Eliges un guion y la app hace el video vertical con la foto de tu personaje, listo para subir. Con los mejores modelos de video del mercado, sin pagar otra suscripción: pagas solo los videos que haces, con tus créditos, y los créditos que compras no caducan.</p>
            {PRESALE_URL && PRESALE_DEADLINE ? (
              <div className="rounded-xl bg-card border border-border p-4 space-y-2">
                <p className="font-semibold text-foreground">Reserva tus créditos de video y recibe 50 % más al abrir</p>
                <p className="text-[13px] text-muted-foreground">Pagas hoy y, el día que abramos los videos, te cargamos tus créditos con un 50 % extra. Si no abrimos antes del {PRESALE_DEADLINE}, te devolvemos el 100 % de lo que pagaste.</p>
                <a href={PRESALE_URL} target="_blank" rel="noopener noreferrer" onClick={() => track("video_reserva_click")}
                  className="inline-flex items-center gap-2 h-11 px-5 rounded-full btn-primary-nova text-[14px]">Reservar mis créditos de video <ArrowRight className="w-4 h-4" /></a>
              </div>
            ) : (
              <button onClick={async () => { if (await save({ avisame: true })) { track("video_avisame"); toast.success("Anotado: te avisamos apenas abramos los videos."); } else toast.error("No se pudo anotar. Intenta de nuevo."); }}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-full border border-border bg-card text-[14px] font-semibold text-foreground"><Lock className="w-4 h-4" /> Avísame cuando abra</button>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
            <p className="font-semibold text-foreground">¿No quieres esperar?</p>
            <p className="text-[14px] text-foreground/85">Tus guiones ya sirven: grábalos con la foto de tu personaje en CapCut o Edits (gratis). Si quieres videos con IA desde hoy, Higgsfield es la herramienta que usamos y recomendamos: sube la foto de tu personaje, pega un guion y te da el video vertical.</p>
            <a href={HIGGSFIELD_URL} target="_blank" rel="noopener noreferrer sponsored" onClick={() => track("higgsfield_click")}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-border text-[13px] font-semibold text-foreground hover:border-foreground/30">Abrir Higgsfield <ArrowRight className="w-4 h-4" /></a>
            <p className="text-[11px] text-muted-foreground">{AFFILIATE_NOTE}</p>
          </div>
        </section>
      )}
      {upsell && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setUpsell(null)}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="upsell-title"
            className="w-full max-w-md rounded-2xl border border-primary/30 bg-card p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between">
              <span className="w-11 h-11 rounded-xl bg-primary/15 text-primary grid place-items-center"><Crown className="w-5 h-5" /></span>
              <button onClick={() => setUpsell(null)} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <h2 id="upsell-title" className="font-display text-xl font-semibold text-foreground">{upsell.label} es de la Comunidad</h2>
              <p className="text-sm text-muted-foreground mt-1">Los modelos más avanzados de video e imagen vienen con la {PLANS.comunidad.name}: todo lo de PRO, la comunidad privada y llamadas en vivo.</p>
            </div>
            <ul className="space-y-1.5 text-[14px] text-foreground/90">
              {["Kling 3.0, Veo de Google, Wan 2.6 y más", "Comunidad en Skool con apoyo diario", "Llamadas en vivo para revisar tu avance"].map(t => (
                <li key={t} className="flex gap-2"><Check className="w-4 h-4 text-success shrink-0 mt-0.5" />{t}</li>
              ))}
            </ul>
            <a href={checkoutUrl("comunidad", user?.email ?? undefined)} target="_blank" rel="noopener noreferrer" onClick={() => track("comunidad_upsell_click", { modelo: upsell.id })}
              className="w-full h-12 rounded-full btn-primary-nova text-[15px] inline-flex items-center justify-center gap-2">Unirme a la Comunidad · {formatUsd(PLANS.comunidad.price)}/mes <ArrowRight className="w-4 h-4" /></a>
            <p className="text-[11px] text-muted-foreground text-center">Usa el mismo correo de tu cuenta: tu acceso se activa solo. Los créditos se siguen usando igual.</p>
          </div>
        </div>
      )}
    </div>
  );
}
