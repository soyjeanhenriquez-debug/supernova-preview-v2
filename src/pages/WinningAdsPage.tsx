import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Plus, Trash2, Zap, RefreshCw, Clock, ExternalLink, Loader2, Tag, X,
  Sparkles, Copy as CopyIcon, Star, Trophy, TrendingUp, CheckCircle2, Info,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import {
  processAdsIntoWinners, dbRowToFBAd, OFFER_TYPE_LABEL, type WinnerAd,
} from "@/lib/winner-detection";

const DAYS_OPTIONS = [7, 14, 30, 60, 90];
const DUP_OPTIONS = [3, 5, 7, 10];

export function WinningAdsPage() {
  const { user } = useAuth();
  const [keywords, setKeywords] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [loadingKeywords, setLoadingKeywords] = useState(true);
  const [loadingAds, setLoadingAds] = useState(true);
  const [searching, setSearching] = useState(false);
  const [selectedKeyword, setSelectedKeyword] = useState<string>("all");

  // Filters
  const [minDays, setMinDays] = useState<number>(7);
  const [minDups, setMinDups] = useState<number>(3);
  const [onlyConfirmed, setOnlyConfirmed] = useState<boolean>(true);
  const [showBanner, setShowBanner] = useState<boolean>(
    typeof window !== "undefined" && !localStorage.getItem("supernova_winners_banner_dismissed"),
  );

  // Blueprint panel
  const [blueprintFor, setBlueprintFor] = useState<any | null>(null);
  const [blueprintText, setBlueprintText] = useState("");
  const [blueprintLoading, setBlueprintLoading] = useState(false);

  const fetchKeywords = async () => {
    if (!user) return;
    const { data } = await supabase.from("keywords").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setKeywords(data || []);
    setLoadingKeywords(false);
  };

  const fetchRows = async () => {
    setLoadingAds(true);
    let query = supabase.from("winning_ads").select("*").order("scraped_at", { ascending: false }).limit(200);
    if (selectedKeyword !== "all") query = query.eq("keyword", selectedKeyword);
    const { data } = await query;
    setRows(data || []);
    setLoadingAds(false);
  };

  useEffect(() => { fetchKeywords(); }, [user]);
  useEffect(() => { fetchRows(); }, [selectedKeyword]);

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
    if (keywords.length === 0) { toast.error("Agrega al menos una keyword primero"); return; }
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("search-winning-ads", {
        body: { keywords: keywords.filter((k) => k.is_active).map((k) => k.keyword) },
      });
      if (error) throw error;
      toast.success(`✅ ${data?.found || 0} anuncios procesados`);
      fetchRows();
    } catch (err: any) {
      toast.error(err.message || "Error en la búsqueda");
    } finally { setSearching(false); }
  };

  // Process via winner-detection
  const winners: WinnerAd[] = useMemo(() => {
    const fbAds = rows.map(dbRowToFBAd);
    const result = processAdsIntoWinners(fbAds, { minDays, minDuplicates: minDups, onlyConfirmed });
    // Attach DB row by id
    return result.map((w) => ({ ...w, _row: rows.find((r) => r.id === w.ad.id) } as any));
  }, [rows, minDays, minDups, onlyConfirmed]);

  const counts = useMemo(() => {
    const c = { mega: 0, rising: 0, solid: 0 };
    winners.forEach((w) => { if (w.tier !== "skip") (c as any)[w.tier]++; });
    return c;
  }, [winners]);

  const openBlueprint = async (row: any, w: WinnerAd) => {
    setBlueprintFor({ row, w });
    setBlueprintText("");
    setBlueprintLoading(true);
    try {
      const payload = {
        ad: {
          ad_title: row.ad_title,
          ad_body: row.ad_body || row.ad_description,
          ad_description: row.ad_description,
          page_name: row.page_name || row.advertiser,
          advertiser: row.advertiser,
          days_active: w.daysActive,
          duplicate_count: w.duplicateCount,
          impressions_lower: row.impressions_lower,
          market: row.market,
        },
      };
      const resp = await fetch(
        `https://quyjsihawxeghsptwltq.supabase.co/functions/v1/winner-blueprint`,
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
      if (!resp.ok || !resp.body) throw new Error("Error generando blueprint");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content || "";
            if (delta) setBlueprintText((t) => t + delta);
          } catch {/* ignore */}
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Error blueprint");
    } finally { setBlueprintLoading(false); }
  };

  const dismissBanner = () => {
    localStorage.setItem("supernova_winners_banner_dismissed", "1");
    setShowBanner(false);
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
          <p className="text-sm text-muted-foreground mt-0.5">Winner Detection Engine — detecta ofertas que están convirtiendo ahora mismo</p>
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

      {/* Educational banner */}
      {showBanner && (
        <div className="card-surface rounded-xl p-5 border border-primary/30 relative">
          <button onClick={dismissBanner} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="space-y-2">
              <div className="font-display font-semibold text-foreground">⚡ Cómo funciona el detector de winners</div>
              <p className="text-sm text-muted-foreground">Un anuncio es un <strong className="text-foreground">WINNER CONFIRMADO</strong> cuando:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>✅ <strong className="text-foreground">Lleva 7+ días activo</strong> — si no convirtiera, lo habrían pausado</li>
                <li>✅ <strong className="text-foreground">Tiene 3+ versiones del mismo anunciante</strong> — nadie escala dinero en perdedores</li>
                <li>✅ <strong className="text-foreground">Tiene alto volumen de impresiones</strong> — más presupuesto = más confianza</li>
              </ul>
              <p className="text-xs text-muted-foreground pt-1">Los que cumplen los 3 = ofertas reales para clonar. Los demás pueden ser buenos, pero no están validados.</p>
            </div>
          </div>
        </div>
      )}

      {/* Quality filters */}
      <div className="card-surface rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-primary" />
          <h3 className="font-display font-semibold text-foreground">Filtros de calidad</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-2">Días mínimos activos</div>
            <div className="flex gap-1.5 flex-wrap">
              {DAYS_OPTIONS.map((d) => (
                <button key={d} onClick={() => setMinDays(d)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${minDays === d ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                  {d}{d === 90 ? "+" : ""}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-2">Repeticiones mínimas</div>
            <div className="flex gap-1.5 flex-wrap">
              {DUP_OPTIONS.map((d) => (
                <button key={d} onClick={() => setMinDups(d)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${minDups === d ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                  {d}+
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-2">Mostrar</div>
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => setOnlyConfirmed(true)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${onlyConfirmed ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                ✓ Solo Confirmed
              </button>
              <button onClick={() => setOnlyConfirmed(false)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${!onlyConfirmed ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                Todos los tiers
              </button>
            </div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground border-t border-border pt-3">
          ⚠️ Menos de 7 días + menos de 3 repeticiones = anuncio sin validar. No recomendado para clonar.
        </div>
      </div>

      {/* Status bar */}
      <div className="card-surface rounded-xl p-4 flex flex-wrap items-center gap-4 text-sm">
        <span className="text-muted-foreground">
          Analizando: <strong className="text-foreground">{selectedKeyword === "all" ? "Todas las keywords" : `"${selectedKeyword}"`}</strong>
        </span>
        <div className="h-4 w-px bg-border" />
        <span className="text-muted-foreground">
          <strong className="text-foreground">{rows.length}</strong> encontrados → <strong className="text-foreground">{winners.length}</strong> pasan filtros
        </span>
        <div className="h-4 w-px bg-border" />
        <span className="flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5 text-warning" /> <strong>{counts.mega}</strong> MEGA</span>
        <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-info" /> <strong>{counts.rising}</strong> RISING</span>
        <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-success" /> <strong>{counts.solid}</strong> SOLID</span>
        <span className="ml-auto text-xs text-muted-foreground">Filtro: {minDays}+ días · {minDups}+ reps {onlyConfirmed && "· solo confirmed"}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Keywords */}
        <div className="card-surface rounded-xl p-5 space-y-4 lg:col-span-1">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-foreground">Keywords</h3>
          </div>
          <form onSubmit={addKeyword} className="flex gap-2">
            <input value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} placeholder="ej. Hotmart"
              className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary" />
            <button type="submit" className="p-2 gradient-brand text-primary-foreground rounded-lg hover:opacity-90 transition-opacity">
              <Plus className="w-4 h-4" />
            </button>
          </form>
          {loadingKeywords ? <Loader2 className="w-5 h-5 text-primary animate-spin mx-auto" /> :
            keywords.length === 0 ? <div className="text-xs text-muted-foreground text-center py-4">Sin keywords</div> : (
            <div className="space-y-1.5">
              <button onClick={() => setSelectedKeyword("all")}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedKeyword === "all" ? "bg-primary/10 text-primary border border-primary/20" : "hover:bg-secondary text-muted-foreground"}`}>
                🔍 Todas
              </button>
              {keywords.map((k) => (
                <div key={k.id} onClick={() => setSelectedKeyword(k.keyword)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${selectedKeyword === k.keyword ? "bg-primary/10 border border-primary/20" : "hover:bg-secondary"}`}>
                  <span className={`text-sm font-medium ${selectedKeyword === k.keyword ? "text-primary" : "text-foreground"}`}>{k.keyword}</span>
                  <button onClick={(e) => { e.stopPropagation(); deleteKeyword(k.id); }} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="pt-2 border-t border-border text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3 h-3" /> Búsqueda automática cada hora
          </div>
        </div>

        {/* Winners grid */}
        <div className="lg:col-span-3 space-y-4">
          {loadingAds ? (
            <div className="flex justify-center py-20 card-surface rounded-xl"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
          ) : winners.length === 0 ? (
            <div className="card-surface rounded-xl py-20 text-center">
              <div className="text-4xl mb-3">🔍</div>
              <div className="font-display font-semibold text-foreground mb-1">Sin winners que cumplan los filtros</div>
              <div className="text-sm text-muted-foreground mb-4">Baja los filtros o haz una nueva búsqueda</div>
              <button onClick={runSearch} disabled={searching} className="px-4 py-2 gradient-brand text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-60">
                {searching ? "Buscando..." : "Buscar anuncios"}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {winners.map((w: any) => {
                const row = w._row;
                return (
                  <div key={w.ad.id} className="card-surface rounded-xl p-5 hover:border-primary/30 transition-all flex flex-col" style={{ borderTop: `3px solid ${w.tierColor}` }}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-1 rounded-md" style={{ background: `${w.tierColor}22`, color: w.tierColor }}>
                          {w.tierIcon} {w.tierLabel}
                        </span>
                        {w.isConfirmedWinner && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-success/20 text-success border border-success/30">✅ CONFIRMED</span>
                        )}
                      </div>
                      <div className="text-xs font-bold text-foreground">{w.winnerScore}<span className="text-muted-foreground font-normal">/100</span></div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2 flex-wrap">
                      <span>{OFFER_TYPE_LABEL[w.offerType] || OFFER_TYPE_LABEL.unknown}</span>
                      {row?.market && <><span>·</span><span>🌍 {row.market}</span></>}
                      <span>·</span>
                      <span>{row?.platform || "Meta"}</span>
                    </div>

                    {row?.ad_title && <h4 className="text-sm font-semibold text-foreground mb-2 line-clamp-2">{row.ad_title}</h4>}
                    {(row?.ad_body || row?.ad_description) && (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 mb-3 italic">
                        "{(row.ad_body || row.ad_description).slice(0, 220)}..."
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {w.signals.slice(0, 5).map((s, i) => (
                        <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full border ${s.positive ? "border-success/30 bg-success/10 text-success" : "border-border bg-secondary text-muted-foreground"}`}>
                          {s.label}
                        </span>
                      ))}
                    </div>

                    {row?.page_name && (
                      <div className="text-xs font-medium text-accent mb-3">👤 {row.page_name}</div>
                    )}

                    <div className="flex items-center gap-2 mt-auto pt-3 border-t border-border/50">
                      <button onClick={() => openBlueprint(row, w)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 gradient-brand text-primary-foreground rounded-md text-xs font-semibold hover:opacity-90">
                        <Sparkles className="w-3.5 h-3.5" /> Blueprint
                      </button>
                      {row?.ad_url && (
                        <a href={row.ad_url} target="_blank" rel="noopener noreferrer"
                          className="p-2 rounded-md bg-secondary text-muted-foreground hover:text-foreground" title="Ver en Ads Library">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Blueprint side panel */}
      {blueprintFor && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-background/80 backdrop-blur-sm" onClick={() => setBlueprintFor(null)} />
          <div className="w-full max-w-2xl bg-card border-l border-border overflow-y-auto p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Blueprint de Clonación</div>
                <h3 className="font-display font-bold text-lg text-foreground flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  {blueprintFor.row?.ad_title || "Anuncio"}
                </h3>
                <div className="text-xs text-muted-foreground mt-1">
                  {blueprintFor.w.daysActive} días activo · {blueprintFor.w.duplicateCount} repeticiones · score {blueprintFor.w.winnerScore}/100
                </div>
              </div>
              <button onClick={() => setBlueprintFor(null)} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="card-surface rounded-lg p-4 prose prose-sm prose-invert max-w-none prose-headings:font-display prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-li:text-muted-foreground">
              {blueprintText ? (
                <ReactMarkdown>{blueprintText}</ReactMarkdown>
              ) : blueprintLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Generando blueprint con IA...
                </div>
              ) : null}
              {blueprintLoading && blueprintText && (
                <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> generando...
                </div>
              )}
            </div>

            {blueprintText && !blueprintLoading && (
              <div className="flex gap-2">
                <button onClick={() => { navigator.clipboard.writeText(blueprintText); toast.success("Blueprint copiado"); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-secondary text-foreground rounded-md text-sm font-semibold hover:bg-secondary/70">
                  <CopyIcon className="w-4 h-4" /> Copiar Blueprint
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
