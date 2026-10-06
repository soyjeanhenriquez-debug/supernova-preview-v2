import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TOOL_LABEL, feedbackSummary, listClones, listFeedback, type CloneRow, type Feedback } from "@/lib/creationFeedback";

/**
 * Admin → Aprendizaje (06-oct-2026, pedido de Jean: "retroalimentarnos de los usuarios").
 *  · Carruseles clonados: lo que la gente trae porque funciona, con su gancho, por qué funciona, sus
 *    láminas y lo que pidió la app. Es la biblioteca de patrones virales para mejorar los prompts.
 *  · ¿Les sirvió?: los "sí / no mucho" de cada herramienta, con la nota. Los "no" son los muros.
 */
type Tab = "clones" | "opiniones";

export default function AdminAprendizaje() {
  const [tab, setTab] = useState<Tab>("clones");
  const [order, setOrder] = useState<"likes" | "recent">("likes");
  const [onlyNo, setOnlyNo] = useState(false);
  const [clones, setClones] = useState<CloneRow[] | null>(null);
  const [fb, setFb] = useState<Feedback[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    if (tab === "clones") { setClones(null); listClones(order).then(setClones).catch(() => setClones([])); }
    else { setFb(null); listFeedback(onlyNo).then(setFb).catch(() => setFb([])); }
  }, [tab, order, onlyNo]);
  useEffect(() => { load(); }, [load]);

  // Nombres para saber a quién escribirle (si no se pueden leer, se muestra el id corto).
  useEffect(() => {
    const ids = [...new Set([...(clones ?? []).map(c => c.user_id), ...(fb ?? []).map(f => f.user_id)])].filter(id => !(id in names));
    if (!ids.length) return;
    supabase.from("profiles").select("user_id,display_name").in("user_id", ids.slice(0, 200))
      .then(({ data }) => setNames(n => ({ ...n, ...Object.fromEntries((data ?? []).map(p => [p.user_id, p.display_name ?? ""])) })));
  }, [clones, fb, names]);
  const who = (id: string) => names[id] || id.slice(0, 8);
  const summary = useMemo(() => feedbackSummary(fb ?? []), [fb]);
  const chip = (on: boolean) => `h-8 px-3.5 rounded-lg text-[13px] font-medium ${on ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Aprendizaje</h1>
        <p className="text-sm text-muted-foreground mt-1">Lo que los usuarios clonan porque funciona y lo que les sirvió o no. Los "no mucho" son los muros que hay que arreglar primero.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-border p-1 gap-1">
          <button onClick={() => setTab("clones")} className={chip(tab === "clones")}>Carruseles clonados</button>
          <button onClick={() => setTab("opiniones")} className={chip(tab === "opiniones")}>¿Les sirvió?</button>
        </div>
        {tab === "clones" ? (
          <div className="inline-flex rounded-xl border border-border p-1 gap-1">
            <button onClick={() => setOrder("likes")} className={chip(order === "likes")}>Más me gusta</button>
            <button onClick={() => setOrder("recent")} className={chip(order === "recent")}>Recientes</button>
          </div>
        ) : (
          <div className="inline-flex rounded-xl border border-border p-1 gap-1">
            <button onClick={() => setOnlyNo(false)} className={chip(!onlyNo)}>Todas</button>
            <button onClick={() => setOnlyNo(true)} className={chip(onlyNo)}>Solo "no mucho"</button>
          </div>
        )}
      </div>

      {tab === "clones" && (clones === null ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : clones.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-[13px] text-muted-foreground">Todavía nadie ha clonado un carrusel.</p>
      ) : (
        <div className="space-y-3">
          {clones.map(c => (
            <div key={c.id} className="rounded-xl border border-border p-4 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-foreground">{c.hook || c.summary || "Sin gancho leído"}</p>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    {c.owner ? `@${c.owner}` : "Cuenta desconocida"}
                    {c.likes != null && <> · {c.likes.toLocaleString("es")} me gusta · {(c.comments ?? 0).toLocaleString("es")} comentarios</>}
                    {" · "}{c.mode === "tema" ? "Clonar casi igual" : "Su ADN en mi producto"}
                    {" · "}lo clonó {who(c.user_id)} · {new Date(c.created_at).toLocaleString("es")}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <a href={c.url} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-lg border border-border text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" /> Original</a>
                  <button onClick={() => setOpen(open === c.id ? null : c.id)} className="h-8 px-3 rounded-lg border border-border text-[12px] text-muted-foreground hover:text-foreground">{open === c.id ? "Cerrar" : "Ver análisis"}</button>
                </div>
              </div>
              {c.why && <p className="text-[13px] text-foreground"><span className="text-muted-foreground">Por qué funciona: </span>{c.why}</p>}
              {open === c.id && (
                <div className="grid gap-3 sm:grid-cols-2 text-[12px]">
                  <div className="space-y-1">
                    <p className="text-foreground font-medium">Sus láminas</p>
                    {(c.analysis.laminas ?? []).map((l, i) => <p key={i} className="text-muted-foreground">{l.n ?? i + 1}. {l.composicion} — {l.idea}</p>)}
                  </div>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <p className="text-foreground font-medium">Lo que la app le dio</p>
                      {(c.result.portadas ?? []).map((t, i) => <p key={i} className="text-muted-foreground">Portada {i + 1}: {t.replace(/\*/g, "")}</p>)}
                      {!!c.result.tipos?.length && <p className="text-muted-foreground">Láminas: {c.result.tipos.join(" · ")}</p>}
                      {c.result.palabra && <p className="text-muted-foreground">Palabra clave: {c.result.palabra}</p>}
                    </div>
                    {!!c.analysis.necesitas?.length && (
                      <div className="space-y-1">
                        <p className="text-foreground font-medium">Lo que le pidió poner</p>
                        {c.analysis.necesitas.map((n, i) => <p key={i} className="text-muted-foreground">· {n}</p>)}
                      </div>
                    )}
                    {!!c.analysis.adn?.length && <p className="text-muted-foreground"><span className="text-foreground">ADN que importa: </span>{c.analysis.adn.filter(d => d.importa).map(d => d.parte).join(" · ")}</p>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {tab === "opiniones" && (fb === null ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : (
        <div className="space-y-4">
          {summary.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-3">
              {summary.map(s => (
                <div key={s.tool} className="rounded-xl border border-border p-3">
                  <p className="text-[13px] text-foreground">{TOOL_LABEL[s.tool] ?? s.tool}</p>
                  <p className="text-[12px] text-muted-foreground mt-1">{s.yes} sí · {s.no} no mucho{s.yes + s.no ? ` · ${Math.round((s.yes / (s.yes + s.no)) * 100)} % les sirvió` : ""}</p>
                </div>
              ))}
            </div>
          )}
          {fb.length === 0 ? <p className="rounded-xl border border-dashed border-border px-4 py-5 text-[13px] text-muted-foreground">Todavía no hay opiniones.</p> : (
            <div className="space-y-2">
              {fb.map(f => (
                <div key={f.id} className="rounded-xl border border-border p-3.5 flex gap-3">
                  {f.helpful ? <ThumbsUp className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" /> : <ThumbsDown className="w-4 h-4 mt-0.5 text-primary shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-[13px] text-foreground">{f.note || (f.helpful ? "Le sirvió." : "No le sirvió (sin nota).")}</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">{TOOL_LABEL[f.tool] ?? f.tool} · {who(f.user_id)} · {new Date(f.created_at).toLocaleString("es")}
                      {typeof f.context?.original === "string" && <> · <a href={f.context.original} target="_blank" rel="noreferrer" className="underline">original</a></>}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
