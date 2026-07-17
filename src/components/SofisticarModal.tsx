import { useEffect, useRef, useState } from "react";
import { X, ArrowLeft, Sparkles, Globe2, Target, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { useCredits, CREDIT_COSTS } from "@/hooks/useCredits";
import { useProjects } from "@/hooks/useProjects";
import type { DemoAd } from "@/lib/demo-winning-ads";
import { OFFER_TYPE_LABEL } from "@/lib/demo-winning-ads";

interface Props { ad: DemoAd; onClose: () => void; }

type Mode = "choose" | "sofisticar" | "adaptar" | "blueprint";

const MARKETS = ["México", "Colombia", "España", "LATAM", "USA"];
const HAS_PRODUCT = ["Sí", "No, voy a crear uno"];
const BUDGETS = ["< $500", "$500-$2K", "> $2K"];

export function SofisticarModal({ ad, onClose }: Props) {
  const { consume, canAfford } = useCredits();
  const { create } = useProjects();
  const [mode, setMode] = useState<Mode>("choose");
  const [streamText, setStreamText] = useState("");
  const [loading, setLoading] = useState(false);
  const [targetMarket, setTargetMarket] = useState(MARKETS[0]);
  const [hasProduct, setHasProduct] = useState(HAS_PRODUCT[0]);
  const [budget, setBudget] = useState(BUDGETS[0]);
  const [adaptTo, setAdaptTo] = useState<"es" | "en">("es");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [streamText]);

  const run = async (action: "sofisticar" | "adaptar" | "blueprint") => {
    if (!canAfford(action as "sofisticar" | "adaptar" | "blueprint")) { toast.error("Sin créditos suficientes"); return; }
    setLoading(true); setStreamText("");
    consume(action as "sofisticar" | "adaptar" | "blueprint", ad.title);

    try {
      const payload = {
        action,
        ad: {
          title: ad.title, body: ad.body, market: ad.marketLabel,
          lang: ad.lang, daysActive: ad.daysActive, duplicates: ad.duplicates,
          offerType: OFFER_TYPE_LABEL[ad.offerType], score: ad.score,
        },
        targetMarket, hasProduct, budget, adaptTo,
      };
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sofisticar-ad`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify(payload),
        },
      );
      if (!resp.ok || !resp.body) throw new Error("Error de análisis");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content || "";
            if (delta) setStreamText((t) => t + delta);
          } catch {/* ignore */}
        }
      }
      toast.success("✓ Análisis completado");
    } catch (e: unknown) {
      toast.error(e.message || "Error generando análisis");
    } finally { setLoading(false); }
  };

  const saveAsProject = () => {
    const projectMode = mode === "blueprint" ? "blueprint" : mode === "adaptar" ? "sofisticar" : "sofisticar";
    create({
      name: ad.title.slice(0, 50),
      mode: projectMode as "sofisticar" | "crear" | "blueprint",
      context: { ad, analysis: streamText, mode },
    });
    toast.success("✓ Guardado en SUPERNOVA BRAIN");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <button onClick={mode === "choose" ? onClose : () => { setMode("choose"); setStreamText(""); }}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> {mode === "choose" ? "Cerrar" : "Volver"}
          </button>
          <span className="text-xs uppercase tracking-widest text-primary font-bold">⚡ Sofisticar</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        {/* Context preview */}
        <div className="px-6 py-4 bg-secondary/40 border-b border-border">
          <p className="text-sm text-foreground/90 line-clamp-2 italic">"{ad.body}"</p>
          <div className="flex flex-wrap gap-2 mt-2 text-[11px] text-muted-foreground">
            <span className="text-primary font-bold">{OFFER_TYPE_LABEL[ad.offerType]}</span>
            <span>· {ad.flag} {ad.marketLabel}</span>
            <span>· {ad.daysActive} días activo</span>
            <span>· {ad.duplicates} duplicados</span>
            <span>· score {ad.score}</span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {mode === "choose" && (
            <div className="p-6 space-y-4">
              <h3 className="font-display font-bold text-lg">Antes de continuar: ¿qué quieres hacer con esta oferta?</h3>
              <div className="grid md:grid-cols-3 gap-4">
                <ModeCard icon={<Sparkles className="w-5 h-5" />} title="⚡ SOFISTICAR"
                  desc="Existe un curso, ebook o PDF con demanda probada. Entiendes por qué vende y construyes algo MEJOR que resuelve ese dolor de forma más instantánea."
                  cost="2 créditos" onClick={() => setMode("sofisticar")} />
                <ModeCard icon={<Globe2 className="w-5 h-5" />} title="🌍 ADAPTAR A MI MERCADO"
                  desc="Este anuncio está en otro idioma o mercado. Lo adaptamos culturalmente a tu audiencia — no es traducción, es recreación."
                  cost={`${CREDIT_COSTS.sofisticar} ⚡`}
                  extra={
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => { setAdaptTo("es"); setMode("adaptar"); run("adaptar"); }}
                        className="flex-1 text-xs px-3 py-1.5 rounded bg-primary/20 text-primary hover:bg-primary/30">→ Adaptar Español</button>
                      <button onClick={() => { setAdaptTo("en"); setMode("adaptar"); run("adaptar"); }}
                        className="flex-1 text-xs px-3 py-1.5 rounded bg-primary/20 text-primary hover:bg-primary/30">→ Adaptar Inglés</button>
                    </div>
                  }
                />
                <ModeCard icon={<Target className="w-5 h-5" />} title="🎯 BLUEPRINT COMPLETO"
                  desc="Análisis profundo: por qué gana, cómo clonarlo, el avatar, la estructura de la oferta y tu plan de acción."
                  cost="3 créditos" onClick={() => { setMode("blueprint"); run("blueprint"); }} />
              </div>
            </div>
          )}

          {mode === "sofisticar" && (
            <div className="grid md:grid-cols-5 h-full">
              <div className="md:col-span-2 border-r border-border p-6 space-y-4 overflow-y-auto">
                <h4 className="font-display font-bold">Contexto del análisis</h4>
                <Field label="Tu mercado objetivo">
                  <div className="flex flex-wrap gap-1.5">
                    {MARKETS.map((m) => <Chip key={m} active={targetMarket === m} onClick={() => setTargetMarket(m)}>{m}</Chip>)}
                  </div>
                </Field>
                <Field label="¿Tienes producto propio?">
                  <div className="flex flex-wrap gap-1.5">
                    {HAS_PRODUCT.map((m) => <Chip key={m} active={hasProduct === m} onClick={() => setHasProduct(m)}>{m}</Chip>)}
                  </div>
                </Field>
                <Field label="Presupuesto para crear">
                  <div className="flex flex-wrap gap-1.5">
                    {BUDGETS.map((m) => <Chip key={m} active={budget === m} onClick={() => setBudget(m)}>{m}</Chip>)}
                  </div>
                </Field>
                <button onClick={() => run("sofisticar")} disabled={loading}
                  className="btn-primary-nova w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Analizar y Sofisticar → <span className="opacity-70 text-xs">2 créditos</span>
                </button>
              </div>
              <div className="md:col-span-3 p-6 overflow-y-auto" ref={scrollRef}>
                <StreamOutput text={streamText} loading={loading} onSave={saveAsProject} />
              </div>
            </div>
          )}

          {(mode === "adaptar" || mode === "blueprint") && (
            <div className="p-6 h-full overflow-y-auto" ref={scrollRef}>
              <StreamOutput text={streamText} loading={loading} onSave={saveAsProject} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ModeCard({ icon, title, desc, cost, onClick, extra }: { icon: React.ReactNode; title: string; desc: string; cost: string; onClick?: () => void; extra?: React.ReactNode }) {
  return (
    <div className="card-surface rounded-xl p-5 flex flex-col gap-3 hover:border-primary/40 transition-all">
      <div className="flex items-center gap-2 text-primary">{icon} <span className="font-display font-bold text-base">{title}</span></div>
      <p className="text-xs text-muted-foreground leading-relaxed flex-1">{desc}</p>
      <div className="text-[10px] uppercase tracking-wider text-primary/80">Costo: {cost}</div>
      {extra ? extra : (
        <button onClick={onClick} className="btn-primary-nova w-full py-2 rounded-lg text-xs">Empezar →</button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
        active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
      }`}>{children}</button>
  );
}

function StreamOutput({ text, loading, onSave }: { text: string; loading: boolean; onSave: () => void }) {
  if (!text && !loading) {
    return <div className="text-center text-sm text-muted-foreground py-20">Selecciona inputs y haz clic en "Analizar"</div>;
  }
  return (
    <div className="space-y-4">
      <div className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:text-primary">
        <ReactMarkdown>{text}</ReactMarkdown>
        {loading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Generando…</div>}
      </div>
      {text && !loading && (
        <button onClick={onSave} className="btn-primary-nova px-4 py-2 rounded-lg text-sm">
          → Guardar como Proyecto en SUPERNOVA BRAIN
        </button>
      )}
    </div>
  );
}
