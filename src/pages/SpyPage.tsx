import { useState } from "react";
import { Search, Globe, Eye, Loader2, ExternalLink, Copy, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SpyResult {
  url: string;
  title: string;
  description: string;
  ads_found: string[];
  landing_analysis: string;
  copy_hooks: string[];
  cta_text: string;
  audience_signals: string[];
}

export function SpyPage() {
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SpyResult | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [mode, setMode] = useState<"url" | "search">("url");

  const handleSpy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "url" && !url.trim()) return;
    if (mode === "search" && !query.trim()) return;
    setLoading(true);
    setResults(null);
    setSearchResults([]);

    try {
      const { data, error } = await supabase.functions.invoke("spy-analyze", {
        body: mode === "url"
          ? { type: "url", url: url.trim() }
          : { type: "search", query: query.trim() },
      });
      if (error) throw error;

      if (mode === "url") {
        setResults(data?.result || null);
      } else {
        setSearchResults(data?.results || []);
      }
      toast.success("Análisis completado");
    } catch (err: any) {
      toast.error(err.message || "Error al analizar");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado al portapapeles");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2">
          <Eye className="w-5 h-5 text-primary" />
          Espía de Competidores
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Analiza URLs de competidores o busca nichos para descubrir estrategias ganadoras
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("url")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mode === "url"
              ? "bg-primary/10 text-primary border border-primary/20"
              : "text-muted-foreground hover:bg-secondary border border-transparent"
          }`}
        >
          <Globe className="w-4 h-4" /> Analizar URL
        </button>
        <button
          onClick={() => setMode("search")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mode === "search"
              ? "bg-primary/10 text-primary border border-primary/20"
              : "text-muted-foreground hover:bg-secondary border border-transparent"
          }`}
        >
          <Search className="w-4 h-4" /> Buscar Nicho
        </button>
      </div>

      {/* Input */}
      <form onSubmit={handleSpy} className="card-surface rounded-xl p-5">
        <div className="flex gap-3">
          {mode === "url" ? (
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://competidor.com/landing-page"
                className="w-full bg-secondary border border-border rounded-lg pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
              />
            </div>
          ) : (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ej: cursos de marketing digital, suplementos fitness..."
                className="w-full bg-secondary border border-border rounded-lg pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 gradient-brand text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 glow-primary"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Analizando...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Espiar</>
            )}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {mode === "url"
            ? "Pega la URL de cualquier landing page o anuncio para analizar su estrategia"
            : "Busca un nicho para encontrar los anuncios más exitosos del momento"}
        </p>
      </form>

      {/* Loading state */}
      {loading && (
        <div className="card-surface rounded-xl p-12 text-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
          <div className="font-display font-semibold text-foreground">Analizando con IA...</div>
          <div className="text-sm text-muted-foreground mt-1">Esto puede tardar unos segundos</div>
        </div>
      )}

      {/* URL Analysis Results */}
      {results && !loading && (
        <div className="space-y-4">
          <div className="card-surface rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary" />
                Análisis de Landing Page
              </h3>
              {results.url && (
                <a href={results.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Ver original
                </a>
              )}
            </div>

            {results.title && (
              <div className="mb-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Título</span>
                <p className="text-sm text-foreground font-medium mt-1">{results.title}</p>
              </div>
            )}

            {results.landing_analysis && (
              <div className="mb-4">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Análisis</span>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap">{results.landing_analysis}</p>
              </div>
            )}

            {results.copy_hooks?.length > 0 && (
              <div className="mb-4">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hooks de Copy</span>
                <div className="mt-2 space-y-2">
                  {results.copy_hooks.map((hook, i) => (
                    <div key={i} className="flex items-start gap-2 bg-secondary/50 rounded-lg p-3 group">
                      <span className="text-xs font-bold text-primary mt-0.5">#{i + 1}</span>
                      <p className="text-sm text-foreground flex-1">{hook}</p>
                      <button onClick={() => copyToClipboard(hook)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {results.cta_text && (
              <div className="mb-4">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">CTA Principal</span>
                <div className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary text-sm font-semibold">
                  {results.cta_text}
                  <button onClick={() => copyToClipboard(results.cta_text)} className="text-primary/60 hover:text-primary">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {results.audience_signals?.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Señales de Audiencia</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {results.audience_signals.map((signal, i) => (
                    <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-accent/10 text-accent border border-accent/20">
                      {signal}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search Results */}
      {searchResults.length > 0 && !loading && (
        <div className="space-y-4">
          <h3 className="font-display font-semibold text-foreground">
            {searchResults.length} resultados encontrados
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {searchResults.map((result, i) => (
              <div key={i} className="card-surface rounded-xl p-5 hover:border-primary/30 transition-all">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="text-sm font-semibold text-foreground line-clamp-2 flex-1">{result.title || "Sin título"}</h4>
                  {result.url && (
                    <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary ml-2 flex-shrink-0">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                {result.description && (
                  <p className="text-xs text-muted-foreground line-clamp-3 mb-3">{result.description}</p>
                )}
                {result.url && (
                  <div className="text-xs text-primary/60 truncate">{result.url}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !results && searchResults.length === 0 && (
        <div className="card-surface rounded-xl py-16 text-center">
          <div className="text-5xl mb-4">🕵️</div>
          <div className="font-display font-semibold text-foreground mb-1">¿Listo para espiar?</div>
          <div className="text-sm text-muted-foreground max-w-md mx-auto">
            Ingresa una URL de landing page o busca un nicho para descubrir las estrategias de tus competidores con análisis de IA
          </div>
        </div>
      )}
    </div>
  );
}
