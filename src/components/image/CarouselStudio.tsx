import { useCreditsLeft } from "@/hooks/useCreditsLeft";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, Download, ImagePlus, Loader2, Plus, Sparkles, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generatorCost, useCredits, CREDIT_COSTS } from "@/hooks/useCredits";
import { invokeErrorMessage } from "@/lib/fnAuth";
import { runGenerator } from "@/lib/generatorStream";
import { RULES, type Brief } from "@/lib/imagePrompts";
import { toWebp } from "@/lib/brandKit";
import {
  ADMIN_DESIGN, BRAND_COLORS, DEFAULT_DESIGN, DEFAULT_SLIDES, GENERATOR_ID, GOAL_INFO, KIND_LABEL, PUBLISH_STEPS, SLIDE_COUNTS, STYLES,
  carouselRequest, cleanHandle, coverCheck, draftCarousel, parseCarousel, posterPrompt, retone, slideTwoScore, storyTest, withCover,
  type CarouselDesign, type CarouselDraft, type CarouselGoal, type Item, type Slide, type StyleId,
} from "@/lib/carousel";
import { FONTS, fontEmbedCss, loadStyleFonts, slideToBlob } from "@/lib/carouselTheme";
import { SLIDE_W, SlideView, slideH } from "@/components/image/carousel/SlideView";
import { loadDesign, loadDraft, saveDesign, saveDraft } from "@/lib/carouselStore";

/**
 * Carrusel (05-oct-2026, v2): la IA escribe el texto con los 5 tiempos (Gancho → Promesa → Tirón →
 * Valor → Llamada) y 3 portadas; cada lámina es una página diseñada (portada, problema, solución,
 * tarjetas, pasos, frase, llamada) con un sistema fijo que sale de UN color de marca, y se descarga
 * en PNG con las fuentes reales.
 *
 * Cobro: el texto lo escribe el generador "carrusel-copy" de ai-chat (nivel ligero); el servidor cobra
 * ANTES y devuelve si la IA falla. Editar, cambiar portada o diseño y descargar es gratis. Con
 * `autostart` (el botón que trajo la idea ya mostraba el costo) se escribe solo, una vez.
 */
type Seed = { hook?: string; angle?: string; evidence?: string; title?: string; autostart?: boolean } | null;

const SYSTEM = `Eres el estratega de carruseles de SUPERNOVA para emprendedores latinos que empiezan de cero.
Sabes que un carrusel no falla por la idea: falla porque la portada no detiene el scroll. Los reels hacen que te encuentren; los carruseles hacen que te recuerden, te guarden y te compren.
Escribes con 5 tiempos: Gancho, Promesa, Tirón, Valor y Llamada. Español neutro latinoamericano, de tú, frases cortas, sin jerga (si usas un término técnico, lo explicas en pocas palabras).
Respondes SOLO con el JSON que se te pide, sin texto alrededor y sin emojis.`;

const THUMB = 250;

/**
 * IAs de imagen para la portada póster, todas por APIMart (decisión de Jean, 05-oct-2026). La persona
 * elige; el servidor (generate-ad-creative) solo acepta estas 3 y cobra el precio de cada una.
 */
type PosterModel = { id: "gpt-image-2" | "nano-banana-2" | "nano-banana-pro"; label: string; action: "gen_ad_image" | "gen_ad_image_nb2" | "gen_ad_image_nbpro"; note: string };
const POSTER_MODELS: PosterModel[] = [
  { id: "gpt-image-2", label: "GPT Image 2", action: "gen_ad_image", note: "La que usan los mejores carruseles. Escribe muy bien el texto." },
  { id: "nano-banana-2", label: "Nano Banana 2", action: "gen_ad_image_nb2", note: "Fotos muy naturales y buen texto." },
  { id: "nano-banana-pro", label: "Nano Banana Pro", action: "gen_ad_image_nbpro", note: "La mejor calidad de foto, de cine." },
];

/** Lámina a escala dentro de una caja del ancho dado. */
function Scaled({ width, aspect, children }: { width: number; aspect: "4:5" | "1:1"; children: React.ReactNode }) {
  const s = width / SLIDE_W;
  return (
    <div style={{ width, height: slideH(aspect) * s, overflow: "hidden", position: "relative" }}>
      <div style={{ transform: `scale(${s})`, transformOrigin: "top left", position: "absolute", top: 0, left: 0 }}>{children}</div>
    </div>
  );
}

export function CarouselStudio({ brief, seed, uid, productId, folder, kitColors, kitRefs = [], onAutostart }: {
  brief: Brief; seed: Seed; uid: string | null; productId: string | null; folder: string | null; kitColors: string[];
  /** Fotos del producto o logo del kit de marca (rutas propias de "creativos"). */
  kitRefs?: string[];
  /** Avisa que la semilla ya se usó, para no volver a cobrar si la pantalla se vuelve a montar. */
  onAutostart?: () => void;
}) {
  const { applyServerCharge, balance } = useCredits();
  const { label: creditsLeft, isAdmin } = useCreditsLeft();
  const [posterModel, setPosterModel] = useState<PosterModel["id"]>("gpt-image-2");
  const [posterBusy, setPosterBusy] = useState(false);
  const [useRefs, setUseRefs] = useState(true);
  const { action, cost } = generatorCost(GENERATOR_ID);
  const [goal, setGoal] = useState<CarouselGoal>("vender");
  const [source, setSource] = useState("");
  const [count, setCount] = useState<number>(DEFAULT_SLIDES);
  const [aspect, setAspect] = useState<"4:5" | "1:1">("4:5");
  const [design, setDesign] = useState<CarouselDesign>(DEFAULT_DESIGN);
  const [designOpen, setDesignOpen] = useState(false);
  const [draft, setDraft] = useState<CarouselDraft | null>(null);
  const [writing, setWriting] = useState(false);
  const [sel, setSel] = useState(0);
  const [, setFontsTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [likes, setLikes] = useState({ cover: "", two: "" });
  const [past, setPast] = useState<string[]>([]);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const autoRan = useRef(false);
  const designLoaded = useRef(false);

  const preview = useMemo(() => draft ?? draftCarousel(brief, count, seed?.hook, design.start), [draft, brief, count, seed?.hook, design.start]);
  const isSample = !draft;
  const slides = preview.slides;

  // Sistema de diseño y último borrador del producto.
  useEffect(() => {
    if (!uid || !productId) return;
    let alive = true;
    void loadDesign(uid, productId).then(d => {
      if (!alive) return;
      designLoaded.current = true;
      if (d) setDesign(d);
      else if (isAdmin) setDesign(ADMIN_DESIGN);
      else { setDesignOpen(true); if (kitColors[0]) setDesign(x => ({ ...x, brand: kitColors[0] })); }
    });
    const saved = loadDraft(uid, productId);
    if (saved && saved.slides.every(s => typeof s.kind === "string" && s.kind !== ("frase" as string))) {
      const cover = saved.slides[0];
      // La URL de la portada póster vence: se vuelve a firmar desde su ruta.
      if (cover?.imagePath) {
        void supabase.storage.from("creativos").createSignedUrl(cover.imagePath, 3600).then(({ data }) => {
          if (alive) setDraft({ ...saved, slides: [{ ...cover, image: data?.signedUrl }, ...saved.slides.slice(1)] });
        });
      }
      setDraft(saved); setCount(saved.slides.length);
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, productId]);

  useEffect(() => {
    if (!uid || !productId || !designLoaded.current) return;
    const t = setTimeout(() => void saveDesign(uid, productId, design), 600);
    return () => clearTimeout(t);
  }, [design, uid, productId]);
  useEffect(() => { if (uid && productId && draft) saveDraft(uid, productId, draft); }, [draft, uid, productId]);
  useEffect(() => { let alive = true; void loadStyleFonts(design.style).then(() => { if (alive) setFontsTick(n => n + 1); }); return () => { alive = false; }; }, [design.style]);

  // Prueba de la cuadrícula: portadas de tus carruseles anteriores.
  const loadPast = async () => {
    if (!folder) return;
    const { data } = await supabase.storage.from("creativos").list(folder, { limit: 8, search: "carrusel-s1", sortBy: { column: "created_at", order: "desc" } });
    const names = (data ?? []).filter(f => f.name.endsWith("-carrusel-s1.webp")).map(f => `${folder}/${f.name}`);
    if (!names.length) { setPast([]); return; }
    const { data: signed } = await supabase.storage.from("creativos").createSignedUrls(names, 3600);
    setPast((signed ?? []).map(s => s.signedUrl).filter(Boolean) as string[]);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadPast(); }, [folder]);

  const write = async () => {
    if (writing) return;
    if (goal === "texto" && source.trim().length < 80) { toast("Pega tu texto (mínimo unas líneas) para convertirlo en carrusel."); return; }
    if (balance < cost) { toast.error(`Te faltan créditos: esto cuesta ${cost}`, { description: "Recarga créditos para escribir tu carrusel." }); return; }
    setWriting(true);
    const label = `Carrusel · ${seed?.title || brief.product}`;
    try {
      const text = await runGenerator({
        id: GENERATOR_ID, title: label, system: SYSTEM,
        prompt: carouselRequest({ goal, brief, slides: count, source: goal === "texto" ? source : undefined, hook: seed?.hook, angle: seed?.angle, evidence: seed?.evidence, handle: design.handle }),
        onCharge: b => applyServerCharge(action, b, label),
      });
      const parsed = parseCarousel(text, count, design.start);
      if (!parsed) throw new Error("La IA respondió en un formato raro. Toca de nuevo: si vuelve a pasar, escríbenos y te devolvemos los créditos.");
      setDraft(parsed); setSel(0);
      toast.success("Tu carrusel está listo", { description: "Elige la portada y toca cualquier lámina para cambiar el texto." });
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo escribir el carrusel.");
    } finally { setWriting(false); }
  };

  useEffect(() => {
    if (autoRan.current || !seed?.autostart || !uid || !productId) return;
    autoRan.current = true;
    onAutostart?.();
    void write();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, uid, productId]);

  const setSlides = (fn: (s: Slide[]) => Slide[]) => { const base = draft ?? preview; setDraft({ ...base, slides: fn(base.slides) }); };
  const editSlide = (i: number, patch: Partial<Slide>) => setSlides(list => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const editItem = (i: number, k: number, patch: Partial<Item>) => setSlides(list => list.map((s, j) => (j === i ? { ...s, items: s.items.map((it, m) => (m === k ? { ...it, ...patch } : it)) } : s)));
  const setStart = (start: "claro" | "oscuro") => { setDesign(d => ({ ...d, start })); if (draft) setDraft({ ...draft, slides: retone(draft.slides, start) }); };

  const makePoster = async () => {
    const m = POSTER_MODELS.find(x => x.id === posterModel) ?? POSTER_MODELS[0];
    const price = CREDIT_COSTS[m.action];
    if (posterBusy) return;
    if (balance < price) { toast.error(`Te faltan créditos: esto cuesta ${price}`); return; }
    const refs = useRefs ? kitRefs : [];
    const prompt = posterPrompt({ cover: slides[0], scene: preview.scene, design, brief, aspect, hasRefs: refs.length > 0, rules: RULES });
    setPosterBusy(true);
    try {
      const body: Record<string, unknown> = { prompt, aspectRatio: aspect, model: m.id };
      if (refs.length) body.reference_paths = refs;
      const { data, error } = await supabase.functions.invoke("generate-ad-creative", { body });
      if (error || !data?.image) throw new Error(error ? await invokeErrorMessage(error, "No se pudo crear la portada. No se te cobró.") : (data?.error || "No se pudo crear la portada. No se te cobró."));
      if (data.billing) applyServerCharge(m.action, data.billing, `Carrusel · portada ${m.label}`);
      const blob = await toWebp(data.image as string, 1350);
      let image = URL.createObjectURL(blob);
      let imagePath: string | undefined;
      if (folder) {
        const p = `${folder}/${Date.now()}-carrusel-poster.webp`;
        const up = await supabase.storage.from("creativos").upload(p, blob, { contentType: "image/webp", upsert: false });
        if (!up.error) {
          imagePath = p;
          const { data: s2 } = await supabase.storage.from("creativos").createSignedUrl(p, 3600);
          if (s2?.signedUrl) { URL.revokeObjectURL(image); image = s2.signedUrl; }
        }
      }
      editSlide(0, { image, imagePath });
      setSel(0);
      toast.success("Portada póster lista", { description: "Revisa que el titular diga exactamente lo mismo. Si no te convence, crea otra o vuelve a la portada diseñada." });
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo crear la portada.");
    } finally { setPosterBusy(false); }
  };

  const downloadAll = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const fontEmbedCSS = await fontEmbedCss(design.style).catch(() => "");
      const stamp = Date.now();
      const H = slideH(aspect);
      for (let i = 0; i < slides.length; i++) {
        const n = nodes.current[i];
        if (!n) continue;
        const png = await slideToBlob(n, SLIDE_W, H, fontEmbedCSS);
        const url = URL.createObjectURL(png);
        const a = document.createElement("a");
        a.href = url; a.download = `carrusel-${String(i + 1).padStart(2, "0")}.png`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        if (folder) {
          const webp = await toWebp(png, SLIDE_W, 0.9);
          await supabase.storage.from("creativos").upload(`${folder}/${stamp}-carrusel-s${i + 1}.webp`, webp, { contentType: "image/webp", upsert: false });
        }
        await new Promise(r => setTimeout(r, 300));
      }
      void loadPast();
    } catch {
      toast.error("No se pudo descargar. Intenta de nuevo.");
    } finally { setSaving(false); }
  };

  const copyCaption = async () => {
    try { await navigator.clipboard.writeText(preview.caption); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { toast.error("No se pudo copiar. Selecciona el texto y cópialo a mano."); }
  };

  const check = coverCheck(slides[0]?.title ?? "");
  const current = slides[sel] ?? slides[0];
  const brandOptions = Array.from(new Set([...kitColors, ...BRAND_COLORS.map(b => b.hex)])).slice(0, 10);
  const chip = (on: boolean) => `shrink-0 min-h-[40px] px-3.5 rounded-full border text-[13px] transition-colors disabled:opacity-60 ${on ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground hover:text-foreground"}`;
  const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60";
  const itemMax = current?.kind === "tarjetas" || current?.kind === "pasos" ? 4 : current?.kind === "comparacion" ? 2 : 3;
  const story = storyTest(slides);
  const storyScore = story.filter(x => x.ok).length;
  const s2 = slideTwoScore(Number(likes.cover), Number(likes.two));

  return (
    <div className="space-y-6">
      {/* 1. Qué carrusel */}
      <div className="rounded-2xl border border-border p-5 space-y-4">
        <div className="space-y-2">
          <p className="text-[13px] text-foreground font-medium">¿Para qué es este carrusel?</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Objetivo del carrusel">
            {(Object.keys(GOAL_INFO) as CarouselGoal[]).map(g => (
              <button key={g} type="button" role="radio" aria-checked={goal === g} onClick={() => setGoal(g)} disabled={writing} className={chip(goal === g)}>{GOAL_INFO[g].label}</button>
            ))}
          </div>
          <p className="text-[12px] text-muted-foreground">{GOAL_INFO[goal].line}</p>
          {goal === "texto" && (
            <textarea value={source} onChange={e => setSource(e.target.value.slice(0, 6000))} rows={6} aria-label="Tu texto"
              placeholder="Pega aquí tu artículo, tu correo, el guion de tu video o tus notas. La IA lo resume en láminas sin inventar nada." className={input} />
          )}
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <div className="space-y-1.5">
            <p className="text-[12px] text-muted-foreground">Láminas</p>
            <div className="flex gap-2">{SLIDE_COUNTS.map(n => <button key={n} type="button" onClick={() => setCount(n)} disabled={writing} className={chip(count === n)}>{n}</button>)}</div>
          </div>
          <div className="space-y-1.5">
            <p className="text-[12px] text-muted-foreground">Formato</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAspect("4:5")} className={chip(aspect === "4:5")}>Vertical 4:5</button>
              <button type="button" onClick={() => setAspect("1:1")} className={chip(aspect === "1:1")}>Cuadrado 1:1</button>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <button onClick={() => void write()} disabled={writing}
            className="btn-primary-nova w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14px] font-semibold disabled:opacity-60">
            {writing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {writing ? "Escribiendo tu carrusel…" : `${draft ? "Escribir otro" : "Escribir mi carrusel"} con IA · ${cost} créditos`}
          </button>
          <p className="text-[11px] text-muted-foreground">{creditsLeft}. Incluye 3 portadas para elegir y el pie de publicación. Cambiar textos o diseño y descargar es gratis. Si falla, no se te cobra.</p>
        </div>
      </div>

      {/* 2. Sistema de diseño */}
      <details open={designOpen} onToggle={e => setDesignOpen((e.target as HTMLDetailsElement).open)} className="rounded-2xl border border-border p-5 group">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3 min-h-[32px]">
          <span className="flex items-center gap-3 min-w-0">
            <span className="w-7 h-7 rounded-full border border-border shrink-0" style={{ background: design.brand }} />
            <span className="min-w-0">
              <span className="block font-display font-semibold text-[15px] text-foreground">Tu sistema de diseño · {STYLES[design.style].name}</span>
              <span className="block text-[12px] text-muted-foreground">Un color de marca, 2 fuentes y una plantilla fija. Se guarda para todos tus carruseles de este producto.</span>
            </span>
          </span>
          <span className="text-xs text-muted-foreground group-open:hidden shrink-0">Cambiar</span>
        </summary>
        <div className="mt-4 space-y-5">
          <div className="space-y-2">
            <p className="text-[13px] text-foreground font-medium">Color de marca <span className="text-muted-foreground font-normal">— de él salen todos los tonos: claro, oscuro y degradado.</span></p>
            <div className="flex flex-wrap items-center gap-2">
              {brandOptions.map(hex => (
                <button key={hex} type="button" onClick={() => setDesign(d => ({ ...d, brand: hex }))} aria-label={`Color ${BRAND_COLORS.find(b => b.hex === hex)?.name ?? hex}`} aria-pressed={design.brand === hex}
                  className={`w-10 h-10 rounded-full border-2 ${design.brand === hex ? "border-foreground" : "border-transparent"}`} style={{ background: hex }} />
              ))}
              <label className="inline-flex items-center gap-2 h-10 rounded-full border border-border pl-1.5 pr-3 text-[12px] text-muted-foreground cursor-pointer">
                <input type="color" value={design.brand} onChange={e => setDesign(d => ({ ...d, brand: e.target.value.toLowerCase() }))} aria-label="Otro color" className="w-7 h-7 rounded-full border-0 bg-transparent p-0 cursor-pointer" />
                Otro
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[13px] text-foreground font-medium">Estilo <span className="text-muted-foreground font-normal">— una fuente grita para detener el scroll, la otra se queda callada para que se lea.</span></p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(STYLES) as StyleId[]).map(id => {
                const f = FONTS[id];
                return (
                  <button key={id} type="button" onClick={() => setDesign(d => ({ ...d, style: id }))} onMouseEnter={() => void loadStyleFonts(id)}
                    className={`rounded-xl border p-3 text-left ${design.style === id ? "border-foreground/40 bg-card" : "border-border hover:border-foreground/30"}`}>
                    <span className="block text-[24px] leading-none text-foreground" style={{ fontFamily: `"${f.display}", serif`, fontWeight: f.displayWeight }}>Aa</span>
                    <span className="block text-[12px] text-foreground mt-1.5">{STYLES[id].name}</span>
                    <span className="block text-[10px] text-muted-foreground truncate">{STYLES[id].line}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[13px] text-foreground font-medium">Empieza en</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStart("oscuro")} className={chip(design.start === "oscuro")}>Oscuro</button>
              <button type="button" onClick={() => setStart("claro")} className={chip(design.start === "claro")}>Claro</button>
            </div>
            <p className="text-[11px] text-muted-foreground">Las láminas alternan claro y oscuro; la solución y la llamada van con el degradado de tu marca.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
            <label className="block space-y-1.5">
              <span className="text-[13px] text-foreground font-medium">Nombre de tu marca</span>
              <input value={design.name} maxLength={28} onChange={e => setDesign(d => ({ ...d, name: e.target.value }))} placeholder="Ej.: Cocina con Ana" aria-label="Nombre de tu marca" className={input} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-[13px] text-foreground font-medium">Tu cuenta</span>
              <div className="flex items-center rounded-lg border border-border bg-background focus-within:border-primary/60">
                <span className="pl-3 text-sm text-muted-foreground">@</span>
                <input value={design.handle} onChange={e => setDesign(d => ({ ...d, handle: cleanHandle(e.target.value) }))} placeholder="tucuenta" aria-label="Tu cuenta de Instagram"
                  className="w-full bg-transparent px-1.5 py-2 text-sm text-foreground focus:outline-none" />
              </div>
            </label>
          </div>
        </div>
      </details>

      {/* 3. Portadas */}
      {draft && draft.covers.length > 1 && (
        <section className="space-y-2">
          <h2 className="font-display font-semibold text-[15px] text-foreground">Elige tu portada</h2>
          <p className="text-[12px] text-muted-foreground -mt-1">Es lo más importante del carrusel: si no detiene el scroll, nadie ve el resto.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {draft.covers.map((c, i) => (
              <button key={i} type="button" onClick={() => setDraft(withCover(draft, i))}
                className={`rounded-xl border p-3 text-left space-y-1.5 ${draft.pick === i ? "border-foreground/40 bg-card" : "border-border hover:border-foreground/30"}`}>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {draft.pick === i ? <Check className="w-3.5 h-3.5 text-primary" /> : null} Portada {i + 1}
                  {draft.rec === i && <span className="ml-auto text-primary">Recomendada</span>}
                </span>
                <span className="block text-[14px] text-foreground font-semibold leading-snug">{c.title.replace(/\*/g, "")}</span>
                {c.why && <span className="block text-[11px] text-muted-foreground">{c.why}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 4. Láminas */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display font-semibold text-[15px] text-foreground">{isSample ? "Así se verá tu carrusel" : "Tu carrusel"}</h2>
          <span className="text-[12px] text-muted-foreground">{isSample ? "Texto de ejemplo: la IA escribe el real." : "Toca una lámina para cambiar su texto."}</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory [scrollbar-width:thin]">
          {slides.map((s, i) => (
            <button key={i} type="button" onClick={() => setSel(i)} aria-label={`Lámina ${i + 1}: ${KIND_LABEL[s.kind]}`}
              className={`snap-start shrink-0 rounded-xl overflow-hidden border text-left ${sel === i ? "border-foreground/60" : "border-border"}`}>
              <Scaled width={THUMB} aspect={aspect}>
                <SlideView ref={el => { nodes.current[i] = el; }} slide={s} index={i} total={slides.length} design={design} aspect={aspect} />
              </Scaled>
              <span className="block px-2.5 py-1.5 text-[11px] text-muted-foreground">{i + 1}. {KIND_LABEL[s.kind]}</span>
            </button>
          ))}
        </div>

        {current && (
          <div className="rounded-2xl border border-border p-4 space-y-3">
            <p className="text-[12px] text-muted-foreground">Lámina {sel + 1} · {KIND_LABEL[current.kind]}</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
              <label className="block space-y-1">
                <span className="text-[12px] text-foreground">Titular</span>
                <input value={current.title} maxLength={140} onChange={e => editSlide(sel, { title: e.target.value })} aria-label="Titular de la lámina" className={input} />
                <span className="block text-[11px] text-muted-foreground">Pon entre *asteriscos* la palabra que va con tu color de marca.</span>
              </label>
              <label className="block space-y-1">
                <span className="text-[12px] text-foreground">Etiqueta</span>
                <input value={current.kicker} maxLength={26} onChange={e => editSlide(sel, { kicker: e.target.value.toLocaleUpperCase("es") })} aria-label="Etiqueta de la lámina" className={input} />
              </label>
            </div>
            {current.kind !== "problema" && current.kind !== "tarjetas" && current.kind !== "pasos" && current.kind !== "comparacion" && (
              <label className="block space-y-1">
                <span className="text-[12px] text-foreground">{sel === 0 ? "Subtítulo" : "Texto"}</span>
                <textarea value={current.body} maxLength={260} rows={2} onChange={e => editSlide(sel, { body: e.target.value })} aria-label="Texto de la lámina" className={input} />
              </label>
            )}
            {sel > 0 && sel < slides.length - 1 && current.kind !== "giro" && (
              <label className="block space-y-1">
                <span className="text-[12px] text-foreground">Tirón hacia la siguiente <span className="text-muted-foreground">(abre algo que la siguiente lámina responde)</span></span>
                <input value={current.bridge ?? ""} maxLength={60} onChange={e => editSlide(sel, { bridge: e.target.value })} aria-label="Tirón hacia la siguiente lámina" className={input} />
              </label>
            )}
            {current.kind === "portada" && (
              <label className="block space-y-1 max-w-xs">
                <span className="text-[12px] text-foreground">Pastilla</span>
                <input value={current.tag ?? ""} maxLength={24} onChange={e => editSlide(sel, { tag: e.target.value.toLocaleUpperCase("es") })} aria-label="Pastilla de la portada" className={input} />
              </label>
            )}
            {current.kind === "llamada" && (
              <label className="block space-y-1 max-w-xs">
                <span className="text-[12px] text-foreground">Palabra clave</span>
                <input value={current.cta ?? ""} maxLength={20} onChange={e => editSlide(sel, { cta: e.target.value.toLocaleUpperCase("es") })} aria-label="Palabra clave" className={input} />
              </label>
            )}
            {["problema", "comparacion", "solucion", "tarjetas", "pasos"].includes(current.kind) && (
              <label className="block space-y-1">
                <span className="text-[12px] text-foreground">Veredicto <span className="text-muted-foreground">(una línea al pie que remata el punto)</span></span>
                <input value={current.verdict ?? ""} maxLength={90} onChange={e => editSlide(sel, { verdict: e.target.value })} aria-label="Veredicto de la lámina" className={input} />
              </label>
            )}
            {(current.kind === "problema" || current.kind === "comparacion" || current.kind === "tarjetas" || current.kind === "pasos" || current.kind === "llamada") && (
              <div className="space-y-2">
                <span className="text-[12px] text-foreground">{current.kind === "llamada" ? "Recordatorios" : current.kind === "comparacion" ? "Las dos cajas (etiqueta y texto)" : "Puntos"}</span>
                {current.items.map((it, k) => (
                  <div key={k} className="flex gap-2 items-start">
                    <div className="flex-1 grid gap-2 sm:grid-cols-2">
                      <input value={it.title} maxLength={70} onChange={e => editItem(sel, k, { title: e.target.value })} aria-label={`Punto ${k + 1}`} className={input} />
                      {current.kind !== "llamada" && <input value={it.text} maxLength={140} onChange={e => editItem(sel, k, { text: e.target.value })} aria-label={`Detalle del punto ${k + 1}`} placeholder="Detalle (opcional)" className={input} />}
                    </div>
                    <button type="button" onClick={() => editSlide(sel, { items: current.items.filter((_, m) => m !== k) })} aria-label={`Quitar punto ${k + 1}`}
                      className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
                {current.items.length < itemMax && (
                  <button type="button" onClick={() => editSlide(sel, { items: [...current.items, { title: "Nuevo punto", text: "" }] })}
                    className="min-h-[36px] inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"><Plus className="w-3.5 h-3.5" /> Añadir punto</button>
                )}
              </div>
            )}
            {sel === 0 && (check.ok
              ? <p className="text-[12px] text-foreground flex gap-1.5"><Star className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" /> Portada lista: corta, con una palabra que resalta y sin promesas.</p>
              : check.notes.map((n, k) => <p key={k} className="text-[12px] text-muted-foreground flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {n}</p>))}
            {sel === 0 && (
              <div className="rounded-xl border border-border p-3.5 space-y-3">
                <div>
                  <p className="text-[13px] text-foreground font-medium">Portada póster con IA de imagen <span className="text-muted-foreground font-normal">(opcional)</span></p>
                  <p className="text-[12px] text-muted-foreground">Una foto de cine con tu titular escrito dentro, como las portadas de revista que más se guardan. Las demás láminas siguen con tu diseño.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="IA de imagen">
                  {POSTER_MODELS.map(m => (
                    <button key={m.id} type="button" role="radio" aria-checked={posterModel === m.id} disabled={posterBusy} onClick={() => setPosterModel(m.id)}
                      className={`rounded-lg border px-3 py-2 text-left disabled:opacity-55 ${posterModel === m.id ? "border-foreground/50 bg-card" : "border-border hover:border-foreground/30"}`}>
                      <span className="flex items-center justify-between gap-2 text-[13px] text-foreground">
                        <span>{m.label}</span>
                        <span className="text-muted-foreground text-[12px] shrink-0">{CREDIT_COSTS[m.action]} créditos</span>
                      </span>
                      <span className="block text-[11px] text-muted-foreground">{m.note}</span>
                    </button>
                  ))}
                </div>
                {kitRefs.length > 0 && (
                  <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <input type="checkbox" checked={useRefs} onChange={e => setUseRefs(e.target.checked)} /> Usar mis fotos del kit de marca como protagonista
                  </label>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void makePoster()} disabled={posterBusy}
                    className="min-h-[40px] inline-flex items-center gap-2 rounded-lg border border-border px-3 text-[12px] text-foreground hover:border-foreground/40 disabled:opacity-60">
                    {posterBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                    {posterBusy ? "Creando tu portada…" : `${current.image ? "Crear otra portada" : "Crear portada póster"} · ${CREDIT_COSTS[(POSTER_MODELS.find(m => m.id === posterModel) ?? POSTER_MODELS[0]).action]} créditos`}
                  </button>
                  {current.image && (
                    <button type="button" onClick={() => editSlide(0, { image: undefined, imagePath: undefined })}
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg px-3 text-[12px] text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /> Volver a la portada diseñada</button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">La IA escribe tu titular dentro de la foto: revisa que diga exactamente lo mismo antes de publicar. Si falla, no se te cobra.</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* La prueba de la historia */}
      <section className="rounded-2xl border border-border p-5 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display font-semibold text-[15px] text-foreground">La prueba de la historia</h2>
          <span className={`text-[13px] font-semibold ${storyScore >= 5 ? "text-primary" : "text-foreground"}`}>{storyScore} / 6</span>
        </div>
        <p className="text-[12px] text-muted-foreground -mt-1">Un carrusel no es una lista: es una máquina de deseo. Con menos de 4, la gente lo abandona antes del final, que es donde está lo que quieres (guardar, comentar, escribirte).</p>
        {preview.idea && <p className="text-[13px] text-foreground"><span className="text-muted-foreground">La idea que defiende: </span>{preview.idea}</p>}
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {story.map(x => (
            <li key={x.id} className="flex gap-2 text-[12px]">
              {x.ok ? <Check className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />}
              <span><span className="text-foreground">{x.label}.</span> <span className="text-muted-foreground">{x.why}</span></span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground">Última revisión: lee solo la portada y la última lámina. ¿La de adelante hizo una promesa y la de atrás la pagó?</p>
      </section>

      {/* 5. Listo para publicar */}
      <section className="rounded-2xl border border-border p-5 space-y-4">
        <div>
          <h2 className="font-display font-semibold text-[17px] text-foreground">Listo para publicar</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">Se descargan en PNG de {SLIDE_W}×{slideH(aspect)}, en orden, con tus fuentes reales.{isSample ? " Ahora tiene el texto de ejemplo: escríbelo con IA o cámbialo a mano." : ""}</p>
        </div>
        <button type="button" onClick={() => void downloadAll()} disabled={saving}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 text-[13px] text-foreground hover:border-foreground/40 disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Descargar las {slides.length} láminas
        </button>

        {preview.caption && (
          <div className="rounded-xl border border-border bg-background/40 p-4 space-y-3">
            <p className="text-[12px] text-muted-foreground">Pie de publicación</p>
            <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-foreground">{preview.caption}</pre>
            <button type="button" onClick={() => void copyCaption()} className="min-h-[40px] inline-flex items-center gap-2 rounded-lg border border-border px-3 text-[12px] text-foreground">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? "Copiado" : "Copiar pie"}
            </button>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-[13px] text-foreground font-medium">Así se ve en tu perfil</p>
          <p className="text-[12px] text-muted-foreground">La gente no sigue un post: abre tu perfil y mira todo junto. Si tus portadas se ven como una sola marca, vas bien.</p>
          <div className="grid grid-cols-3 gap-1 max-w-[360px]">
            <div className="aspect-[3/4] overflow-hidden bg-card flex items-start justify-center">
              <Scaled width={118} aspect={aspect}><SlideView slide={slides[0]} index={0} total={slides.length} design={design} aspect={aspect} /></Scaled>
            </div>
            {past.slice(0, 8).map((u, i) => <div key={i} className="aspect-[3/4] bg-card overflow-hidden"><img src={u} alt="Portada anterior" className="w-full h-full object-cover" /></div>)}
            {Array.from({ length: Math.max(0, 2 - past.length) }).map((_, i) => <div key={`e${i}`} className="aspect-[3/4] border border-dashed border-border" />)}
          </div>
          {past.length === 0 && <p className="text-[11px] text-muted-foreground">Al descargar, la portada se guarda aquí para comparar con los próximos.</p>}
        </div>

        <div className="space-y-2">
          <p className="text-[13px] text-foreground font-medium">Mide tu último carrusel</p>
          <p className="text-[12px] text-muted-foreground">Instagram no te da la retención, pero esto hace el mismo trabajo: en Estadísticas, mira los me gusta de la portada y los de la lámina 2.</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1"><span className="block text-[11px] text-muted-foreground">Me gusta portada</span>
              <input inputMode="numeric" value={likes.cover} onChange={e => setLikes(l => ({ ...l, cover: e.target.value.replace(/\D/g, "").slice(0, 7) }))} aria-label="Me gusta de la portada" className={`${input} w-32`} /></label>
            <label className="space-y-1"><span className="block text-[11px] text-muted-foreground">Me gusta lámina 2</span>
              <input inputMode="numeric" value={likes.two} onChange={e => setLikes(l => ({ ...l, two: e.target.value.replace(/\D/g, "").slice(0, 7) }))} aria-label="Me gusta de la lámina 2" className={`${input} w-32`} /></label>
          </div>
          {s2 && likes.two !== "" && <p className={`text-[13px] ${s2.level === "fuerte" ? "text-primary" : "text-foreground"}`}><span className="font-semibold">{s2.pct} %</span> · {s2.text}</p>}
        </div>

        <ol className="space-y-2">
          {PUBLISH_STEPS.map((s, i) => (
            <li key={i} className="flex gap-3 text-[13px] text-muted-foreground">
              <span className="shrink-0 w-6 h-6 rounded-full border border-border flex items-center justify-center text-[11px] text-foreground">{i + 1}</span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
