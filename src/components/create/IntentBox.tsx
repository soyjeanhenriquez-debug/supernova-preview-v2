import { useMemo, useState } from "react";
import {
  ArrowRight, Camera, ChevronRight, Compass, Copy, FileText, Images, Lightbulb, MessageSquareText, Shapes, UserRound, Video,
  type LucideIcon,
} from "lucide-react";
import { useBusinessProfile } from "@/lib/businessProfile";
import { useFeatureAccess } from "@/lib/features";
import { TOOL_BY_ID, useVia } from "@/lib/tools";
import { IG_POST_RE, IG_REEL_RE, planFor, routeIntent, setClipPrompt, startIntent, type IntentPlan } from "@/lib/intentRouter";
import { IdeaOfTheDay } from "@/components/create/IdeaOfTheDay";
import { useAuth } from "@/contexts/AuthContext";
import { isGenjutsuOwner } from "@/lib/genjutsuOwner";
import { track } from "@/lib/analytics";

/**
 * "¿Qué quieres crear hoy?" (26-oct-2026, pedido de Jean): 4 entradas según lo que la persona TIENE en la mano,
 * no según el nombre de la herramienta. Cada una se abre en el mismo sitio y lleva a algo que YA funciona:
 *  1. Tengo una referencia → reel (Analiza un Reel) o carrusel (Modelar uno que ya funciona), con el enlace puesto.
 *  2. Tengo mi material → mi video, mi guion, fotos de mi producto o un prompt, cada uno a su herramienta.
 *  3. Solo tengo una idea → una frase; el enrutador (src/lib/intentRouter.ts) elige la pieza.
 *  4. No sé qué crear → la oferta ganadora del día (IdeaOfTheDay) con "Crear con esta idea".
 * Entender y llevar es gratis (reglas fijas, sin IA). Los créditos los cobra cada herramienta como siempre, en el
 * servidor, y se ven antes de crear. Solo se muestra lo que esa cuenta puede abrir (canSee / solo Jean).
 */
type Entry = "ref" | "mat" | "idea" | "nose";
type Row = { id: string; icon: LucideIcon; label: string; desc: string; page: string; hash: string; show: boolean };

export function IntentBox({ onNavigate, compact = false, onDone }: {
  onNavigate: (page: string) => void;
  /** En la hoja del teléfono y dentro del árbol: sin título grande. */
  compact?: boolean;
  /** Se llama al ir a una herramienta (para cerrar la hoja). */
  onDone?: () => void;
}) {
  const [open, setOpen] = useState<Entry | null>(null);
  const [link, setLink] = useState("");
  const [idea, setIdea] = useState("");
  const [prompt, setPrompt] = useState<string | null>(null);
  const { via } = useVia();
  const { canSee } = useFeatureAccess();
  const { profile } = useBusinessProfile();
  const { user } = useAuth();
  const jean = isGenjutsuOwner(user?.id);
  const plan = useMemo(() => routeIntent(idea, { via, canSee }), [idea, via, canSee]);
  const isReel = IG_REEL_RE.test(link);
  const isPost = !isReel && IG_POST_RE.test(link);

  const go = (p: IntentPlan, como: string) => {
    track("intent_start", { regla: p.rule, herramienta: p.tool.id, como, via });
    onDone?.();
    startIntent(p, profile, onNavigate);
  };
  const toHash = (hash: string, id: string) => {
    track("intent_start", { regla: id, herramienta: id, como: "material", via });
    onDone?.();
    window.location.hash = `#/${hash}`;
    window.scrollTo({ top: 0 });
  };
  const goLink = () => {
    const p = routeIntent(link, { via, canSee });
    if (p && (isReel || isPost)) go(p, "referencia");
  };
  const goPrompt = () => {
    const t = (prompt ?? "").trim();
    if (t.length < 8) return;
    setClipPrompt(t);
    toHash("video-ia", "prompt");
  };
  const toggle = (e: Entry) => setOpen(o => (o === e ? null : e));

  const rows: Row[] = [
    { id: "mi_video", icon: Video, label: "Grabé mi video", desc: "Subtítulos, portada y edición.", page: "Con tu cara", hash: "con-tu-cara/video", show: true },
    { id: "guion_grabo", icon: FileText, label: "Tengo mi guion y me grabo", desc: "Lo lees mirando a la cámara.", page: "Con tu cara", hash: "con-tu-cara/teleprompter", show: true },
    { id: "guion_animado", icon: Shapes, label: "Tengo mi guion, sin salir yo", desc: "Texto animado con el estilo que elijas.", page: "Motion graphics", hash: "motion", show: true },
    { id: "fotos_producto", icon: Camera, label: "Tengo fotos de mi producto", desc: "Fotos de estudio y en uso para vender.", page: "Foto de producto", hash: "foto-producto", show: true },
    { id: "foto_habla", icon: UserRound, label: "Mi foto hablando", desc: "Tu avatar dice tu texto.", page: "Estudio de avatar", hash: "estudio-avatar", show: canSee("Estudio de avatar") },
    { id: "fotos_reel", icon: Images, label: "Mis fotos + una frase → reel", desc: "Reel Studio arma el reel completo.", page: "Con tu cara", hash: "con-tu-cara/reel-ia", show: jean },
  ].filter(r => r.show && canSee(r.page));
  const clipCost = TOOL_BY_ID.videoia?.cost;

  const cards: { id: Entry; titulo: string; linea: string; icon: LucideIcon }[] = [
    { id: "ref", titulo: "Tengo una referencia", linea: "Un reel o un carrusel que funciona.", icon: Copy },
    { id: "mat", titulo: "Tengo mi material", linea: "Mi video, mi guion, mis fotos o una escena.", icon: Images },
    { id: "idea", titulo: "Solo tengo una idea", linea: "Dila en una frase y la armamos.", icon: Lightbulb },
    { id: "nose", titulo: "No sé qué crear", linea: "Te damos una idea que ya está vendiendo.", icon: Compass },
  ];

  const input = "w-full h-12 rounded-xl border border-border bg-background/60 px-3.5 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/30";
  const primary = "w-full h-11 btn-primary-nova rounded-xl text-[14px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50";

  return (
    <section aria-labelledby="intent-titulo" className="space-y-3">
      {compact
        ? <h2 id="intent-titulo" className="sr-only">¿Qué quieres crear hoy?</h2>
        : (
          <div>
            <h2 id="intent-titulo" className="font-display font-semibold text-[18px] text-foreground">¿Qué quieres crear hoy?</h2>
            <p className="text-[12.5px] text-muted-foreground">Toca lo que tienes. Nosotros te llevamos a la herramienta con todo puesto.</p>
          </div>
        )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {cards.map(c => {
          const Icon = c.icon;
          const active = open === c.id;
          return (
            <button key={c.id} type="button" onClick={() => toggle(c.id)} aria-expanded={active}
              className={`text-left rounded-2xl border p-3.5 min-h-[112px] flex flex-col gap-2 transition-colors ${active ? "border-primary/60 bg-primary/[0.05]" : "border-border bg-card/40 hover:border-foreground/30"}`}>
              <Icon className={`w-5 h-5 ${active ? "text-primary" : "text-foreground"}`} strokeWidth={1.7} />
              <span className="font-display text-[14.5px] font-semibold leading-snug text-foreground">{c.titulo}</span>
              <span className="text-[12px] text-muted-foreground leading-snug">{c.linea}</span>
            </button>
          );
        })}
      </div>

      {open === "ref" && (
        <div className="rounded-2xl border border-border bg-card/40 p-4 space-y-2.5">
          <input value={link} onChange={e => setLink(e.target.value)} onKeyDown={e => { if (e.key === "Enter") goLink(); }}
            placeholder="https://www.instagram.com/reel/…" inputMode="url" aria-label="Enlace de la referencia" maxLength={300} className={input} autoFocus />
          {isReel && <p className="text-[12.5px] text-foreground">Es un reel. Ves por qué funciona y armas tu versión para grabar.</p>}
          {isPost && <p className="text-[12.5px] text-foreground">Es un carrusel. Lo modelas con tu estilo y tu ADN.</p>}
          {link.trim() && !isReel && !isPost && (
            <p className="text-[12px] text-muted-foreground">Por ahora leemos enlaces de Instagram (instagram.com/reel/… o /p/…). Si es de TikTok o YouTube, usa «Solo tengo una idea» y cuéntanos de qué trata.</p>
          )}
          <button onClick={goLink} disabled={!isReel && !isPost} className={primary}>
            {isPost ? "Modelar este carrusel" : "Ver por qué funciona y hacer mi versión"} <ArrowRight className="w-4 h-4" />
          </button>
          {isReel && jean && (
            <button onClick={() => toHash("con-tu-cara/reel-ia", "reel_studio")}
              className="w-full h-10 rounded-xl border border-border text-[13px] font-semibold text-foreground hover:border-foreground/30">
              Hacerlo completo con IA en Reel Studio
            </button>
          )}
          <p className="text-[11.5px] text-muted-foreground text-center">Antes de analizar o modelar ves cuántos créditos usa.</p>
        </div>
      )}

      {open === "mat" && (
        <div className="rounded-2xl border border-border bg-card/40 divide-y divide-border">
          {rows.map(r => {
            const Icon = r.icon;
            return (
              <button key={r.id} onClick={() => toHash(r.hash, r.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40">
                <Icon className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.7} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-foreground">{r.label}</span>
                  <span className="block text-[12px] text-muted-foreground">{r.desc}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
          {canSee("Video IA") && (
            <div className="px-4 py-3 space-y-2.5">
              <button onClick={() => setPrompt(p => (p === null ? "" : null))} aria-expanded={prompt !== null} className="w-full flex items-center gap-3 text-left">
                <MessageSquareText className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.7} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-foreground">Ya sé cómo se ve mi video</span>
                  <span className="block text-[12px] text-muted-foreground">Descríbelo y lo convertimos en un video corto.</span>
                </span>
                <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${prompt !== null ? "rotate-90" : ""}`} />
              </button>
              {prompt !== null && (
                <>
                  <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} maxLength={1000} aria-label="Cómo se ve tu video" autoFocus
                    placeholder="Una mujer abre su laptop en una cocina luminosa y sonríe al ver su primera venta…"
                    className="w-full rounded-xl border border-border bg-background/60 px-3.5 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/30" />
                  <button onClick={goPrompt} disabled={prompt.trim().length < 8} className={primary}>
                    Llevarlo a Video con IA <ArrowRight className="w-4 h-4" />
                  </button>
                  <p className="text-[11.5px] text-muted-foreground text-center">Allí eliges la duración y ves el costo{clipCost ? ` (${clipCost.toLowerCase()})` : ""} antes de crear.</p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {open === "idea" && (
        <div className="rounded-2xl border border-border bg-card/40 p-4 space-y-3">
          <input value={idea} onChange={e => setIdea(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && plan) go(plan, "idea"); }}
            placeholder="Ej.: un carrusel sobre 5 errores al empezar" aria-label="Tu idea" maxLength={400} className={input} autoFocus />
          {plan ? (
            <div className="space-y-2.5" aria-live="polite">
              <p className="text-[13.5px] text-foreground">{plan.entendi} <span className="text-muted-foreground">{plan.necesita}</span></p>
              <button onClick={() => go(plan, "idea")} className={primary}>
                Crear en {plan.tool.title} <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-[11.5px] text-muted-foreground text-center">
                {plan.tool.cost ? `${plan.tool.cost}. ` : ""}Allí lo ves y lo confirmas antes de crear.
              </p>
              {plan.alternatives.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] text-muted-foreground">O mejor:</span>
                  {plan.alternatives.map(a => (
                    <button key={a.id} onClick={() => go(planFor(a.id, plan), "alternativa")}
                      className="h-8 px-3 rounded-full border border-border text-[12px] text-foreground hover:border-foreground/30">{a.nav}</button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">Escribe qué quieres y de qué trata. Si nombras la pieza (carrusel, video, imágenes…), vamos directo a ella.</p>
          )}
        </div>
      )}

      {open === "nose" && (
        <div className="space-y-2">
          <IdeaOfTheDay />
          <button onClick={() => { onDone?.(); onNavigate("Ofertas"); }}
            className="w-full h-11 rounded-xl border border-border text-[13px] font-semibold text-foreground hover:border-foreground/30 inline-flex items-center justify-center gap-1.5">
            Ver más ofertas que ya venden <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </section>
  );
}
