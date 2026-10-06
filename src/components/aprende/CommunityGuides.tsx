import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { AlertTriangle, ExternalLink, Heart, Loader2, PenLine, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useVitrina } from "@/contexts/VitrinaContext";
import { TOOLS, TOOL_BY_ID, openTool } from "@/lib/tools";
import {
  BODY_TEMPLATE, GUIDE_LIMITS, createGuide, deleteGuide, getBody, listMine, listPublished, myVotes, riskyPhrases, setVote, updateGuide,
  type CommunityGuide, type GuideDraft, type GuideStatus,
} from "@/lib/communityGuides";

const STATUS: Record<GuideStatus, { label: string; cls: string }> = {
  pendiente: { label: "En revisión", cls: "text-muted-foreground border-border" },
  publicada: { label: "Publicada", cls: "text-foreground border-foreground/30" },
  rechazada: { label: "Necesita cambios", cls: "text-primary border-primary/40" },
};

const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" }) : "";

function ToolChips({ ids, onNavigate }: { ids: string[]; onNavigate?: (p: string) => void }) {
  const tools = ids.map(id => TOOL_BY_ID[id]).filter(Boolean);
  if (!tools.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tools.map(t => onNavigate ? (
        <button key={t.id} onClick={() => openTool(t, onNavigate)} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-foreground/30">
          <t.icon className="w-3 h-3" strokeWidth={1.8} /> {t.nav} →
        </button>
      ) : (
        <span key={t.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
          <t.icon className="w-3 h-3" strokeWidth={1.8} /> {t.nav}
        </span>
      ))}
    </div>
  );
}

/** Lector: el cuerpo se pide al abrir (la lista no lo carga). */
export function GuideReader({ guide, onClose, onNavigate, voted, onVote }: {
  guide: CommunityGuide; onClose: () => void; onNavigate?: (p: string) => void; voted?: boolean; onVote?: (on: boolean) => void;
}) {
  const [body, setBody] = useState(guide.body);
  useEffect(() => {
    if (guide.body) return;
    let alive = true;
    getBody(guide.id).then(b => { if (alive) setBody(b); }).catch(() => { if (alive) setBody("_No se pudo cargar. Vuelve a intentarlo._"); });
    return () => { alive = false; };
  }, [guide.id, guide.body]);

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[760px] max-h-[88vh] overflow-y-auto p-0 gap-0">
        <div className="px-6 pt-6 pb-4 border-b border-border space-y-2">
          <DialogTitle className="font-display text-xl leading-snug pr-6">{guide.title}</DialogTitle>
          <p className="text-[13px] text-muted-foreground">Por <b className="text-foreground font-medium">{guide.author_name}</b>{guide.published_at && ` · ${fmtDate(guide.published_at)}`}</p>
          {guide.source_credit && (
            <p className="text-[12px] text-muted-foreground">
              Basada en: {guide.source_url
                ? <a href={guide.source_url} target="_blank" rel="noopener noreferrer nofollow" className="underline hover:text-foreground inline-flex items-center gap-1">{guide.source_credit}<ExternalLink className="w-3 h-3" /></a>
                : guide.source_credit}
            </p>
          )}
        </div>
        <div className="px-6 py-5">
          {body ? (
            <article className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:text-foreground">
              <ReactMarkdown>{body}</ReactMarkdown>
            </article>
          ) : <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
        </div>
        {(guide.tools.length > 0 || onVote) && (
          <div className="px-6 py-4 border-t border-border space-y-3">
            {guide.tools.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Hazlo tú con</p>
                <ToolChips ids={guide.tools} onNavigate={onNavigate ? (p) => { onClose(); onNavigate(p); } : undefined} />
              </div>
            )}
            {onVote && guide.status === "publicada" && (
              <button onClick={() => onVote(!voted)} className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[12px] ${voted ? "border-primary/50 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                <Heart className={`w-3.5 h-3.5 ${voted ? "fill-current" : ""}`} strokeWidth={1.8} /> {voted ? "Te sirvió" : "Me sirvió"}
              </button>
            )}
            <p className="text-[11px] text-muted-foreground/80 leading-snug">La escribió un miembro y la revisó el equipo de SUPERNOVA. Es su experiencia, no una promesa de resultados: lo que ganes depende de tu trabajo y de tu mercado.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Escribir o editar una enseñanza. Todo entra a revisión. */
function GuideEditor({ initial, onClose, onSaved }: { initial?: CommunityGuide; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [d, setD] = useState<GuideDraft>(() => initial
    ? { title: initial.title, summary: initial.summary, body: initial.body, tools: initial.tools, source_credit: initial.source_credit, source_url: initial.source_url }
    : { title: "", summary: "", body: BODY_TEMPLATE, tools: [], source_credit: "", source_url: "" });
  const [adapted, setAdapted] = useState(!!initial?.source_credit);
  const [okEthics, setOkEthics] = useState(!!initial);
  const [okOwnWords, setOkOwnWords] = useState(!!initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof GuideDraft>(k: K, v: GuideDraft[K]) => setD(p => ({ ...p, [k]: v }));
  const risky = useMemo(() => riskyPhrases(`${d.title}\n${d.summary}\n${d.body}`), [d.title, d.summary, d.body]);
  const tools = useMemo(() => TOOLS.filter(t => t.key !== "Generadores" || t.generator), []);

  const len = (s: string) => s.trim().length;
  const problems = [
    len(d.title) < GUIDE_LIMITS.title[0] && `El título necesita al menos ${GUIDE_LIMITS.title[0]} letras.`,
    len(d.summary) < GUIDE_LIMITS.summary[0] && "Escribe en una línea qué va a lograr quien la lea.",
    (len(d.body) < GUIDE_LIMITS.body[0] || d.body.trim() === BODY_TEMPLATE.trim()) && `Cuenta los pasos (mínimo ${GUIDE_LIMITS.body[0]} letras).`,
    adapted && !d.source_credit?.trim() && "Di de quién es la idea original.",
    d.source_url?.trim() && !/^https?:\/\//.test(d.source_url.trim()) && "El enlace de la fuente debe empezar por https://",
    !okEthics && "Confirma que no prometes ingresos ni resultados.",
    !okOwnWords && "Confirma que está escrita con tus palabras.",
  ].filter(Boolean) as string[];

  const save = async () => {
    if (problems.length) { toast.error(problems[0]); return; }
    setBusy(true);
    try {
      const draft = adapted ? d : { ...d, source_credit: null, source_url: null };
      if (initial) await updateGuide(initial.id, draft);
      else await createGuide(draft, (user?.user_metadata?.display_name as string) || user?.email?.split("@")[0] || "Miembro");
      toast.success("Enviada. El equipo la revisa y te avisamos aquí cuando esté publicada.");
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(/row-level security|policy/i.test(msg) ? "Para compartir necesitas tu prueba o tu plan activo." : "No se pudo enviar. Revisa los campos e inténtalo otra vez.");
    } finally { setBusy(false); }
  };

  const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground/40";
  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-[760px] max-h-[90vh] overflow-y-auto">
        <DialogTitle className="font-display text-lg">{initial ? "Editar tu enseñanza" : "Comparte lo que aprendiste"}</DialogTitle>
        <p className="text-[13px] text-muted-foreground -mt-2">Cuenta paso a paso cómo usas SUPERNOVA para algo concreto. Así otros lo pueden repetir. Antes de publicarla la revisa el equipo.</p>

        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-foreground">Título</span>
            <input className={field} maxLength={GUIDE_LIMITS.title[1]} value={d.title} onChange={e => set("title", e.target.value)} placeholder="Ej.: Cómo hago videos de GTA 6 sin tener el juego" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-foreground">Qué va a lograr quien la lea <span className="text-muted-foreground font-normal">(una línea)</span></span>
            <input className={field} maxLength={GUIDE_LIMITS.summary[1]} value={d.summary} onChange={e => set("summary", e.target.value)} placeholder="Ej.: Armar una página de noticias de GTA 6 y publicar un video corto al día." />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-foreground">Los pasos</span>
            <textarea className={`${field} min-h-[260px] font-mono text-[13px] leading-relaxed`} maxLength={GUIDE_LIMITS.body[1]} value={d.body} onChange={e => set("body", e.target.value)} />
            <span className="block text-[11px] text-muted-foreground">Usa <code>## </code> para un título de paso y <code>- </code> para una lista.</span>
          </label>

          <div className="space-y-1.5">
            <span className="text-[12px] font-medium text-foreground">Herramientas que usas <span className="text-muted-foreground font-normal">(hasta 8; quien la lea las abre con un toque)</span></span>
            <div className="flex flex-wrap gap-1.5">
              {tools.map(t => {
                const on = d.tools.includes(t.id);
                return (
                  <button key={t.id} type="button" onClick={() => set("tools", on ? d.tools.filter(x => x !== t.id) : d.tools.length < 8 ? [...d.tools, t.id] : d.tools)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] ${on ? "border-primary/60 text-foreground bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    <t.icon className="w-3 h-3" strokeWidth={1.8} /> {t.nav}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-border p-3.5 space-y-3">
            <label className="flex items-start gap-2.5 text-[13px] text-foreground cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-[hsl(var(--primary))]" checked={adapted} onChange={e => setAdapted(e.target.checked)} />
              <span>La adapté de otra persona (un curso, un post, un video)</span>
            </label>
            {adapted && (
              <div className="grid sm:grid-cols-2 gap-2.5 pl-6">
                <input className={field} maxLength={160} value={d.source_credit ?? ""} onChange={e => set("source_credit", e.target.value)} placeholder="De quién es la idea (nombre)" />
                <input className={field} maxLength={500} value={d.source_url ?? ""} onChange={e => set("source_url", e.target.value)} placeholder="Enlace (opcional)" />
                <p className="sm:col-span-2 text-[11px] text-muted-foreground">Dale crédito y explícala con tus palabras y tu experiencia. No pegues el texto traducido tal cual: eso es de su autor.</p>
              </div>
            )}
          </div>

          {risky.length > 0 && (
            <div className="flex gap-2.5 rounded-xl border border-primary/40 bg-primary/5 p-3.5 text-[13px] text-foreground">
              <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>Parece que hay {risky.join(", ")}. En SUPERNOVA no prometemos ingresos ni plazos: cuenta lo que hiciste y qué mirar, sin cifras de ganancia. Si no lo cambias, es probable que la devolvamos.</span>
            </div>
          )}

          <div className="space-y-2 text-[13px] text-foreground">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-[hsl(var(--primary))]" checked={okEthics} onChange={e => setOkEthics(e.target.checked)} />
              <span>No prometo ingresos, ventas ni resultados, y no invento cifras ni testimonios.</span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-[hsl(var(--primary))]" checked={okOwnWords} onChange={e => setOkOwnWords(e.target.checked)} />
              <span>La escribí con mis palabras y acepto que se muestre con mi nombre a los miembros de SUPERNOVA.</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={busy} className="h-10 px-4 rounded-xl border border-border text-[13px] text-muted-foreground hover:text-foreground">Cancelar</button>
          <button onClick={save} disabled={busy} className="btn-primary-nova h-10 px-5 rounded-xl text-[13px] font-semibold inline-flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Enviar a revisión
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Pestaña "De la comunidad" de Aprende. */
export function CommunityGuides({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { user } = useAuth();
  const { locked, openPlans } = useVitrina();
  const [guides, setGuides] = useState<CommunityGuide[] | null>(null);
  const [mine, setMine] = useState<CommunityGuide[]>([]);
  const [votes, setVotes] = useState<Set<string>>(new Set());
  const [reading, setReading] = useState<CommunityGuide | null>(null);
  const [editing, setEditing] = useState<CommunityGuide | "new" | null>(null);

  const load = useCallback(() => {
    listPublished().then(setGuides).catch(() => setGuides([]));
    if (user) {
      listMine(user.id).then(setMine).catch(() => setMine([]));
      myVotes(user.id).then(setVotes).catch(() => {});
    }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const vote = async (g: CommunityGuide, on: boolean) => {
    setVotes(v => { const n = new Set(v); if (on) n.add(g.id); else n.delete(g.id); return n; });
    const bump = (list: CommunityGuide[] | null) => list?.map(x => x.id === g.id ? { ...x, helpful_count: Math.max(0, x.helpful_count + (on ? 1 : -1)) } : x) ?? null;
    setGuides(bump);
    try { await setVote(g.id, on); }
    catch { toast.error("No se pudo guardar tu voto."); load(); }
  };

  const remove = async (g: CommunityGuide) => {
    if (!confirm(`¿Borrar "${g.title}"? No se puede deshacer.`)) return;
    try { await deleteGuide(g.id); toast.success("Borrada."); load(); }
    catch { toast.error("No se pudo borrar."); }
  };

  const share = () => (locked ? openPlans("Compartir una enseñanza") : setEditing("new"));
  const pending = mine.filter(g => g.status !== "publicada");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between rounded-2xl border border-border bg-card/40 p-5">
        <div>
          <p className="font-display font-semibold text-[15px] text-foreground flex items-center gap-2"><Users className="w-4 h-4 text-muted-foreground" /> Lo que otros miembros ya probaron</p>
          <p className="text-[13px] text-muted-foreground mt-1">Casos reales paso a paso, con las herramientas que usaron. ¿Encontraste una forma de usar la app? Compártela.</p>
        </div>
        <button onClick={share} className="btn-primary-nova shrink-0 h-10 px-4 rounded-xl text-[13px] font-semibold inline-flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Compartir mi enseñanza
        </button>
      </div>

      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Tus enseñanzas</p>
          {pending.map(g => (
            <div key={g.id} className="rounded-xl border border-border p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS[g.status].cls}`}>{STATUS[g.status].label}</span>
                  <span className="text-[14px] font-medium text-foreground truncate">{g.title}</span>
                </div>
                {g.status === "rechazada" && g.review_note && <p className="text-[12px] text-muted-foreground mt-1.5">Qué cambiar: {g.review_note}</p>}
                {g.status === "pendiente" && <p className="text-[12px] text-muted-foreground mt-1.5">La estamos revisando. Si la editas, vuelve a la fila de revisión.</p>}
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => setEditing(g)} className="h-8 px-3 rounded-lg border border-border text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><PenLine className="w-3.5 h-3.5" /> Editar</button>
                <button onClick={() => remove(g)} className="h-8 px-2.5 rounded-lg border border-border text-muted-foreground hover:text-foreground" aria-label="Borrar"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {guides === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => <div key={i} className="h-44 rounded-2xl border border-border bg-card/30 animate-pulse" />)}
        </div>
      ) : guides.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-[13px] text-muted-foreground">Todavía no hay enseñanzas publicadas. La primera puede ser la tuya.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {guides.map(g => (
            <button key={g.id} onClick={() => setReading(g)} className="text-left rounded-2xl border border-border bg-card/40 p-5 flex flex-col gap-3 hover:border-foreground/25 transition-colors">
              <span className="font-display font-semibold text-[15px] text-foreground leading-snug">{g.title}</span>
              <span className="text-[13px] text-muted-foreground leading-relaxed line-clamp-3">{g.summary}</span>
              <ToolChips ids={g.tools.slice(0, 4)} />
              <div className="mt-auto pt-1 flex items-center justify-between text-[12px] text-muted-foreground">
                <span>Por {g.author_name}{mine.some(m => m.id === g.id) && " (tú)"}</span>
                {g.helpful_count > 0 && <span className="inline-flex items-center gap-1"><Heart className="w-3 h-3" strokeWidth={1.8} /> {g.helpful_count.toLocaleString("es")} {g.helpful_count === 1 ? "le sirvió" : "les sirvió"}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {mine.some(g => g.status === "publicada") && (
        <p className="text-[12px] text-muted-foreground">
          Tus publicadas: {mine.filter(g => g.status === "publicada").map((g, i) => (
            <span key={g.id}>{i > 0 && " · "}<button onClick={() => setEditing(g)} className="underline hover:text-foreground">{g.title}</button></span>
          ))} (si la editas, vuelve a revisión).
        </p>
      )}

      {reading && (
        <GuideReader guide={reading} onClose={() => setReading(null)} onNavigate={locked ? undefined : onNavigate}
          voted={votes.has(reading.id)} onVote={user && !locked ? (on) => vote(reading, on) : undefined} />
      )}
      {editing && <GuideEditor initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}
