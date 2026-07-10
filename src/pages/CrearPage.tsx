import { useState } from "react";
import { Sparkles, Loader2, Plus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { useCredits } from "@/hooks/useCredits";
import { useProjects } from "@/hooks/useProjects";

export function CrearPage() {
  const { consume, canAfford } = useCredits();
  const { create } = useProjects();
  const [keyword, setKeyword] = useState("");
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
    if (!keyword.trim()) { toast.error("Escribe un nicho o keyword"); return; }
    if (!canAfford("pain_discovery")) { toast.error("Sin créditos suficientes"); return; }
    consume("pain_discovery", keyword);

    setLoading(true); setAnalysis(""); setSuggestions([]);
    const sugg = await fetchAutocomplete(keyword);
    setSuggestions(sugg);

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pain-discovery`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ keyword, suggestions: sugg, sources }),
        },
      );
      if (!resp.ok || !resp.body) throw new Error("Error análisis");
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
      toast.success("✓ Dolores descubiertos");
    } catch (e: any) {
      toast.error(e.message || "Error en Pain Discovery");
    } finally { setLoading(false); }
  };

  const createProjectFromPain = () => {
    create({ name: `${keyword} — Modo Crear`, mode: "crear", context: { keyword, suggestions, analysis } });
    toast.success("✓ Proyecto creado en SUPERNOVA BRAIN");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-bold text-2xl text-foreground flex items-center gap-2">
          MODO CREAR <span className="text-primary">——</span>
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Descubre dolores reales en internet y conviértelos en productos digitales</p>
      </div>

      <div className="card-surface rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary font-bold">
          <Sparkles className="w-4 h-4" /> PAIN DISCOVERY ENGINE
        </div>
        <input
          value={keyword} onChange={(e) => setKeyword(e.target.value)}
          placeholder="ej: productividad, idiomas, trading, perder peso..."
          className="w-full bg-secondary border border-border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground self-center mr-2">Fuentes activas:</span>
          {(["reddit", "google", "ph"] as const).map((s) => (
            <button key={s} onClick={() => setSources({ ...sources, [s]: !sources[s] })}
              className={`px-2.5 py-1 rounded-full font-semibold transition-all ${sources[s] ? "bg-primary/20 text-primary border border-primary/40" : "bg-secondary text-muted-foreground border border-border"}`}>
              {s === "reddit" ? "🔴 Reddit" : s === "google" ? "🔵 Google Autocomplete" : "🟠 Product Hunt"}
            </button>
          ))}
        </div>
        <button onClick={discover} disabled={loading} className="btn-primary-nova px-5 py-2.5 rounded-lg text-sm flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Descubrir Dolores <span className="opacity-70">· 2 créditos</span>
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="card-surface rounded-xl p-5">
          <div className="text-xs uppercase tracking-widest text-primary font-bold mb-3">Señales de mercado (Google Autocomplete)</div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => <span key={s} className="px-2.5 py-1 rounded-full bg-secondary text-xs text-foreground">{s}</span>)}
          </div>
        </div>
      )}

      {(analysis || loading) && (
        <div className="card-surface rounded-xl p-6 space-y-3">
          <div className="text-xs uppercase tracking-widest text-primary font-bold">Análisis de dolores</div>
          <div className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:text-primary">
            <ReactMarkdown>{analysis || "_Generando..._"}</ReactMarkdown>
          </div>
          {analysis && !loading && (
            <button onClick={createProjectFromPain} className="btn-primary-nova px-4 py-2 rounded-lg text-sm">
              → Crear Proyecto desde este Dolor
            </button>
          )}
        </div>
      )}
    </div>
  );
}
