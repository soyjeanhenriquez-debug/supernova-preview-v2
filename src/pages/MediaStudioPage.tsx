import { useEffect, useRef, useState } from "react";
import { useFormAssist } from "@/lib/formAssist";
import { useBusinessProfile, profileReady } from "@/lib/businessProfile";
import { AssistButton } from "@/components/AssistButton";
import { Video, Loader2, Sparkles, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useMediaCredits, MEDIA_COST_PER_VIDEO } from "@/hooks/useMediaCredits";
import { listAvatars, generateVideo, fetchRecentJobs, refreshJob, type HeygenAvatar, type HeygenVoice, type MediaJob } from "@/lib/heygen";
import { CopyLevelPicker } from "@/components/CopyLevelPicker";

const MEDIA_HOOK_KEY = "supernova_media_hook";
const LANGS = ["español", "English", "Deutsch", "português"] as const;

const MAX_WORDS = 160;

function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/**
 * Media Studio: genera un video con avatar IA a partir de un guion corto
 * (hook de 45-60s — el formato que un media buyer testea a diario, no el
 * VSL completo). Punto de entrada SIEMPRE accesible, a propósito: es lo que
 * convierte SUPERNOVA en una herramienta de uso diario, no solo semanal.
 */
export function MediaStudioPage() {
  const { balance, loading: creditsLoading, refresh: refreshCredits } = useMediaCredits();
  const [script, setScript] = useState("");
  const [avatars, setAvatars] = useState<HeygenAvatar[]>([]);
  const [voices, setVoices] = useState<HeygenVoice[]>([]);
  const [avatarId, setAvatarId] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [dryRunMode, setDryRunMode] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const pollRef = useRef<number | null>(null);
  // El guion de ejemplo es largo: solo se pide con el botón, no al abrir la página.
  const assist = useFormAssist("media-script", "", false);
  const { profile, savePatch, loaded: profileLoaded } = useBusinessProfile();
  const changeTone = (next: typeof profile) => { savePatch({ copy_level: next.copy_level }); };
  // Idioma del video: el guion se escribe (no se traduce) en este idioma.
  const [lang, setLang] = useState<(typeof LANGS)[number]>(LANGS[0]);
  // Gancho que llegó desde la Bóveda: se usa como estructura, no se dice tal cual.
  const [refHook, setRefHook] = useState("");
  const writeScript = async (hook: string, current: string) => {
    try {
      const s = await assist.generate({ ya_escrito: current, idioma: lang, tono: profile.copy_level, ...(hook ? { gancho_referencia: hook } : {}) });
      if (typeof s.text === "string" && s.text) setScript(s.text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo escribir el guion. Prueba otra vez.");
    }
  };
  const fillScript = () => writeScript(refHook, script);

  useEffect(() => {
    // Prefill desde la Mándala u otra página: ese texto ya es un guion hecho para el negocio.
    const prefill = localStorage.getItem("supernova_media_prefill");
    if (prefill) {
      setScript(prefill);
      localStorage.removeItem("supernova_media_prefill");
    }
    // Desde la Bóveda de Ganchos llega un gancho AJENO (otro producto, a veces otro idioma):
    // se guarda como referencia y la IA escribe el guion con el negocio del usuario (ver abajo).
    try {
      const hook = localStorage.getItem(MEDIA_HOOK_KEY);
      if (hook) { setRefHook(hook.slice(0, 600)); localStorage.removeItem(MEDIA_HOOK_KEY); }
    } catch { /* sin almacenamiento */ }

    listAvatars().then((res) => {
      setAvatars(res.avatars);
      setVoices(res.voices);
      setDryRunMode(res.dry_run);
      if (res.avatars[0]) {
        setAvatarId(res.avatars[0].avatar_id);
        // Cada avatar trae su voz recomendada — se preselecciona, el usuario
        // puede cambiarla si quiere.
        setVoiceId(res.avatars[0].default_voice_id || res.voices[0]?.voice_id || "");
      } else if (res.voices[0]) {
        setVoiceId(res.voices[0].voice_id);
      }
    }).catch((e) => toast.error(e.message || "No se pudieron cargar los avatares. Recarga la página."));

    loadJobs();
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, []);

  const loadJobs = async () => {
    const list = await fetchRecentJobs();
    setJobs(list);

    const hasPending = list.some((j) => j.status === "pending" || j.status === "processing");
    if (hasPending && !pollRef.current) {
      let tick = 0;
      pollRef.current = window.setInterval(async () => {
        tick++;
        let fresh = await fetchRecentJobs();
        // Respaldo: si el aviso de HeyGen no llega, cada ~20s se le pregunta el
        // estado real de los videos que llevan más de un minuto generándose.
        if (tick % 4 === 0) {
          const stuck = fresh.filter((j) => j.status === "processing" && !j.dry_run && Date.now() - new Date(j.created_at).getTime() > 60_000);
          if (stuck.length) {
            await Promise.all(stuck.slice(0, 3).map((j) => refreshJob(j.id)));
            fresh = await fetchRecentJobs();
          }
        }
        setJobs((prev) => {
          const justFailed = fresh.find((j) => j.status === "failed" && prev.some((p) => p.id === j.id && p.status !== "failed"));
          if (justFailed) {
            toast.error("No se pudo crear ese video", { description: "Te devolvimos tus Media Credits. Puedes intentarlo de nuevo." });
            refreshCredits();
          }
          return fresh;
        });
        if (!fresh.some((j) => j.status === "pending" || j.status === "processing") && pollRef.current) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 5000);
    }
  };

  const selectedAvatar = avatars.find((a) => a.avatar_id === avatarId);
  const selectedPreview = selectedAvatar?.preview_image_url ?? null;
  const selectedAvatarName = selectedAvatar?.avatar_name ?? "tu avatar";

  const words = wordCount(script);
  const overLimit = words > MAX_WORDS;
  const canGenerate = !generating && script.trim().length > 0 && !overLimit && avatarId && voiceId && balance >= MEDIA_COST_PER_VIDEO;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    try {
      const res = await generateVideo({ script: script.trim(), avatar_id: avatarId, voice_id: voiceId, kind: selectedAvatar?.kind });
      toast.success(res.dry_run ? "Video de prueba creado (modo de prueba, no es un video real)" : "Estamos creando tu video. Tarda unos minutos: aparecerá abajo, en Tus videos.");
      setScript("");
      await refreshCredits();
      await loadJobs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el video. Si se cobró, te devolvemos los Media Credits.");
      // Si HeyGen rechazó el video, el servidor ya devolvió los Media Credits.
      await refreshCredits();
      await loadJobs();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="page-heading font-display text-2xl text-foreground flex items-center gap-2">
            <Video className="w-6 h-6 text-primary" /> MEDIA STUDIO
          </h2>
          <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
            Convierte un guion corto en un video vertical de 45 a 60 segundos, hablado por un avatar con IA. Sirve para Reels, TikTok
            y anuncios, sin que tengas que grabarte.
          </p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-2xl">
            Cómo empezar: pega tu guion (o toca Rellenar con IA), elige un avatar y una voz, y toca Crear video. Cada video cuesta{" "}
            {MEDIA_COST_PER_VIDEO} Media Credits, un saldo aparte de tus créditos normales.
          </p>
        </div>
        <div className="card-surface rounded-xl px-4 py-3 text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Tus Media Credits</div>
          <div className="font-display font-bold text-xl text-primary">{creditsLoading ? "…" : balance}</div>
        </div>
      </div>

      {dryRunMode && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-warning/30 bg-warning/10 text-sm text-warning">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Modo de prueba: por ahora los videos que crees aquí no son reales, solo sirven para probar la pantalla.
        </div>
      )}

      <div className="card-surface rounded-xl p-6 space-y-5">
        {refHook && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3.5 space-y-1.5 text-sm">
            <p className="text-xs uppercase tracking-wider text-primary font-semibold">Gancho de referencia (de la Bóveda)</p>
            <p className="text-foreground">"{refHook}"</p>
            <p className="text-xs text-muted-foreground">
              No se dice tal cual: la IA usa su estructura para escribir tu guion, con tu producto y en {lang}.
              {profileLoaded && !profileReady(profile) && " Aún no guardaste tu negocio: llénalo en la Mándala (paso 1) para que el guion hable de tu producto."}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={fillScript} disabled={assist.loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/25 disabled:opacity-60">
                {assist.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} {script.trim() ? "Escribir otra versión" : "Escribir mi guion con este gancho"} · gratis
              </button>
              <button onClick={() => setRefHook("")} className="text-xs text-muted-foreground hover:text-foreground">Quitar referencia</button>
            </div>
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground" htmlFor="ms-script">Lo que dirá el avatar</label>
            <span className="flex items-center gap-3">
            <select value={lang} onChange={(e) => setLang(e.target.value as (typeof LANGS)[number])} aria-label="Idioma del video"
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground">
              {LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <AssistButton onClick={fillScript} loading={assist.loading} filled={!!script.trim()} />
            <span className={`text-xs tabular-nums ${overLimit ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
              {words} / {MAX_WORDS} palabras
            </span>
            </span>
          </div>
          <div className="mb-2"><CopyLevelPicker profile={profile} onChange={changeTone} /></div>
          <textarea
            id="ms-script"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={5}
            placeholder="Pega aquí lo que quieres que diga el avatar a cámara. Máximo 160 palabras (unos 45 a 60 segundos). Empieza con una frase que frene el scroll."
            className="w-full bg-secondary border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {overLimit && (
            <p className="text-xs text-destructive mt-1.5">
              Te pasaste de {MAX_WORDS} palabras. Media Studio hace videos cortos, no un video de ventas largo: recorta el guion para seguir.
            </p>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Quién lo dice (avatar)</label>
            <div className="grid grid-cols-2 gap-2">
              {avatars.map((a) => (
                <button
                  key={a.avatar_id}
                  onClick={() => {
                    setAvatarId(a.avatar_id);
                    if (a.default_voice_id) setVoiceId(a.default_voice_id);
                  }}
                  className={`px-3 py-2.5 rounded-lg border text-left text-sm transition-colors truncate ${
                    avatarId === a.avatar_id ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-secondary/60"
                  }`}
                >
                  {a.avatar_name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5" htmlFor="ms-voice">Voz</label>
            <select
              id="ms-voice"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {voices.map((v) => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
            </select>
            {/* Solo la cara del avatar ELEGIDO: las vistas previas de HeyGen pesan
                ~500 KB cada una; cargar las de toda la lista serían ~10 MB en un teléfono. */}
            {selectedPreview && (
              <div className="mt-3 flex items-center gap-3">
                <img key={selectedPreview} src={selectedPreview} alt="" referrerPolicy="no-referrer"
                  className="w-20 h-28 rounded-lg object-cover border border-border bg-secondary shrink-0"
                  onError={(e) => { e.currentTarget.style.display = "none"; }} />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Así se ve <span className="text-foreground font-medium">{selectedAvatarName}</span>. El video sale vertical (9:16), listo para Reels, TikTok y Stories.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Cada video (de 45 a 60 segundos) cuesta <span className="text-foreground font-semibold">{MEDIA_COST_PER_VIDEO} Media Credits</span>. Si falla, te los devolvemos.
          </p>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="gradient-brand text-primary-foreground px-6 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? "Enviando…" : `Crear video · ${MEDIA_COST_PER_VIDEO} Media Credits`}
          </button>
        </div>
        {!creditsLoading && balance < MEDIA_COST_PER_VIDEO && (
          <p className="text-xs text-warning">Te faltan Media Credits: necesitas {MEDIA_COST_PER_VIDEO} para un video y tienes {balance}. Puedes comprar más en la página Créditos.</p>
        )}
      </div>

      <div className="card-surface rounded-xl">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-display font-bold text-base">Tus videos recientes</h3>
          <button onClick={loadJobs} className="text-muted-foreground hover:text-primary transition-colors" title="Ver el estado actualizado" aria-label="Ver el estado actualizado">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {jobs.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Todavía no has creado videos. Cuando crees uno, aparecerá aquí.</div>
        ) : (
          <div className="divide-y divide-border">
            {jobs.map((job) => <JobRow key={job.id} job={job} />)}
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<MediaJob["status"], string> = {
  pending: "En espera", processing: "Creándose…", completed: "Listo", failed: "No se pudo crear",
};
const STATUS_CLASS: Record<MediaJob["status"], string> = {
  pending: "text-muted-foreground", processing: "text-warning", completed: "text-success", failed: "text-destructive",
};

function JobRow({ job }: { job: MediaJob }) {
  // El enlace del video es prefirmado y caduca: si deja de cargar se pide uno
  // nuevo al servidor (una sola vez por tarjeta, para no entrar en bucle).
  const [videoUrl, setVideoUrl] = useState(job.video_url);
  const renewedRef = useRef(false);
  useEffect(() => { setVideoUrl(job.video_url); }, [job.video_url]);
  const renewUrl = async () => {
    if (renewedRef.current || job.dry_run) return;
    renewedRef.current = true;
    const fresh = await refreshJob(job.id);
    if (fresh?.video_url) setVideoUrl(fresh.video_url);
  };
  return (
    <div className="px-5 py-3 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{job.script}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs font-medium ${STATUS_CLASS[job.status]}`}>
            {(job.status === "pending" || job.status === "processing") && <Loader2 className="w-3 h-3 inline animate-spin mr-1" />}
            {STATUS_LABEL[job.status]}
          </span>
          {job.dry_run && <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded px-1.5 py-0.5">De prueba</span>}
          <span className="text-xs text-muted-foreground">{new Date(job.created_at).toLocaleString("es-ES")}</span>
        </div>
        {job.status === "failed" && job.error && (
          <p className="text-xs text-destructive mt-1 truncate">{job.error}</p>
        )}
        {job.status === "completed" && job.dry_run && !job.video_url && (
          <p className="text-xs text-muted-foreground mt-1">Modo de prueba: no se creó un video real.</p>
        )}
      </div>
      {videoUrl && (
        <video src={videoUrl} controls onError={renewUrl} className="w-24 rounded-lg border border-border shrink-0" />
      )}
    </div>
  );
}
