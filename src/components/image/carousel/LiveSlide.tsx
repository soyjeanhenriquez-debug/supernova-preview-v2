import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeErrorMessage } from "@/lib/fnAuth";
import { useCredits } from "@/hooks/useCredits";
import { fontEmbedCss, slideToBlob } from "@/lib/carouselTheme";
import type { CarouselDesign, Slide } from "@/lib/carousel";
import { SLIDE_W, SlideView, slideH } from "@/components/image/carousel/SlideView";
import { MOTION_FPS, SlideMotion, type SlideMotionProps } from "@/remotion/SlideMotion";

/**
 * "Dar vida a esta lámina" (17-oct-2026, pedido de Jean): la IA de video anima SOLO la foto de fondo
 * (el agua, las nubes, la luz…) unos segundos en bucle, como un GIF; el texto queda nítido encima porque
 * se pone después, en el navegador. El servidor cobra antes de gastar y devuelve si falla (video-generate).
 * Por ahora solo para administradores (los modelos están en estado "admin").
 */
const MODELS = [
  { id: "seedance15", name: "Normal", line: "Seedance 1.5 · 5 s", credits: 85 },
  { id: "kling26pro", name: "Más calidad", line: "Kling 2.6 Pro · 5 s", credits: 220 },
] as const;
type ModelId = (typeof MODELS)[number]["id"];

const motionPrompt = (what: string) => [
  "Cinemagraph: the photo comes alive with subtle, natural, continuous motion that loops seamlessly (the last frame matches the first).",
  "Static camera: no zoom, no pan, no camera movement.",
  `Only this moves: ${what.trim() || "the natural elements of the scene (water, clouds, light, leaves, hair)"}.`,
  "Do not add text, letters, logos, people or new objects. Keep faces, bodies and clothing exactly the same.",
].join(" ");

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function LiveSlide({ slide, index, total, design, aspect, photos, sourcePath, onMotion }: {
  slide: Slide; index: number; total: number; design: CarouselDesign; aspect: "4:5" | "1:1";
  photos: string[]; sourcePath: string | null; onMotion: (url: string | undefined) => void;
}) {
  const { applyServerCharge } = useCredits();
  const [model, setModel] = useState<ModelId>("seedance15");
  const [what, setWhat] = useState("");
  const [busy, setBusy] = useState<"" | "creando" | "armando">("");
  const [pct, setPct] = useState(0);
  const [hole, setHole] = useState(false);
  const holeRef = useRef<HTMLDivElement>(null);
  const H = slideH(aspect);

  const create = async () => {
    if (!sourcePath) { toast.error("Esta lámina no tiene una foto guardada para animar."); return; }
    setBusy("creando");
    try {
      const { data, error } = await supabase.functions.invoke("video-generate", {
        body: { model_id: model, prompt: motionPrompt(what), image_path: sourcePath, source: "carrusel" },
      });
      if (error || !data?.job?.id) throw new Error(error ? await invokeErrorMessage(error, "No se pudo animar la lámina. No se te cobró.") : (data?.error || "No se pudo animar la lámina. No se te cobró."));
      if (data.billing) applyServerCharge("gen_media", data.billing, "Dar vida a una lámina");
      // La IA tarda 1 a 3 minutos: se pregunta cada 6 s, hasta 6 minutos.
      for (let i = 0; i < 60; i++) {
        await sleep(6000);
        const st = await supabase.functions.invoke("video-generate", { body: { action: "status", job_id: data.job.id } });
        const job = st.data?.job;
        if (job?.status === "done" && job.result_url) { onMotion(job.result_url); toast.success("Tu lámina ya tiene vida", { description: "Mírala moverse arriba. Bájala en video para subirla al carrusel." }); return; }
        if (job?.status === "failed") throw new Error(st.data?.error || "El video falló. Te devolvimos los créditos.");
      }
      throw new Error("La IA está tardando más de lo normal. Vuelve en unos minutos: si falla, se devuelven los créditos.");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo animar la lámina.");
    } finally { setBusy(""); }
  };

  const download = async () => {
    if (!slide.motion) return;
    setBusy("armando"); setPct(0);
    try {
      // 1) La capa de texto: la misma lámina sin la foto y con el fondo transparente.
      setHole(true);
      await sleep(250);
      if (!holeRef.current) throw new Error("sin capa");
      const css = await fontEmbedCss(design.style).catch(() => "");
      const overlay = URL.createObjectURL(await slideToBlob(holeRef.current, SLIDE_W, H, css));
      setHole(false);
      // 2) El video de fondo, local (así el armado no depende de la red).
      const video = URL.createObjectURL(await (await fetch(slide.motion)).blob());
      const seconds = await new Promise<number>(res => {
        const v = document.createElement("video"); v.preload = "metadata"; v.muted = true;
        v.onloadedmetadata = () => res(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 5); v.onerror = () => res(5); v.src = video;
      });
      // 3) Las dos capas en un MP4.
      const props: SlideMotionProps = { video, overlay, area: design.style === "tuit" ? "tuit" : "full", height: H };
      const { renderMediaOnWeb } = await import("@remotion/web-renderer");
      const composition = { id: "lamina-viva", component: SlideMotion, durationInFrames: Math.max(30, Math.round(seconds * MOTION_FPS)), fps: MOTION_FPS, width: SLIDE_W, height: H, defaultProps: props };
      const r = await renderMediaOnWeb({ composition, inputProps: props, container: "mp4", videoCodec: "h264", onProgress: p => setPct(Math.round(p.progress * 100)) });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await r.getBlob()); a.download = `carrusel-${String(index + 1).padStart(2, "0")}-con-vida.mp4`; a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); URL.revokeObjectURL(overlay); URL.revokeObjectURL(video); }, 5000);
    } catch {
      toast.error("Tu navegador no pudo armar el video. Prueba en Chrome de computadora.");
    } finally { setHole(false); setBusy(""); }
  };

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div>
        <p className="text-[13px] text-foreground font-medium">Dar vida a esta lámina <span className="text-muted-foreground font-normal">(opcional · solo administradores por ahora)</span></p>
        <p className="text-[12px] text-muted-foreground">La IA anima solo la foto de fondo unos segundos en bucle, como un GIF: el agua, las nubes, la luz. Tu texto queda quieto y nítido. Instagram acepta videos dentro del carrusel.</p>
      </div>
      {slide.motion && <p className="text-[12px] text-foreground">Esta lámina ya tiene vida: se mueve en la vista de arriba.</p>}
      <label className="block text-[12px] text-muted-foreground">Qué se mueve (opcional)
        <input value={what} onChange={e => setWhat(e.target.value.slice(0, 200))} placeholder="Ej.: las olas del mar, las nubes y el reflejo del sol"
          className="mt-1 w-full min-h-[44px] rounded-lg border border-border bg-background px-3 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none" />
      </label>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Calidad de la animación">
        {MODELS.map(m => (
          <button key={m.id} type="button" role="radio" aria-checked={model === m.id} onClick={() => setModel(m.id)} disabled={!!busy}
            className={`rounded-lg border px-3 py-2 text-left ${model === m.id ? "border-foreground/50 bg-card" : "border-border hover:border-foreground/30"}`}>
            <span className="flex items-baseline justify-between gap-2 text-[13px] text-foreground">{m.name}<span className="text-[11px] text-muted-foreground">{m.credits} créditos</span></span>
            <span className="block text-[11px] text-muted-foreground">{m.line}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void create()} disabled={!!busy || !sourcePath}
          className="btn-primary-nova inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-[13px] font-semibold disabled:opacity-60">
          {busy === "creando" ? <><Loader2 className="w-4 h-4 animate-spin" /> Animando la foto (1 a 3 min)…</> : <><Sparkles className="w-4 h-4" /> {slide.motion ? "Animar otra vez" : "Dar vida"} · {MODELS.find(m => m.id === model)!.credits} créditos</>}
        </button>
        {slide.motion && (
          <>
            <button type="button" onClick={() => void download()} disabled={!!busy}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 text-[13px] text-foreground hover:border-foreground/40 disabled:opacity-60">
              {busy === "armando" ? <><Loader2 className="w-4 h-4 animate-spin" /> Armando {pct} %</> : <><Download className="w-4 h-4" /> Bajar esta lámina en video</>}
            </button>
            <button type="button" onClick={() => onMotion(undefined)} disabled={!!busy}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-[12px] text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /> Quitar la vida</button>
          </>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">El servidor cobra antes de animar y, si falla, te devuelve los créditos. "Descargar las láminas" baja esta lámina como imagen quieta; para la versión que se mueve usa "Bajar esta lámina en video".</p>
      {hole && (
        <div aria-hidden style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }}>
          <SlideView ref={holeRef} slide={slide} index={index} total={total} design={design} aspect={aspect} photos={photos} hole />
        </div>
      )}
    </div>
  );
}
