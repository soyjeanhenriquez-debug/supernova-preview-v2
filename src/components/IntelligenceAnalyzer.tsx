import { useEffect, useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLandingAnalyzer, STEP_ORDER, STEP_LABEL, type IntelligenceResult, type LandingAd } from "@/hooks/useLandingAnalyzer";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Loader2, Zap, Link as LinkIcon, Copy, Trash2, ChevronDown, History, ExternalLink, CheckCircle2, Circle, AlertCircle, Sparkles, Download, FileText, X, ArrowRight } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";

interface SavedRow {
  id: string;
  url: string;
  domain: string;
  brand_name: string | null;
  analysis_text: string;
  ads_found: unknown;
  created_at: string;
}

export function IntelligenceAnalyzer() {
  const { user } = useAuth();
  const { analyze, running, steps, result, error, reset, setResult } = useLandingAnalyzer();

  const [url, setUrl] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [fallback, setFallback] = useState<{ open: boolean; text: string }>({ open: false, text: "" });
  const [saved, setSaved] = useState<SavedRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const loadSaved = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("landing_analyses")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setSaved((data as SavedRow[]) ?? []);
  };
  useEffect(() => { loadSaved(); }, [user?.id]);

  const launch = async (manualText?: string) => {
    setConfirmOpen(false);
    const res = await analyze(url, manualText);
    if (res) {
      setReportOpen(true);
      setFallback({ open: false, text: "" });
      loadSaved();
      toast.success("✓ Informe listo");
    } else if (error === "FETCH_FAILED") {
      setFallback({ open: true, text: "" });
    } else if (error) {
      toast.error(error);
    }
  };

  // when fetch fails inside analyze() we surface fallback automatically via error
  useEffect(() => {
    if (error === "FETCH_FAILED") setFallback((f) => ({ ...f, open: true }));
  }, [error]);

  const handleAnalyzeClick = () => {
    if (!url.trim()) { toast.error("Pega una URL"); return; }
    setConfirmOpen(true);
  };

  const openSaved = (row: SavedRow) => {
    setResult({
      id: row.id,
      url: row.url,
      domain: row.domain,
      brandName: row.brand_name || row.domain,
      analysis: row.analysis_text,
      ads: Array.isArray(row.ads_found) ? (row.ads_found as LandingAd[]) : [],
      createdAt: row.created_at,
    });
    setReportOpen(true);
  };

  const deleteSaved = async (id: string) => {
    await supabase.from("landing_analyses").delete().eq("id", id);
    setSaved((s) => s.filter((r) => r.id !== id));
    toast.success("Análisis eliminado");
  };

  return (
    <>
      {/* Analyzer input card */}
      <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-primary font-bold">
              <Sparkles className="w-3.5 h-3.5" /> Intelligence Analyzer
            </div>
            <h3 className="font-display text-xl text-foreground mt-1.5">Pega cualquier landing y la analizamos todo</h3>
            <p className="text-sm text-muted-foreground mt-1">Anuncios activos · Avatar · Ángulo · Debilidades · Blueprint 30 días · Hook listo.</p>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground border border-border rounded-full px-3 py-1">5 créditos · ~25 s</div>
        </div>

        <div className="flex gap-2 items-stretch flex-col md:flex-row">
          <div className="flex-1 relative">
            <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAnalyzeClick(); }}
              placeholder="https://hotmart.com/... · landing de Shopify · ClickFunnels · Ads Library"
              disabled={running}
              className="w-full bg-background/60 border border-border rounded-xl pl-10 pr-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all disabled:opacity-60"
            />
          </div>
          <button
            onClick={handleAnalyzeClick}
            disabled={running}
            className="btn-primary-nova px-6 py-3.5 rounded-xl text-sm font-semibold whitespace-nowrap flex items-center gap-2 disabled:opacity-60"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {running ? "Analizando..." : "Analizar"}
          </button>
        </div>

        <div className="text-[11px] text-muted-foreground/70">
          Ejemplos: páginas de ventas, Hotmart, Kiwify, Clickbank, Shopify, ClickFunnels o cualquier landing que veas en redes sociales.
        </div>

        {/* Progress */}
        {(running || error) && (
          <div className="mt-2 rounded-xl border border-border bg-background/40 p-4 space-y-2">
            {STEP_ORDER.map((s) => {
              const st = steps[s];
              const icon = st === "done" ? <CheckCircle2 className="w-4 h-4 text-success" />
                : st === "running" ? <Loader2 className="w-4 h-4 animate-spin text-primary" />
                : st === "error" ? <AlertCircle className="w-4 h-4 text-destructive" />
                : st === "skipped" ? <CheckCircle2 className="w-4 h-4 text-muted-foreground/50" />
                : <Circle className="w-4 h-4 text-muted-foreground/40" />;
              return (
                <div key={s} className={`flex items-center gap-3 text-sm ${st === "running" ? "text-foreground" : st === "done" || st === "skipped" ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
                  {icon}
                  <span>{STEP_LABEL[s]}{st === "skipped" ? " (omitido)" : ""}</span>
                </div>
              );
            })}
            {error && error !== "FETCH_FAILED" && (
              <div className="text-[12px] text-destructive pt-1">{error}</div>
            )}
          </div>
        )}

        {/* Manual fallback when fetch fails */}
        {fallback.open && (
          <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 space-y-3">
            <div className="text-sm font-semibold">No pudimos acceder al contenido de esta URL</div>
            <div className="text-xs text-muted-foreground">Pega el copy de la landing aquí y lo analizamos igual.</div>
            <textarea
              value={fallback.text}
              onChange={(e) => setFallback((f) => ({ ...f, text: e.target.value }))}
              rows={6}
              placeholder="Pega aquí el titular, la promesa, los bullets, las secciones de oferta, garantía..."
              className="w-full bg-background/60 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setFallback({ open: false, text: "" }); reset(); }} className="text-xs px-3 py-2 rounded-lg border border-border hover:bg-secondary">Cancelar</button>
              <button onClick={() => launch(fallback.text)} disabled={fallback.text.trim().length < 50 || running} className="btn-primary-nova text-xs px-4 py-2 rounded-lg disabled:opacity-50">Analizar con este texto</button>
            </div>
          </div>
        )}
      </div>

      {/* Confirm modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md border-border bg-card">
          <div className="space-y-4 pt-2">
            <h3 className="font-display text-lg">Confirmar análisis</h3>
            <p className="text-sm text-muted-foreground">Este análisis cuesta <strong className="text-primary">5 créditos</strong>. Incluye fetch de la página, búsqueda en Ads Library y el informe IA completo (9 secciones).</p>
            <div className="text-xs text-muted-foreground truncate font-mono bg-background/60 border border-border rounded px-3 py-2">{url}</div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmOpen(false)} className="text-sm px-4 py-2 rounded-lg border border-border hover:bg-secondary">Cancelar</button>
              <button onClick={() => launch()} className="btn-primary-nova text-sm px-5 py-2 rounded-lg">Sí, analizar (5 cr)</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Report modal */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0 border-border bg-card">
          {result && <ReportContent result={result} onClose={() => setReportOpen(false)} />}
        </DialogContent>
      </Dialog>

      {/* Saved history */}
      <div className="rounded-2xl border border-border bg-card/40 backdrop-blur-xl">
        <button
          onClick={() => setHistoryOpen((v) => !v)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/30 rounded-2xl transition-colors"
        >
          <div className="flex items-center gap-3">
            <History className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Mis análisis guardados</span>
            <span className="text-[11px] text-muted-foreground">({saved.length})</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${historyOpen ? "rotate-180" : ""}`} />
        </button>
        {historyOpen && (
          <div className="border-t border-border divide-y divide-border">
            {saved.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">Aún no has analizado ninguna landing.</div>
            ) : saved.map((row) => (
              <div key={row.id} className="flex items-center gap-3 p-3 hover:bg-secondary/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{row.domain}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{new Date(row.created_at).toLocaleString("es-ES")} · {row.url}</div>
                </div>
                <button onClick={() => openSaved(row)} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:border-primary hover:text-primary transition-colors">Ver</button>
                <button onClick={() => deleteSaved(row.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1.5" aria-label="Eliminar">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ReportContent({ result, onClose }: { result: IntelligenceResult; onClose: () => void }) {
  const copyAll = async () => {
    await navigator.clipboard.writeText(result.analysis);
    toast.success("Informe copiado");
  };

  // Split analysis into sections by '## '
  const sections = (() => {
    const parts = result.analysis.split(/\n(?=## )/g);
    const head = parts[0]?.startsWith("## ") ? "" : parts.shift() ?? "";
    return { head, items: parts };
  })();

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border p-5 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-primary font-bold">Intelligence Report</div>
          <div className="font-display text-lg truncate">{result.domain}</div>
          <div className="text-[11px] text-muted-foreground">{new Date(result.createdAt).toLocaleString("es-ES")}</div>
        </div>
        <div className="flex items-center gap-2">
          <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 rounded-lg border border-border hover:border-primary hover:text-primary flex items-center gap-1.5 transition-colors">
            <ExternalLink className="w-3.5 h-3.5" /> Abrir
          </a>
          <button onClick={copyAll} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:border-primary hover:text-primary flex items-center gap-1.5 transition-colors">
            <Copy className="w-3.5 h-3.5" /> Copiar
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Ads strip */}
        {result.ads.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-3">
              Anuncios activos encontrados ({result.ads.length})
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {result.ads.map((ad, i) => (
                <div key={i} className="shrink-0 w-64 rounded-xl border border-border bg-background/60 p-3 hover:border-primary/40 transition-colors">
                  <div className="text-[11px] font-semibold text-primary truncate">{ad.page_name ?? "Anunciante"}</div>
                  <div className="text-xs text-foreground mt-1 line-clamp-3">{ad.ad_creative_link_titles?.[0] ?? ad.ad_creative_bodies?.[0] ?? "—"}</div>
                  <div className="text-[10px] text-muted-foreground mt-2 line-clamp-3">{ad.ad_creative_bodies?.[0]}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Analysis sections */}
        {sections.head && (
          <div className="prose prose-invert prose-sm max-w-none prose-headings:font-display">
            <ReactMarkdown>{sections.head}</ReactMarkdown>
          </div>
        )}
        <Accordion type="multiple" defaultValue={sections.items.map((_, i) => `s-${i}`)} className="space-y-2">
          {sections.items.map((sec, i) => {
            const title = sec.match(/^##\s+(.+)/)?.[1]?.trim() ?? `Sección ${i+1}`;
            const body = sec.replace(/^##\s+.+\n?/, "");
            return (
              <AccordionItem key={i} value={`s-${i}`} className="border border-border rounded-xl px-4 bg-background/30">
                <AccordionTrigger className="hover:no-underline py-3 text-sm font-display">
                  {title}
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <div className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground">
                    <ReactMarkdown>{body}</ReactMarkdown>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>

        {/* Generadores inline */}
        <OraculoGenerators result={result} />
      </div>
    </div>
  );
}

type GenKind = "creativos" | "landing" | "avatar" | "funnel";

const GEN_META: Record<GenKind, { label: string; icon: string; cost: number; credit: "gen_ad_copies" | "gen_landing" | "gen_avatar" | "gen_funnel" }> = {
  creativos: { label: "Generar mis Creativos", icon: "⚡", cost: 2, credit: "gen_ad_copies" },
  landing:   { label: "Clonar esta Landing",  icon: "📄", cost: 3, credit: "gen_landing" },
  avatar:    { label: "Avatar Profundo",      icon: "👤", cost: 2, credit: "gen_avatar" },
  funnel:    { label: "Funnel Completo",      icon: "📦", cost: 5, credit: "gen_funnel" },
};

function OraculoGenerators({ result }: { result: IntelligenceResult }) {
  const [loading, setLoading] = useState<GenKind | null>(null);
  const [outputs, setOutputs] = useState<Partial<Record<GenKind, string>>>({});
  const { consume, canAfford } = useCredits();

  const run = async (kind: GenKind) => {
    const meta = GEN_META[kind];
    if (!canAfford(meta.credit)) { toast.error("Sin créditos suficientes"); return; }
    setLoading(kind);
    try {
      const { data, error } = await supabase.functions.invoke<{ content?: string; error?: string }>("oraculo-generate", {
        body: { kind, analysis: result.analysis, brand: result.brandName, url: result.url },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Error generando");
        return;
      }
      const content = data?.content ?? "";
      if (!content.trim()) { toast.error("Respuesta vacía"); return; }
      consume(meta.credit, kind);
      setOutputs((p) => ({ ...p, [kind]: content }));
      toast.success(`✓ ${meta.label} listo`);
      // scroll al output
      requestAnimationFrame(() => {
        document.getElementById(`gen-output-${kind}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-5 space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-primary font-bold flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" /> Acciones del Oráculo
        </div>
        <div className="text-sm text-foreground mt-1 font-display">
          Continúa el informe con activos listos para usar
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {(Object.keys(GEN_META) as GenKind[]).map((k) => {
          const m = GEN_META[k];
          const isLoading = loading === k;
          const done = !!outputs[k];
          return (
            <button
              key={k}
              onClick={() => run(k)}
              disabled={!!loading}
              className={`group relative text-left px-3 py-3 rounded-xl border transition-all disabled:opacity-60 ${
                done
                  ? "border-success/40 bg-success/5 hover:border-success/60"
                  : "border-border bg-card hover:border-primary hover:bg-primary/5"
              }`}
            >
              <div className="text-lg leading-none mb-1.5">{m.icon}</div>
              <div className="text-[12px] font-semibold leading-tight">{m.label}</div>
              <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                {isLoading ? <><Loader2 className="w-3 h-3 animate-spin" /> Generando…</> :
                 done ? <><CheckCircle2 className="w-3 h-3 text-success" /> Listo · regenerar</> :
                 <>{m.cost} créditos</>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Outputs */}
      <div className="space-y-3">
        {(Object.keys(GEN_META) as GenKind[]).map((k) => {
          const content = outputs[k];
          if (!content) return null;
          const m = GEN_META[k];
          return (
            <GenOutput key={k} id={`gen-output-${k}`} kind={k} icon={m.icon} label={m.label} content={content} />
          );
        })}
      </div>
    </div>
  );
}

function GenOutput({ id, kind, icon, label, content }: { id: string; kind: GenKind; icon: string; label: string; content: string }) {
  const copyAll = async () => {
    await navigator.clipboard.writeText(content);
    toast.success(`${label} copiado`);
  };
  // Para creativos partimos por "---" para mostrar bloques con copy individual.
  const blocks = kind === "creativos"
    ? content.split(/\n---\n/g).map((b) => b.trim()).filter(Boolean)
    : [content];

  return (
    <div id={id} className="rounded-xl border border-border bg-background/40 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-secondary/30">
        <div className="text-sm font-display flex items-center gap-2">
          <span className="text-base">{icon}</span> {label}
        </div>
        <button onClick={copyAll} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:border-primary hover:text-primary flex items-center gap-1.5 transition-colors">
          <Copy className="w-3.5 h-3.5" /> Copiar todo
        </button>
      </div>
      <div className="p-5 space-y-3">
        {blocks.map((b, i) => (
          <div key={i} className="rounded-lg border border-border/60 bg-card/40 px-4 py-3 relative group">
            {blocks.length > 1 && (
              <button
                onClick={async () => { await navigator.clipboard.writeText(b); toast.success("Copiado"); }}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-2 py-1 rounded-md border border-border bg-card hover:border-primary hover:text-primary flex items-center gap-1"
              >
                <Copy className="w-3 h-3" /> Copiar
              </button>
            )}
            <div className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:mt-2 prose-headings:mb-2 prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground prose-code:text-primary">
              <ReactMarkdown>{b}</ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
