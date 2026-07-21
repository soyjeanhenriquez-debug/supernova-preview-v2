import { useEffect, useRef, useState } from "react";
import { Video, Loader2, Sparkles, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useMediaCredits, MEDIA_COST_PER_VIDEO } from "@/hooks/useMediaCredits";
import { listAvatars, generateVideo, fetchRecentJobs, type HeygenAvatar, type HeygenVoice, type MediaJob } from "@/lib/heygen";

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

  useEffect(() => {
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
    }).catch((e) => toast.error(e.message || "Error cargando avatares"));

    loadJobs();
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, []);

  const loadJobs = async () => {
    const list = await fetchRecentJobs();
    setJobs(list);

    const hasPending = list.some((j) => j.status === "pending" || j.status === "processing");
    if (hasPending && !pollRef.current) {
      pollRef.current = window.setInterval(async () => {
        const fresh = await fetchRecentJobs();
        setJobs(fresh);
        if (!fresh.some((j) => j.status === "pending" || j.status === "processing") && pollRef.current) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 5000);
    }
  };

  const words = wordCount(script);
  const overLimit = words > MAX_WORDS;
  const canGenerate = !generating && script.trim().length > 0 && !overLimit && avatarId && voiceId && balance >= MEDIA_COST_PER_VIDEO;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    try {
      const selectedAvatar = avatars.find((a) => a.avatar_id === avatarId);
      const res = await generateVideo({ script: script.trim(), avatar_id: avatarId, voice_id: voiceId, kind: selectedAvatar?.kind });
      toast.success(res.dry_run ? "🎬 Video simulado generado (modo demo)" : "🎬 Generando tu video — listo en 1-3 min");
      setScript("");
      await refreshCredits();
      await loadJobs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error generando el video");
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
          <p className="text-sm text-muted-foreground mt-3">
            Tu próximo hook en video, listo en minutos. Un guion corto (45-60s) → un avatar con IA lo graba por ti.
          </p>
        </div>
        <div className="card-surface rounded-xl px-4 py-3 text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Media Credits</div>
          <div className="font-display font-bold text-xl text-primary">{creditsLoading ? "…" : balance}</div>
        </div>
      </div>

      {dryRunMode && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-warning/30 bg-warning/10 text-sm text-warning">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Modo simulado: aún no hay conexión real con HeyGen configurada. Los videos generados aquí son de prueba.
        </div>
      )}

      <div className="card-surface rounded-xl p-6 space-y-5">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground" htmlFor="ms-script">Guion del hook</label>
            <span className={`text-xs tabular-nums ${overLimit ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
              {words} / {MAX_WORDS} palabras
            </span>
          </div>
          <textarea
            id="ms-script"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={5}
            placeholder="Pega aquí tu hook — el gancho de 45-60 segundos que quieres que el avatar diga a cámara…"
            className="w-full bg-secondary border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {overLimit && (
            <p className="text-xs text-destructive mt-1.5">
              Media Studio genera hooks cortos, no el VSL completo. Recorta el guion a {MAX_WORDS} palabras.
            </p>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Avatar</label>
            <div className="grid grid-cols-2 gap-2">
              {avatars.map((a) => (
                <button
                  key={a.avatar_id}
                  onClick={() => {
                    setAvatarId(a.avatar_id);
                    if (a.default_voice_id) setVoiceId(a.default_voice_id);
                  }}
                  className={`px-3 py-2.5 rounded-lg border text-left text-sm transition-colors ${
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
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Cada video cuesta <span className="text-foreground font-semibold">{MEDIA_COST_PER_VIDEO} Media Credits</span> (~1 min de duración).
          </p>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="gradient-brand text-primary-foreground px-6 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? "Generando…" : `Generar video · ${MEDIA_COST_PER_VIDEO} ⚡`}
          </button>
        </div>
        {!creditsLoading && balance < MEDIA_COST_PER_VIDEO && (
          <p className="text-xs text-warning">No tienes suficientes Media Credits. Recarga desde la página de Créditos.</p>
        )}
      </div>

      <div className="card-surface rounded-xl">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-display font-bold text-base">Tus videos recientes</h3>
          <button onClick={loadJobs} className="text-muted-foreground hover:text-primary transition-colors" title="Actualizar">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {jobs.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Aún no has generado ningún video</div>
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
  pending: "En cola", processing: "Generando…", completed: "Listo", failed: "Falló",
};
const STATUS_CLASS: Record<MediaJob["status"], string> = {
  pending: "text-muted-foreground", processing: "text-warning", completed: "text-success", failed: "text-destructive",
};

function JobRow({ job }: { job: MediaJob }) {
  return (
    <div className="px-5 py-3 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{job.script}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs font-medium ${STATUS_CLASS[job.status]}`}>
            {(job.status === "pending" || job.status === "processing") && <Loader2 className="w-3 h-3 inline animate-spin mr-1" />}
            {STATUS_LABEL[job.status]}
          </span>
          {job.dry_run && <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded px-1.5 py-0.5">Simulado</span>}
          <span className="text-xs text-muted-foreground">{new Date(job.created_at).toLocaleString("es-ES")}</span>
        </div>
        {job.status === "failed" && job.error && (
          <p className="text-xs text-destructive mt-1 truncate">{job.error}</p>
        )}
        {job.status === "completed" && job.dry_run && !job.video_url && (
          <p className="text-xs text-muted-foreground mt-1">Modo simulado: no se generó un video real (falta configurar HEYGEN_API_KEY).</p>
        )}
      </div>
      {job.video_url && (
        <video src={job.video_url} controls className="w-24 rounded-lg border border-border shrink-0" />
      )}
    </div>
  );
}
