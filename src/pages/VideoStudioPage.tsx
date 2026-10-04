import { useCallback, useEffect, useRef, useState } from "react";
import { Clapperboard, Download, Film, Loader2, Play, Sparkles, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/hooks/useCredits";
import { useBusinessProfile, profileReady } from "@/lib/businessProfile";

/**
 * Estudio de video (03-oct-2026): un clip suelto o una SERIE encadenada (novela, dibujos animados,
 * anuncio, short) con Seedance 2.0 Mini en APIMart, vía la función video-studio. El servidor cobra
 * antes de generar (vid_mini_5 = 55 créditos, vid_mini_10 = 110) y devuelve los créditos si falla.
 * En una serie, el último cuadro de cada clip es la imagen inicial del siguiente: la historia se ve
 * continua. Los enlaces de APIMart duran 24 h: el usuario descarga sus videos.
 */
type Mode = "clip" | "serie";
type Size = "9:16" | "16:9" | "1:1";
type Job = { id: string; status: "queued" | "running" | "done" | "failed"; result_url: string | null; last_frame_url?: string | null; prompt: string; seconds: number; created_at?: string };
type Scene = { text: string; job?: Job; error?: string };

const PRICE = { 5: 55, 10: 110 } as const;

const STYLES: { id: string; label: string; hint: string }[] = [
  { id: "real", label: "Realista", hint: "Estilo cinematográfico realista, luz natural, cámara estable, gente latina natural." },
  { id: "novela", label: "Novela", hint: "Estilo telenovela cinematográfica, emociones intensas, primeros planos, luz cálida, gente latina." },
  { id: "dibujos", label: "Dibujos animados", hint: "Animación 3D estilo película familiar, colores vivos, personajes expresivos, original (sin personajes con derechos)." },
  { id: "anime", label: "Anime", hint: "Estilo anime original, trazos limpios, colores intensos, personajes originales." },
  { id: "anuncio", label: "Anuncio UGC", hint: "Video estilo UGC grabado con celular, una persona latina habla a cámara con naturalidad, en español." },
];

const TEMPLATES: { id: string; label: string; style: string; scenes: string[] }[] = [
  { id: "novela", label: "Novela en 3 escenas", style: "novela", scenes: [
    "Escena 1 (gancho): ella descubre algo inesperado y su cara cambia por completo.",
    "Escena 2 (conflicto): la discusión sube de tono entre los dos, miradas tensas.",
    "Escena 3 (giro): una revelación final que deja a todos en silencio.",
  ] },
  { id: "dibujos", label: "Dibujos animados", style: "dibujos", scenes: [
    "Escena 1: el personaje principal despierta en un lugar mágico y lo explora con curiosidad.",
    "Escena 2: aparece un amigo inesperado que le pide ayuda con un problema.",
    "Escena 3: juntos lo resuelven y celebran.",
  ] },
  { id: "anuncio", label: "Anuncio de mi producto", style: "anuncio", scenes: [
    "Escena 1 (gancho): una persona muestra el problema que vive todos los días.",
    "Escena 2: descubre el producto y lo usa por primera vez.",
    "Escena 3 (cierre): muestra el resultado con alegría e invita a escribir por WhatsApp.",
  ] },
  { id: "short", label: "Short vertical", style: "real", scenes: [
    "Golpe 1: algo sorprendente en el primer segundo.",
    "Golpe 2: la explicación rápida.",
    "Golpe 3: el remate que invita a seguir la cuenta.",
  ] },
];

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("video-studio", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const msg = ctx ? await ctx.json().then((b: { error?: string }) => b?.error).catch(() => null) : null;
    throw new Error(msg || "No se pudo crear el video.");
  }
  return data as { job: Job; billing?: { charged: number; balance: number | null }; error?: string };
}

/** Espera a que el clip termine (consulta cada 6 s, hasta ~6 min). */
async function waitFor(jobId: string, onTick?: () => void): Promise<Job> {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 6000));
    onTick?.();
    const r = await invoke({ action: "status", job_id: jobId });
    if (r.job.status === "done" || r.job.status === "failed") return r.job;
  }
  throw new Error("El video está tardando más de lo normal. Revisa en unos minutos en \"Tus videos\".");
}

async function downloadVideo(url: string, name: string) {
  try {
    const blob = await (await fetch(url)).blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(href), 5000);
  } catch {
    window.open(url, "_blank", "noopener"); // si el proveedor no deja descargar directo, se abre aparte
  }
}

export function VideoStudioPage({ initialMode = "clip" }: { initialMode?: Mode }) {
  const { user } = useAuth();
  const { profile, productId } = useBusinessProfile();
  const { applyServerCharge, balance } = useCredits();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [style, setStyle] = useState("real");
  const [size, setSize] = useState<Size>("9:16");
  const [seconds, setSeconds] = useState<5 | 10>(5);
  const [audio, setAudio] = useState(true);
  const [idea, setIdea] = useState("");
  const [cast, setCast] = useState("");
  const [scenes, setScenes] = useState<Scene[]>(TEMPLATES[0].scenes.map(text => ({ text })));
  const [clip, setClip] = useState<Scene | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Job[]>([]);
  const [playAll, setPlayAll] = useState<number | null>(null);
  const playerRef = useRef<HTMLVideoElement>(null);

  // Idea de arranque desde el producto (anuncio) si lo hay.
  useEffect(() => {
    if (profileReady(profile) && !idea) setIdea(`Una persona latina descubre ${profile.product} y su vida mejora: ${profile.promise}.`);
  }, [profile, idea]);

  const loadRecent = useCallback(async () => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from("video_jobs").select("id,status,result_url,prompt,seconds,created_at")
      .eq("user_id", user.id).eq("provider", "apimart").eq("status", "done")
      .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString())
      .order("created_at", { ascending: false }).limit(8);
    setRecent((data ?? []) as Job[]);
  }, [user]);
  useEffect(() => { void loadRecent(); }, [loadRecent]);

  const styleHint = STYLES.find(s => s.id === style)?.hint ?? "";
  const promptFor = (text: string) => [text.trim(), cast.trim() ? `Personajes y lugar (iguales en todas las escenas): ${cast.trim()}` : "", styleHint].filter(Boolean).join("\n");

  const runOne = async (text: string, fromJob?: string): Promise<Job> => {
    const r = await invoke({ prompt: promptFor(text), seconds, size, audio, product_id: productId ?? undefined, ...(fromJob ? { from_job_id: fromJob } : {}) });
    if (r.billing) applyServerCharge("gen_media", r.billing, `Video IA ${seconds} s`);
    const done = await waitFor(r.job.id);
    if (done.status !== "done") throw new Error("El video falló. Te devolvimos los créditos.");
    return done;
  };

  const startClip = async () => {
    if (busy || idea.trim().length < 5) return;
    if (balance < PRICE[seconds]) { toast.error(`Te faltan créditos: este video cuesta ${PRICE[seconds]}`); return; }
    setBusy(true); setClip({ text: idea });
    try {
      const job = await runOne(idea);
      setClip({ text: idea, job });
      void loadRecent();
    } catch (e) {
      setClip({ text: idea, error: e instanceof Error ? e.message : "No se pudo crear el video." });
    } finally { setBusy(false); }
  };

  const startSerie = async () => {
    const list = scenes.filter(s => s.text.trim().length >= 5);
    if (busy || list.length < 2) { toast.error("Escribe al menos 2 escenas."); return; }
    const total = list.length * PRICE[seconds];
    if (balance < total) { toast.error(`Te faltan créditos: esta serie cuesta ${total}`); return; }
    setBusy(true);
    setScenes(list.map(s => ({ text: s.text })));
    let prev: Job | undefined;
    for (let i = 0; i < list.length; i++) {
      try {
        // Continuidad: el último cuadro del clip anterior es la imagen inicial de este.
        const job = await runOne(list[i].text, prev?.last_frame_url ? prev.id : undefined);
        prev = job;
        setScenes(cur => cur.map((s, j) => (j === i ? { ...s, job } : s)));
      } catch (e) {
        setScenes(cur => cur.map((s, j) => (j === i ? { ...s, error: e instanceof Error ? e.message : "Falló este clip." } : s)));
        break; // sin este clip no hay cuadro para seguir la historia
      }
    }
    setBusy(false);
    void loadRecent();
  };

  const doneScenes = scenes.filter(s => s.job?.result_url);
  useEffect(() => {
    if (playAll === null || !playerRef.current) return;
    playerRef.current.src = doneScenes[playAll]?.job?.result_url ?? "";
    void playerRef.current.play().catch(() => {});
  }, [playAll]); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (on: boolean) => `h-8 px-3 rounded-full border text-[12px] transition-colors ${on ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground hover:text-foreground"}`;
  const VideoCard = ({ s, label }: { s: Scene; label: string }) => (
    <div className="rounded-2xl border border-border overflow-hidden bg-card/40">
      <div className={`relative bg-black ${size === "16:9" ? "aspect-video" : size === "1:1" ? "aspect-square" : "aspect-[9/16] max-h-[520px] mx-auto"}`}>
        {s.job?.result_url ? <video src={s.job.result_url} controls playsInline className="w-full h-full object-contain" />
          : s.error ? <p className="absolute inset-0 m-auto h-fit px-4 text-center text-[12px] text-muted-foreground">{s.error}</p>
          : <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin" /><span className="text-[11px]">Creando… 1 a 3 min</span></div>}
      </div>
      <div className="p-3 flex items-center gap-2">
        <span className="text-[12px] text-foreground truncate flex-1">{label}</span>
        {s.job?.result_url && (
          <button onClick={() => void downloadVideo(s.job!.result_url!, `supernova-${label.replace(/\W+/g, "-").toLowerCase()}.mp4`)} aria-label="Descargar" className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground">
            <Download className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  const count = mode === "clip" ? 1 : scenes.filter(s => s.text.trim().length >= 5).length;

  return (
    <div className="max-w-[1180px] mx-auto space-y-6 py-4">
      <div>
        <h1 className="font-display font-bold text-2xl text-foreground">{mode === "clip" ? "Video con IA" : "Series de video"}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === "clip" ? "Describe la escena y la IA la graba por ti, con sonido." : "Novelas, dibujos animados o anuncios en escenas que siguen una a la otra: el final de cada clip es el inicio del siguiente."}
        </p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setMode("clip")} disabled={busy} className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-full border text-[13px] ${mode === "clip" ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground"}`}><Film className="w-4 h-4" /> Un clip</button>
        <button onClick={() => setMode("serie")} disabled={busy} className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-full border text-[13px] ${mode === "serie" ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground"}`}><Clapperboard className="w-4 h-4" /> Serie</button>
      </div>

      <div className="rounded-2xl border border-border p-5 space-y-4">
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Estilo</p>
          <div className="flex flex-wrap gap-2">{STYLES.map(s => <button key={s.id} onClick={() => setStyle(s.id)} className={chip(style === s.id)}>{s.label}</button>)}</div>
        </div>

        {mode === "clip" ? (
          <textarea value={idea} onChange={e => setIdea(e.target.value.slice(0, 600))} rows={3}
            placeholder="Ej.: Una mamá latina en su cocina descubre una receta fácil y sonríe a cámara."
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60" />
        ) : (
          <>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Plantilla</p>
              <div className="flex flex-wrap gap-2">
                {TEMPLATES.map(t => (
                  <button key={t.id} disabled={busy} onClick={() => { setStyle(t.style); setScenes(t.scenes.map(text => ({ text }))); }} className={chip(false)}>{t.label}</button>
                ))}
              </div>
            </div>
            <input value={cast} onChange={e => setCast(e.target.value.slice(0, 300))}
              placeholder="Personajes y lugar (opcional): Ej.: Ana, 30 años, cabello rizado, vestido rojo; cocina de casa en Santo Domingo"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60" />
            <div className="space-y-2">
              {scenes.map((s, i) => (
                <textarea key={i} value={s.text} rows={2} disabled={busy}
                  onChange={e => setScenes(list => list.map((x, j) => (j === i ? { text: e.target.value.slice(0, 400) } : x)))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
              ))}
              {scenes.length < 6 && !busy && (
                <button onClick={() => setScenes(list => [...list, { text: "" }])} className="text-[12px] text-muted-foreground hover:text-foreground">+ Añadir escena</button>
              )}
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex gap-2">{(["9:16", "16:9", "1:1"] as Size[]).map(s => <button key={s} onClick={() => setSize(s)} className={chip(size === s)}>{s === "9:16" ? "Vertical" : s === "16:9" ? "YouTube" : "Cuadrado"}</button>)}</div>
          <div className="flex gap-2">{([5, 10] as const).map(n => <button key={n} onClick={() => setSeconds(n)} className={chip(seconds === n)}>{n} s</button>)}</div>
          <button onClick={() => setAudio(a => !a)} className={chip(audio)}>{audio ? <><Volume2 className="w-3.5 h-3.5 inline mr-1" />Con sonido</> : <><VolumeX className="w-3.5 h-3.5 inline mr-1" />Sin sonido</>}</button>
        </div>

        <button onClick={() => void (mode === "clip" ? startClip() : startSerie())} disabled={busy}
          className="btn-primary-nova inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-semibold disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {busy ? "Creando tu video…" : `${mode === "clip" ? "Crear video" : `Crear serie de ${count} clips`} · ${count * PRICE[seconds]} créditos`}
        </button>
        <p className="text-[11px] text-muted-foreground">Si un video falla, no se te cobra. Descarga tus videos: el enlace dura 24 horas.</p>
      </div>

      {mode === "clip" && clip && <div className="max-w-md"><VideoCard s={clip} label="Tu video" /></div>}

      {mode === "serie" && scenes.some(s => s.job || s.error) && (
        <section className="space-y-3">
          {doneScenes.length >= 2 && (
            <div className="rounded-2xl border border-border p-4 space-y-3">
              <button onClick={() => setPlayAll(0)} className="inline-flex items-center gap-2 text-[13px] font-semibold text-foreground"><Play className="w-4 h-4" /> Ver la serie completa</button>
              {playAll !== null && (
                <video ref={playerRef} controls playsInline className="w-full max-h-[520px] bg-black rounded-xl"
                  onEnded={() => setPlayAll(i => (i !== null && i + 1 < doneScenes.length ? i + 1 : null))} />
              )}
            </div>
          )}
          <div className={`grid gap-4 ${size === "16:9" ? "sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-3"}`}>
            {scenes.map((s, i) => (s.job || s.error || busy) && <VideoCard key={i} s={s} label={`Escena ${i + 1}`} />)}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <h2 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-foreground mb-3">Tus videos de hoy</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {recent.map(j => j.result_url && (
              <div key={j.id} className="rounded-xl border border-border overflow-hidden bg-black">
                <video src={j.result_url} controls playsInline preload="metadata" className="w-full aspect-[9/16] object-contain" />
                <button onClick={() => void downloadVideo(j.result_url!, `supernova-video-${j.id.slice(0, 6)}.mp4`)} className="w-full py-2 text-[11px] text-muted-foreground hover:text-foreground bg-card">Descargar</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
