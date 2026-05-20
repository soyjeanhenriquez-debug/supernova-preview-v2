import { useEffect, useState } from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLandingAnalyzer, STEP_ORDER, STEP_LABEL, type IntelligenceResult, type LandingAd } from "@/hooks/useLandingAnalyzer";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Loader2, Zap, Link as LinkIcon, Copy, Trash2, ChevronDown, History, ExternalLink, CheckCircle2, Circle, AlertCircle, Sparkles, Download, FileText, X, ArrowRight, Heart, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";
import { useAdHistory, adKey, type AdHistoryItem } from "@/hooks/useAdHistory";

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
  // (report renders inline below — no popup)
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
      setFallback({ open: false, text: "" });
      loadSaved();
      toast.success("✓ Informe listo");
      requestAnimationFrame(() => {
        document.getElementById("oraculo-report")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
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
    requestAnimationFrame(() => {
      document.getElementById("oraculo-report")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
              placeholder="https://... · JARVIS analizará esta oferta al instante"
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
            {running ? "JARVIS analizando..." : "⚡ Activar JARVIS"}
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

      {/* Report inline (centered, readable) */}
      {result && (
        <div id="oraculo-report" className="mx-auto w-full max-w-3xl">
          <ReportContent result={result} onClose={() => setResult(null)} />
        </div>
      )}

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

  // Split analysis into sections by '## '
  const sections = (() => {
    const parts = result.analysis.split(/\n(?=## )/g);
    const head = parts[0]?.startsWith("## ") ? "" : parts.shift() ?? "";
    return { head, items: parts };
  })();

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-border bg-card/60 backdrop-blur-xl overflow-hidden">
      {/* Header */}
      <div className="px-7 pt-6 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-primary font-bold">Intelligence Report</div>
          <div className="font-display text-2xl truncate mt-0.5">{result.domain}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{new Date(result.createdAt).toLocaleString("es-ES")} · {wordCount(result.analysis).toLocaleString("es-ES")} palabras</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 rounded-lg border border-border hover:border-primary hover:text-primary flex items-center gap-1.5 transition-colors">
            <ExternalLink className="w-3.5 h-3.5" /> Abrir URL
          </a>
          <ExportMenu result={result} />
          <button onClick={onClose} aria-label="Cerrar informe" className="text-xs p-2 rounded-lg border border-border hover:border-destructive hover:text-destructive transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="px-7 pb-7 space-y-6">
        {/* Historial de anuncios visitados + favoritos */}
        <AdHistoryBar />

        {/* Ads strip */}
        {result.ads.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-3">
              Anuncios activos encontrados ({result.ads.length})
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {result.ads.map((ad, i) => {
                const href = ad.id
                  ? `https://www.facebook.com/ads/library/?id=${ad.id}`
                  : ad.page_id
                  ? `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${ad.page_id}`
                  : `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=${encodeURIComponent(ad.page_name ?? result.brandName)}`;
                const item: Omit<AdHistoryItem, "visitedAt"> = {
                  key: adKey({ id: ad.id, page_id: ad.page_id, title: ad.ad_creative_link_titles?.[0] ?? ad.ad_creative_bodies?.[0] }),
                  id: ad.id,
                  page_id: ad.page_id,
                  page_name: ad.page_name,
                  title: ad.ad_creative_link_titles?.[0] ?? ad.ad_creative_bodies?.[0],
                  body: ad.ad_creative_bodies?.[0],
                  href,
                };
                return <AdCard key={i} item={item} />;
              })}
            </div>
          </div>
        )}

        {/* Analysis sections — centered reading column */}
        <div className="mx-auto w-full">
          {sections.head && (
            <div className="prose prose-invert max-w-none prose-headings:font-display prose-p:leading-relaxed prose-li:leading-relaxed">
              <ReactMarkdown>{sections.head}</ReactMarkdown>
            </div>
          )}
          <Accordion type="multiple" defaultValue={sections.items.map((_, i) => `s-${i}`)} className="space-y-2 mt-4">
            {sections.items.map((sec, i) => {
              const title = sec.match(/^##\s+(.+)/)?.[1]?.trim() ?? `Sección ${i+1}`;
              const body = sec.replace(/^##\s+.+\n?/, "");
              return (
                <AccordionItem key={i} value={`s-${i}`} className="border border-border rounded-xl px-5 bg-background/30">
                  <AccordionTrigger className="hover:no-underline py-4 text-[15px] font-display">
                    {title}
                  </AccordionTrigger>
                  <AccordionContent className="pb-5">
                    <div className="prose prose-invert max-w-none prose-headings:font-display prose-p:text-muted-foreground prose-p:leading-relaxed prose-li:text-muted-foreground prose-li:leading-relaxed prose-strong:text-foreground">
                      <ReactMarkdown>{body}</ReactMarkdown>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>

        {/* Próximos pasos */}
        <NextSteps />

        {/* Generadores inline */}
        <OraculoGenerators result={result} />
      </div>
    </div>
  );
}

function wordCount(s: string) {
  return s.trim().split(/\s+/).length;
}

function ExportMenu({ result }: { result: IntelligenceResult }) {
  const stamp = new Date(result.createdAt).toISOString().slice(0, 10);
  const baseName = `oraculo-${result.domain.replace(/[^a-z0-9.-]/gi, "_")}-${stamp}`;
  const md = `# Intelligence Report — ${result.domain}\n\n_Fuente: ${result.url}_\n_Generado: ${new Date(result.createdAt).toLocaleString("es-ES")}_\n\n---\n\n${result.analysis}\n`;
  const plain = md.replace(/[#*_>`]/g, "").replace(/\n{3,}/g, "\n\n");

  const copyMd = async () => { await navigator.clipboard.writeText(md); toast.success("Markdown copiado · pega en Notion"); };
  const copyPlain = async () => { await navigator.clipboard.writeText(plain); toast.success("Texto copiado · pega en Word"); };
  const downloadFile = (content: string, ext: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${baseName}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="text-xs px-3 py-1.5 rounded-lg border border-border hover:border-primary hover:text-primary flex items-center gap-1.5 transition-colors">
          <Download className="w-3.5 h-3.5" /> Exportar
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onClick={copyMd}><Copy className="w-3.5 h-3.5 mr-2" /> Copiar Markdown (Notion)</DropdownMenuItem>
        <DropdownMenuItem onClick={copyPlain}><FileText className="w-3.5 h-3.5 mr-2" /> Copiar texto plano (Word)</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => downloadFile(md, "md", "text/markdown")}><Download className="w-3.5 h-3.5 mr-2" /> Descargar .md</DropdownMenuItem>
        <DropdownMenuItem onClick={() => downloadFile(plain, "txt", "text/plain")}><Download className="w-3.5 h-3.5 mr-2" /> Descargar .txt</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NextSteps() {
  const items = [
    { icon: "🧬", title: "Genera tu Mega-Prompt Replicador", desc: "Convierte todo el informe en un prompt maestro para Claude/GPT-5 — listo para crear una versión MEJORADA, ya sea como campaña de ads o como app/SaaS." },
    { icon: "⚡", title: "Lanza creativos en 24 h", desc: "Usa 'Generar mis Creativos' para sacar 5 hooks + 3 ad copies. Testea con $50-$100 antes de escalar." },
    { icon: "👤", title: "Construye el avatar profundo", desc: "Saca demografía exacta, miedos, deseos y los 5 niveles de consciencia. Base de todo el copy serio." },
    { icon: "📦", title: "Diseña el funnel completo", desc: "VSL + secuencia de 5 emails + upsell + order bump. Para cuando ya tengas el ángulo validado." },
    { icon: "📄", title: "Clona la landing con un giro", desc: "Genera tu propia versión con ángulo sofisticado, sin copiar literal." },
  ];
  return (
    <div className="rounded-xl border border-border bg-background/40 p-5 space-y-3">
      <div className="text-[10px] uppercase tracking-[0.22em] text-primary font-bold flex items-center gap-1.5">
        <ArrowRight className="w-3 h-3" /> Qué hacer con este informe
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {items.map((it) => (
          <div key={it.title} className="rounded-lg border border-border/60 bg-card/40 p-3">
            <div className="text-sm font-display flex items-center gap-2"><span>{it.icon}</span> {it.title}</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{it.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

type GenKind = "creativos" | "landing" | "avatar" | "funnel" | "master_prompt";

const GEN_META: Record<GenKind, { label: string; icon: string; cost: number; credit: "gen_ad_copies" | "gen_landing" | "gen_avatar" | "gen_funnel" | "gen_master_prompt"; highlight?: boolean }> = {
  master_prompt: { label: "Mega-Prompt Replicador", icon: "🧬", cost: 4, credit: "gen_master_prompt", highlight: true },
  creativos:     { label: "Generar mis Creativos",  icon: "⚡", cost: 2, credit: "gen_ad_copies" },
  landing:       { label: "Clonar esta Landing",    icon: "📄", cost: 3, credit: "gen_landing" },
  avatar:        { label: "Avatar Profundo",        icon: "👤", cost: 2, credit: "gen_avatar" },
  funnel:        { label: "Funnel Completo",        icon: "📦", cost: 5, credit: "gen_funnel" },
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
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
                  : m.highlight
                  ? "border-primary/60 bg-primary/10 hover:border-primary hover:bg-primary/15 shadow-sm"
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

// ───────────────────────────── Ad history + favorites ─────────────────────────────

function AdCard({ item }: { item: Omit<AdHistoryItem, "visitedAt"> }) {
  const { markVisited, toggleFavorite, isFavorite } = useAdHistory();
  const [fav, setFav] = useState(() => isFavorite(item.key));
  const [burst, setBurst] = useState(false);

  const onClick = () => markVisited(item);
  const onFav = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const now = await toggleFavorite(item);
    setFav(now);
    if (now) { setBurst(true); setTimeout(() => setBurst(false), 600); }
  };

  return (
    <a
      href={item.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      title="Abrir en Facebook Ads Library"
      className="group shrink-0 w-64 rounded-xl border border-border bg-background/60 p-3 hover:border-primary hover:bg-primary/5 transition-colors flex flex-col relative"
    >
      <button
        onClick={onFav}
        aria-label={fav ? "Quitar de favoritos" : "Añadir a favoritos"}
        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/80 backdrop-blur border border-border flex items-center justify-center hover:scale-110 active:scale-95 transition-transform z-10"
      >
        <Heart
          className={`w-3.5 h-3.5 transition-all ${fav ? "fill-rose-500 text-rose-500" : "text-muted-foreground hover:text-rose-500"} ${burst ? "scale-125" : ""}`}
          strokeWidth={2.2}
        />
        {burst && (
          <span className="absolute inset-0 rounded-full animate-ping bg-rose-500/30 pointer-events-none" />
        )}
      </button>
      <div className="flex items-start justify-between gap-2 pr-8">
        <div className="text-[11px] font-semibold text-primary truncate">{item.page_name ?? "Anunciante"}</div>
        <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-primary shrink-0 mt-0.5" />
      </div>
      <div className="text-xs text-foreground mt-1 line-clamp-3">{item.title ?? "—"}</div>
      <div className="text-[10px] text-muted-foreground mt-2 line-clamp-3">{item.body}</div>
      <div className="text-[10px] text-muted-foreground/70 mt-2 pt-2 border-t border-border/50">Ver en Ads Library →</div>
    </a>
  );
}

const PAGE_SIZE = 6;

function AdHistoryBar() {
  const { history, favorites, toggleFavorite, isFavorite, clearHistory } = useAdHistory();
  const [tab, setTab] = useState<"history" | "favorites">("history");
  const [page, setPage] = useState(0);

  const list = tab === "history" ? history : favorites;
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const slice = list.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => { setPage(0); }, [tab, list.length]);

  if (history.length === 0 && favorites.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-background/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab("history")}
            className={`text-[11px] uppercase tracking-[0.18em] font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${tab === "history" ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Eye className="w-3 h-3" /> Visitados <span className="opacity-60">({history.length})</span>
          </button>
          <button
            onClick={() => setTab("favorites")}
            className={`text-[11px] uppercase tracking-[0.18em] font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${tab === "favorites" ? "bg-rose-500/15 text-rose-400 border border-rose-500/30" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Heart className={`w-3 h-3 ${tab === "favorites" ? "fill-rose-500 text-rose-500" : ""}`} /> Favoritos <span className="opacity-60">({favorites.length})</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          {pages > 1 && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="p-1 rounded hover:bg-secondary disabled:opacity-30">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="tabular-nums">{safePage + 1} / {pages}</span>
              <button onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={safePage >= pages - 1} className="p-1 rounded hover:bg-secondary disabled:opacity-30">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {tab === "history" && history.length > 0 && (
            <button onClick={clearHistory} className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Limpiar
            </button>
          )}
        </div>
      </div>

      {slice.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-3">
          {tab === "favorites" ? "Aún no marcaste favoritos. Pulsa el ♥ en cualquier tarjeta." : "Aún no visitaste anuncios en esta sesión."}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {slice.map((it) => {
            const fav = isFavorite(it.key);
            return (
              <a
                key={it.key}
                href={it.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative rounded-lg border border-border/60 bg-card/40 px-3 py-2 hover:border-primary hover:bg-primary/5 transition-colors flex flex-col min-w-0"
              >
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(it); }}
                  aria-label={fav ? "Quitar favorito" : "Marcar favorito"}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center hover:scale-110 active:scale-90 transition-transform"
                >
                  <Heart className={`w-3 h-3 transition-all ${fav ? "fill-rose-500 text-rose-500" : "text-muted-foreground hover:text-rose-500"}`} strokeWidth={2.2} />
                </button>
                <div className="text-[11px] font-semibold text-primary truncate pr-6">{it.page_name ?? "Anunciante"}</div>
                <div className="text-[11px] text-foreground/90 truncate">{it.title ?? it.body ?? "Ver anuncio"}</div>
                <div className="text-[9px] text-muted-foreground/70 mt-0.5">{relativeTime(it.visitedAt)}</div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(iso).toLocaleDateString("es-ES");
}
