import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { temperatureFromLevel, type TemperatureLevel } from '@/lib/temperature-system';

interface NicheHeat {
  name: string;
  count: number;
  level: TemperatureLevel;
  market: string;
}

const OFFER_LABEL: Record<string, string> = {
  infoproducto: 'Infoproducto',
  ecommerce: 'Ecommerce',
  saas: 'SaaS',
  servicio: 'Servicio',
  app: 'App',
};

function levelFromCount(count: number, max: number): TemperatureLevel {
  const ratio = count / Math.max(1, max);
  if (ratio >= 0.9) return 6;
  if (ratio >= 0.7) return 5;
  if (ratio >= 0.5) return 4;
  if (ratio >= 0.3) return 3;
  if (ratio >= 0.15) return 2;
  return 1;
}

export function HeatMap({ onSelectNiche }: { onSelectNiche?: (offer: string, market: string) => void }) {
  const [niches, setNiches] = useState<NicheHeat[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Últimos 7 días
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data, error } = await supabase
        .from('winning_ads')
        .select('offer_type, market')
        .gte('scraped_at', since)
        .not('offer_type', 'is', null)
        .limit(5000);
      if (cancelled || error || !data) return;
      const counts = new Map<string, { count: number; offer: string; market: string }>();
      for (const r of data as Array<{ offer_type?: string | null; market?: string | null }>) {
        const offer = (r.offer_type ?? '').toString().toLowerCase().split(/[\s-]/)[0];
        const market = r.market ?? 'GLOBAL';
        if (!offer) continue;
        const key = `${offer}|${market}`;
        const prev = counts.get(key);
        if (prev) prev.count++;
        else counts.set(key, { count: 1, offer, market });
      }
      const arr = Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 8);
      const max = arr[0]?.count ?? 1;
      setNiches(arr.map(n => ({
        name: OFFER_LABEL[n.offer] ?? n.offer,
        count: n.count,
        market: n.market,
        level: levelFromCount(n.count, max),
      })));
      setUpdatedAt(new Date());
    })();
    return () => { cancelled = true; };
  }, []);

  if (niches.length === 0) return null;

  return (
    <div className="card-surface rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-foreground">
          🌡️ Nichos en llamas ahora
        </h3>
        <span className="text-[10px] text-muted-foreground">
          {updatedAt ? `actualizado ${updatedAt.toLocaleTimeString()}` : ''}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {niches.map((niche, i) => {
          const t = temperatureFromLevel(niche.level);
          return (
            <button
              key={i}
              onClick={() => onSelectNiche?.(niche.name, niche.market)}
              className="rounded-lg border border-border bg-background/40 px-3 py-2 flex items-center justify-between gap-2 hover:bg-secondary/40 hover:border-primary/40 transition-all text-left"
              style={{ borderColor: t.color + '40' }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm leading-none">{t.fires}</span>
                <span className="text-[11px] font-semibold text-foreground truncate">{niche.name}</span>
                <span className="text-[10px] text-muted-foreground">· {niche.market}</span>
              </div>
              <span className="text-[11px] font-bold text-foreground/90 whitespace-nowrap">
                {niche.count.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
