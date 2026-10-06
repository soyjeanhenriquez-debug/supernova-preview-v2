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
  ADMIN_DESIGN, BRAND_COLORS, DEFAULT_DESIGN, DEFAULT_SLIDES, GENERATOR_ID, KIND_LABEL, PUBLISH_STEPS, SLIDE_COUNTS, STYLES,
  carouselRequest, cleanHandle, coverCheck, draftCarousel, parseCarousel, posterPrompt, posterScenePrompt, posterTextPrompt, retone, slideTwoScore, storyTest, withCover,
  FORMATS, planFor, type FormatId,
  brandFromClone, parseClone, parseReclone, photoPrompt, recloneRequest, MAX_KEEP, COVER_TEMPLATES, CLONE_MODES, type CoverTemplateId, type CloneMode,
  type CarouselDesign, type CarouselDraft, type CarouselGoal, type Item, type Slide, type StyleId,
} from "@/lib/carousel";
import { FONTS, fontEmbedCss, loadStyleFonts, slideToBlob } from "@/lib/carouselTheme";
import { SLIDE_W, SlideView, slideH } from "@/components/image/carousel/SlideView";
import { loadDesign, loadDraft, saveDesign, saveDraft } from "@/lib/carouselStore";
import { AddToTracker } from "@/components/AddToTracker";

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

export function CarouselStudio({ brief, seed, uid, productId, folder, kitColors, kitRefs = [], useRefs = true, photoPanel, onAutostart }: {
  brief: Brief; seed: Seed; uid: string | null; productId: string | null; folder: string | null; kitColors: string[];
  /** Fotos del producto o logo del kit de marca (rutas propias de "creativos"). */
  kitRefs?: string[];
  /** ¿Usar esas fotos como referencia? (se decide en el panel de fotos). */
  useRefs?: boolean;
  /** Panel para subir tu foto (tu cara), tu logo o tu producto: la protagonista de las fotos IA. */
  photoPanel?: React.ReactNode;
  /** Avisa que la semilla ya se usó, para no volver a cobrar si la pantalla se vuelve a montar. */
  onAutostart?: () => void;
}) {
  const { applyServerCharge, balance } = useCredits();
  const { label: creditsLeft, isAdmin } = useCreditsLeft();
  const [posterModel, setPosterModel] = useState<PosterModel["id"]>("gpt-image-2");
  const [posterBusy, setPosterBusy] = useState(false);
  const { action, cost } = generatorCost(GENERATOR_ID);
  // Lo primero que elige la persona: qué carrusel quiere hacer. El objetivo sale del formato.
  const [fmt, setFmt] = useState<FormatId>("vender");
  const goal: CarouselGoal = FORMATS[fmt].goal;
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
  // Clonar con ADN ganador.
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneMode2, setCloneMode2] = useState<CloneMode>("tema");
  const [cloning, setCloning] = useState(false);
  const [keep, setKeep] = useState<string[]>([]);
  const [past, setPast] = useState<string[]>([]);
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const autoRan = useRef(false);
  const designLoaded = useRef(false);

  const preview = useMemo(() => draft ?? draftCarousel(brief, count, seed?.hook, design.start, fmt), [draft, brief, count, seed?.hook, design.start, fmt]);
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
      // Las URLs de la portada póster y de las fotos vencen: se vuelven a firmar desde su ruta.
      const paths = saved.slides.flatMap(x => [x.imagePath, x.photoPath]).filter((p): p is string => !!p);
      if (paths.length) {
        void supabase.storage.from("creativos").createSignedUrls(paths, 3600).then(({ data }) => {
          if (!alive) return;
          const url = new Map((data ?? []).map(d => [d.path, d.signedUrl]));
          setDraft(d => (d ? { ...d, slides: d.slides.map(x => ({ ...x, image: x.imagePath ? url.get(x.imagePath) ?? undefined : x.image, photo: x.photoPath ? url.get(x.photoPath) ?? undefined : x.photo })) } : d));
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
    if (fmt === "texto" && source.trim().length < 80) { toast("Pega tu texto (mínimo unas líneas) para convertirlo en carrusel."); return; }
    if (fmt === "historia" && source.trim().length < 60) { toast("Cuéntame tu historia en unas líneas: qué pasó y qué aprendiste."); return; }
    if (balance < cost) { toast.error(`Te faltan créditos: esto cuesta ${cost}`, { description: "Recarga créditos para escribir tu carrusel." }); return; }
    setWriting(true);
    const label = `Carrusel · ${seed?.title || brief.product}`;
    try {
      const text = await runGenerator({
        id: GENERATOR_ID, title: label, system: SYSTEM,
        prompt: carouselRequest({ goal, format: fmt, brief, slides: count, source: fmt === "texto" || fmt === "historia" ? source : undefined, hook: seed?.hook, angle: seed?.angle, evidence: seed?.evidence, handle: design.handle, world: design.world, line: design.line }),
        onCharge: b => applyServerCharge(action, b, label),
      });
      const parsed = parseCarousel(text, count, design.start, { free: !!planFor(fmt, count) });
      if (!parsed) throw new Error("La IA respondió en un formato raro. Toca de nuevo: si vuelve a pasar, escríbenos y te devolvemos los créditos.");
      setDraft({ ...parsed, template: parsed.template ?? FORMATS[fmt].template }); setSel(0);
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

  // Siempre sobre el último estado (las imágenes llegan después de esperar a la IA).
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const setSlides = (fn: (s: Slide[]) => Slide[]) => setDraft(d => { const base = d ?? previewRef.current; return { ...base, slides: fn(base.slides) }; });
  const editSlide = (i: number, patch: Partial<Slide>) => setSlides(list => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const editItem = (i: number, k: number, patch: Partial<Item>) => setSlides(list => list.map((s, j) => (j === i ? { ...s, items: s.items.map((it, m) => (m === k ? { ...it, ...patch } : it)) } : s)));
  const setStart = (start: "claro" | "oscuro") => { setDesign(d => ({ ...d, start })); if (draft) setDraft({ ...draft, slides: retone(draft.slides, start) }); };

  /** Portada póster (con el titular escrito por la IA) o foto de una lámina (sin texto). */
  const makeImage = async (index: number) => {
    const m = POSTER_MODELS.find(x => x.id === posterModel) ?? POSTER_MODELS[0];
    const price = CREDIT_COSTS[m.action];
    if (posterBusy) return;
    if (balance < price) { toast.error(`Te faltan créditos: esto cuesta ${price}`); return; }
    const target = slides[index];
    if (!target) return;
    const isPoster = index === 0;
    const refs = useRefs ? kitRefs : [];
    const prompt = isPoster
      ? posterPrompt({ cover: target, scene: target.scene || preview.scene, design, brief, aspect, hasRefs: refs.length > 0, rules: RULES, template })
      : photoPrompt({ slide: target, design, brief, aspect, card: target.kind === "regla", hasRefs: refs.length > 0, rules: RULES });
    setPosterBusy(true);
    try {
      const body: Record<string, unknown> = { prompt, aspectRatio: aspect, model: m.id };
      if (refs.length) body.reference_paths = refs;
      const { data, error } = await supabase.functions.invoke("generate-ad-creative", { body });
      if (error || !data?.image) throw new Error(error ? await invokeErrorMessage(error, "No se pudo crear la imagen. No se te cobró.") : (data?.error || "No se pudo crear la imagen. No se te cobró."));
      if (data.billing) applyServerCharge(m.action, data.billing, `Carrusel · ${isPoster ? "portada" : `foto lámina ${index + 1}`} ${m.label}`);
      const blob = await toWebp(data.image as string, 1350);
      let url = URL.createObjectURL(blob);
      let path: string | undefined;
      if (folder) {
        const p = `${folder}/${Date.now()}-carrusel-${isPoster ? "poster" : "foto"}.webp`;
        const up = await supabase.storage.from("creativos").upload(p, blob, { contentType: "image/webp", upsert: false });
        if (!up.error) {
          path = p;
          const { data: s2 } = await supabase.storage.from("creativos").createSignedUrl(p, 3600);
          if (s2?.signedUrl) { URL.revokeObjectURL(url); url = s2.signedUrl; }
        }
      }
      editSlide(index, isPoster ? { image: url, imagePath: path } : { photo: url, photoPath: path });
      toast.success(isPoster ? "Portada póster lista" : "Foto lista", { description: isPoster ? "Revisa que el titular diga exactamente lo mismo." : "El texto lo pone tu diseño, con letras perfectas." });
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo crear la imagen.");
    } finally { setPosterBusy(false); }
  };
  /**
   * Portada MVP, en 2 pasos (el método de los mejores carruseles): 1) la foto con la IA elegida (Nano Banana Pro da la mejor foto y
   * te pone a ti con tu foto de referencia), sin texto; 2) GPT Image 2 recibe esa foto y SOLO le pone
   * las letras, sin tocar la escena. Cada paso lo cobra el servidor; si falla el 2, la foto queda
   * guardada y se reintentan solo las letras.
   */
  const [posterMode, setPosterMode] = useState<"dos" | "uno">("dos");
  // Plantilla de portada (gramática visual): la sugiere la IA y la persona la puede cambiar.
  const [template, setTemplate] = useState<CoverTemplateId>("editorial");
  useEffect(() => { if (draft?.template) setTemplate(draft.template); }, [draft?.template]);
  const [scenePath, setScenePath] = useState<string | null>(null);
  const gen = async (body: Record<string, unknown>, action: PosterModel["action"], label: string): Promise<Blob> => {
    const { data, error } = await supabase.functions.invoke("generate-ad-creative", { body });
    if (error || !data?.image) throw new Error(error ? await invokeErrorMessage(error, "No se pudo crear la imagen. No se te cobró.") : (data?.error || "No se pudo crear la imagen. No se te cobró."));
    if (data.billing) applyServerCharge(action, data.billing, label);
    return toWebp(data.image as string, 1350);
  };
  const save = async (blob: Blob, kind: string): Promise<{ path: string; url: string } | null> => {
    if (!folder) return null;
    const p = `${folder}/${Date.now()}-carrusel-${kind}.webp`;
    const up = await supabase.storage.from("creativos").upload(p, blob, { contentType: "image/webp", upsert: false });
    if (up.error) return null;
    const { data } = await supabase.storage.from("creativos").createSignedUrl(p, 3600);
    return data?.signedUrl ? { path: p, url: data.signedUrl } : null;
  };
  const makePosterMvp = async (onlyLetters = false) => {
    const m = POSTER_MODELS.find(x => x.id === posterModel) ?? POSTER_MODELS[0];
    const lettersPrice = CREDIT_COSTS.gen_ad_image;
    const total = (onlyLetters ? 0 : CREDIT_COSTS[m.action]) + lettersPrice;
    if (posterBusy) return;
    if (!folder) { toast("Elige tu producto primero: la foto se guarda en tu carpeta para ponerle las letras."); return; }
    if (balance < total) { toast.error(`Te faltan créditos: esto cuesta ${total}`); return; }
    const refs = useRefs ? kitRefs : [];
    const opts = { cover: slides[0], scene: slides[0].scene || preview.scene, design, brief, aspect, hasRefs: refs.length > 0, rules: RULES, template };
    setPosterBusy(true);
    try {
      let base = onlyLetters ? scenePath : null;
      if (!base) {
        const body: Record<string, unknown> = { prompt: posterScenePrompt(opts), aspectRatio: aspect, model: m.id };
        if (refs.length) body.reference_paths = refs;
        const scene = await save(await gen(body, m.action, `Carrusel · foto de portada ${m.label}`), "escena");
        if (!scene) throw new Error("La foto se creó pero no se pudo guardar. Intenta de nuevo.");
        base = scene.path; setScenePath(scene.path);
        toast("Paso 1 listo: la foto. Ahora le pongo las letras…");
      }
      try {
        const blob = await gen({ prompt: posterTextPrompt(opts), aspectRatio: aspect, model: "gpt-image-2", reference_paths: [base] }, "gen_ad_image", "Carrusel · letras de la portada GPT Image 2");
        const done = await save(blob, "poster");
        editSlide(0, done ? { image: done.url, imagePath: done.path } : { image: URL.createObjectURL(blob), imagePath: undefined });
        toast.success("Tu portada MVP está lista", { description: "Revisa que el titular diga exactamente lo mismo. Si no, toca \"Otra vez solo las letras\"." });
      } catch (e) {
        toast.error("La foto quedó lista, pero faltan las letras", { description: `${e instanceof Error ? e.message : ""} Toca "Poner solo las letras" (${lettersPrice} créditos): no vuelves a pagar la foto.` });
      }
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo crear la portada.");
    } finally { setPosterBusy(false); }
  };
  const makePoster = () => (posterMode === "dos" ? makePosterMvp() : makeImage(0));

  const cloneInfo = draft?.clone;
  useEffect(() => { setKeep(cloneInfo?.keep ?? []); }, [cloneInfo]);
  const cloneCost = CREDIT_COSTS.clone_carousel;

  const cloneCarousel = async () => {
    if (cloning) return;
    if (!/instagram\.com\/(?:[A-Za-z0-9._]+\/)?p\/[A-Za-z0-9_-]{5,}/.test(cloneUrl)) { toast("Pega el enlace de un carrusel de Instagram (instagram.com/p/…)."); return; }
    if (balance < cloneCost) { toast.error(`Te faltan créditos: esto cuesta ${cloneCost}`); return; }
    setCloning(true);
    try {
      const { data, error } = await supabase.functions.invoke("carousel-clone", { body: { url: cloneUrl.trim(), mode: cloneMode2, brief, goal: goal === "ensenar" ? "ensenar" : "vender", handle: design.handle, world: design.world ?? "", line: design.line ?? "" } });
      if (error || !data?.carrusel) throw new Error(error ? await invokeErrorMessage(error, "No se pudo clonar el carrusel. No se te cobró.") : (data?.error || "No se pudo clonar el carrusel. No se te cobró."));
      if (data.billing) applyServerCharge("clone_carousel", data.billing, "Clonar carrusel viral");
      const parsed = parseClone(data, design.start, cloneMode2);
      if (!parsed) throw new Error("La IA respondió en un formato raro. Escríbenos y te devolvemos los créditos.");
      setDraft({ ...parsed.draft, clone: parsed.info }); setSel(0); setCount(parsed.draft.slides.length);
      toast.success("Carrusel clonado con su ADN", { description: "Mira abajo qué 3 partes se mantuvieron y cómo lo mejoramos." });
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo clonar el carrusel.");
    } finally { setCloning(false); }
  };

  const reclone = async () => {
    if (!cloneInfo || writing || !keep.length) return;
    if (balance < cost) { toast.error(`Te faltan créditos: esto cuesta ${cost}`); return; }
    setWriting(true);
    const label = "Carrusel · clonar con otro ADN";
    try {
      const text = await runGenerator({ id: GENERATOR_ID, title: label, system: SYSTEM, prompt: recloneRequest({ info: cloneInfo, keep, brief, goal: goal === "ensenar" ? "ensenar" : "vender", handle: design.handle, world: design.world, line: design.line }), onCharge: b => applyServerCharge(action, b, label) });
      const parsed = parseReclone(text, design.start);
      if (!parsed) throw new Error("La IA respondió en un formato raro. Toca de nuevo: si vuelve a pasar, escríbenos y te devolvemos los créditos.");
      setDraft({ ...parsed.draft, clone: { ...cloneInfo, keep, improvements: parsed.improvements.length ? parsed.improvements : cloneInfo.improvements } }); setSel(0);
      toast.success("Listo: clonado con las 3 partes que elegiste");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo volver a clonar.");
    } finally { setWriting(false); }
  };

  const [styleChoice, setStyleChoice] = useState<"mio" | "original">("mio");
  const myDesign = useRef<CarouselDesign | null>(null);
  useEffect(() => { setStyleChoice("mio"); myDesign.current = null; }, [cloneInfo]);
  const useMyStyle = () => {
    if (myDesign.current) { const d = myDesign.current; setDesign(d); setDraft(x => (x ? { ...x, slides: retone(x.slides, d.start) } : x)); }
    myDesign.current = null; setStyleChoice("mio");
  };
  const useCloneStyle = () => {
    if (!cloneInfo || styleChoice === "original") return;
    myDesign.current = design;
    setStyleChoice("original");
    const brand = brandFromClone(cloneInfo.style.colors);
    setDesign(d => ({ ...d, style: cloneInfo.style.style, start: cloneInfo.style.start, ...(brand ? { brand } : {}) }));
    setDraft(d => (d ? { ...d, slides: retone(d.slides, cloneInfo.style.start) } : d));
    toast.success("Estilo parecido al original", { description: "Colores y tipo de letra cercanos. Toca \"Mi estilo\" para volver al tuyo." });
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

  const modelPicker = (
    <>
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
                <p className="text-[11px] text-muted-foreground">{kitRefs.length && useRefs ? "Sales tú: se usa tu foto de \"Tu foto\" como protagonista." : "¿Quieres salir tú? Sube tu foto en \"Tu foto\" (en Tu sistema de diseño)."}</p>
    </>
  );
  const imgPrice = CREDIT_COSTS[(POSTER_MODELS.find(m => m.id === posterModel) ?? POSTER_MODELS[0]).action];

  return (
    <div className="space-y-6">
      {/* 1. Qué carrusel quieres hacer */}
      <div className="rounded-2xl border border-border p-5 space-y-4">
        <div>
          <p className="font-display font-semibold text-[15px] text-foreground">¿Qué carrusel quieres hacer?</p>
          <p className="text-[12px] text-muted-foreground">Elige uno. La IA lo escribe con la fórmula de los carruseles que más se guardan y tú solo revisas.</p>
        </div>
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Tipo de carrusel">
          {(Object.keys(FORMATS) as FormatId[]).map(id => (
            <button key={id} type="button" role="radio" aria-checked={fmt === id} disabled={writing || cloning} onClick={() => setFmt(id)}
              className={`rounded-xl border p-3 text-left min-h-[86px] disabled:opacity-60 ${fmt === id ? "border-foreground/50 bg-card" : "border-border hover:border-foreground/30"}`}>
              <span className="flex items-center justify-between gap-2 text-[13px] text-foreground font-medium">
                {FORMATS[id].label}
                {id === "clonar" && <span className="text-primary text-[10px] font-normal shrink-0">El más rápido</span>}
              </span>
              <span className="block text-[11px] text-muted-foreground mt-1 leading-snug">{FORMATS[id].line}</span>
            </button>
          ))}
        </div>

        {fmt === "clonar" ? (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={cloneUrl} onChange={e => setCloneUrl(e.target.value.slice(0, 300))} placeholder="Pega el enlace: https://www.instagram.com/p/…" aria-label="Enlace del carrusel de Instagram" className={input} />
              <button type="button" onClick={() => void cloneCarousel()} disabled={cloning}
                className="btn-primary-nova shrink-0 min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl px-5 text-[14px] font-semibold disabled:opacity-60">
                {cloning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {cloning ? "Analizando el carrusel…" : `Clonar · ${cloneCost} créditos`}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Cómo clonarlo">
              {(Object.keys(CLONE_MODES) as CloneMode[]).map(m => (
                <button key={m} type="button" role="radio" aria-checked={cloneMode2 === m} disabled={cloning} onClick={() => setCloneMode2(m)}
                  className={`rounded-lg border px-3 py-2 text-left ${cloneMode2 === m ? "border-foreground/50 bg-card" : "border-border hover:border-foreground/30"}`}>
                  <span className="block text-[13px] text-foreground">{CLONE_MODES[m].label}{m === "tema" && <span className="text-primary text-[11px]"> · Recomendado</span>}</span>
                  <span className="block text-[11px] text-muted-foreground">{CLONE_MODES[m].line}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Carruseles públicos de Instagram. Tarda cerca de un minuto. La IA lo lee lámina por lámina y te dice por qué funcionó. No traduce palabra por palabra ni usa sus fotos, su cara ni su marca. Si falla, no se te cobra.</p>
          </div>
        ) : (
          <>
            {FORMATS[fmt].needs === "texto" && (
              <textarea value={source} onChange={e => setSource(e.target.value.slice(0, 6000))} rows={6} aria-label="Tu texto"
                placeholder="Pega aquí tu artículo, tu correo, el guion o la transcripción de tu video. La IA lo convierte en láminas sin inventar nada." className={input} />
            )}
            {FORMATS[fmt].needs === "historia" && (
              <textarea value={source} onChange={e => setSource(e.target.value.slice(0, 3000))} rows={5} aria-label="Tu historia"
                placeholder="Cuéntala en pocas líneas, como se la contarías a un amigo: cómo estabas antes, qué pasó, qué cambió y qué aprendiste. Solo lo que pasó de verdad." className={input} />
            )}
            {!FORMATS[fmt].needs && <p className="text-[12px] text-muted-foreground">Sale de tu producto{brief.product ? <>: <span className="text-foreground">{brief.product}</span></> : ""}. No tienes que escribir nada.</p>}
            <div className="space-y-1.5">
              <button onClick={() => void write()} disabled={writing}
                className="btn-primary-nova w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14px] font-semibold disabled:opacity-60">
                {writing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {writing ? "Escribiendo tu carrusel…" : `${draft ? "Escribir otro" : "Escribir mi carrusel"} · ${cost} créditos`}
              </button>
              <p className="text-[11px] text-muted-foreground">{creditsLeft}. Incluye 3 portadas para elegir y el pie de publicación. Cambiar textos o diseño y descargar es gratis. Si falla, no se te cobra.</p>
            </div>
          </>
        )}

        <details className="group">
          <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground select-none min-h-[32px] flex items-center">▸ Opciones: {count} láminas · {aspect === "4:5" ? "vertical 4:5" : "cuadrado 1:1"}</summary>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-3">
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
        </details>
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

          <div className="space-y-2">
            <p className="text-[13px] text-foreground font-medium">Tu firma <span className="text-muted-foreground font-normal">— colores y letras se copian en 5 minutos; esto no. Repítelo en cada post.</span></p>
            <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
              <label className="block space-y-1">
                <span className="text-[12px] text-foreground">Tu papel <span className="text-muted-foreground">(arriba en cada lámina)</span></span>
                <input value={design.role ?? ""} maxLength={32} onChange={e => setDesign(d => ({ ...d, role: e.target.value }))} placeholder="Ej.: estratega de negocios digitales" aria-label="Tu papel" className={input} />
              </label>
              <label className="block space-y-1">
                <span className="text-[12px] text-foreground">Tu dato real <span className="text-muted-foreground">(solo si es cierto)</span></span>
                <input value={design.receipt ?? ""} maxLength={40} onChange={e => setDesign(d => ({ ...d, receipt: e.target.value }))} placeholder="Ej.: 12.000 seguidores" aria-label="Tu dato real" className={input} />
              </label>
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-[12px] text-foreground">Tu mundo <span className="text-muted-foreground">(el lugar que se repite en todas tus fotos IA)</span></span>
                <input value={design.world ?? ""} maxLength={160} onChange={e => setDesign(d => ({ ...d, world: e.target.value }))} placeholder="Ej.: una cocina caribeña con azulejos verdes y luz de tarde" aria-label="Tu mundo visual" className={input} />
              </label>
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-[12px] text-foreground">Tu objeto firma <span className="text-muted-foreground">(lo que invade el primer plano en 3D en tus portadas: tu laptop, tu micrófono, tu cámara…)</span></span>
                <input value={design.prop ?? ""} maxLength={80} onChange={e => setDesign(d => ({ ...d, prop: e.target.value }))} placeholder="Ej.: mi laptop abierta" aria-label="Tu objeto firma" className={input} />
              </label>
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-[12px] text-foreground">Tu frase <span className="text-muted-foreground">(la que la gente reconoce como tuya; sale en el remate)</span></span>
                <input value={design.line ?? ""} maxLength={80} onChange={e => setDesign(d => ({ ...d, line: e.target.value }))} placeholder="Ej.: Cocina una vez, come toda la semana." aria-label="Tu frase" className={input} />
              </label>
            </div>
            <div className="space-y-1.5 pt-1">
              <p className="text-[12px] text-foreground">Tu foto <span className="text-muted-foreground">(tu cara también es tu firma: las fotos IA te ponen como protagonista; también sirve tu logo o tu producto)</span></p>
              {photoPanel ?? <p className="text-[11px] text-muted-foreground">Elige tu producto para subir tu foto.</p>}
            </div>
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

      {/* ADN del carrusel clonado */}
      {cloneInfo && (
        <section className="rounded-2xl border border-border p-5 space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display font-semibold text-[15px] text-foreground">El ADN ganador{cloneInfo.source.owner ? ` de @${cloneInfo.source.owner}` : ""}</h2>
            {cloneInfo.source.likes != null && <span className="text-[12px] text-muted-foreground">{cloneInfo.source.likes.toLocaleString("es")} me gusta · {(cloneInfo.source.comments ?? 0).toLocaleString("es")} comentarios</span>}
          </div>
          {cloneInfo.source.images.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {cloneInfo.source.images.map((u, i) => (
                <img key={i} src={u} alt={`Lámina ${i + 1} del original`} referrerPolicy="no-referrer" loading="lazy"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} className="h-28 w-auto rounded-md border border-border shrink-0" />
              ))}
            </div>
          )}
          {cloneInfo.why && <p className="text-[13px] text-foreground"><span className="text-muted-foreground">Por qué funciona: </span>{cloneInfo.why}</p>}
          <div className="space-y-2">
            <p className="text-[13px] text-foreground font-medium">Sus partes <span className="text-muted-foreground font-normal">— la IA marcó las 3 que lo hicieron funcionar. Toca cualquiera para cambiarla (con 3 marcadas, la nueva reemplaza a la primera). Si mantienes todo, es una copia.</span></p>
            <div className="grid gap-2 sm:grid-cols-2">
              {cloneInfo.dna.map(d => {
                const on = keep.includes(d.id);
                return (
                  <button key={d.id} type="button" disabled={writing} aria-pressed={on}
                    // Con 3 elegidas, tocar otra la cambia por la que elegiste primero.
                    onClick={() => setKeep(k => (on ? k.filter(x => x !== d.id) : [...(k.length >= MAX_KEEP ? k.slice(1) : k), d.id]))}
                    className={`rounded-xl border p-3 text-left disabled:opacity-50 ${on ? "border-foreground/50 bg-card" : "border-border hover:border-foreground/30"}`}>
                    <span className="flex items-center gap-2 text-[13px] text-foreground">
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-primary border-primary" : "border-border"}`}>{on && <Check className="w-3 h-3 text-primary-foreground" />}</span>
                      {d.part}
                    </span>
                    {d.what && <span className="block text-[11px] text-muted-foreground mt-1">{d.what}</span>}
                    {on && d.why && <span className="block text-[11px] text-foreground/80 mt-1">{d.why}</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void reclone()} disabled={writing || !keep.length || keep.join() === cloneInfo.keep.join()}
                className="min-h-[40px] inline-flex items-center gap-2 rounded-lg border border-border px-3 text-[12px] text-foreground hover:border-foreground/40 disabled:opacity-50">
                {writing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Clonar de nuevo con estas {keep.length} · {cost} créditos
              </button>
              <span className="text-[11px] text-muted-foreground">{keep.length}/{MAX_KEEP} elegidas</span>
            </div>
          </div>
          {cloneInfo.improvements.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[13px] text-foreground font-medium">Cómo lo mejoramos</p>
              <ul className="space-y-1">{cloneInfo.improvements.map((m, i) => <li key={i} className="flex gap-2 text-[12px] text-muted-foreground"><Star className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />{m}</li>)}</ul>
            </div>
          )}
          {cloneInfo.style.colors.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex -space-x-1">{cloneInfo.style.colors.map((c, i) => <span key={i} className="w-6 h-6 rounded-full border border-border" style={{ background: c }} />)}</span>
              <span className="text-[12px] text-muted-foreground">El original: estilo {STYLES[cloneInfo.style.style].name.toLowerCase()}, empieza en {cloneInfo.style.start}.</span>
              <div className="inline-flex rounded-full border border-border p-0.5" role="radiogroup" aria-label="Estilo del carrusel">
                <button type="button" role="radio" aria-checked={styleChoice === "mio"} onClick={useMyStyle}
                  className={`min-h-[34px] px-3 rounded-full text-[12px] ${styleChoice === "mio" ? "bg-card text-foreground border border-foreground/30" : "text-muted-foreground"}`}>Mi estilo</button>
                <button type="button" role="radio" aria-checked={styleChoice === "original"} onClick={useCloneStyle}
                  className={`min-h-[34px] px-3 rounded-full text-[12px] ${styleChoice === "original" ? "bg-card text-foreground border border-foreground/30" : "text-muted-foreground"}`}>Parecido al original</button>
              </div>
            </div>
          )}
        </section>
      )}

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
            {sel > 0 && (
              <div className="rounded-xl border border-border p-3.5 space-y-3">
                <div>
                  <p className="text-[13px] text-foreground font-medium">Foto con IA para esta lámina <span className="text-muted-foreground font-normal">(opcional)</span></p>
                  <p className="text-[12px] text-muted-foreground">{current.kind === "regla" ? "Va en una tarjeta debajo de la palabra grande, como ejemplo de la regla." : current.kind === "llamada" ? "Plantilla CTA: acción de fondo y una tarjeta de cristal con tu palabra clave." : "Va de fondo, detrás del texto."} La IA hace solo la foto; las letras las pone tu diseño.</p>
                </div>
                <label className="block space-y-1">
                  <span className="text-[12px] text-foreground">Escena</span>
                  <input value={current.scene ?? ""} maxLength={300} onChange={e => editSlide(sel, { scene: e.target.value })} placeholder="Ej.: una mujer cocinando de noche en una cocina pequeña, luz cálida" aria-label="Escena de la foto" className={input} />
                </label>
                {modelPicker}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void makeImage(sel)} disabled={posterBusy}
                    className="min-h-[40px] inline-flex items-center gap-2 rounded-lg border border-border px-3 text-[12px] text-foreground hover:border-foreground/40 disabled:opacity-60">
                    {posterBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                    {posterBusy ? "Creando la foto…" : `${current.photo ? "Otra foto" : "Crear foto"} · ${imgPrice} créditos`}
                  </button>
                  {current.photo && (
                    <button type="button" onClick={() => editSlide(sel, { photo: undefined, photoPath: undefined })}
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg px-3 text-[12px] text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /> Quitar foto</button>
                  )}
                </div>
              </div>
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
            {current.kind === "regla" && (
              <label className="block space-y-1 max-w-xs">
                <span className="text-[12px] text-foreground">Pastilla</span>
                <input value={current.tag ?? ""} maxLength={20} onChange={e => editSlide(sel, { tag: e.target.value })} aria-label="Pastilla de la regla" className={input} />
              </label>
            )}
            {["problema", "comparacion", "solucion", "tarjetas", "pasos", "regla"].includes(current.kind) && (
              <label className="block space-y-1">
                <span className="text-[12px] text-foreground">Veredicto <span className="text-muted-foreground">(una línea al pie que remata el punto)</span></span>
                <input value={current.verdict ?? ""} maxLength={90} onChange={e => editSlide(sel, { verdict: e.target.value })} aria-label="Veredicto de la lámina" className={input} />
              </label>
            )}
            {(current.kind === "problema" || current.kind === "comparacion" || current.kind === "tarjetas" || current.kind === "pasos" || current.kind === "llamada" || current.kind === "regla") && (
              <div className="space-y-2">
                <span className="text-[12px] text-foreground">{current.kind === "llamada" ? "Recordatorios" : current.kind === "comparacion" ? "Las dos cajas (etiqueta y texto)" : current.kind === "regla" ? "3 líneas al lado de la foto (opcional: qué hace, cuándo sí, cuándo no)" : "Puntos"}</span>
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
                <div className="space-y-1.5">
                  <p className="text-[12px] text-foreground">Plantilla <span className="text-muted-foreground">— perspectiva 3D real: un objeto invade el primer plano, tú en segundo plano y la palabra gigante detrás de ti.</span></p>
                  <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Plantilla de portada">
                    {(["hero", "editorial", "cinematica"] as CoverTemplateId[]).map(id => (
                      <button key={id} type="button" role="radio" aria-checked={template === id} disabled={posterBusy} onClick={() => setTemplate(id)}
                        className={`rounded-lg border px-3 py-2 text-left ${template === id ? "border-foreground/50 bg-card" : "border-border hover:border-foreground/30"}`}>
                        <span className="flex items-center justify-between gap-2 text-[13px] text-foreground">{COVER_TEMPLATES[id].name}{draft?.template === id && <span className="text-primary text-[10px]">Sugerida</span>}</span>
                        <span className="block text-[11px] text-muted-foreground">{COVER_TEMPLATES[id].line}</span>
                        <span className="block text-[10px] text-muted-foreground/80 mt-0.5">{COVER_TEMPLATES[id].uses}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block space-y-1">
                  <span className="text-[12px] text-foreground">Objeto en primer plano <span className="text-muted-foreground">(lo que sale enorme hacia la cámara)</span></span>
                  <input value={current.prop ?? ""} maxLength={80} onChange={e => editSlide(0, { prop: e.target.value })} placeholder={design.prop || "Ej.: mi mano sosteniendo el teléfono"} aria-label="Objeto en primer plano" className={input} />
                </label>
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Cómo se hace la portada">
                  <button type="button" role="radio" aria-checked={posterMode === "dos"} disabled={posterBusy}
                    onClick={() => { setPosterMode("dos"); if (posterModel === "gpt-image-2") setPosterModel("nano-banana-pro"); }}
                    className={`rounded-lg border px-3 py-2 text-left ${posterMode === "dos" ? "border-foreground/50 bg-card" : "border-border hover:border-foreground/30"}`}>
                    <span className="block text-[13px] text-foreground">Portada MVP · 2 pasos <span className="text-primary text-[11px]">Recomendado</span></span>
                    <span className="block text-[11px] text-muted-foreground">1) La foto con la IA que elijas abajo (sales tú si subiste tu foto). 2) GPT Image 2 le pone las letras sin tocar la foto.</span>
                  </button>
                  <button type="button" role="radio" aria-checked={posterMode === "uno"} disabled={posterBusy} onClick={() => setPosterMode("uno")}
                    className={`rounded-lg border px-3 py-2 text-left ${posterMode === "uno" ? "border-foreground/50 bg-card" : "border-border hover:border-foreground/30"}`}>
                    <span className="block text-[13px] text-foreground">Rápida · 1 paso</span>
                    <span className="block text-[11px] text-muted-foreground">Una sola IA hace la foto y las letras a la vez. Más barata, menos control.</span>
                  </button>
                </div>
                <p className="text-[12px] text-muted-foreground">{posterMode === "dos" ? "Paso 1 · la foto con:" : "La hace:"}</p>
                {modelPicker}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void makePoster()} disabled={posterBusy}
                    className="min-h-[40px] inline-flex items-center gap-2 rounded-lg border border-border px-3 text-[12px] text-foreground hover:border-foreground/40 disabled:opacity-60">
                    {posterBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                    {posterBusy ? "Creando tu portada…" : `${current.image ? "Crear otra portada" : "Crear portada póster"} · ${posterMode === "dos" ? imgPrice + CREDIT_COSTS.gen_ad_image : imgPrice} créditos`}
                  </button>
                  {posterMode === "dos" && scenePath && (
                    <button type="button" onClick={() => void makePosterMvp(true)} disabled={posterBusy}
                      className="min-h-[40px] inline-flex items-center gap-2 rounded-lg border border-border px-3 text-[12px] text-foreground hover:border-foreground/40 disabled:opacity-60">
                      {current.image ? "Otra vez solo las letras" : "Poner solo las letras"} · {CREDIT_COSTS.gen_ad_image} créditos
                    </button>
                  )}
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
        {!isSample && <AddToTracker kind="carrusel" title={slides[0]?.title ?? brief.product} keyword={slides[slides.length - 1]?.cta} source="carrusel" className="sm:ml-2" />}

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
