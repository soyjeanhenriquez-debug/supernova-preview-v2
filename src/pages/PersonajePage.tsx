import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Copy, Crown, Download, Film, ImageIcon, Loader2, Lock, RefreshCw, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessProfile, profileReady } from "@/lib/businessProfile";
import { useCredits, generatorCost, CREDIT_COSTS } from "@/hooks/useCredits";
import { fnHeaders, fnErrorMessage, readBilling } from "@/lib/fnAuth";
import { track } from "@/lib/analytics";
import { AFFILIATE_NOTE, HIGGSFIELD_URL } from "@/lib/partners";
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
 * Etapa 5 · "Vende sin mostrar tu cara": un personaje creado con IA cuenta tu oferta gemela en
 * Reels/TikTok/Shorts. 1) Personaje (3 propuestas + foto) · 2) 10 guiones con ganchos probados ·
 * 3) Videos (PRONTO: fal.ai, base en supabase/functions/video-generate). Cobra el servidor con los
 * precios de siempre (gen_light, gen_medium, gen_ad_image). Reglas de honestidad: src/lib/personaje.ts.
 */
const PRESALE_URL = import.meta.env.VITE_VIDEO_PRESALE_URL as string | undefined;
const PRESALE_DEADLINE = import.meta.env.VITE_VIDEO_PRESALE_DEADLINE as string | undefined; // "30 de noviembre de 2026"

type Step = 1 | 2 | 3;
type Job = { id: string; status: "queued" | "running" | "done" | "failed"; prompt: string; result_url: string | null; model: string; created_at: string };
const DEFAULT_VIDEO_PROMPT = "La persona de la foto mira a cámara y habla con naturalidad, con gestos suaves de las manos. Luz natural, cámara estable, estilo video vertical para redes sociales.";

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

export function PersonajePage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { user } = useAuth();
  const { profile, savePatch, loaded, productId } = useBusinessProfile();
  const { applyServerCharge, canAfford } = useCredits();
  const state: PersonajeState = profile.journey?.personaje ?? {};
  const [step, setStep] = useState<Step>(state.guiones?.length ? 2 : 1);
  const [country, setCountry] = useState<CountryCode>(profile.journey?.gemelo?.country ?? "RD");
  const [busy, setBusy] = useState<"" | "ideas" | "foto" | "guiones">("");
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  // Catálogo de modelos (fal.ai): qué se ve y a qué precio. El servidor decide lo que se puede usar.
  const { isAdmin } = useIsAdmin();
  const [models, setModels] = useState<MediaModel[]>([]);
  const [comunidad, setComunidad] = useState(false);
  const [imgModel, setImgModel] = useState<string | null>(null);
  const [vidModel, setVidModel] = useState<string | null>(null);
  const [upsell, setUpsell] = useState<MediaModel | null>(null);
  const [vPrompt, setVPrompt] = useState(DEFAULT_VIDEO_PROMPT);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [videoBusy, setVideoBusy] = useState(false);

  useEffect(() => { loadMediaModels().then(setModels); }, []);
  useEffect(() => { if (user) hasComunidad(user.id, user.email).then(setComunidad); }, [user]);
  const opts = useMemo(() => ({ isAdmin: !!isAdmin, comunidad }), [isAdmin, comunidad]);
  const usable = useCallback((kind: MediaModel["kind"]) => models.filter(m => m.kind === kind && accessOf(m, opts) === "ok"), [models, opts]);
  // Modelo por defecto: el recomendado que se pueda usar, o el primero.
  useEffect(() => {
    const im = usable("image"); if (!imgModel && im.length) setImgModel((im.find(m => m.recommended) ?? im[0]).id);
    const vm = usable("video"); if (!vidModel && vm.length) setVidModel((vm.find(m => m.recommended) ?? vm[0]).id);
  }, [usable, imgModel, vidModel]);
  const imgM = models.find(m => m.id === imgModel && accessOf(m, opts) === "ok") ?? null;
  const vidM = models.find(m => m.id === vidModel && accessOf(m, opts) === "ok") ?? null;
  const videosOpen = usable("video").length > 0;

  const loadJobs = useCallback(async () => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from("video_jobs").select("id,status,prompt,result_url,model,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(6);
    setJobs((data ?? []) as Job[]);
  }, [user]);
  useEffect(() => { if (step === 3 && videosOpen) void loadJobs(); }, [step, videosOpen, loadJobs]);
  // Mientras haya videos en proceso, se pregunta cada 7 s (el servidor consulta a fal y reembolsa si falla).
  useEffect(() => {
    const pending = jobs.filter(j => j.status === "running" || j.status === "queued");
    if (!pending.length) return;
    const t = setTimeout(async () => {
      for (const j of pending) {
        const { data } = await supabase.functions.invoke("video-generate", { body: { action: "status", job_id: j.id } });
        if (data?.error && data?.job?.status === "failed") toast.error(data.error);
      }
      void loadJobs();
    }, 7000);
    return () => clearTimeout(t);
  }, [jobs, loadJobs]);

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

  const crearVideo = async () => {
    if (!vidM || !state.foto) return;
    if (!vPrompt.trim()) { toast.error("Escribe qué pasa en el video."); return; }
    setVideoBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("video-generate", { body: { model_id: vidM.id, prompt: vPrompt.trim(), image_path: state.foto, product_id: productId } });
      if (error || !data?.job) {
        const body = await (error as { context?: Response } | null)?.context?.json?.().catch(() => null);
        if (body?.code === "comunidad_required") { setUpsell(vidM); return; }
        throw new Error(body?.error || data?.error || "No se pudo crear el video. No se te cobró.");
      }
      if (data.billing) applyServerCharge("gen_media", data.billing, `Video · ${vidM.label}`);
      track("video_generado", { modelo: vidM.id });
      toast.success("Tu video se está creando. Tarda de 1 a 5 minutos: puedes seguir usando la app.");
      await loadJobs();
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo crear el video."); }
    finally { setVideoBusy(false); }
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

  return (
    <div className="max-w-5xl mx-auto space-y-6 py-2">
      <div>
        <p className="text-xs uppercase tracking-wider text-primary font-semibold">Mi negocio · Etapa 5 · Vender</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground mt-1">Vende sin mostrar tu cara</h1>
        <p className="text-[15px] text-muted-foreground mt-1.5 max-w-2xl">Un personaje creado con IA cuenta «{profile.product}» en Reels, TikTok y Shorts. Tú publicas; él da la cara.</p>
      </div>

      <ol className="flex flex-wrap gap-2" aria-label="Pasos">
        {([[1, "Tu personaje", !!pj], [2, "Tus 10 guiones", !!state.guiones?.length], [3, "Tus videos", false]] as const).map(([n, label, done]) => (
          <li key={n}>
            <button onClick={() => (n === 1 || pj) && setStep(n)} disabled={n !== 1 && !pj}
              className={`h-9 pl-1.5 pr-4 rounded-full border text-[13px] font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-50 ${step === n ? "bg-card border-foreground/15 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <span className={`w-6 h-6 rounded-full grid place-items-center text-[11px] ${step === n ? "bg-primary text-primary-foreground" : done ? "bg-success text-black" : "bg-secondary"}`}>
                {done ? <Check className="w-3.5 h-3.5" /> : n}
              </span>
              {label}{n === 3 && <span className="text-[10px] font-bold text-primary">PRONTO</span>}
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
                <button onClick={() => setStep(2)} className="h-11 px-5 rounded-full btn-primary-nova text-[14px] inline-flex items-center gap-2">Siguiente: sus 10 guiones <ArrowRight className="w-4 h-4" /></button>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-border bg-card p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <div>
                  <p className="font-display text-lg font-semibold text-foreground">Te proponemos 3 personajes</p>
                  <p className="text-sm text-muted-foreground">Distintos entre sí, pensados para tu cliente y para destacar en tu nicho.</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-background" role="radiogroup" aria-label="País">
                    {(Object.keys(COUNTRIES) as CountryCode[]).map(cc => (
                      <button key={cc} role="radio" aria-checked={country === cc} onClick={() => setCountry(cc)}
                        className={`h-9 px-3 rounded-lg text-[13px] font-bold ${country === cc ? "bg-secondary text-foreground" : "text-muted-foreground"}`}>{cc}</button>
                    ))}
                  </div>
                  <button onClick={crearIdeas} disabled={busy !== ""} className="h-11 px-5 rounded-full btn-primary-nova text-[14px] inline-flex items-center gap-2">
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
                </div>
              ))}
            </div>
          )}
          {!!state.guiones?.length && (
            <div className="rounded-2xl border border-border bg-card p-5 text-[14px] text-foreground/85 space-y-1.5">
              <p className="font-semibold text-foreground">Cómo publicarlos esta semana</p>
              <p>1. Crea la cuenta con el nombre y la bio de {pj.nombre}, y su foto de perfil.</p>
              <p>2. Graba cada guion con la foto y la voz de la app de tu celular (CapCut o Edits), o espera los videos automáticos.</p>
              <p>3. Publica 1 o 2 al día. En 10 días mira cuál tuvo más vistas y guardados, y haz más de ese tipo.</p>
              <p className="text-[12px] text-muted-foreground pt-1">Consejo: prueba 2 o 3 personajes a la vez. En la prueba pública que estudiamos, el que parecía ganador no fue el que más creció.</p>
            </div>
          )}
          <button onClick={() => setStep(3)} className="h-11 px-5 rounded-full border border-border text-[14px] font-semibold text-foreground inline-flex items-center gap-2 hover:border-foreground/30">Ver: videos automáticos <ArrowRight className="w-4 h-4" /></button>
        </section>
      )}

      {step === 3 && videosOpen && pj && (
        <section key="s3v" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {!state.foto ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-3">
              <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground" />
              <p className="text-foreground font-semibold">Primero crea la foto de {pj.nombre}</p>
              <p className="text-sm text-muted-foreground">El video sale de esa foto: así tu personaje se ve igual en todos tus videos.</p>
              <button onClick={() => setStep(1)} className="h-11 px-5 rounded-full btn-primary-nova text-[14px] inline-flex items-center gap-2">Crear su foto <ArrowRight className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="grid md:grid-cols-[180px_minmax(0,1fr)] gap-4">
              <div className="rounded-2xl border border-border bg-card overflow-hidden aspect-[9/16]">
                {fotoUrl ? <img src={fotoUrl} alt={`Foto de ${pj.nombre}`} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-secondary/40" />}
              </div>
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <p className="font-display text-lg font-semibold text-foreground">Crea un video de {pj.nombre}</p>
                <label className="block">
                  <span className="text-[12px] text-muted-foreground">Qué pasa en el video (movimiento, gestos, lugar)</span>
                  <textarea value={vPrompt} onChange={e => setVPrompt(e.target.value)} rows={3} maxLength={1800}
                    className="mt-1 w-full rounded-xl bg-background border border-border px-3.5 py-2.5 text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                </label>
                {!!state.guiones?.length && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[12px] text-muted-foreground self-center">Usar escena de un guion:</span>
                    {state.guiones.slice(0, 5).map((g, i) => (
                      <button key={i} onClick={() => setVPrompt(`${DEFAULT_VIDEO_PROMPT} Tema del video: ${g.pantalla || g.titulo}.`)}
                        className="text-[12px] rounded-full border border-border px-2.5 py-1 text-foreground/80 hover:border-primary hover:text-primary">{i + 1}. {g.titulo.slice(0, 28)}</button>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <ModelPicker models={models} kinds={["video", "avatar"]} value={vidModel} onChange={setVidModel} isAdmin={!!isAdmin} comunidad={comunidad} onUpsell={setUpsell} />
                  <button onClick={crearVideo} disabled={videoBusy || !vidM} className="h-11 px-5 rounded-full btn-primary-nova text-[14px] inline-flex items-center gap-2">
                    {videoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />} Generar video {vidM?.cost != null && <span className="opacity-70 font-medium">· {vidM.cost} ⚡</span>}
                  </button>
                </div>
                <p className="text-[12px] text-muted-foreground flex gap-2"><ShieldCheck className="w-4 h-4 shrink-0 text-success" /> Si el video falla, te devolvemos los créditos solos. Recuerda marcarlo como contenido hecho con IA al publicarlo.</p>
              </div>
            </div>
          )}
          {!!jobs.length && (
            <div className="space-y-2">
              <p className="text-[12px] tracking-widest font-semibold text-muted-foreground">TUS VIDEOS</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {jobs.map(j => (
                  <div key={j.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="aspect-[9/16] bg-secondary/40 grid place-items-center">
                      {j.status === "done" && j.result_url
                        ? <video src={j.result_url} controls playsInline className="w-full h-full object-cover" />
                        : j.status === "failed"
                          ? <p className="text-[12px] text-muted-foreground px-3 text-center">No se pudo crear. Te devolvimos los créditos.</p>
                          : <div className="text-center space-y-2"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /><p className="text-[12px] text-muted-foreground">Creando… 1 a 5 min</p></div>}
                    </div>
                    {j.status === "done" && j.result_url && (
                      <a href={j.result_url} target="_blank" rel="noopener noreferrer" download className="h-10 border-t border-border text-[13px] font-semibold text-foreground inline-flex w-full items-center justify-center gap-2 hover:bg-secondary/40"><Download className="w-4 h-4" /> Descargar</a>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Descarga tus videos: el enlace del proveedor puede vencer con el tiempo.</p>
            </div>
          )}
        </section>
      )}

      {step === 3 && !videosOpen && (
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
