import { useEffect, useRef, useState } from "react";
import { X, Rocket, Loader2, Copy, Check, Save } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { useCredits, CREDIT_COSTS } from "@/hooks/useCredits";
import { useProjects } from "@/hooks/useProjects";
import type { DemoAd } from "@/lib/demo-winning-ads";
import { OFFER_TYPE_LABEL } from "@/lib/demo-winning-ads";

interface Props { ad: DemoAd; onClose: () => void; }

type Phase = "idle" | "blueprint" | "miniapp" | "done" | "error";

const FN_HEADERS = {
  "Content-Type": "application/json",
  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
};

/**
 * Flujo "CREAR MI APP": de un anuncio ganador a un producto digital propio.
 *  Fase 1 — Blueprint: por qué gana, mecanismo, avatar (streaming visible).
 *  Fase 2 — Mega-Prompt: prompts listos para construir la Mini App (Lovable/
 *  Claude), escalar con anuncios y armar el embudo. Precio único.
 */
export function MiniAppModal({ ad, onClose }: Props) {
  const { consume, canAfford } = useCredits();
  const { create } = useProjects();
  const [phase, setPhase] = useState<Phase>("idle");
  const [blueprint, setBlueprint] = useState("");
  const [miniapp, setMiniapp] = useState("");
  const [tab, setTab] = useState<"blueprint" | "miniapp">("blueprint");
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [blueprint, miniapp]);

  const run = async () => {
    if (startedRef.current) return;
    if (!canAfford("gen_master_prompt")) { toast.error("Sin créditos suficientes"); return; }
    startedRef.current = true;
    consume("gen_master_prompt", `Mi App · ${ad.title.slice(0, 40)}`);

    try {
      // Fase 1 — Blueprint (streaming)
      setPhase("blueprint");
      let bp = "";
      const bpResp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/winner-blueprint`,
        {
          method: "POST", headers: FN_HEADERS,
          body: JSON.stringify({
            ad: {
              ad_title: ad.title, ad_body: ad.body, page_name: ad.pageName,
              days_active: ad.daysActive, duplicate_count: ad.duplicates,
              market: ad.marketLabel,
            },
          }),
        },
      );
      if (!bpResp.ok || !bpResp.body) throw new Error("Error analizando el anuncio");
      const reader = bpResp.body.getReader();
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
            if (delta) { bp += delta; setBlueprint(bp); }
          } catch {/* ignore */}
        }
      }
      if (bp.trim().length < 80) throw new Error("El análisis vino vacío, reintenta");

      // Fase 2 — Mega-Prompt de la Mini App + embudo
      setPhase("miniapp");
      setTab("miniapp");
      const mpResp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oraculo-generate`,
        {
          method: "POST", headers: FN_HEADERS,
          body: JSON.stringify({ kind: "master_prompt", brand: ad.pageName, analysis: bp }),
        },
      );
      const mp = await mpResp.json();
      if (!mpResp.ok || !mp.content) throw new Error(mp.error || "Error generando la Mini App");
      setMiniapp(mp.content);
      setPhase("done");
      toast.success("🧬 Tu Mini App está lista");
    } catch (e: any) {
      setPhase("error");
      toast.error(e.message || "Error en el proceso");
    }
  };

  const copyMiniapp = async () => {
    await navigator.clipboard.writeText(miniapp || blueprint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copiado — pégalo en Lovable o Claude para construir");
  };

  const saveToBrain = () => {
    create({
      name: `Mi App · ${ad.title.slice(0, 40)}`,
      mode: "crear" as any,
      context: { ad, blueprint, miniapp },
    });
    toast.success("✓ Guardado en SUPERNOVA BRAIN");
  };

  const running = phase === "blueprint" || phase === "miniapp";

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-4xl h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Rocket className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-semibold text-foreground truncate">Crear Mi App</h2>
              <p className="text-xs text-muted-foreground truncate">{ad.title} · {ad.pageName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progreso de fases */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border text-xs">
          {([
            ["blueprint", "1 · Por qué gana"],
            ["miniapp", "2 · Mini App + Embudo"],
          ] as const).map(([key, label]) => {
            const active = phase === key;
            const complete =
              (key === "blueprint" && (phase === "miniapp" || phase === "done")) ||
              (key === "miniapp" && phase === "done");
            return (
              <button
                key={key}
                onClick={() => (key === "blueprint" ? setTab("blueprint") : miniapp && setTab("miniapp"))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors ${
                  tab === key ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground"
                }`}
              >
                {active && <Loader2 className="w-3 h-3 animate-spin" />}
                {complete && <Check className="w-3 h-3 text-primary" />}
                {label}
              </button>
            );
          })}
        </div>

        {/* Contenido */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
          {phase === "idle" && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <Rocket className="w-10 h-10 text-primary" />
              <div>
                <h3 className="font-display font-semibold text-lg text-foreground">
                  Convierte este ganador en TU producto digital
                </h3>
                <p className="text-sm text-muted-foreground mt-2 max-w-md">
                  SUPERNOVA analiza por qué este anuncio está vendiendo y te entrega los
                  prompts exactos para construir tu Mini App, tus anuncios y tu embudo —
                  listos para pegar en Lovable o Claude.
                </p>
              </div>
              <button
                onClick={run}
                className="gradient-brand text-primary-foreground px-8 py-3 rounded-lg font-semibold text-sm hover:opacity-90 flex items-center gap-2 glow-primary"
              >
                <Rocket className="w-4 h-4" /> Crear Mi App · {CREDIT_COSTS.gen_master_prompt} ⚡
              </button>
              <p className="text-[11px] text-muted-foreground">
                Incluye análisis + prompts de app, anuncios y funnel en un solo pago
              </p>
            </div>
          )}

          {phase === "error" && (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <p className="text-sm text-muted-foreground">Algo falló. Tus créditos siguen ahí si el análisis no se completó.</p>
              <button onClick={() => { startedRef.current = false; run(); }} className="text-primary text-sm hover:underline">
                Reintentar
              </button>
            </div>
          )}

          {phase !== "idle" && phase !== "error" && (
            <article className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown>{tab === "blueprint" ? blueprint : miniapp || "_Generando tu Mini App…_"}</ReactMarkdown>
            </article>
          )}
        </div>

        {/* Footer acciones */}
        {(phase === "done" || (running && blueprint)) && (
          <div className="flex items-center gap-2 px-5 py-3 border-t border-border">
            <button
              onClick={copyMiniapp}
              disabled={running}
              className="flex-1 gradient-brand text-primary-foreground py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              Copiar Mega-Prompt (pégalo en Lovable)
            </button>
            <button
              onClick={saveToBrain}
              disabled={running}
              className="px-4 py-2.5 rounded-lg border border-border text-sm text-foreground hover:bg-secondary flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> Guardar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
