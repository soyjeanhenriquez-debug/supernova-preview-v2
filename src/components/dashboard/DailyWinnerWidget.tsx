import { useEffect, useState } from "react";
import { Trophy, TrendingUp, ExternalLink, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MiniAppModal } from "@/components/MiniAppModal";
import { CREDIT_COSTS } from "@/hooks/useCredits";
import {
  buildAdsLibrarySearchUrl, normalizeAdsLibraryUrl, langFromCountry,
  type DemoAd, type AdMarket, type Tier,
} from "@/lib/demo-winning-ads";

interface Trend { keyword: string; ads_7d: number; growth_pct: number; }

const FLAGS: Record<string, string> = {
  US: "🇺🇸", GB: "🇬🇧", ES: "🇪🇸", MX: "🇲🇽", AR: "🇦🇷", CO: "🇨🇴",
  BR: "🇧🇷", PT: "🇵🇹", DE: "🇩🇪", AT: "🇦🇹", CH: "🇨🇭", RU: "🇷🇺", KZ: "🇰🇿",
};

function rowToDemoAd(r: any): DemoAd {
  const market = (r.market ?? "US") as AdMarket;
  const title = r.ad_title ?? r.page_name ?? "Anuncio";
  const rawUrl = r.ad_url ?? buildAdsLibrarySearchUrl(r.page_name ?? title, market);
  return {
    id: `daily-${r.id}`,
    pageId: r.page_id ?? "",
    pageName: r.page_name ?? r.advertiser ?? "Anunciante",
    title,
    body: r.ad_body ?? r.ad_description ?? title,
    daysActive: r.days_active ?? 1,
    duplicates: r.duplicate_count ?? 1,
    score: r.winner_score ?? 50,
    tier: (r.tier ?? "mega") as Tier,
    offerType: (r.offer_type ?? "infoproducto") as DemoAd["offerType"],
    market,
    marketLabel: r.market ?? "",
    flag: FLAGS[r.market ?? "US"] ?? "🌍",
    lang: langFromCountry(r.market),
    adUrl: normalizeAdsLibraryUrl(rawUrl, r.page_name ?? title, market),
  };
}

/**
 * El Ganador del Día: un solo MEGA winner curado, igual para todos los
 * usuarios durante 24h, con el CTA de crear tu versión. + Tendencias reales
 * del radar (nichos con más ads nuevos en 7 días).
 */
export function DailyWinnerWidget() {
  const [ad, setAd] = useState<DemoAd | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [showMiniApp, setShowMiniApp] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: winner }, { data: t }] = await Promise.all([
        supabase.rpc("get_daily_winner" as any),
        supabase.rpc("get_market_trends" as any),
      ]);
      const row = Array.isArray(winner) ? winner[0] : winner;
      if (row) setAd(rowToDemoAd(row));
      if (Array.isArray(t)) setTrends(t as Trend[]);
    })();
  }, []);

  if (!ad) return null;

  return (
    <>
      <div className="card-surface rounded-2xl overflow-hidden border border-primary/25">
        {/* Ganador del día */}
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary bg-primary/10 border border-primary/25 rounded-full px-3 py-1">
              <Trophy className="w-3 h-3" /> Ganador del Día
            </span>
            <span className="text-xs text-muted-foreground">
              {ad.flag} {ad.marketLabel} · <Flame className="w-3 h-3 inline text-primary" /> {ad.daysActive} días activo · Score {ad.score}
            </span>
          </div>

          <h3 className="font-display font-semibold text-lg text-foreground mb-1">{ad.title}</h3>
          <p className="text-xs text-muted-foreground mb-2">{ad.pageName}</p>
          <p className="text-sm text-muted-foreground/90 line-clamp-3 italic">"{ad.body.slice(0, 260)}{ad.body.length > 260 ? "…" : ""}"</p>

          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={() => setShowMiniApp(true)}
              className="flex-1 btn-primary-nova py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
            >
              🧬 CREAR MI APP → <span className="opacity-70 text-xs">· {CREDIT_COSTS.gen_master_prompt} ⚡</span>
            </button>
            <a
              href={ad.adUrl} target="_blank" rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Ver en Meta
            </a>
          </div>
        </div>

        {/* Tendencias del radar */}
        {trends.length > 0 && (
          <div className="border-t border-border px-5 py-3 bg-secondary/30">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Tendencias del radar · últimos 7 días
            </p>
            <div className="flex flex-wrap gap-2">
              {trends.map((t) => (
                <span key={t.keyword} className="inline-flex items-center gap-1.5 text-xs bg-secondary border border-border rounded-full px-3 py-1">
                  <span className="text-foreground">{t.keyword}</span>
                  <span className="text-primary font-semibold">+{t.ads_7d} ads</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {showMiniApp && <MiniAppModal ad={ad} onClose={() => setShowMiniApp(false)} />}
    </>
  );
}
