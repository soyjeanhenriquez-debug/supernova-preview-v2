import { useState } from "react";
import { CalendarPlus, Check, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalProducts } from "@/contexts/ProductContext";
import { useBonusStatus } from "@/components/PublishBonus";
import { KINDS, addToTracker, type Kind } from "@/lib/contentTracker";

/**
 * Puente de la creación a la publicación (12-oct-2026): debajo de cada pieza hecha (imagen,
 * carrusel, video, texto) dos botones claros: "Agendar" (elige el día) y "Ya lo publiqué" (queda
 * marcada en todas sus redes y, si hay bono, se reclama en Contenido con el enlace y una captura).
 * Todo va al calendario de Contenido. Gratis.
 */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const pretty = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "short" });

export function AddToTracker({ kind, title, keyword, source, className = "" }: { kind: Kind; title: string; keyword?: string; source: string; className?: string }) {
  const { user } = useAuth();
  const activeId = useOptionalProducts()?.activeId ?? null;
  const bonus = useBonusStatus();
  const [state, setState] = useState<"idle" | "pick" | "busy" | "done">("idle");
  const [date, setDate] = useState(plusDays(1));
  const [doneText, setDoneText] = useState("");

  const save = async (o: { due?: string; published?: boolean }) => {
    if (state === "busy" || state === "done") return;
    if (!user || !activeId) { toast("Elige tu producto primero para guardar tus publicaciones."); return; }
    setState("busy");
    const ok = await addToTracker({ uid: user.id, productId: activeId, kind, title, keyword, source, due: o.due, published: o.published });
    if (!ok) { setState("idle"); toast.error("No se pudo guardar. Intenta de nuevo."); return; }
    setState("done");
    const go = { label: "Ver", onClick: () => { window.location.hash = "#/contenido"; } };
    if (o.published) {
      setDoneText("Publicado");
      const canBonus = bonus && !bonus.claimedToday && bonus.monthTotal + bonus.perClaim <= bonus.monthCap;
      toast.success("Marcado como publicado", {
        description: canBonus ? `En Contenido toca "Ganar ${bonus.perClaim} créditos" con el enlace del post y una captura.` : `Queda en tu calendario como publicado en ${KINDS[kind].line}.`,
        action: go,
      });
    } else {
      const due = o.due ?? plusDays(0);
      setDoneText(due === plusDays(0) ? "Agendado para hoy" : `Agendado: ${pretty(due)}`);
      toast.success(due === plusDays(0) ? "Agendado para hoy" : `Agendado para el ${pretty(due)}`, {
        description: `Cuando lo publiques, márcalo en Contenido (${KINDS[kind].line}).`, action: go,
      });
    }
  };

  const btn = `min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border px-4 text-[13px] disabled:opacity-60 ${className}`;

  if (state === "done") {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 text-[13px] text-emerald-400">
        <Check className="w-4 h-4" /> {doneText}
        <a href="#/contenido" className="text-muted-foreground underline underline-offset-2 hover:text-foreground">Ver en mi calendario</a>
      </span>
    );
  }

  if (state === "pick") {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        {[{ l: "Hoy", d: plusDays(0) }, { l: "Mañana", d: plusDays(1) }].map(o => (
          <button key={o.l} type="button" onClick={() => void save({ due: o.d })} className={`${btn} border-border text-foreground hover:border-foreground/40`}>{o.l}</button>
        ))}
        <input type="date" value={date} min={plusDays(0)} onChange={e => setDate(e.target.value)} aria-label="Día para publicar"
          className="min-h-[44px] rounded-xl border border-border bg-background px-3 text-[13px] text-foreground" />
        <button type="button" onClick={() => void save({ due: date })} disabled={!date} className={`${btn} border-primary/50 text-primary hover:bg-primary/10`}>Agendar</button>
        <button type="button" onClick={() => setState("idle")} className="text-[12px] text-muted-foreground hover:text-foreground">Cancelar</button>
      </span>
    );
  }

  const busy = state === "busy";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => setState("pick")} disabled={busy} className={`${btn} border-border text-foreground hover:border-foreground/40`}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />} Agendar
      </button>
      <button type="button" onClick={() => void save({ published: true })} disabled={busy} className={`${btn} border-border text-foreground hover:border-foreground/40`}>
        <CheckCircle2 className="w-4 h-4" /> Ya lo publiqué
      </button>
    </span>
  );
}
