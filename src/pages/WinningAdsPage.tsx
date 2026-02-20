import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Trash2, Search, Zap, RefreshCw, Star, Clock, ExternalLink, Loader2, Tag } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export function WinningAdsPage() {
  const { user } = useAuth();
  const [keywords, setKeywords] = useState<any[]>([]);
  const [winningAds, setWinningAds] = useState<any[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [loadingKeywords, setLoadingKeywords] = useState(true);
  const [loadingAds, setLoadingAds] = useState(true);
  const [searching, setSearching] = useState(false);
  const [selectedKeyword, setSelectedKeyword] = useState<string>("all");

  const fetchKeywords = async () => {
    if (!user) return;
    const { data } = await supabase.from("keywords").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setKeywords(data || []);
    setLoadingKeywords(false);
  };

  const fetchWinningAds = async () => {
    setLoadingAds(true);
    let query = supabase.from("winning_ads").select("*").order("scraped_at", { ascending: false }).limit(50);
    if (selectedKeyword !== "all") query = query.eq("keyword", selectedKeyword);
    const { data } = await query;
    setWinningAds(data || []);
    setLoadingAds(false);
  };

  useEffect(() => { fetchKeywords(); }, [user]);
  useEffect(() => { fetchWinningAds(); }, [selectedKeyword]);

  const addKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim() || !user) return;
    const { error } = await supabase.from("keywords").insert({ user_id: user.id, keyword: newKeyword.trim() });
    if (error) toast.error("Error al agregar keyword");
    else { toast.success("Keyword agregada"); setNewKeyword(""); fetchKeywords(); }
  };

  const deleteKeyword = async (id: string) => {
    await supabase.from("keywords").delete().eq("id", id);
    fetchKeywords();
  };

  const runSearch = async () => {
    if (keywords.length === 0) {
      toast.error("Agrega al menos una keyword primero");
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("search-winning-ads", {
        body: { keywords: keywords.filter((k) => k.is_active).map((k) => k.keyword) },
      });
      if (error) throw error;
      toast.success(`✅ Búsqueda completada: ${data?.found || 0} anuncios encontrados`);
      fetchWinningAds();
    } catch (err: any) {
      // If edge function not deployed yet, show friendly message
      if (err.message?.includes("Failed to fetch") || err.message?.includes("404")) {
        toast.info("La función de búsqueda se está desplegando. Intenta en unos minutos.");
      } else {
        toast.error(err.message || "Error en la búsqueda");
      }
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-xl text-foreground flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Anuncios Ganadores
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Búsqueda automática por keywords — actualiza cada hora</p>
        </div>
        <button
          onClick={runSearch}
          disabled={searching}
          className="flex items-center gap-2 px-4 py-2 gradient-brand text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 glow-primary"
        >
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {searching ? "Buscando..." : "Buscar ahora"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Keywords panel */}
        <div className="card-surface rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-foreground">Keywords</h3>
          </div>
          <p className="text-xs text-muted-foreground">Agrega términos para buscar anuncios exitosos (ej: Hotmart, Shopify, dropshipping)</p>

          <form onSubmit={addKeyword} className="flex gap-2">
            <input
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="ej. Hotmart"
              className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            />
            <button type="submit" className="p-2 gradient-brand text-primary-foreground rounded-lg hover:opacity-90 transition-opacity">
              <Plus className="w-4 h-4" />
            </button>
          </form>

          {loadingKeywords ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
          ) : keywords.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No hay keywords aún</div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => setSelectedKeyword("all")}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedKeyword === "all" ? "bg-primary/10 text-primary border border-primary/20" : "hover:bg-secondary text-muted-foreground"}`}
              >
                🔍 Todas las keywords
              </button>
              {keywords.map((k) => (
                <div
                  key={k.id}
                  onClick={() => setSelectedKeyword(k.keyword)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${selectedKeyword === k.keyword ? "bg-primary/10 border border-primary/20" : "hover:bg-secondary"}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${k.is_active ? "bg-success" : "bg-muted-foreground"}`} />
                    <span className={`text-sm font-medium ${selectedKeyword === k.keyword ? "text-primary" : "text-foreground"}`}>{k.keyword}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {k.last_searched_at && (
                      <span title={`Última búsqueda: ${format(new Date(k.last_searched_at), "dd/MM HH:mm")}`}>
                        <Clock className="w-3 h-3 text-muted-foreground" />
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteKeyword(k.id); }}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-border">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Búsqueda automática cada hora
            </div>
          </div>
        </div>

        {/* Winning ads grid */}
        <div className="lg:col-span-2 space-y-4">
          {loadingAds ? (
            <div className="flex justify-center py-20 card-surface rounded-xl">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : winningAds.length === 0 ? (
            <div className="card-surface rounded-xl py-20 text-center">
              <div className="text-4xl mb-3">🔍</div>
              <div className="font-display font-semibold text-foreground mb-1">Sin resultados todavía</div>
              <div className="text-sm text-muted-foreground mb-4">Agrega keywords y haz clic en "Buscar ahora"</div>
              <button onClick={runSearch} disabled={searching} className="px-4 py-2 gradient-brand text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-60">
                {searching ? "Buscando..." : "Buscar anuncios"}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {winningAds.map((ad) => (
                <div key={ad.id} className="card-surface rounded-xl p-5 hover:border-primary/30 transition-all group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">{ad.keyword}</span>
                      <span className="text-xs text-muted-foreground">{ad.platform}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {ad.is_featured && <Star className="w-3.5 h-3.5 text-warning fill-warning" />}
                      {ad.ad_url && (
                        <a href={ad.ad_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  {ad.advertiser && (
                    <div className="text-xs font-semibold text-accent mb-1">{ad.advertiser}</div>
                  )}

                  <h4 className="text-sm font-semibold text-foreground mb-2 line-clamp-2">
                    {ad.ad_title || "Sin título"}
                  </h4>

                  {ad.ad_description && (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 mb-3">
                      {ad.ad_description}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-border/50">
                    {ad.engagement_score != null && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">Score: </span>
                        <span className="font-bold text-success">{ad.engagement_score}/10</span>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground ml-auto">
                      {format(new Date(ad.scraped_at), "dd MMM HH:mm", { locale: es })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
