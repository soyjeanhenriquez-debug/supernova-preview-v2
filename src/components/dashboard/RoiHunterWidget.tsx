import { useEffect, useState } from "react";
import { Crosshair, ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { type Offer, flagFor, MARKET_NAME } from "@/lib/offers";
import { CREDIT_COSTS } from "@/hooks/useCredits";

export interface FollowedRow {
  offer: Offer;
  followed_at: string;
  ads_delta: number;
  score_delta: number;
  days_tracked: number;
  first_active_ads: number;
}

export const OFFERS_TAB_KEY = "supernova_offers_tab";

/**
 * Cazador de ROI (dashboard): qué pasó esta semana con las ofertas que sigues
 * — anuncios activos y score vs. el snapshot más antiguo de los últimos 7 días.
 */
export function RoiHunterWidget({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [rows, setRows] = useState<FollowedRow[] | null>(null);

  useEffect(() => {
    supabase.rpc("get_followed_offers").then(({ data }) => setRows((data ?? []) as unknown as FollowedRow[]));
  }, []);

  const goFollowing = () => { localStorage.setItem(OFFERS_TAB_KEY, "siguiendo"); onNavigate?.("Ofertas"); };

  if (rows === null) return null;

  const up = rows.filter((r) => r.ads_delta > 0).length;
  const down = rows.filter((r) => r.ads_delta < 0).length;

  return (
    <section className="card-surface rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium mb-1">Tu acervo privado</div>
          <h3 className="font-display font-semibold text-lg text-foreground flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-primary" strokeWidth={1.8} /> Cazador de ROI
          </h3>
        </div>
        {rows.length > 0 && (
          <div className="flex gap-2 text-[11px]">
            <span className="rounded-full px-2.5 py-1 bg-success/15 text-success font-semibold">↑ {up} escalando</span>
            <span className="rounded-full px-2.5 py-1 bg-secondary text-muted-foreground font-semibold">= {rows.length - up - down} estables</span>
            {down > 0 && <span className="rounded-full px-2.5 py-1 bg-destructive/10 text-destructive font-semibold">↓ {down} bajando</span>}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          Sigue las ofertas que te interesan desde el catálogo y aquí verás, semana a semana, cuáles suben anuncios y cuáles
          se apagan — <span className="text-foreground">antes que todos</span>. Seguir una oferta cuesta {CREDIT_COSTS.follow_offer} ⚡; los insights son gratis.
          <div className="mt-4">
            <button onClick={() => onNavigate?.("Ofertas")} className="btn-primary-nova px-4 py-2 rounded-lg text-[13px] inline-flex items-center gap-1.5">
              Explorar ofertas <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="divide-y divide-border/60">
            {rows.slice(0, 4).map((r) => (
              <div key={r.offer.id} className="py-2.5 flex items-center gap-3">
                <span className="text-lg shrink-0">{flagFor(r.offer.market)}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-foreground truncate">{r.offer.product_name || r.offer.page_name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {MARKET_NAME[r.offer.market] ?? r.offer.market} · {r.offer.active_ads} anuncios activos · score {r.offer.winner_score}
                    {r.days_tracked > 0 ? ` · ${r.days_tracked} días de seguimiento` : " · seguimiento desde hoy"}
                  </div>
                </div>
                <Delta value={r.ads_delta} suffix="ads" />
              </div>
            ))}
          </div>
          <button onClick={goFollowing} className="mt-3 text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            Ver las {rows.length} que sigues <ArrowRight className="w-3 h-3" />
          </button>
        </>
      )}
    </section>
  );
}

export function Delta({ value, suffix }: { value: number; suffix: string }) {
  if (value > 0) return <span className="inline-flex items-center gap-1 text-[12px] font-bold text-success"><TrendingUp className="w-3.5 h-3.5" /> +{value} {suffix}</span>;
  if (value < 0) return <span className="inline-flex items-center gap-1 text-[12px] font-bold text-destructive"><TrendingDown className="w-3.5 h-3.5" /> {value} {suffix}</span>;
  return <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground"><Minus className="w-3.5 h-3.5" /> sin cambios</span>;
}
