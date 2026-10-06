import { useEffect, useState } from "react";
import { Loader2, MessageCircleQuestion, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { sendFeedback } from "@/lib/creationFeedback";
import { CHECKIN_EVERY_DAYS, CHECKIN_OPTIONS, pickCheckIn, type CheckIn, type CheckInClone, type CheckInItem } from "@/lib/checkIn";

/**
 * La pregunta de resultados en el Inicio: como mucho una vez por semana, sobre algo que la persona hizo
 * (ver src/lib/checkIn.ts). Se cierra con "Ahora no" y no vuelve hasta dentro de 7 días. Lo que contesta
 * llega a Admin → Aprendizaje ("Resultados"); si dice cuántos le escribieron, se anota en su tracker.
 */
const TOOL = "resultados";
const SNOOZE_KEY = "sn_checkin_snooze";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;

function snoozedAt(): string | null {
  try { return localStorage.getItem(SNOOZE_KEY); } catch { return null; }
}

export function ResultsCheckIn() {
  const { user } = useAuth();
  const [q, setQ] = useState<CheckIn | null>(null);
  const [leads, setLeads] = useState("");
  const [sales, setSales] = useState("");
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    (async () => {
      try {
        const [fb, items, clones] = await Promise.all([
          db().from("creation_feedback").select("ref_id,created_at").eq("user_id", user.id).eq("tool", TOOL).order("created_at", { ascending: false }).limit(100),
          db().from("content_items").select("id,title,topic,kind,keyword,channels,leads,sales,created_at").eq("user_id", user.id).gte("created_at", since).order("created_at", { ascending: false }).limit(30),
          db().from("carousel_clones").select("id,hook,summary,created_at").eq("user_id", user.id).gte("created_at", since).order("created_at", { ascending: false }).limit(5),
        ]);
        const rows = (fb.data ?? []) as { ref_id: string | null; created_at: string }[];
        const snooze = snoozedAt();
        const last = [rows[0]?.created_at, snooze].filter((x): x is string => !!x).sort().at(-1) ?? null;
        const pick = pickCheckIn({
          items: (items.data ?? []) as CheckInItem[], clones: (clones.data ?? []) as CheckInClone[],
          asked: new Set(rows.map(r => r.ref_id).filter((x): x is string => !!x)), lastAskedAt: last,
        });
        if (alive) setQ(pick);
      } catch { /* sin pregunta: nunca bloquea el Inicio */ }
    })();
    return () => { alive = false; };
  }, [user]);

  if (!user || !q) return null;
  if (done) return <p className="text-[12px] text-muted-foreground">Gracias por contarnos cómo te fue. Con esto mejoramos SUPERNOVA.</p>;

  const later = () => {
    try { localStorage.setItem(SNOOZE_KEY, new Date().toISOString()); } catch { /* sin almacenamiento: solo se oculta */ }
    setQ(null);
  };
  const record = async (helpful: boolean, answer: string, extra: Record<string, unknown> = {}, withNote = false) => {
    setBusy(true);
    const ok = await sendFeedback({ uid: user.id, tool: TOOL, refId: q.refId, helpful, note: withNote ? note : undefined, context: { tipo: q.type, respuesta: answer, pieza: q.title, ...extra } });
    setBusy(false);
    if (!ok) { toast.error("No se pudo guardar. Intenta de nuevo."); return; }
    setDone(true);
  };
  const saveResult = async (none = false) => {
    if (q.type !== "resultado" || busy) return;
    const l = none ? 0 : Math.max(0, Math.min(100000, Math.round(Number(leads) || 0)));
    const s = none ? 0 : Math.max(0, Math.min(100000, Math.round(Number(sales) || 0)));
    if (l || s) {
      const { error } = await db().from("content_items").update({ leads: l, sales: s }).eq("id", q.refId).eq("user_id", user.id);
      if (error) { toast.error("No se pudo anotar en tu tracker."); return; }
    }
    await record(l > 0 || s > 0, none ? "ninguna-todavia" : "anotado", { leads: l, ventas: s });
    if (l || s) toast.success("Anotado en tu tracker de Contenido");
  };
  const num = "w-24 h-10 rounded-lg border border-border bg-transparent px-3 text-[13px] text-foreground";
  const btn = "min-h-[40px] rounded-lg border border-border px-3 text-[12px] text-foreground hover:border-foreground/40 disabled:opacity-60";

  return (
    <section className="rounded-2xl border border-border p-4 space-y-3" aria-label="Cuéntanos cómo te fue">
      <div className="flex items-start gap-3">
        <MessageCircleQuestion className="w-5 h-5 text-primary shrink-0 mt-0.5" strokeWidth={1.8} />
        <p className="flex-1 text-[14px] text-foreground">{q.question}</p>
        <button type="button" onClick={later} aria-label="Ahora no" title={`Ahora no (vuelve en ${CHECKIN_EVERY_DAYS} días)`} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>

      {q.type === "resultado" ? (
        <div className="flex flex-wrap items-end gap-2 pl-8">
          <label className="space-y-1"><span className="block text-[11px] text-muted-foreground">Personas</span>
            <input type="number" inputMode="numeric" min={0} value={leads} onChange={e => setLeads(e.target.value)} className={num} aria-label="Cuántas personas te escribieron" /></label>
          <label className="space-y-1"><span className="block text-[11px] text-muted-foreground">Ventas (si hubo)</span>
            <input type="number" inputMode="numeric" min={0} value={sales} onChange={e => setSales(e.target.value)} className={num} aria-label="Cuántas ventas" /></label>
          <button type="button" disabled={busy || (!leads && !sales)} onClick={() => void saveResult()} className={btn}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Anotar"}</button>
          <button type="button" disabled={busy} onClick={() => void saveResult(true)} className="min-h-[40px] px-2 text-[12px] text-muted-foreground hover:text-foreground">Ninguna todavía</button>
        </div>
      ) : (
        <div className="space-y-2 pl-8">
          <div className="flex flex-wrap gap-2">
            {CHECKIN_OPTIONS[q.type].map(o => (
              <button key={o.id} type="button" disabled={busy} aria-pressed={noteFor === o.id}
                onClick={() => (o.askNote ? setNoteFor(o.id) : void record(o.helpful, o.id))} className={btn}>{o.label}</button>
            ))}
          </div>
          {noteFor && (
            <div className="space-y-2">
              <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={2} placeholder="¿Qué faltó o qué no salió como esperabas? (opcional)" aria-label="Qué faltó"
                className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground" />
              <button type="button" disabled={busy} onClick={() => void record(false, noteFor, {}, true)} className={btn}>Enviar</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
