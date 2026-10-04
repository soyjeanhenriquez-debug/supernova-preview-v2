import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles, Image as ImageIcon, LayoutTemplate, MonitorPlay, Smartphone, Package, Shuffle, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits, CREDIT_COSTS } from "@/hooks/useCredits";
import { useBusinessProfile, profileReady } from "@/lib/businessProfile";
import { invokeErrorMessage } from "@/lib/fnAuth";
import { QuickBrief } from "@/components/QuickBrief";
import { takeSeed, setSeed, TARGET_SLUG, type CreativeSeed } from "@/lib/creativeSeed";
import {
  aiAspect, aspectOptions, buildSlots, carruselTexts, variationSpec, adCopyRequest, missingRealTexts,
  MODE_COUNT, MODE_INFO, TARGET_MODE, IMAGE_TARGETS, formatNumber, type Aspect, type Brief, type StudioMode, type PromptCtx,
} from "@/lib/imagePrompts";
import { EMPTY_KIT, kitReferences, loadBrandKit, toWebp, type BrandKit } from "@/lib/brandKit";
import { AiChoiceChip } from "@/components/image/AiChoiceChip";
import { ConceptPicker } from "@/components/image/ConceptPicker";
import { BrandKitPanel } from "@/components/image/BrandKitPanel";
import { ImageSlotCard, type Slot } from "@/components/image/ImageSlotCard";
import { ReadyToPublish } from "@/components/image/ReadyToPublish";
import { SavedGallery, type SavedImage } from "@/components/image/SavedGallery";

/**
 * Estudio de imágenes (03-oct-2026; plan ATLAS 04-oct-2026): Creativos, Carrusel, Miniaturas, Fotos
 * estilo UGC, Foto de producto y Variar, hechos desde tu producto o desde una idea ganadora (semilla
 * de creativeSeed), sin escribir prompts. La IA elige el formato ("Formato: X · cambiar").
 *
 * Cobro: generate-ad-creative cobra en el servidor ANTES de generar (acción gen_ad_image de
 * credit_prices: 6 créditos, ≈ 5,9× el costo real con APIMart GPT Image 2) y devuelve el crédito si la
 * IA falla. Aquí solo se muestra el precio y se refleja el saldo. Con `autostart` (el botón que trajo la
 * semilla ya mostraba el costo) la generación arranca sola; sin eso, nunca se gasta nada solo.
 *
 * Cada imagen se guarda comprimida a WebP en el bucket privado "creativos" (<user>/<producto>/…).
 * Fotos del producto o logo (kit de marca) viajan como `reference_paths` (rutas propias; el servidor
 * las valida y firma). Nada de promesas de ingresos, marcas reales ni famosos (manual, sección 2).
 */
export type { StudioMode } from "@/lib/imagePrompts";

const PRICE = CREDIT_COSTS.gen_ad_image;

const MODE_ICON: Record<StudioMode, typeof ImageIcon> = {
  creativo: ImageIcon, carrusel: LayoutTemplate, miniatura: MonitorPlay, foto_ugc: Smartphone, foto_producto: Package, variar: Shuffle,
};
const MODES: StudioMode[] = ["creativo", "carrusel", "miniatura", "foto_ugc", "foto_producto", "variar"];
const SHORT_TITLE: Record<StudioMode, string> = {
  creativo: "Creativos", carrusel: "Carrusel", miniatura: "Miniaturas", foto_ugc: "Fotos UGC", foto_producto: "Foto de producto", variar: "Variar",
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function ImageStudioPage({ initialMode = "creativo" }: { initialMode?: StudioMode }) {
  const { user } = useAuth();
  const { profile, loaded, savePatch, productId } = useBusinessProfile();
  const { applyServerCharge, balance } = useCredits();
  const [mode, setMode] = useState<StudioMode>(initialMode);
  const [seed, setSeedState] = useState<CreativeSeed | null>(null);
  const [aspect, setAspect] = useState<Aspect>(() => aiAspect(initialMode).aspect);
  const [headline, setHeadline] = useState("");
  const [texts, setTexts] = useState<string[]>([]);
  // Creativos: estilos elegidos (hasta 3), otro estilo escrito y los datos reales que piden algunos.
  const [concepts, setConcepts] = useState<string[]>([]);
  const [customStyle, setCustomStyle] = useState("");
  const [realTexts, setRealTexts] = useState<Record<string, string>>({});
  const [slots, setSlots] = useState<Slot[]>([]);
  const [kit, setKit] = useState<BrandKit>(EMPTY_KIT);
  const [kitLoaded, setKitLoaded] = useState(false);
  const [useRefs, setUseRefs] = useState(true);
  const [varySource, setVarySource] = useState<SavedImage | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const seedTaken = useRef(false);
  const autoRan = useRef(false);

  const uid = user?.id ?? null;
  const folder = uid && productId ? `${uid}/${productId}` : null;

  // La semilla se toma UNA vez al abrir (se borra al leerla).
  useEffect(() => {
    if (seedTaken.current) return;
    seedTaken.current = true;
    const s = takeSeed(IMAGE_TARGETS);
    if (!s) return;
    setSeedState(s);
    const m = TARGET_MODE[s.target];
    if (m) setMode(m);
  }, []);

  // Ficha o semilla: la semilla manda mientras esté puesta y NO sobrescribe business_profile.
  const brief: Brief = useMemo(() => (seed
    ? { product: seed.product || seed.title, who: seed.who, promise: seed.promise, price: seed.price }
    : { product: profile.product, who: profile.who, promise: profile.promise, price: profile.price }), [seed, profile.product, profile.who, profile.promise, profile.price]);
  const ready = seed ? brief.product.trim().length >= 3 : profileReady(profile);
  const choice = aiAspect(mode, seed?.aspect);
  const running = slots.some(s => s.status === "busy");

  useEffect(() => { setSlots([]); setHeadline(""); setVarySource(null); setAspect(aiAspect(mode, seed?.aspect).aspect); }, [mode, seed?.aspect]);
  useEffect(() => { if (ready) setTexts(carruselTexts(brief, seed?.hook)); }, [ready, brief, seed?.hook]);

  // Kit de marca del producto activo.
  useEffect(() => {
    if (!uid || !productId) { setKit(EMPTY_KIT); setKitLoaded(!!loaded); return; }
    let alive = true;
    setKitLoaded(false);
    void loadBrandKit(uid, productId).then(k => { if (alive) { setKit(k); setKitLoaded(true); } });
    return () => { alive = false; };
  }, [uid, productId, loaded]);

  const kitRefs = kitReferences(kit);
  const refsForRun = (): string[] => {
    if (mode === "variar") return varySource ? [varySource.path] : [];
    return useRefs ? kitRefs : [];
  };

  const ctx: PromptCtx = {
    brief, aspect, headline, hook: seed?.hook, angle: seed?.angle, texts,
    kit: { colors: kit.colors, style: kit.style }, hasRefs: mode !== "variar" && useRefs && kitRefs.length > 0,
    ...(mode === "creativo" ? { concepts, customStyle, realTexts } : {}),
  };
  const missing = mode === "creativo" ? missingRealTexts(ctx) : [];

  const runSlot = async (slot: Slot) => {
    setSlots(list => list.map(s => (s.id === slot.id ? { ...s, status: "busy", error: undefined } : s)));
    try {
      const body: Record<string, unknown> = { prompt: slot.prompt, aspectRatio: slot.aspect };
      if (slot.refs?.length) body.reference_paths = slot.refs;
      const { data, error } = await supabase.functions.invoke("generate-ad-creative", { body });
      if (error || !data?.image) throw new Error(error ? await invokeErrorMessage(error, "No se pudo crear la imagen. No se te cobró.") : (data?.error || "No se pudo crear la imagen. No se te cobró."));
      if (data.billing) applyServerCharge("gen_ad_image", data.billing, `${MODE_INFO[mode].title} · ${slot.label}`);
      const blob = await toWebp(data.image as string, slot.aspect === "16:9" ? 1280 : 1080);
      const localUrl = URL.createObjectURL(blob);
      let path: string | undefined;
      if (folder) {
        const p = `${folder}/${Date.now()}-${mode}-${slot.id.replace(/[^A-Za-z0-9-]/g, "")}.webp`;
        const up = await supabase.storage.from("creativos").upload(p, blob, { contentType: "image/webp", upsert: false });
        if (up.error) toast.error("La imagen se creó pero no se pudo guardar. Descárgala antes de salir.");
        else { path = p; setRefreshKey(k => k + 1); }
      }
      setSlots(list => list.map(s => (s.id === slot.id ? { ...s, status: "done", url: localUrl, path } : s)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo crear la imagen.";
      setSlots(list => list.map(s => (s.id === slot.id ? { ...s, status: "error", error: msg } : s)));
    }
  };

  const start = async () => {
    if (!ready || running) return;
    if (mode === "variar" && !varySource) { toast("Elige abajo la imagen que quieres variar."); return; }
    if (missing.length) { toast("Falta tu dato real", { description: "Algunos estilos (testimonio, dato, experto…) usan solo información real. Escríbela o quita ese estilo." }); return; }
    const refs = refsForRun();
    const next: Slot[] = buildSlots(mode, ctx).map(s => ({ ...s, status: "idle" as const, refs }));
    if (balance < next.length * PRICE) {
      toast.error(`Te faltan créditos: esto cuesta ${next.length * PRICE}`, { description: "Recarga créditos o haz menos imágenes." });
      return;
    }
    setSlots(next);
    // De a una: el tope por hora es del servidor y así cada imagen aparece en cuanto está.
    for (const s of next) await runSlot(s);
  };

  // Semilla con autostart (el botón ya mostraba el costo): 0 toques extra.
  useEffect(() => {
    if (autoRan.current || !seed?.autostart || !loaded || !kitLoaded || !ready) return;
    // Espera a que el modo y el formato de la semilla ya estén puestos.
    if (TARGET_MODE[seed.target] !== mode || aspect !== aiAspect(mode, seed.aspect).aspect) return;
    autoRan.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, loaded, kitLoaded, ready, mode, aspect]);

  const vary = async (slot: Slot) => {
    if (!slot.path || running) return;
    if (balance < PRICE) { toast.error(`Te faltan créditos: esto cuesta ${PRICE}`); return; }
    const n = slots.filter(s => s.id.startsWith(`${slot.id}v`)).length;
    const spec = variationSpec(n, slot.aspect, ctx, `Variación · ${slot.label}`);
    const ns: Slot = { ...spec, id: `${slot.id}v${n}`, status: "idle", refs: [slot.path] };
    setSlots(list => { const i = list.findIndex(s => s.id === slot.id); const c = [...list]; c.splice(i + 1, 0, ns); return c; });
    await runSlot(ns);
  };

  const handOff = (slot: Slot, target: "video_anuncio" | "youtube") => {
    if (!slot.path) return;
    setSeed({
      source: seed?.source ?? "manual", target,
      title: (target === "youtube" && headline.trim()) || seed?.title || brief.product,
      product: brief.product, who: brief.who, promise: brief.promise, price: brief.price,
      hook: seed?.hook, angle: seed?.angle, evidence: seed?.evidence, refId: seed?.refId,
      aspect: slot.aspect, imagePath: slot.path,
    });
    window.location.hash = `#/${TARGET_SLUG[target]}`;
  };

  // Descarga real también para las guardadas (URL firmada de otro dominio: el atributo download no basta).
  const download = async (url: string, name: string) => {
    try {
      const href = url.startsWith("blob:") ? url : URL.createObjectURL(await (await fetch(url)).blob());
      const a = document.createElement("a");
      a.href = href; a.download = name; a.click();
      if (href !== url) setTimeout(() => URL.revokeObjectURL(href), 5000);
    } catch { toast.error("No se pudo descargar. Intenta de nuevo."); }
  };
  const done = slots.filter(s => s.status === "done" && s.url);
  const downloadAll = async () => {
    for (const [i, s] of done.entries()) { await download(s.url!, `supernova-${mode}-${i + 1}.webp`); await sleep(350); }
  };

  if (!loaded) return <div className="text-sm text-muted-foreground p-6">Cargando…</div>;
  const info = MODE_INFO[mode];
  const count = MODE_COUNT[mode];
  const canText = mode === "creativo" || mode === "miniatura" || mode === "variar";

  return (
    <div className="max-w-[1180px] mx-auto space-y-6 py-4 min-w-0">
      <div>
        <h1 className="font-display font-bold text-2xl text-foreground">{info.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{info.line} {mode === "variar" ? "" : "Salen de tu producto: no tienes que escribir nada."}</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {MODES.map(m => {
          const Icon = MODE_ICON[m];
          return (
            <button key={m} onClick={() => setMode(m)} disabled={running}
              className={`shrink-0 inline-flex items-center gap-2 h-10 px-3.5 rounded-full border text-[13px] transition-colors disabled:opacity-60 ${mode === m ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-4 h-4" strokeWidth={1.7} /> {SHORT_TITLE[m]}
            </button>
          );
        })}
      </div>

      {seed && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border px-4 py-2.5 text-[13px]">
          <span className="text-muted-foreground">Con la idea:</span>
          <span className="text-foreground min-w-0 truncate max-w-full">{seed.title}</span>
          {seed.evidence && <span className="text-[12px] text-muted-foreground">· {seed.evidence}</span>}
          <button type="button" onClick={() => { setSeedState(null); autoRan.current = true; }} disabled={running}
            className="ml-auto inline-flex items-center gap-1 min-h-[32px] text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-50">
            <X className="w-3.5 h-3.5" /> quitar
          </button>
        </div>
      )}

      {!ready ? (
        <QuickBrief profile={profile} savePatch={savePatch} purpose="hacer tus imágenes" />
      ) : (
        <div className="rounded-2xl border border-border p-5 space-y-4">
          {!seed && <p className="text-[13px] text-muted-foreground truncate"><span className="text-foreground">{profile.product}</span> · {profile.who}</p>}

          <AiChoiceChip aspect={aspect} reason={choice.aspect === aspect ? choice.reason : "Elegiste este formato."}
            options={aspectOptions(mode)} onChange={setAspect} disabled={running} />

          {mode === "creativo" && (
            <ConceptPicker value={concepts} onChange={setConcepts} custom={customStyle} onCustom={setCustomStyle}
              realTexts={realTexts} onRealText={(id, s) => setRealTexts(r => ({ ...r, [id]: s }))} disabled={running} />
          )}

          {mode === "variar" && (
            <p className="text-[13px] text-foreground">
              {varySource ? "Imagen elegida. Toca el botón para crear 3 versiones." : "Toca abajo, en tus imágenes, la que quieres variar."}
              {!varySource && (
                <button type="button" onClick={() => setMode("creativo")} className="block mt-1 text-[12px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
                  ¿Aún no tienes imágenes? Crea tus creativos primero
                </button>
              )}
            </p>
          )}

          {mode === "carrusel" ? (
            <details className="group">
              <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground select-none min-h-[32px] flex items-center">▸ Cambiar el texto de cada lámina (opcional)</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {texts.map((t, i) => (
                  <input key={i} value={t} maxLength={80} aria-label={`Texto de la lámina ${i + 1}`} onChange={e => setTexts(list => list.map((x, j) => (j === i ? e.target.value : x)))}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
                ))}
              </div>
            </details>
          ) : canText ? (
            <details className="group">
              <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground select-none min-h-[32px] flex items-center">
                ▸ {mode === "variar" ? "Cambiar el texto de la imagen (opcional)" : seed?.hook ? "Poner tu propio texto (opcional: la IA escribe uno nuevo con la idea)" : "Poner un texto en la imagen (opcional)"}
              </summary>
              <input value={headline} maxLength={60} onChange={e => setHeadline(e.target.value)} aria-label="Texto en la imagen"
                placeholder={mode === "miniatura" ? "Ej.: Mi primer ebook paso a paso" : "Ej.: Aprende a hacerlo desde casa"}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
            </details>
          ) : null}

          {uid && productId && mode !== "variar" && (
            <BrandKitPanel uid={uid} productId={productId} kit={kit} onChange={setKit} useRefs={useRefs} setUseRefs={setUseRefs} disabled={running} />
          )}

          <div className="space-y-1.5">
            <button onClick={() => void start()} disabled={running || (mode === "variar" && !varySource)}
              className="btn-primary-nova w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14px] font-semibold disabled:opacity-60">
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {running ? `Creando tus ${info.unit}…` : `Crear ${count} ${info.unit} · ${count * PRICE} créditos`}
            </button>
            <p className="text-[11px] text-muted-foreground">
              Te quedan {formatNumber(balance)} créditos. Si una imagen falla, no se te cobra.
              {ctx.hasRefs ? " Se usan tus fotos como referencia." : ""}
            </p>
          </div>
        </div>
      )}

      {slots.length > 0 && (
        <div className={`grid gap-3 sm:gap-4 ${aspect === "16:9" ? "sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-3"}`}>
          {slots.map(s => (
            <ImageSlotCard key={s.id} slot={s} price={PRICE} locked={running}
              onDownload={() => void download(s.url!, `supernova-${mode}-${s.id}.webp`)}
              onRedo={() => void runSlot(s)}
              onVary={() => void vary(s)}
              onAnimate={mode === "carrusel" ? undefined : () => handOff(s, "video_anuncio")}
              onYoutube={mode === "miniatura" ? () => handOff(s, "youtube") : undefined} />
          ))}
        </div>
      )}

      {done.length > 0 && !running && (
        <ReadyToPublish mode={mode} count={done.length} onDownloadAll={downloadAll} title={seed?.title || brief.product}
          copyRequest={adCopyRequest(mode, { brief, hook: seed?.hook, angle: seed?.angle })} />
      )}

      {folder && (
        <SavedGallery folder={folder} refreshKey={refreshKey}
          selectable={mode === "variar"} selected={varySource?.path ?? null}
          onSelect={img => { setVarySource(img); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          onOpen={img => void download(img.url, img.path.split("/").pop() ?? "imagen.webp")} />
      )}
    </div>
  );
}
