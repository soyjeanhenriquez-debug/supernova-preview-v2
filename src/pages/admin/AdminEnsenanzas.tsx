import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Eye, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { GuideReader } from "@/components/aprende/CommunityGuides";
import { listByStatus, reviewGuide, riskyPhrases, type CommunityGuide, type GuideStatus } from "@/lib/communityGuides";

/**
 * Admin → Enseñanzas: revisar lo que comparten los miembros antes de que se vea en Aprende.
 * Publicar solo si cumple el manual: sin promesas de ingresos ni plazos, sin cifras inventadas,
 * con sus palabras (no un texto ajeno traducido tal cual) y con crédito si es una adaptación.
 */
const TABS: { id: GuideStatus; label: string }[] = [
  { id: "pendiente", label: "Por revisar" },
  { id: "publicada", label: "Publicadas" },
  { id: "rechazada", label: "Devueltas" },
];

export default function AdminEnsenanzas() {
  const [tab, setTab] = useState<GuideStatus>("pendiente");
  const [rows, setRows] = useState<CommunityGuide[] | null>(null);
  const [reading, setReading] = useState<CommunityGuide | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => { setRows(null); listByStatus(tab).then(setRows).catch(() => setRows([])); }, [tab]);
  useEffect(() => { load(); }, [load]);

  const decide = async (g: CommunityGuide, status: GuideStatus) => {
    let note: string | null = null;
    if (status === "rechazada") {
      note = prompt("¿Qué tiene que cambiar? (lo verá quien la escribió)", g.review_note ?? "");
      if (note === null) return;
    }
    setBusy(g.id);
    try {
      await reviewGuide(g.id, status, note);
      toast.success(status === "publicada" ? "Publicada en Aprende." : status === "rechazada" ? "Devuelta con tu nota." : "Vuelve a revisión.");
      load();
    } catch { toast.error("No se pudo guardar."); }
    finally { setBusy(""); }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Enseñanzas</h1>
        <p className="text-sm text-muted-foreground mt-1">Lo que comparten los miembros en Aprende. Publica solo si no promete ingresos ni plazos, está escrita con sus palabras y da crédito si la adaptó.</p>
      </div>
      <div className="inline-flex rounded-xl border border-border p-1 gap-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`h-8 px-3.5 rounded-lg text-[13px] font-medium ${tab === t.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
        ))}
      </div>

      {rows === null ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-[13px] text-muted-foreground">Nada en esta lista.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(g => {
            const risky = riskyPhrases(`${g.title}\n${g.summary}\n${g.body}`);
            return (
              <div key={g.id} className="rounded-xl border border-border p-4 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium text-foreground">{g.title}</p>
                    <p className="text-[13px] text-muted-foreground mt-0.5">{g.summary}</p>
                    <p className="text-[12px] text-muted-foreground mt-1.5">
                      {g.author_name} · {new Date(g.created_at).toLocaleString("es")} · {g.body.length.toLocaleString("es")} caracteres
                      {g.source_credit && <> · Basada en: {g.source_credit}</>}
                      {tab === "publicada" && <> · {g.helpful_count.toLocaleString("es")} votos “me sirvió”</>}
                    </p>
                    {risky.length > 0 && <p className="mt-1.5 text-[12px] text-primary inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Revisa: {risky.join(", ")}</p>}
                    {g.review_note && <p className="mt-1 text-[12px] text-muted-foreground">Tu nota: {g.review_note}</p>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => setReading(g)} className="h-8 px-3 rounded-lg border border-border text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> Leer</button>
                    {g.status !== "publicada" && (
                      <button disabled={busy === g.id} onClick={() => decide(g, "publicada")} className="btn-primary-nova h-8 px-3 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Publicar</button>
                    )}
                    {g.status !== "rechazada" && (
                      <button disabled={busy === g.id} onClick={() => decide(g, "rechazada")} className="h-8 px-3 rounded-lg border border-border text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><X className="w-3.5 h-3.5" /> {g.status === "publicada" ? "Retirar" : "Devolver"}</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {reading && <GuideReader guide={reading} onClose={() => setReading(null)} />}
    </div>
  );
}
