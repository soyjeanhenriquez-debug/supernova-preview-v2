import { useEffect, useState } from "react";
import { Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { sendFeedback } from "@/lib/creationFeedback";

/**
 * "¿Te sirvió?" al final de una herramienta. Un toque basta; si dice que no, se le pregunta qué faltó
 * (opcional). Lo lee el admin en Aprendizaje para encontrar los muros. Gratis.
 */
export function ToolFeedback({ tool, refId, context, question = "¿Te sirvió?" }: { tool: string; refId?: string | null; context?: Record<string, unknown>; question?: string }) {
  const { user } = useAuth();
  const [id, setId] = useState<string | null>(null);
  const [vote, setVote] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  // Un resultado nuevo = una pregunta nueva.
  useEffect(() => { setId(null); setVote(null); setNote(""); setSent(false); }, [refId, tool]);
  if (!user) return null;

  const save = async (helpful: boolean, withNote = false) => {
    if (busy) return;
    setBusy(true); setVote(helpful);
    const got = await sendFeedback({ id, uid: user.id, tool, refId, helpful, note: withNote ? note : undefined, context });
    setBusy(false);
    if (!got) { toast.error("No se pudo guardar tu opinión."); return; }
    setId(got);
    if (withNote || helpful) { setSent(true); toast.success("Gracias: con esto mejoramos la app."); }
  };

  if (sent) return <p className="text-[12px] text-muted-foreground">Gracias por contarnos. Lo usamos para mejorar.</p>;
  return (
    <div className="rounded-xl border border-border p-3.5 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-foreground">{question}</span>
        <button type="button" onClick={() => void save(true)} disabled={busy} aria-pressed={vote === true}
          className={`min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border px-3 text-[12px] ${vote === true ? "border-foreground/50 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
          <ThumbsUp className="w-3.5 h-3.5" /> Sí
        </button>
        <button type="button" onClick={() => void save(false)} disabled={busy} aria-pressed={vote === false}
          className={`min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border px-3 text-[12px] ${vote === false ? "border-foreground/50 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
          <ThumbsDown className="w-3.5 h-3.5" /> No mucho
        </button>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>
      {vote === false && (
        <div className="space-y-2">
          <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={2}
            placeholder="¿Qué faltó o qué no salió como esperabas? (opcional)" aria-label="Qué faltó"
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground" />
          <button type="button" onClick={() => void save(false, true)} disabled={busy}
            className="min-h-[36px] rounded-lg border border-border px-3 text-[12px] text-foreground hover:border-foreground/40">Enviar</button>
        </div>
      )}
    </div>
  );
}
