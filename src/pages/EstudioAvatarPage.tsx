import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Download, Film, ImageIcon, Loader2, Sparkles, Upload, UserRound, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessProfile } from "@/lib/businessProfile";
import { useCredits } from "@/hooks/useCredits";
import { invokeErrorMessage } from "@/lib/fnAuth";
import { track } from "@/lib/analytics";
import { PageHeader } from "@/components/PageHeader";
import { downloadVideo, waitForVideo, type VideoJob } from "@/components/video/videoApi";
import { STOCK_INFLUENCERS } from "@/lib/influencers";
import { adviceFor, bestFor, imageTag } from "@/lib/modelAdvice";
import { fmtNumber } from "@/lib/gemelo";
import {
  ACCENTS, BROLL_ACTIONS, CAMERAS, GESTURES, IMAGE_GROUPS, IMAGE_TEMPLATES, IMAGE_TIERS, IMAGE_TIER_IDS, PLACES, REF_LABEL, VIDEO_FORMATS, VIDEO_MODELS, VOICES,
  imageCredits, maxWords, videoCredits, videoSeconds, wordCount,
  type ImageGroup, type ImageModelTier, type ImageTemplate, type RefSlot, type VideoFormat,
} from "@/lib/avatarStudio";

/**
 * Estudio de avatar (20-oct-2026): crea fotos y videos de un avatar (sin tu cara) o de ti (con tu cara)
 * con plantillas probadas. El servidor (función avatar-studio) arma el prompt, cobra antes de gastar y
 * devuelve los créditos si algo falla; aquí solo se elige y se refleja el saldo.
 * Camino sugerido: 1) fija la cara con la hoja 3×3 · 2) crea escenas (ropa, ángulo, producto, app)
 * · 3) dale vida en video (habla a cámara o escena muda para tu voz en off).
 */
type Modo = "sin-cara" | "con-cara";
type Ref = { bucket: "personajes" | "estudio-avatar"; path: string; url: string } | { stock: string; url: string };
type Tab = "imagen" | "video";

async function invokeStudio<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("avatar-studio", { body });
  if (error) throw new Error(await invokeErrorMessage(error, "No se pudo completar."));
  if (data?.error) throw new Error(data.error);
  return data as T;
}

/** Foto del celular → WebP de máx. 1536 px (menos peso, misma calidad para la IA). */
async function toWebp(file: Blob, flip = false): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 1536 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  const ctx = c.getContext("2d")!;
  if (flip) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error("No se pudo leer la imagen."))), "image/webp", 0.9));
}

const chip = (on: boolean) =>
  `h-9 px-3.5 rounded-full border text-[13px] font-medium transition-colors ${on ? "bg-card border-foreground/20 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`;
const select = "w-full h-10 rounded-xl border border-border bg-background px-3 text-sm";

type ModelCard = { id: string; label: string; note: string; credits: number; tag?: string | null };

/** Modelos como tarjetas: nombre, para qué sirve y cuántos créditos cuesta, a la vista antes de crear. */
function ModelCards({ items, value, onChange, recommended, label }: {
  items: ModelCard[]; value: string | undefined; onChange: (id: string) => void; recommended?: string | null; label: string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={label}>
      {items.map(m => {
        const on = m.id === value;
        return (
          <button key={m.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(m.id)}
            className={`group relative text-left rounded-xl border px-3.5 py-3 transition-colors ${on ? "border-foreground/40 bg-card" : "border-border hover:border-foreground/20"}`}>
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground leading-tight">
                  {on && <Check className="w-3.5 h-3.5 text-foreground shrink-0" />}{m.label}
                </span>
                {(m.id === recommended || m.tag) && (
                  <span className="block mt-1 text-[10px] font-semibold tracking-wider uppercase text-primary/90">
                    {[m.id === recommended ? "Recomendado" : null, m.tag].filter(Boolean).join(" · ")}
                  </span>
                )}
                <span className="block mt-1 text-[12px] text-muted-foreground leading-snug">{m.note}</span>
              </span>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[12px] tabular-nums ${on ? "border-foreground/20 text-foreground" : "border-border text-muted-foreground"}`}>
                {fmtNumber(m.credits)} créditos
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function EstudioAvatarPage({ initialModo }: { onNavigate?: (page: string) => void; initialModo?: Modo }) {
  const { user } = useAuth();
  const { profile, productId } = useBusinessProfile();
  const { applyServerCharge, balance } = useCredits();
  const uid = user?.id ?? null;

  const [cfg, setCfg] = useState<{ open: boolean; apimart: boolean; higgsfield: boolean } | null>(null);
  useEffect(() => { invokeStudio<{ open: boolean; apimart: boolean; higgsfield: boolean }>({ action: "config" }).then(setCfg).catch(() => setCfg({ open: false, apimart: false, higgsfield: false })); }, []);

  const [modo, setModo] = useState<Modo>(initialModo ?? "sin-cara");
  const [tab, setTab] = useState<Tab>("imagen");
  const [base, setBase] = useState<Ref | null>(null);
  const [gallery, setGallery] = useState<{ path: string; url: string }[]>([]);
  const [busy, setBusy] = useState("");

  // Base por defecto: el influencer elegido en "Influencer IA" (sin cara).
  const pjFoto = profile.journey?.personaje?.foto ?? null;
  useEffect(() => {
    if (modo !== "sin-cara" || base || !pjFoto) return;
    supabase.storage.from("personajes").createSignedUrl(pjFoto, 3600).then(({ data }) => {
      if (data?.signedUrl) setBase({ bucket: "personajes", path: pjFoto, url: data.signedUrl });
    });
  }, [modo, base, pjFoto]);

  const loadGallery = useCallback(() => {
    invokeStudio<{ items: { path: string; url: string }[] }>({ action: "gallery" }).then(r => setGallery(r.items)).catch(() => undefined);
  }, []);
  useEffect(() => { loadGallery(); }, [loadGallery]);

  const upload = async (file: Blob, name: string, flip = false): Promise<Ref> => {
    if (!uid) throw new Error("Inicia sesión.");
    const blob = await toWebp(file, flip);
    const path = `${uid}/${productId ?? "estudio"}/estudio-${name}-${Date.now()}.webp`;
    const up = await supabase.storage.from("personajes").upload(path, blob, { contentType: "image/webp", upsert: false });
    if (up.error) throw new Error("No se pudo subir la imagen. Intenta de nuevo.");
    const { data } = await supabase.storage.from("personajes").createSignedUrl(path, 3600);
    return { bucket: "personajes", path, url: data?.signedUrl ?? URL.createObjectURL(blob) };
  };

  const pickStock = async (id: string) => {
    const s = STOCK_INFLUENCERS.find(x => x.id === id);
    if (!s) return;
    setBusy(`stock-${id}`);
    try { setBase(await upload(await (await fetch(s.foto)).blob(), `supernova-${id}`)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo elegir."); }
    finally { setBusy(""); }
  };

  const baseInput = useRef<HTMLInputElement>(null);
  const onBaseFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy("base");
    try { setBase(await upload(f, "tu-foto")); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo subir."); }
    finally { setBusy(""); }
  };

  const closed = cfg && !cfg.open;

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader stage="Crear · Estudio de avatar" title="Fotos y videos de tu avatar"
        icon={<Wand2 className="w-5 h-5 text-primary" />}
        line="Elige una foto base, crea escenas con plantillas probadas y dales vida en video."
        details={[
          "1. Fija la cara: la hoja de personaje 3×3 sirve de referencia para que la cara no cambie.",
          "2. Crea escenas: otra ropa, otro lugar, otro ángulo, tu producto en la mano o tu app en pantalla.",
          "3. Dale vida: que hable a cámara con tu guion, o una escena muda para poner tu voz encima.",
          "Tu avatar presenta y explica; nunca dice que compró o que le funcionó (eso sería un testimonio falso).",
        ]} />

      {closed && (
        <p className="card-surface rounded-2xl p-4 text-sm text-muted-foreground">El estudio de avatar se está abriendo poco a poco. Pronto lo tendrás aquí.</p>
      )}

      {/* Modo + foto base */}
      <section className="card-surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Con o sin tu cara">
          {([["sin-cara", "Sin mostrar tu cara"], ["con-cara", "Con tu cara"]] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={modo === id} className={chip(modo === id)}
              onClick={() => { setModo(id); setBase(null); }}>{label}</button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="w-28 shrink-0 aspect-[3/4] rounded-xl overflow-hidden bg-secondary/40 border border-border grid place-items-center">
            {base ? <img src={base.url} alt="Foto base" className="w-full h-full object-cover" /> : <UserRound className="w-8 h-8 text-muted-foreground" />}
          </div>
          <div className="space-y-3 min-w-0 flex-1">
            <p className="text-sm text-foreground font-semibold">Foto base</p>
            {modo === "sin-cara" ? (
              <>
                <p className="text-[13px] text-muted-foreground">Usa tu influencer de "Influencer IA" o uno de los 4 de SUPERNOVA (gratis).</p>
                <div className="flex flex-wrap gap-2">
                  {STOCK_INFLUENCERS.map(s => (
                    <button key={s.id} type="button" onClick={() => pickStock(s.id)} disabled={!!busy}
                      className="flex items-center gap-2 h-10 pl-1 pr-3 rounded-full border border-border hover:bg-secondary/40 text-[13px] disabled:opacity-50">
                      <img src={s.foto} alt="" className="w-8 h-8 rounded-full object-cover" />{s.personaje.nombre}
                      {busy === `stock-${s.id}` && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-[13px] text-muted-foreground">Sube una foto tuya: de frente, buena luz, la cara se vea clara. Solo tu foto, nunca la de otra persona.</p>
                <button type="button" onClick={() => baseInput.current?.click()} disabled={!!busy}
                  className="h-10 px-4 rounded-xl border border-border text-sm inline-flex items-center gap-2 hover:bg-secondary/40 disabled:opacity-50">
                  {busy === "base" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Subir mi foto
                </button>
                <input ref={baseInput} type="file" accept="image/*" className="hidden" onChange={e => onBaseFile(e.target.files?.[0])} />
              </>
            )}
            {gallery.length > 0 && (
              <div>
                <p className="text-[12px] text-muted-foreground mb-1.5">O una que ya creaste aquí:</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {gallery.slice(0, 12).map(g => (
                    <button key={g.path} type="button" onClick={() => setBase({ bucket: "estudio-avatar", path: g.path, url: g.url })}
                      className={`w-14 h-20 shrink-0 rounded-lg overflow-hidden border ${base && "path" in base && base.path === g.path ? "border-primary" : "border-border"}`}>
                      <img src={g.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="flex gap-2" role="tablist" aria-label="Qué crear">
        <button type="button" role="tab" aria-selected={tab === "imagen"} className={chip(tab === "imagen")} onClick={() => setTab("imagen")}><ImageIcon className="inline w-4 h-4 mr-1.5 -mt-0.5" />Imagen</button>
        <button type="button" role="tab" aria-selected={tab === "video"} className={chip(tab === "video")} onClick={() => setTab("video")}><Film className="inline w-4 h-4 mr-1.5 -mt-0.5" />Video</button>
      </div>

      {tab === "imagen"
        ? <ImagenTab base={base} disabled={!!closed} balance={balance} upload={upload}
            onDone={(r, billing, label) => { if (billing) applyServerCharge("gen_media", billing, label); setGallery(g => [r, ...g]); setBase({ bucket: "estudio-avatar", ...r }); }}
            onLocal={setBase} gallery={gallery} />
        : <VideoTab base={base} disabled={!!closed} balance={balance} upload={upload} higgsfield={!!cfg?.higgsfield} productId={productId ?? null}
            onCharge={(billing, label) => applyServerCharge("gen_media", billing, label)} />}
      {!profile.product && <p className="text-[12px] text-muted-foreground">Consejo: si eliges tu producto activo, las imágenes y videos quedan guardados para él.</p>}
    </div>
  );
}

// ───────────────────────── Imagen ─────────────────────────

type Billing = { charged: number; balance: number | null };

function ImagenTab({ base, disabled, balance, upload, onDone, onLocal, gallery }: {
  base: Ref | null; disabled: boolean; balance: number;
  upload: (f: Blob, name: string, flip?: boolean) => Promise<Ref>;
  onDone: (r: { path: string; url: string }, billing: Billing | undefined, label: string) => void;
  onLocal: (r: Ref) => void;
  gallery: { path: string; url: string }[];
}) {
  const [group, setGroup] = useState<ImageGroup>("angulos");
  const [tplId, setTplId] = useState<string>("hoja-personaje");
  const tpl = IMAGE_TEMPLATES.find(t => t.id === tplId) ?? IMAGE_TEMPLATES[0];
  const [fill, setFill] = useState("");
  const [extra, setExtra] = useState<Partial<Record<RefSlot, Ref>>>({});
  const [busy, setBusy] = useState(false);
  // Modelo: el predeterminado de la plantilla (el mejor del momento) o el que elija la persona.
  const [pick, setPick] = useState<ImageModelTier | null>(null);
  const tier = pick ?? tpl.tier;
  const cost = imageCredits(tier);
  const list = IMAGE_TEMPLATES.filter(t => t.group === group);
  const imageModels = useMemo<ModelCard[]>(() => IMAGE_TIER_IDS.map(id => ({
    id, label: IMAGE_TIERS[id].label, note: IMAGE_TIERS[id].note, credits: imageCredits(id), tag: imageTag({ id, label: IMAGE_TIERS[id].label }),
  })), []);

  const choose = (t: ImageTemplate) => { setTplId(t.id); setFill(""); setPick(null); };
  const slots = tpl.refs.filter(s => s !== "persona");
  const ready = !!base && slots.every(s => extra[s]) && (!tpl.fill || fill.trim().length >= 3);

  const crear = async () => {
    if (!base || busy) return;
    if (tpl.local === "flip") {
      setBusy(true);
      try { onLocal(await upload(await (await fetch(base.url)).blob(), "volteada", true)); toast.success("Listo: imagen volteada (gratis)."); }
      catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo voltear."); }
      finally { setBusy(false); }
      return;
    }
    if (balance < cost) { toast.error(`Te faltan créditos: esta imagen cuesta ${cost}.`); return; }
    const refOf = (r: Ref) => ("stock" in r ? { stock: r.stock } : { bucket: r.bucket, path: r.path });
    const refs: Record<string, unknown> = { persona: refOf(base) };
    for (const s of slots) refs[s] = refOf(extra[s]!);
    setBusy(true);
    try {
      const r = await invokeStudio<{ path: string; url: string; billing?: Billing }>({ action: "image", template: tpl.id, model: tier, fill, refs });
      onDone({ path: r.path, url: r.url }, r.billing, `Estudio · ${tpl.label}`);
      track("estudio_avatar_imagen", { plantilla: tpl.id, modelo: tier });
      toast.success("¡Lista! Ya es tu nueva foto base.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo crear la imagen."); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {IMAGE_GROUPS.map(g => <button key={g.id} type="button" className={chip(group === g.id)} onClick={() => { setGroup(g.id); choose(IMAGE_TEMPLATES.find(t => t.group === g.id)!); }}>{g.label}</button>)}
      </div>
      <p className="text-[13px] text-muted-foreground">{IMAGE_GROUPS.find(g => g.id === group)?.line}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {list.map(t => (
          <button key={t.id} type="button" onClick={() => choose(t)}
            className={`text-left rounded-2xl border overflow-hidden transition-colors ${t.id === tplId ? "border-primary" : "border-border hover:border-foreground/20"}`}>
            <div className="aspect-square bg-secondary/40">
              {t.example ? <img src={t.example} alt="" loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center"><Sparkles className="w-6 h-6 text-muted-foreground" /></div>}
            </div>
            <div className="p-2.5">
              <p className="text-[13px] font-semibold text-foreground leading-tight">{t.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{t.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="card-surface rounded-2xl p-5 space-y-3">
        <p className="font-display text-base font-semibold text-foreground">{tpl.label}</p>
        {slots.map(s => (
          <SlotPicker key={s} slot={s} value={extra[s] ?? null} upload={upload} gallery={gallery}
            onChange={r => setExtra(x => ({ ...x, [s]: r ?? undefined }))} />
        ))}
        {tpl.fill && (
          <label className="block space-y-1">
            <span className="text-[13px] text-foreground">{tpl.fill.label}</span>
            <input value={fill} onChange={e => setFill(e.target.value.slice(0, tpl.fill!.max))} placeholder={tpl.fill.placeholder}
              className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm" />
          </label>
        )}
        {!tpl.local && (
          <div className="space-y-1.5">
            <p className="text-[13px] text-foreground">Modelo</p>
            <ModelCards label="Modelo de imagen" items={imageModels} value={tier} recommended={tpl.tier} onChange={id => setPick(id as ImageModelTier)} />
          </div>
        )}
        {!base && <p className="text-[13px] text-muted-foreground">Primero elige la foto base arriba.</p>}
        <button type="button" onClick={crear} disabled={disabled || !ready || busy}
          className="h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {tpl.local ? "Voltear · gratis" : `Crear imagen · ${cost} créditos`}
        </button>
      </div>
    </section>
  );
}

function SlotPicker({ slot, value, onChange, upload, gallery }: {
  slot: RefSlot; value: Ref | null; onChange: (r: Ref | null) => void;
  upload: (f: Blob, name: string) => Promise<Ref>; gallery: { path: string; url: string }[];
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try { onChange(await upload(f, slot)); } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo subir."); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] text-foreground">{REF_LABEL[slot]}</p>
      <div className="flex flex-wrap items-center gap-2">
        {value && <img src={value.url} alt="" className="w-12 h-12 rounded-lg object-cover border border-border" />}
        {slot === "aiFace" ? (
          <>
            {STOCK_INFLUENCERS.map(s => (
              <button key={s.id} type="button" onClick={() => onChange({ stock: s.id, url: s.foto })}
                className={`w-10 h-10 rounded-full overflow-hidden border ${value && "stock" in value && value.stock === s.id ? "border-primary" : "border-border"}`}>
                <img src={s.foto} alt={s.personaje.nombre} className="w-full h-full object-cover" />
              </button>
            ))}
            {gallery.slice(0, 6).map(g => (
              <button key={g.path} type="button" onClick={() => onChange({ bucket: "estudio-avatar", path: g.path, url: g.url })}
                className="w-10 h-10 rounded-lg overflow-hidden border border-border"><img src={g.url} alt="" className="w-full h-full object-cover" /></button>
            ))}
            <span className="text-[11px] text-muted-foreground w-full">Solo caras creadas con IA: así nadie pone la cara de una persona real.</span>
          </>
        ) : (
          <>
            <button type="button" onClick={() => input.current?.click()} disabled={busy}
              className="h-9 px-3 rounded-lg border border-border text-[13px] inline-flex items-center gap-1.5 hover:bg-secondary/40 disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} {value ? "Cambiar" : "Subir"}
            </button>
            <input ref={input} type="file" accept="image/*" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
          </>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Video ─────────────────────────

function VideoTab({ base, disabled, balance, upload, higgsfield, productId, onCharge }: {
  base: Ref | null; disabled: boolean; balance: number; higgsfield: boolean; productId: string | null;
  upload: (f: Blob, name: string) => Promise<Ref>;
  onCharge: (billing: Billing, label: string) => void;
}) {
  const [format, setFormat] = useState<VideoFormat>("camara");
  const f = VIDEO_FORMATS.find(x => x.id === format)!;
  const models = useMemo(() => VIDEO_MODELS.filter(m => (m.provider === "apimart" || higgsfield) && (!f.talks || m.talks)), [higgsfield, f.talks]);
  // Predeterminado: el recomendado para este formato (habla → Omni, sin hablar → Grok); la persona puede cambiarlo.
  const [modelId, setModelId] = useState<string | null>(null);
  const recommended = bestFor(f.talks ? "habla" : "sin-hablar", models);
  const model = models.find(m => m.id === modelId) ?? recommended ?? models[0];
  const [seconds, setSeconds] = useState<5 | 10>(10);
  const realSec = model ? videoSeconds(model, seconds) : seconds;
  const [camera, setCamera] = useState("quieta-gestos");
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [script, setScript] = useState("");
  const [voice, setVoice] = useState("m28");
  const [accent, setAccent] = useState("latam");
  const [action, setAction] = useState("cafe");
  const [place, setPlace] = useState("ventana");
  const [surface, setSurface] = useState("");
  const [product, setProduct] = useState<Ref | null>(null);
  const [busy, setBusy] = useState<{ progress: number | null } | null>(null);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const cost = model ? videoCredits(model, seconds) : 0;
  // Qué modelo conviene para este formato (habla → Omni; sin hablar → Grok o el más parecido que haya).
  const tip = adviceFor(f.talks ? "habla" : "sin-hablar", models, model?.id);
  const words = wordCount(script), max = maxWords(realSec);

  const loadJobs = useCallback(async () => {
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from("video_jobs").select("id,status,prompt,result_url,seconds,created_at,kind,template,model")
      .eq("kind", "avatar").gte("created_at", since).order("created_at", { ascending: false }).limit(8);
    const list = (data ?? []) as VideoJob[];
    const pending = list.filter(j => j.status === "running" || j.status === "queued");
    if (pending.length) await Promise.all(pending.map(j => invokeStudio({ action: "status", job_id: j.id }).catch(() => null)));
    setJobs(pending.length ? (((await (supabase as any).from("video_jobs").select("id,status,prompt,result_url,seconds,created_at,kind,template,model") // eslint-disable-line @typescript-eslint/no-explicit-any
      .eq("kind", "avatar").gte("created_at", since).order("created_at", { ascending: false }).limit(8)).data ?? []) as VideoJob[]) : list);
  }, []);
  useEffect(() => { void loadJobs(); }, [loadJobs]);

  const productInput = useRef<HTMLInputElement>(null);
  const needsProductRef = !!(model?.productRef && f.needsProduct);

  const crear = async () => {
    if (!base || !model || busy) return;
    if (f.talks && words < 3) { toast.error("Escribe lo que va a decir."); return; }
    if (f.talks && words > max) { toast.error(`Para ${realSec} s caben unas ${max} palabras.`); return; }
    if (balance < cost) { toast.error(`Te faltan créditos: este video cuesta ${cost}.`); return; }
    const refOf = (r: Ref) => ("stock" in r ? null : { bucket: r.bucket, path: r.path });
    setBusy({ progress: null });
    try {
      const r = await invokeStudio<{ job: VideoJob; billing?: Billing }>({
        action: "video", model: model.id, seconds, image: refOf(base), product: product ? refOf(product) : undefined, product_id: productId ?? undefined,
        parts: { format, camera, before: before || undefined, after: after || undefined, script, voice, accent, action, place, surface },
      });
      if (r.billing) onCharge(r.billing, `Estudio · video ${realSec} s`);
      void loadJobs();
      const done = await waitForVideo(r.job.id, p => setBusy({ progress: p }), { check: b => invokeStudio(b) });
      if (done.status !== "done") throw new Error("El video falló. Te devolvimos los créditos.");
      track("estudio_avatar_video", { modelo: model.id, formato: format, segundos: realSec });
      toast.success("¡Tu video está listo!");
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo crear el video."); }
    finally { setBusy(null); void loadJobs(); }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {VIDEO_FORMATS.map(x => <button key={x.id} type="button" className={chip(format === x.id)} onClick={() => { if (x.talks !== f.talks) setModelId(null); setFormat(x.id); }}>{x.label}</button>)}
      </div>
      <p className="text-[13px] text-muted-foreground">{f.desc}{f.needsProduct && !needsProductRef && format !== "broll-producto" ? " Usa como foto base una donde ya tenga tu producto en la mano (Imagen → Tu producto)." : ""}{format === "broll-producto" ? " Usa como foto base la foto de tu producto." : ""}</p>

      <div className="card-surface rounded-2xl p-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <span className="text-[13px] text-foreground">Modelo</span>
          <ModelCards label="Modelo de video" value={model?.id} recommended={recommended?.id} onChange={setModelId}
            items={models.map(m => ({ id: m.id, label: m.label, note: m.note, credits: videoCredits(m, seconds) }))} />
          {tip && (tip.ok
            ? <span className="block text-[11px] text-muted-foreground">Buena elección para este video.</span>
            : <span className="block text-[11px] text-muted-foreground">{tip.text}{" "}
                <button type="button" onClick={() => setModelId(tip.best.id)} className="text-primary font-semibold hover:underline">Usar {tip.best.label}</button>
              </span>)}
        </div>
        <div className="space-y-1">
          <span className="text-[13px] text-foreground">Duración</span>
          <div className="flex gap-2">{([5, 10] as const).map(s => <button key={s} type="button" className={chip(seconds === s)} onClick={() => setSeconds(s)}>{model ? videoSeconds(model, s) : s} s</button>)}</div>
        </div>
        {format !== "broll-producto" && (
          <label className="space-y-1 block">
            <span className="text-[13px] text-foreground">Cámara</span>
            <select className={select} value={camera} onChange={e => setCamera(e.target.value)}>
              {CAMERAS.map(c => <option key={c.id} value={c.id}>{c.label} · {c.hint}</option>)}
            </select>
          </label>
        )}

        {f.talks ? (
          <>
            <label className="space-y-1 block sm:col-span-2">
              <span className="text-[13px] text-foreground">Lo que dice <span className="text-muted-foreground">({words}/{max} palabras)</span></span>
              <textarea value={script} onChange={e => setScript(e.target.value.slice(0, 400))} rows={3}
                placeholder="Ej.: Si vendes por WhatsApp y nadie te responde, mira esto: te enseño a escribir el primer mensaje."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
              <span className="text-[11px] text-muted-foreground">Presenta o explica. Nada de "lo compré", "me funcionó" ni cifras de dinero.</span>
            </label>
            <label className="space-y-1 block">
              <span className="text-[13px] text-foreground">Gesto antes de hablar (opcional)</span>
              <select className={select} value={before} onChange={e => setBefore(e.target.value)}>
                <option value="">Ninguno</option>{GESTURES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            </label>
            <label className="space-y-1 block">
              <span className="text-[13px] text-foreground">Gesto al terminar (opcional)</span>
              <select className={select} value={after} onChange={e => setAfter(e.target.value)}>
                <option value="">Ninguno</option>{GESTURES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            </label>
            <label className="space-y-1 block">
              <span className="text-[13px] text-foreground">Voz</span>
              <select className={select} value={voice} onChange={e => setVoice(e.target.value)}>
                {VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </label>
            <label className="space-y-1 block">
              <span className="text-[13px] text-foreground">Acento</span>
              <select className={select} value={accent} onChange={e => setAccent(e.target.value)}>
                {ACCENTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
          </>
        ) : format === "sin-hablar" ? (
          <>
            <label className="space-y-1 block">
              <span className="text-[13px] text-foreground">Qué hace</span>
              <select className={select} value={action} onChange={e => setAction(e.target.value)}>
                {BROLL_ACTIONS.map(a => <option key={a.id} value={a.id}>{a.group} · {a.label}</option>)}
              </select>
            </label>
            <label className="space-y-1 block">
              <span className="text-[13px] text-foreground">Lugar y luz</span>
              <select className={select} value={place} onChange={e => setPlace(e.target.value)}>
                {PLACES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
          </>
        ) : format === "broll-producto" ? (
          <label className="space-y-1 block">
            <span className="text-[13px] text-foreground">Sobre qué superficie</span>
            <input value={surface} onChange={e => setSurface(e.target.value.slice(0, 80))} placeholder="Ej.: a marble counter" className={select} />
          </label>
        ) : null}

        {needsProductRef && (
          <div className="space-y-1 sm:col-span-2">
            <span className="text-[13px] text-foreground">Foto de tu producto</span>
            <div className="flex items-center gap-2">
              {product && <img src={product.url} alt="" className="w-12 h-12 rounded-lg object-cover border border-border" />}
              <button type="button" onClick={() => productInput.current?.click()} className="h-9 px-3 rounded-lg border border-border text-[13px] inline-flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" />{product ? "Cambiar" : "Subir"}</button>
              <input ref={productInput} type="file" accept="image/*" className="hidden"
                onChange={async e => { const file = e.target.files?.[0]; if (file) { try { setProduct(await upload(file, "producto")); } catch (err) { toast.error(err instanceof Error ? err.message : "No se pudo subir."); } } }} />
            </div>
          </div>
        )}

        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <button type="button" onClick={crear} disabled={disabled || !base || !model || !!busy || (needsProductRef && !product)}
            className="h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
            {busy ? `Creando${busy.progress ? ` ${Math.round(busy.progress)} %` : "…"}` : `Crear video · ${cost} créditos`}
          </button>
          {!base && <span className="text-[13px] text-muted-foreground">Primero elige la foto base arriba.</span>}
          {busy && <span className="text-[12px] text-muted-foreground">Tarda de 1 a 5 minutos. Puedes salir: aparecerá abajo.</span>}
        </div>
      </div>

      {jobs.length > 0 && (
        <div className="card-surface rounded-2xl p-5 space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Tus videos de los últimos 7 días</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {jobs.map(j => (
              <div key={j.id} className="rounded-xl border border-border overflow-hidden">
                {j.status === "done" && j.result_url
                  ? <video src={j.result_url} controls playsInline className="w-full aspect-[9/16] bg-black object-cover" />
                  : <div className="w-full aspect-[9/16] grid place-items-center bg-secondary/40 text-[12px] text-muted-foreground text-center px-2">
                      {j.status === "failed" ? "Falló · créditos devueltos" : <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Creando…</span>}
                    </div>}
                {j.status === "done" && j.result_url && (
                  <button type="button" onClick={() => downloadVideo(j.result_url!, `supernova-avatar-${j.id.slice(0, 8)}.mp4`)}
                    className="w-full h-9 text-[12px] inline-flex items-center justify-center gap-1.5 hover:bg-secondary/40"><Download className="w-3.5 h-3.5" />Descargar</button>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground"><Check className="inline w-3 h-3 mr-1" />Descárgalos pronto: el enlace del proveedor caduca.</p>
        </div>
      )}
    </section>
  );
}

export default EstudioAvatarPage;
