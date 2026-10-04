import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard, Download, Film, Loader2, Megaphone, Play, RefreshCw, Sparkles, UserRound, Volume2, VolumeX, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits, generatorCost } from "@/hooks/useCredits";
import { useBusinessProfile, profileReady } from "@/lib/businessProfile";
import { QuickBrief } from "@/components/QuickBrief";
import { track } from "@/lib/analytics";
import { takeSeed, type CreativeSeed } from "@/lib/creativeSeed";
import {
  SERIE_STYLES, SERIE_TEMPLATES, SPEECH_HINT, VIDEO_PRICE, VIDEO_TEMPLATES,
  buildShots, cleanBrief, hasForbiddenClaim, improvePrompt, parseImprovedLines, planCost, publishText,
  recommendTemplate, retryFromIndex, serieFromBrief, shotPrompt, videoSizeFor,
  type Shot, type VideoBrief, type VideoMode, type VideoSize, type VideoTemplateId,
} from "@/lib/videoTemplates";
import { PresenterPicker } from "@/components/video/PresenterPicker";
import { ReadyToPublish } from "@/components/video/ReadyToPublish";
import {
  createVideo, downloadVideo, invokeVideo, loadVideoConfig, streamUgcScript, takePresenter, waitForVideo,
  type CreateBody, type VideoJob,
} from "@/components/video/videoApi";

/**
 * Estudio de video (03-oct-2026; anuncio y UGC el 04-oct-2026). Cuatro modos con Seedance 2.0 Mini
 * en APIMart, vía la función video-studio (cobra el servidor antes de generar y devuelve si falla):
 * - Clip: una escena suelta (55 / 110 créditos).
 * - Serie: escenas encadenadas por el último cuadro (novela, dibujos, short).
 * - Anuncio: 3 tomas de 5 s (gancho, demo, llamada) = 165. La IA elige la plantilla.
 * - UGC: un presentador IA habla a cámara 10 s en español = 110. Nunca testimonio.
 * Llega con una "semilla" desde una idea (Radar, Ofertas, creativos de LUMEN): si el botón tocado
 * mostraba el costo (`autostart`), genera sin otro toque. Los enlaces duran 24 h: se descargan.
 */
type Scene = { text: string; label?: string; job?: VideoJob; error?: string; progress?: number | null };
type Mode = VideoMode;

const MODES: { id: Mode; label: string; icon: typeof Film }[] = [
  { id: "anuncio", label: "Anuncio", icon: Megaphone },
  { id: "ugc", label: "UGC", icon: UserRound },
  { id: "clip", label: "Un clip", icon: Film },
  { id: "serie", label: "Serie", icon: Clapperboard },
];
const TITLES: Record<Mode, { h: string; p: string }> = {
  clip: { h: "Video con IA", p: "Describe la escena y la IA la graba por ti, con sonido." },
  serie: { h: "Series de video", p: "Novelas, dibujos animados o shorts en escenas que siguen una a la otra: el final de cada clip es el inicio del siguiente." },
  anuncio: { h: "Anuncio en video", p: "3 tomas de 5 segundos: gancho, demostración y llamada a la acción. La IA arma el guion; tú solo lo creas." },
  ugc: { h: "UGC con IA", p: "Un presentador creado con IA habla a cámara de tu producto, en español latino. Explica y presenta; nunca finge ser cliente." },
};
const SEED_MODE: Partial<Record<CreativeSeed["target"], Mode>> = { video_anuncio: "anuncio", video_ugc: "ugc", serie: "serie" };

export function VideoStudioPage({ initialMode = "clip" }: { initialMode?: Mode }) {
  const { user } = useAuth();
  const { profile, loaded, savePatch, productId } = useBusinessProfile();
  const { applyServerCharge, balance } = useCredits();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [seed, setSeed] = useState<CreativeSeed | null>(null);
  const [ugcOpen, setUgcOpen] = useState<boolean | null>(null);

  // Clip y serie
  const [style, setStyle] = useState("real");
  const [size, setSize] = useState<VideoSize>("9:16");
  const [seconds, setSeconds] = useState<5 | 10>(5);
  const [audio, setAudio] = useState(true);
  const [idea, setIdea] = useState("");
  const [cast, setCast] = useState("");
  const [scenes, setScenes] = useState<Scene[]>(SERIE_TEMPLATES[0].scenes.map(text => ({ text })));
  const [clip, setClip] = useState<Scene | null>(null);

  // Anuncio y UGC
  const [templateId, setTemplateId] = useState<VideoTemplateId | null>(null); // null = la que eligió la IA
  const [showTemplates, setShowTemplates] = useState(false);
  const [lineEdits, setLineEdits] = useState<string[] | null>(null);
  const [presenter, setPresenter] = useState<string | null>(null);
  const [firstFrame, setFirstFrame] = useState<string | null>(null);
  const [firstFrameUrl, setFirstFrameUrl] = useState<string | null>(null);
  const [run, setRun] = useState<Scene[]>([]);
  const [improving, setImproving] = useState(false);

  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<VideoJob[]>([]);
  const [playAll, setPlayAll] = useState<number | null>(null);
  const playerRef = useRef<HTMLVideoElement>(null);
  const autoRef = useRef(false);

  // Semilla de una idea (se lee una vez y se borra) y presentador elegido en "Sin mostrar tu cara".
  useEffect(() => {
    const s = takeSeed(["video_anuncio", "video_ugc", "serie"]);
    if (s) {
      setSeed(s);
      const m = SEED_MODE[s.target];
      if (m) setMode(m);
      setSize(videoSizeFor(s.aspect, m ?? initialMode));
      if (s.target === "serie") setScenes(serieFromBrief(s).map(text => ({ text })));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user) return;
    const p = takePresenter(user.id);
    if (p) { setPresenter(p); setMode("ugc"); }
  }, [user]);
  useEffect(() => { if (seed?.imagePath && user && seed.imagePath.startsWith(`${user.id}/`)) setFirstFrame(seed.imagePath); }, [seed, user]);
  useEffect(() => {
    if (!firstFrame) { setFirstFrameUrl(null); return; }
    let alive = true;
    void supabase.storage.from("creativos").createSignedUrl(firstFrame, 3600).then(({ data }) => { if (alive) setFirstFrameUrl(data?.signedUrl ?? null); });
    return () => { alive = false; };
  }, [firstFrame]);
  useEffect(() => { if (mode === "ugc" && ugcOpen === null) void loadVideoConfig().then(c => setUgcOpen(c.ugc)); }, [mode, ugcOpen]);

  // Idea de arranque del clip desde el producto, si lo hay.
  useEffect(() => {
    if (profileReady(profile) && !idea) setIdea(`Una persona latina descubre ${profile.product} y su vida mejora: ${profile.promise}.`);
  }, [profile, idea]);

  // ---------- Brief, plantilla y tomas (anuncio / UGC) ----------
  const brief: VideoBrief | null = useMemo(() => {
    if (seed) return cleanBrief({ product: seed.product || seed.title, who: seed.who, promise: seed.promise, angle: seed.angle, hook: seed.hook });
    if (profileReady(profile)) return cleanBrief({ product: profile.product, who: profile.who, promise: profile.promise });
    return null;
  }, [seed, profile]);
  const adMode = mode === "anuncio" || mode === "ugc" ? mode : null;
  const pick = useMemo(() => (brief && adMode ? recommendTemplate(brief, adMode) : null), [brief, adMode]);
  const template: VideoTemplateId = templateId ?? pick?.id ?? "problema_solucion";
  const baseShots: Shot[] = useMemo(() => (brief && adMode ? buildShots(adMode, template, brief) : []), [brief, adMode, template]);
  const shots: Shot[] = useMemo(() => baseShots.map((s, i) => ({ ...s, line: lineEdits?.[i] ?? s.line })), [baseShots, lineEdits]);
  useEffect(() => { setLineEdits(null); }, [baseShots]);

  const loadRecent = useCallback(async () => {
    if (!user) return;
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    // Trabajos que quedaron "running" (se cerró la pantalla o se cortó la espera): se pregunta su
    // estado (gratis, máx. 8). Así aparecen los que salieron bien y se devuelven los que fallaron.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pending } = await (supabase as any).from("video_jobs").select("id")
        .eq("user_id", user.id).eq("provider", "apimart").in("status", ["queued", "running"]).gte("created_at", since)
        .order("created_at", { ascending: false }).limit(8);
      await Promise.all(((pending ?? []) as { id: string }[]).map(j => invokeVideo({ action: "status", job_id: j.id }).catch(() => null)));
    } catch { /* si falla, se muestra lo que ya está listo */ }
    const query = (cols: string) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("video_jobs").select(cols)
        .eq("user_id", user.id).eq("provider", "apimart").eq("status", "done").gte("created_at", since);
    const first = await query("id,status,result_url,prompt,seconds,created_at,kind").eq("kind", mode).order("created_at", { ascending: false }).limit(8);
    // La base aún sin la columna "kind" (migración sin aplicar): se muestran todos, como antes.
    const res = first.error ? await query("id,status,result_url,prompt,seconds,created_at").order("created_at", { ascending: false }).limit(8) : first;
    setRecent((res.data ?? []) as VideoJob[]);
  }, [user, mode]);
  useEffect(() => { void loadRecent(); }, [loadRecent]);

  // ---------- Generar ----------
  const styleHint = SERIE_STYLES.find(s => s.id === style)?.hint ?? "";
  const promptFor = (text: string) => [text.trim(), cast.trim() ? `Personajes y lugar (iguales en todas las escenas): ${cast.trim()}` : "", styleHint, SPEECH_HINT].filter(Boolean).join("\n");

  const runOne = async (body: CreateBody, label: string, onProgress?: (p: number | null) => void): Promise<VideoJob> => {
    const r = await createVideo({ ...body, product_id: productId ?? undefined });
    if (r.billing) applyServerCharge(body.seconds >= 10 ? "vid_mini_10" : "vid_mini_5", r.billing, `${label} ${body.seconds} s`);
    const done = await waitForVideo(r.job.id, onProgress);
    if (done.status !== "done") throw new Error("El video falló. Te devolvimos los créditos.");
    return done;
  };

  const startClip = async () => {
    if (busy || idea.trim().length < 5) { if (!busy) toast.error("Describe qué pasa en el video."); return; }
    if (balance < VIDEO_PRICE[seconds]) { toast.error(`Te faltan créditos: este video cuesta ${VIDEO_PRICE[seconds]}.`); return; }
    setBusy(true); setClip({ text: idea });
    try {
      const job = await runOne({ prompt: promptFor(idea), seconds, size, audio, kind: "clip" }, "Video IA", p => setClip(c => (c ? { ...c, progress: p } : c)));
      setClip({ text: idea, job });
      track("video_generado", { modo: "clip" });
      void loadRecent();
    } catch (e) {
      setClip({ text: idea, error: e instanceof Error ? e.message : "No se pudo crear el video." });
    } finally { setBusy(false); }
  };

  const startSerie = async () => {
    const list = scenes.filter(s => s.text.trim().length >= 5);
    if (busy || list.length < 2) { if (!busy) toast.error("Escribe al menos 2 escenas."); return; }
    const total = list.length * VIDEO_PRICE[seconds];
    if (balance < total) { toast.error(`Te faltan créditos: esta serie cuesta ${total}.`); return; }
    setBusy(true);
    setScenes(list.map(s => ({ text: s.text })));
    let prev: VideoJob | undefined;
    for (let i = 0; i < list.length; i++) {
      try {
        // Continuidad: el último cuadro del clip anterior es la imagen inicial de este.
        const job = await runOne({
          prompt: promptFor(list[i].text), seconds, size, audio, kind: "serie", template: null,
          ...(prev?.last_frame_url ? { from_job_id: prev.id } : {}),
        }, "Serie", p => setScenes(cur => cur.map((s, j) => (j === i ? { ...s, progress: p } : s))));
        prev = job;
        setScenes(cur => cur.map((s, j) => (j === i ? { ...s, job } : s)));
      } catch (e) {
        setScenes(cur => cur.map((s, j) => (j === i ? { ...s, error: e instanceof Error ? e.message : "Falló este clip." } : s)));
        break; // sin este clip no hay cuadro para seguir la historia
      }
    }
    track("video_generado", { modo: "serie", escenas: list.length });
    setBusy(false);
    void loadRecent();
  };

  /** Crea el anuncio. `from` > 0: rehace desde esa toma, sin volver a cobrar las que ya salieron. */
  const startAd = async (from = 0) => {
    if (busy || !adMode || !brief || !shots.length) return;
    const bad = shots.find(s => s.line.trim().length < 4 || hasForbiddenClaim(s.line));
    if (bad) { toast.error(`Revisa "${bad.label}": la persona solo presenta o explica, sin testimonios, promesas ni cifras.`); return; }
    if (adMode === "ugc" && ugcOpen === false) { toast.error("Los videos UGC con presentador todavía no están abiertos. Usa el anuncio en video."); return; }
    const start0 = from > 0 && from === retryFromIndex(run.map(x => ({ done: !!x.job })), shots.length) ? from : 0;
    const total = planCost(shots.slice(start0));
    if (balance < total) { toast.error(`Te faltan créditos: ${start0 > 0 ? "lo que falta" : "este video"} cuesta ${total}.`); return; }
    setBusy(true);
    setRun(cur => shots.map((s, j) => (j < start0 ? cur[j] : { text: s.line, label: s.label })));
    let prev: VideoJob | undefined = start0 > 0 ? run[start0 - 1]?.job : undefined;
    for (let i = start0; i < shots.length; i++) {
      const s = shots[i];
      const usePresenter = adMode === "ugc" && !!presenter;
      const start: Partial<CreateBody> = i === 0
        ? usePresenter ? { image_path: presenter!, image_bucket: "personajes" }
          : adMode === "anuncio" && firstFrame ? { image_path: firstFrame, image_bucket: "creativos" } : {}
        : prev?.last_frame_url ? { from_job_id: prev.id } : {};
      try {
        const job = await runOne({
          prompt: shotPrompt(s, adMode, { presenter: usePresenter, hook: brief.hook }),
          seconds: s.seconds, size, audio: true, kind: adMode, template, ...start,
        }, adMode === "ugc" ? "Video UGC" : "Video anuncio", p => setRun(cur => cur.map((x, j) => (j === i ? { ...x, progress: p } : x))));
        prev = job;
        setRun(cur => cur.map((x, j) => (j === i ? { ...x, job } : x)));
      } catch (e) {
        setRun(cur => cur.map((x, j) => (j === i ? { ...x, error: e instanceof Error ? e.message : "Falló esta toma." } : x)));
        break; // la siguiente toma sale del último cuadro de esta
      }
    }
    track("video_generado", { modo: adMode, plantilla: template, origen: seed?.source ?? "manual" });
    setBusy(false);
    void loadRecent();
  };

  // Arranque solo: SOLO si el botón que trajo la semilla mostraba el costo (autostart, < 2 min).
  useEffect(() => {
    if (autoRef.current || !seed?.autostart || !user) return;
    if (mode === "serie") { autoRef.current = true; void startSerie(); return; }
    // UGC cerrado: se pasa al anuncio en video con la misma idea, sin arrancar (el costo es otro).
    if (mode === "ugc" && ugcOpen === false) { autoRef.current = true; setMode("anuncio"); return; }
    if ((mode === "anuncio" || (mode === "ugc" && ugcOpen !== null)) && shots.length) { autoRef.current = true; void startAd(); }
  }, [seed, user, mode, shots.length, ugcOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const improve = async () => {
    if (!adMode || !brief || improving || busy) return;
    const cost = generatorCost("ugc-script");
    if (balance < cost.cost) { toast.error(`Te faltan créditos: mejorar el guion cuesta ${cost.cost}.`); return; }
    setImproving(true);
    try {
      const { system, user: msg } = improvePrompt(shots, brief, adMode);
      const { text, billing } = await streamUgcScript(system, msg);
      applyServerCharge(cost.action, billing, "Guion de video IA");
      const lines = parseImprovedLines(text, shots.length, adMode);
      if (!lines) { toast.error("La IA no devolvió un guion que cumpla las reglas. Prueba otra vez o edítalo tú."); return; }
      setLineEdits(lines);
      toast.success("Guion mejorado. Puedes cambiar cualquier línea.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo mejorar el guion."); }
    finally { setImproving(false); }
  };

  // ---------- Vista ----------
  const doneScenes = scenes.filter(s => s.job?.result_url);
  useEffect(() => {
    if (playAll === null || !playerRef.current) return;
    playerRef.current.src = doneScenes[playAll]?.job?.result_url ?? "";
    void playerRef.current.play().catch(() => {});
  }, [playAll]); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (on: boolean) => `h-9 px-3 rounded-full border text-[12px] transition-colors ${on ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground hover:text-foreground"}`;
  const aspectCls = size === "16:9" ? "aspect-video" : size === "1:1" ? "aspect-square" : "aspect-[9/16] max-h-[520px] mx-auto";
  const VideoCard = ({ s, label }: { s: Scene; label: string }) => (
    <div className="rounded-2xl border border-border overflow-hidden bg-card/40 min-w-0">
      <div className={`relative bg-black ${aspectCls}`}>
        {s.job?.result_url ? <video src={s.job.result_url} controls playsInline className="w-full h-full object-contain" />
          : s.error ? <p className="absolute inset-0 m-auto h-fit px-4 text-center text-[12px] text-muted-foreground">{s.error}</p>
          : <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin" /><span className="text-[11px]">{typeof s.progress === "number" && s.progress > 0 ? `Creando… ${s.progress} %` : "Creando… 1 a 3 min"}</span></div>}
      </div>
      <div className="p-3 flex items-center gap-2">
        <span className="text-[12px] text-foreground truncate flex-1">{label}</span>
        {s.job?.result_url && (
          <button onClick={() => void downloadVideo(s.job!.result_url!, `supernova-${label.replace(/\W+/g, "-").toLowerCase()}.mp4`)} aria-label="Descargar" className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground">
            <Download className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  const serieCount = scenes.filter(s => s.text.trim().length >= 5).length;
  const adCost = planCost(shots);
  const cost = mode === "clip" ? VIDEO_PRICE[seconds] : mode === "serie" ? serieCount * VIDEO_PRICE[seconds] : adCost;
  const runDone = run.filter(s => s.job?.result_url);
  const retryFrom = retryFromIndex(run.map(x => ({ done: !!x.job })), shots.length);
  const t = TITLES[mode];

  return (
    <div className="max-w-[1180px] mx-auto space-y-6 py-4 min-w-0">
      <div>
        <h1 className="font-display font-bold text-2xl text-foreground">{t.h}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.p}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {MODES.map(m => (
          <button key={m.id} onClick={() => { setMode(m.id); setRun([]); }} disabled={busy}
            className={`inline-flex items-center gap-2 h-10 px-3.5 rounded-full border text-[13px] ${mode === m.id ? "border-foreground/40 text-foreground bg-card" : "border-border text-muted-foreground"}`}>
            <m.icon className="w-4 h-4" /> {m.label}
          </button>
        ))}
      </div>

      {seed && (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border text-foreground max-w-full min-w-0">
            <span className="truncate">Con la idea: {seed.title}</span>
            <button onClick={() => { setSeed(null); setFirstFrame(null); }} disabled={busy} aria-label="Quitar la idea" className="shrink-0 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
          </span>
          {seed.evidence && <span className="text-muted-foreground">{seed.evidence}</span>}
        </div>
      )}

      {/* ---------- Anuncio / UGC ---------- */}
      {adMode && (
        !brief ? (
          loaded ? <QuickBrief profile={profile} savePatch={savePatch} purpose={adMode === "ugc" ? "armar el guion de tu presentador" : "armar tu anuncio en video"} /> : <div className="h-40 rounded-2xl border border-border animate-pulse" />
        ) : (
          <div className="rounded-2xl border border-border p-4 sm:p-5 space-y-5 min-w-0">
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <p className="text-[13px] text-foreground min-w-0">
                  <span className="font-semibold">{templateId ? "Tu plantilla" : "Plantilla"}: {VIDEO_TEMPLATES.find(x => x.id === template)?.label}</span>
                  {!templateId && pick && <span className="text-muted-foreground"> · porque {pick.reason}</span>}
                  {" "}<button onClick={() => setShowTemplates(v => !v)} disabled={busy} className="underline underline-offset-2 text-muted-foreground hover:text-foreground">cambiar</button>
                </p>
              </div>
              {showTemplates && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {VIDEO_TEMPLATES.map(x => (
                    <button key={x.id} onClick={() => { setTemplateId(x.id === pick?.id ? null : x.id); setShowTemplates(false); }}
                      className={`text-left rounded-xl border px-3 py-2.5 min-h-[44px] ${x.id === template ? "border-foreground/40 bg-card" : "border-border hover:border-foreground/30"}`}>
                      <span className="block text-[13px] text-foreground">{x.label}{x.id === pick?.id ? " · recomendada" : ""}</span>
                      <span className="block text-[11px] text-muted-foreground">{x.desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {adMode === "ugc" && user && <PresenterPicker uid={user.id} value={presenter} onChange={setPresenter} disabled={busy} />}
            {adMode === "anuncio" && firstFrame && (
              <div className="flex items-center gap-3">
                {firstFrameUrl ? <img src={firstFrameUrl} alt="" className="w-14 h-14 rounded-lg object-cover border border-border" /> : <div className="w-14 h-14 rounded-lg border border-border bg-card" />}
                <p className="text-[12px] text-muted-foreground flex-1 min-w-0">El anuncio arranca desde tu creativo.</p>
                <button onClick={() => setFirstFrame(null)} disabled={busy} className="text-[12px] text-muted-foreground hover:text-foreground">Quitar</button>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{adMode === "ugc" ? "Lo que dice tu presentador" : "Las 3 tomas"}</p>
                <button onClick={() => void improve()} disabled={busy || improving}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border text-[12px] text-foreground hover:border-foreground/30 disabled:opacity-60">
                  {improving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Mejorar con IA · {generatorCost("ugc-script").cost} créditos
                </button>
              </div>
              {shots.map((s, i) => (
                <label key={`${template}-${i}`} className="block rounded-xl border border-border p-3 space-y-1.5">
                  <span className="flex items-center justify-between text-[11px] text-muted-foreground"><span>{s.label}</span><span>{s.seconds} s</span></span>
                  <textarea value={s.line} rows={adMode === "ugc" ? 3 : 2} disabled={busy}
                    onChange={e => { const v = e.target.value.slice(0, adMode === "ugc" ? 240 : 110); setLineEdits(cur => shots.map((x, j) => (j === i ? v : cur?.[j] ?? x.line))); }}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
                </label>
              ))}
              <p className="text-[11px] text-muted-foreground">Puedes cambiar lo que se dice. La persona presenta o explica: nada de "lo compré" ni promesas de resultados.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {(["9:16", "1:1", "16:9"] as VideoSize[]).map(sz => <button key={sz} onClick={() => setSize(sz)} disabled={busy} className={chip(size === sz)}>{sz === "9:16" ? "Vertical" : sz === "16:9" ? "Horizontal" : "Cuadrado"}</button>)}
            </div>

            {adMode === "ugc" && ugcOpen === false && (
              <div className="rounded-xl border border-border px-3 py-2.5 space-y-2">
                <p className="text-[12px] text-muted-foreground">Los videos con presentador todavía no están abiertos para tu cuenta. El anuncio en video hace lo mismo con tu idea, sin mostrar tu cara.</p>
                <button onClick={() => { setMode("anuncio"); setRun([]); }} disabled={busy}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-border text-[13px] text-foreground hover:border-foreground/30">
                  <Film className="w-4 h-4" /> Hacer un anuncio en video
                </button>
              </div>
            )}

            <div className="space-y-1.5">
              <button onClick={() => void startAd()} disabled={busy || (adMode === "ugc" && ugcOpen === false)}
                className="btn-primary-nova inline-flex items-center justify-center gap-2 rounded-xl px-5 h-12 text-[14px] font-semibold disabled:opacity-60 w-full sm:w-auto">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {busy ? "Creando tu video…" : `${adMode === "ugc" ? "Crear video UGC" : "Crear anuncio"} · ${adCost} créditos`}
              </button>
              <p className="text-[11px] text-muted-foreground">Te quedan {balance.toLocaleString("es")} créditos. Si una toma falla, te devolvemos sus créditos.</p>
            </div>
          </div>
        )
      )}

      {adMode && run.length > 0 && (
        <section className="space-y-4">
          <div className={`grid gap-3 ${size === "16:9" ? "sm:grid-cols-2" : run.length === 1 ? "max-w-sm" : "grid-cols-2 lg:grid-cols-3"}`}>
            {run.map((s, i) => <VideoCard key={i} s={s} label={s.label ?? `Toma ${i + 1}`} />)}
          </div>
          {!busy && run.some(s => s.error) && (
            <button onClick={() => void startAd(retryFrom)} className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-border text-[13px] text-foreground">
              <RefreshCw className="w-4 h-4" />
              {retryFrom > 0 ? `Rehacer ${retryFrom === shots.length - 1 ? "la toma" : "desde la toma"} ${retryFrom + 1}` : "Intentar de nuevo"} · {planCost(shots.slice(retryFrom))} créditos
            </button>
          )}
          {!busy && runDone.length === run.length && brief && (
            <ReadyToPublish name={adMode === "ugc" ? "ugc" : "anuncio"} text={publishText(brief, adMode)}
              clips={runDone.map(s => ({ url: s.job!.result_url!, label: s.label ?? "Toma" }))} />
          )}
        </section>
      )}

      {/* ---------- Clip / Serie ---------- */}
      {!adMode && (
        <div className="rounded-2xl border border-border p-4 sm:p-5 space-y-4 min-w-0">
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Estilo</p>
            <div className="flex flex-wrap gap-2">{SERIE_STYLES.map(s => <button key={s.id} onClick={() => setStyle(s.id)} className={chip(style === s.id)}>{s.label}</button>)}</div>
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
                  {SERIE_TEMPLATES.map(tp => (
                    <button key={tp.id} disabled={busy} onClick={() => { setStyle(tp.style); setScenes(tp.scenes.map(text => ({ text }))); }} className={chip(false)}>{tp.label}</button>
                  ))}
                </div>
              </div>
              <input value={cast} onChange={e => setCast(e.target.value.slice(0, 300))}
                placeholder="Personajes y lugar (opcional): Ej.: Ana, 30 años, cabello rizado, vestido rojo; cocina en Santo Domingo"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60" />
              <div className="space-y-2">
                {scenes.map((s, i) => (
                  <textarea key={i} value={s.text} rows={2} disabled={busy}
                    onChange={e => setScenes(list => list.map((x, j) => (j === i ? { text: e.target.value.slice(0, 400) } : x)))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60" />
                ))}
                {scenes.length < 6 && !busy && (
                  <button onClick={() => setScenes(list => [...list, { text: "" }])} className="h-9 text-[12px] text-muted-foreground hover:text-foreground">+ Añadir escena</button>
                )}
              </div>
            </>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex flex-wrap gap-2">{(["9:16", "16:9", "1:1"] as VideoSize[]).map(s => <button key={s} onClick={() => setSize(s)} className={chip(size === s)}>{s === "9:16" ? "Vertical" : s === "16:9" ? "YouTube" : "Cuadrado"}</button>)}</div>
            <div className="flex gap-2">{([5, 10] as const).map(n => <button key={n} onClick={() => setSeconds(n)} className={chip(seconds === n)}>{n} s</button>)}</div>
            <button onClick={() => setAudio(a => !a)} className={chip(audio)}>{audio ? <><Volume2 className="w-3.5 h-3.5 inline mr-1" />Con sonido</> : <><VolumeX className="w-3.5 h-3.5 inline mr-1" />Sin sonido</>}</button>
          </div>

          <div className="space-y-1.5">
            <button onClick={() => void (mode === "clip" ? startClip() : startSerie())} disabled={busy}
              className="btn-primary-nova inline-flex items-center justify-center gap-2 rounded-xl px-5 h-12 text-[14px] font-semibold disabled:opacity-60 w-full sm:w-auto">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {busy ? "Creando tu video…" : `${mode === "clip" ? "Crear video" : `Crear serie de ${serieCount} clips`} · ${cost} créditos`}
            </button>
            <p className="text-[11px] text-muted-foreground">Te quedan {balance.toLocaleString("es")} créditos. Si un video falla, no se te cobra. Descarga tus videos: el enlace dura 24 horas.</p>
          </div>
        </div>
      )}

      {mode === "clip" && clip && <div className="max-w-md"><VideoCard s={clip} label="Tu video" /></div>}

      {mode === "serie" && scenes.some(s => s.job || s.error) && (
        <section className="space-y-3">
          {doneScenes.length >= 2 && (
            <div className="rounded-2xl border border-border p-4 space-y-3">
              <button onClick={() => setPlayAll(0)} className="inline-flex items-center gap-2 h-10 text-[13px] font-semibold text-foreground"><Play className="w-4 h-4" /> Ver la serie completa</button>
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
              <div key={j.id} className="rounded-xl border border-border overflow-hidden bg-black min-w-0">
                <video src={j.result_url} controls playsInline preload="metadata" className="w-full aspect-[9/16] object-contain" />
                <button onClick={() => void downloadVideo(j.result_url!, `supernova-video-${j.id.slice(0, 6)}.mp4`)} className="w-full h-10 text-[11px] text-muted-foreground hover:text-foreground bg-card">Descargar</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
