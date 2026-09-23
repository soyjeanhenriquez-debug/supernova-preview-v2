import { useState } from "react";
import { Sparkles, Loader2, Plus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { useCredits, CREDIT_COSTS } from "@/hooks/useCredits";
import { useProjects } from "@/hooks/useProjects";
import { fnHeaders, fnErrorMessage, readBilling } from "@/lib/fnAuth";
import { useFormAssist } from "@/lib/formAssist";
import { AssistButton } from "@/components/AssistButton";

export function CrearPage() {
  const { applyServerCharge, canAfford } = useCredits();
  const { create } = useProjects();
  const [keyword, setKeyword] = useState("");
  const assist = useFormAssist("crear-keyword");
  const assistKeywords = Array.isArray(assist.suggestion?.keywords) ? (assist.suggestion.keywords as string[]).slice(0, 3) : [];
  const [sources, setSources] = useState({ reddit: true, google: true, ph: true });
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);

  const demoSuggestions = (kw: string) => [
    `${kw} cómo empezar`,
    `${kw} qué es`,
    `${kw} para principiantes`,
    `${kw} sin experiencia`,
    `${kw} en 30 días`,
    `${kw} gratis`,
    `${kw} curso online`,
    `${kw} método`,
    `${kw} no funciona`,
    `${kw} mejor app`,
  ];

  const fetchAutocomplete = async (kw: string): Promise<string[]> => {
    try {
      const r = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(kw)}&hl=es`);
      const json = await r.json();
      return Array.isArray(json[1]) ? json[1] : demoSuggestions(kw);
    } catch { return demoSuggestions(kw); }
  };

  const discover = async () => {
    if (!keyword.trim()) { toast.error("Escribe primero un tema, por ejemplo: aprender inglés"); return; }
    if (!canAfford("pain_discovery")) { toast.error(`Te faltan créditos: esto cuesta ${CREDIT_COSTS.pain_discovery}`, { description: "Recarga créditos o espera a que se renueven el mes que viene." }); return; }

    setLoading(true); setAnalysis(""); setSuggestions([]);
    const sugg = await fetchAutocomplete(keyword);
    setSuggestions(sugg);

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pain-discovery`,
        {
          method: "POST",
          headers: await fnHeaders(),
          body: JSON.stringify({ keyword, suggestions: sugg, sources }),
        },
      );
      if (!resp.ok || !resp.body) throw new Error(await fnErrorMessage(resp, "No se pudo hacer el análisis"));
      applyServerCharge("pain_discovery", readBilling(resp), keyword); // lo cobró el servidor
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
          const d = line.slice(6).trim();
          if (d === "[DONE]") continue;
          try {
            const json = JSON.parse(d);
            const delta = json.choices?.[0]?.delta?.content || "";
            if (delta) setAnalysis((t) => t + delta);
          } catch {/* */}
        }
      }
      toast.success("Listo: ya tienes los problemas y las ideas de producto");
    } catch (e: unknown) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo hacer el análisis. Inténtalo de nuevo en un momento.");
    } finally { setLoading(false); }
  };

  const createProjectFromPain = () => {
    create({ name: `${keyword} — Modo Crear`, mode: "crear", context: { keyword, suggestions, analysis } });
    toast.success("Proyecto creado. Lo encuentras en Proyectos.");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-bold text-2xl text-foreground flex items-center gap-2">
          MODO CREAR <span className="text-primary">——</span>
        </h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Escribe un tema y te decimos qué problemas tiene la gente con él y qué producto digital podrías crear para resolverlos.
          Úsalo cuando todavía no sabes qué vender.
        </p>
      </div>

      <div className="card-surface rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary font-bold">
          <Sparkles className="w-4 h-4" /> Buscador de problemas (pain discovery)
        </div>
        {assistKeywords.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Temas para ti:</span>
            {assistKeywords.map(k => (
              <button key={k} onClick={() => setKeyword(k)}
                className="px-2.5 py-1 rounded-full border border-primary/40 bg-primary/5 text-primary hover:bg-primary/10">{k}</button>
            ))}
            <AssistButton onClick={() => assist.generate({ ya_escrito: keyword }).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "No se pudieron sugerir temas. Prueba otra vez."))} loading={assist.loading} filled />
          </div>
        )}
        <input
          value={keyword} onChange={(e) => setKeyword(e.target.value)}
          placeholder={assistKeywords.length ? `Ej.: ${assistKeywords.join(", ")}…` : "Ej.: repostería, aprender inglés, organizar las finanzas, mascotas…"}
          className="w-full bg-secondary border border-border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground self-center mr-2">En qué fijarse:</span>
          {(["reddit", "google", "ph"] as const).map((s) => (
            <button key={s} onClick={() => setSources({ ...sources, [s]: !sources[s] })}
              className={`px-2.5 py-1 rounded-full font-semibold transition-all ${sources[s] ? "bg-primary/20 text-primary border border-primary/40" : "bg-secondary text-muted-foreground border border-border"}`}>
              {s === "reddit" ? "🔴 Foros (Reddit)" : s === "google" ? "🔵 Lo que se busca en Google" : "🟠 Apps nuevas (Product Hunt)"}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground -mt-2">
          La IA parte de lo que la gente busca en Google. Foros y apps nuevas le indican qué tipo de problemas tener en cuenta: no se consultan en vivo.
        </p>
        <button onClick={discover} disabled={loading} className="btn-primary-nova px-5 py-2.5 rounded-lg text-sm flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Buscar problemas e ideas <span className="opacity-70">· {CREDIT_COSTS.pain_discovery} créditos</span>
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="card-surface rounded-xl p-5">
          <div className="text-xs uppercase tracking-widest text-primary font-bold mb-1">Búsquedas relacionadas con tu tema</div>
          <p className="text-[11px] text-muted-foreground mb-3">Salen de las sugerencias de Google; si Google no responde, te mostramos búsquedas de ejemplo.</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => <span key={s} className="px-2.5 py-1 rounded-full bg-secondary text-xs text-foreground">{s}</span>)}
          </div>
        </div>
      )}

      {(analysis || loading) && (
        <div className="card-surface rounded-xl p-6 space-y-3">
          <div className="text-xs uppercase tracking-widest text-primary font-bold">Problemas que encontramos e ideas de producto</div>
          <div className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:text-primary">
            <ReactMarkdown>{analysis || "_Buscando problemas…_"}</ReactMarkdown>
          </div>
          {analysis && !loading && (
            <button onClick={createProjectFromPain} className="btn-primary-nova px-4 py-2 rounded-lg text-sm">
              → Guardar como proyecto
            </button>
          )}
        </div>
      )}
    </div>
  );
}
