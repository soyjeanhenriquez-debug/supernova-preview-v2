import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, Sparkles, Image as ImageIcon, LayoutTemplate, MonitorPlay } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits, CREDIT_COSTS } from "@/hooks/useCredits";
import { useBusinessProfile, profileReady, type BusinessProfile } from "@/lib/businessProfile";
import { QuickBrief } from "@/components/QuickBrief";

/**
 * Estudio de imágenes (03-oct-2026): Creativos para anuncios, Carrusel y Miniaturas, hechos desde tu
 * producto, sin escribir prompts. Usa generate-ad-creative (Gemini Flash Image), que cobra en el
 * servidor ANTES de generar (acción gen_ad_image de credit_prices, 25 créditos ≈ 5× el costo real)
 * y devuelve el crédito si la IA falla. Cada imagen se guarda comprimida en el bucket privado
 * "creativos" (<user>/<producto>/…), así queda en "Tus imágenes" y en la Biblioteca.
 * Nada de promesas de ingresos ni marcas reales en las imágenes (manual, sección 2).
 */
export type StudioMode = "creativo" | "carrusel" | "miniatura";
type Aspect = "1:1" | "4:5" | "9:16" | "16:9";
type Slot = { id: string; label: string; prompt: string; aspect: Aspect; status: "idle" | "busy" | "done" | "error"; url?: string; error?: string };

const PRICE = CREDIT_COSTS.gen_ad_image;
const RULES = "Personas latinas, naturales y creíbles. Sin logotipos, marcas ni personas famosas reales. No muestres dinero, billetes, cifras de ingresos ni promesas de resultados. Si hay texto, que sea en español, corto, grande, legible y escrito exactamente como se indica, sin otras palabras.";

const MODES: { id: StudioMode; title: string; line: string; icon: typeof ImageIcon }[] = [
  { id: "creativo", title: "Creativos para anuncios", line: "3 imágenes listas para Meta, cada una con un ángulo distinto.", icon: ImageIcon },
  { id: "carrusel", title: "Carrusel que vende", line: "5 láminas: gancho, problema, solución, prueba y llamada a la acción.", icon: LayoutTemplate },
  { id: "miniatura", title: "Miniaturas", line: "Portadas para YouTube o Reels que se leen en pequeño.", icon: MonitorPlay },
];

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);

function describe(p: BusinessProfile) {
  return `Producto: ${p.product}. Para: ${p.who}. Lo que logra: ${p.promise}.`;
}

function creativoSlots(p: BusinessProfile, aspect: Aspect, headline: string): Slot[] {
  const h = headline.trim();
  const text = h ? `Texto grande en la imagen: «${h}».` : "Sin texto en la imagen.";
  const base = `${describe(p)} ${RULES}`;
  return [
    { id: "a", label: "Problema → solución", aspect, status: "idle",
      prompt: `Anuncio de Facebook e Instagram. Escena realista: una persona del público objetivo vive el problema que resuelve el producto y se ve el alivio de encontrar la solución. ${text} ${base}` },
    { id: "b", label: "El resultado deseado", aspect, status: "idle",
      prompt: `Anuncio de Facebook e Instagram. Escena aspiracional y realista: una persona del público objetivo disfrutando el resultado que logra el producto, luz natural, emoción genuina. ${text} ${base}` },
    { id: "c", label: "Producto digital en mockup", aspect, status: "idle",
      prompt: `Anuncio de Facebook e Instagram. Mockup profesional del producto digital (portada de ebook o curso en tableta y celular) sobre un fondo limpio con buen contraste. ${text} ${base}` },
  ];
}

function carruselTexts(p: BusinessProfile) {
  return [
    `¿${short(p.who, 50)}?`,
    "Esto es lo que te frena",
    short(p.product, 60),
    short(p.promise, 70),
    "Escríbenos y empieza hoy",
  ];
}

function carruselSlots(p: BusinessProfile, texts: string[]): Slot[] {
  const roles = ["Gancho que detiene el scroll", "El problema", "La solución", "Lo que logra", "Llamada a la acción"];
  return texts.map((t, i) => ({
    id: `s${i}`, label: `${i + 1}. ${roles[i]}`, aspect: "4:5" as Aspect, status: "idle" as const,
    prompt: `Lámina ${i + 1} de 5 de un carrusel de Instagram, mismo estilo visual en todas (fondo oscuro elegante, acento cálido). Rol de esta lámina: ${roles[i]}. Texto grande en la imagen: «${t.trim()}». ${describe(p)} ${RULES}`,
  }));
}

function miniaturaSlots(p: BusinessProfile, aspect: Aspect, headline: string): Slot[] {
  const h = headline.trim() || short(p.promise, 40);
  const base = `${describe(p)} ${RULES}`;
  return [
    { id: "m1", label: "Cara con emoción", aspect, status: "idle",
      prompt: `Miniatura de video. Primer plano de una persona latina con expresión de sorpresa genuina, mirando a cámara, fondo con contraste fuerte. Texto grande de 3 a 5 palabras: «${h}». ${base}` },
    { id: "m2", label: "Antes y después", aspect, status: "idle",
      prompt: `Miniatura de video dividida en dos: a la izquierda el problema, a la derecha el resultado, flecha clara entre ambos. Texto grande: «${h}». ${base}` },
  ];
}

/** PNG grande de la IA → WebP de ~150 KB para guardarla y mostrarla rápido. */
async function compress(dataUrl: string, max = 1080): Promise<Blob> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error("No se pudo preparar la imagen."))), "image/webp", 0.86));
}

type Saved = { name: string; url: string };

export function ImageStudioPage({ initialMode = "creativo" }: { initialMode?: StudioMode }) {
  const { user } = useAuth();
  const { profile, loaded, savePatch, productId } = useBusinessProfile();
  const { applyServerCharge, balance } = useCredits();
  const [mode, setMode] = useState<StudioMode>(initialMode);
  const [aspect, setAspect] = useState<Aspect>(initialMode === "miniatura" ? "16:9" : "1:1");
  const [headline, setHeadline] = useState("");
  const [texts, setTexts] = useState<string[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const ready = profileReady(profile);
  const running = slots.some(s => s.status === "busy");

  useEffect(() => { setSlots([]); setHeadline(""); setAspect(mode === "miniatura" ? "16:9" : mode === "carrusel" ? "4:5" : "1:1"); }, [mode]);
  useEffect(() => { if (ready) setTexts(carruselTexts(profile)); }, [ready, profile]);

  const folder = user && productId ? `${user.id}/${productId}` : null;
  const loadSaved = useCallback(async () => {
    if (!folder) return;
    const { data } = await supabase.storage.from("creativos").list(folder, { limit: 12, sortBy: { column: "created_at", order: "desc" } });
    const names = (data ?? []).filter(f => f.name.endsWith(".webp")).map(f => `${folder}/${f.name}`);
    if (!names.length) { setSaved([]); return; }
    const { data: signed } = await supabase.storage.from("creativos").createSignedUrls(names, 3600);
    setSaved((signed ?? []).filter(s => s.signedUrl).map(s => ({ name: s.path ?? "", url: s.signedUrl })));
  }, [folder]);
  useEffect(() => { void loadSaved(); }, [loadSaved]);

  const runSlot = async (slot: Slot) => {
    setSlots(list => list.map(s => (s.id === slot.id ? { ...s, status: "busy", error: undefined } : s)));
    try {
      const { data, error } = await supabase.functions.invoke("generate-ad-creative", { body: { prompt: slot.prompt, aspectRatio: slot.aspect } });
      if (error || !data?.image) {
        const ctx = (error as { context?: Response } | null)?.context;
        const msg = ctx ? await ctx.json().then((b: { error?: string }) => b?.error).catch(() => null) : null;
        throw new Error(msg || data?.error || "No se pudo crear la imagen. No se te cobró.");
      }
      if (data.billing) applyServerCharge("gen_ad_image", data.billing, `${MODES.find(m => m.id === mode)?.title} · ${slot.label}`);
      const blob = await compress(data.image as string, slot.aspect === "16:9" ? 1280 : 1080);
      const localUrl = URL.createObjectURL(blob);
      setSlots(list => list.map(s => (s.id === slot.id ? { ...s, status: "done", url: localUrl } : s)));
      if (folder) {
        const up = await supabase.storage.from("creativos").upload(`${folder}/${Date.now()}-${mode}-${slot.id}.webp`, blob, { contentType: "image/webp", upsert: false });
        if (up.error) toast.error("La imagen se creó pero no se pudo guardar. Descárgala antes de salir.");
        else void loadSaved();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo crear la imagen.";
      setSlots(list => list.map(s => (s.id === slot.id ? { ...s, status: "error", error: msg } : s)));
    }
  };

  const start = async () => {
    if (!ready || running) return;
    const next = mode === "creativo" ? creativoSlots(profile, aspect, headline)
      : mode === "carrusel" ? carruselSlots(profile, texts)
      : miniaturaSlots(profile, aspect, headline);
    if (balance < next.length * PRICE) {
      toast.error(`Te faltan créditos: esto cuesta ${next.length * PRICE}`, { description: "Recarga créditos o haz menos imágenes." });
      return;
    }
    setSlots(next);
    // De a una: el tope por hora es del servidor y así cada imagen aparece en cuanto está.
    for (const s of next) await runSlot(s);
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

  if (!loaded) return <div className="text-sm text-muted-foreground p-6">Cargando…</div>;
  const current = MODES.find(m => m.id === mode)!;
  const count = mode === "creativo" ? 3 : mode === "carrusel" ? 5 : 2;

  return (
    <div className="max-w-[1180px] mx-auto space-y-6 py-4">
      <div>
        <h1 className="font-display font-bold text-2xl text-foreground">{current.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{current.line} Salen de tu producto: no tienes que escribir nada.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {MODES.map(m => {
          const Icon = m.icon;
          return (
            <button key={m.id} onClick={() => setMode(m.id)} disabled={running}
              className={`shrink-0 inline-flex items-center gap-2 h-9 px-3.5 rounded-full border text-[13px] transition-colors disabled:opacity-60 ${mode === m.id ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-4 h-4" strokeWidth={1.7} /> {m.title}
            </button>
          );
        })}
      </div>

      {!ready ? (
        <QuickBrief profile={profile} savePatch={savePatch} purpose="hacer tus imágenes" />
      ) : (
        <div className="rounded-2xl border border-border p-5 space-y-4">
          <p className="text-[13px] text-muted-foreground truncate"><span className="text-foreground">{profile.product}</span> · {profile.who}</p>

          {mode !== "carrusel" && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Formato</p>
              <div className="flex flex-wrap gap-2">
                {(mode === "miniatura"
                  ? [["16:9", "YouTube (horizontal)"], ["9:16", "Reels y TikTok (vertical)"]]
                  : [["1:1", "Feed cuadrado"], ["4:5", "Feed vertical"], ["9:16", "Historias y Reels"]]
                ).map(([a, label]) => (
                  <button key={a} onClick={() => setAspect(a as Aspect)}
                    className={`h-8 px-3 rounded-full border text-[12px] ${aspect === a ? "border-foreground/40 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {mode === "carrusel" ? (
            <details className="group">
              <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground select-none">▸ Cambiar el texto de cada lámina (opcional)</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {texts.map((t, i) => (
                  <input key={i} value={t} maxLength={80} onChange={e => setTexts(list => list.map((x, j) => (j === i ? e.target.value : x)))}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
                ))}
              </div>
            </details>
          ) : (
            <details className="group">
              <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground select-none">▸ Poner un texto en la imagen (opcional)</summary>
              <input value={headline} maxLength={60} onChange={e => setHeadline(e.target.value)}
                placeholder={mode === "miniatura" ? "Ej.: Mi primer ebook en 7 días" : "Ej.: Aprende a hacerlo desde casa"}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
            </details>
          )}

          <button onClick={() => void start()} disabled={running}
            className="btn-primary-nova inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-semibold disabled:opacity-60">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {running ? "Creando tus imágenes…" : `Crear ${count} ${mode === "carrusel" ? "láminas" : "imágenes"} · ${count * PRICE} créditos`}
          </button>
          <p className="text-[11px] text-muted-foreground">Si una imagen falla, no se te cobra. Cada una tarda unos segundos.</p>
        </div>
      )}

      {slots.length > 0 && (
        <div className={`grid gap-4 ${mode === "miniatura" && aspect === "16:9" ? "sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-3"}`}>
          {slots.map(s => (
            <div key={s.id} className="rounded-2xl border border-border overflow-hidden bg-card/40">
              <div className={`relative bg-secondary/30 ${s.aspect === "16:9" ? "aspect-video" : s.aspect === "9:16" ? "aspect-[9/16]" : s.aspect === "4:5" ? "aspect-[4/5]" : "aspect-square"}`}>
                {s.url ? <img src={s.url} alt={s.label} className="w-full h-full object-cover" />
                  : s.status === "error" ? <p className="absolute inset-0 m-auto h-fit px-4 text-center text-[12px] text-muted-foreground">{s.error}</p>
                  : <Loader2 className={`absolute inset-0 m-auto w-6 h-6 text-muted-foreground ${s.status === "busy" ? "animate-spin" : "opacity-30"}`} />}
              </div>
              <div className="p-3 flex items-center gap-2">
                <span className="text-[12px] text-foreground truncate flex-1">{s.label}</span>
                {s.url && (
                  <button onClick={() => void download(s.url!, `supernova-${mode}-${s.id}.webp`)} aria-label="Descargar" className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground">
                    <Download className="w-4 h-4" />
                  </button>
                )}
                {(s.status === "done" || s.status === "error") && (
                  <button onClick={() => void runSlot(s)} disabled={running} title={`Rehacer · ${PRICE} créditos`} aria-label="Rehacer" className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {saved.length > 0 && (
        <section>
          <h2 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-foreground mb-3">Tus imágenes</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {saved.map(s => (
              <button key={s.name} onClick={() => void download(s.url, s.name.split("/").pop() ?? "imagen.webp")} title="Descargar" className="rounded-lg overflow-hidden border border-border aspect-square bg-secondary/30">
                <img src={s.url} alt="" loading="lazy" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
