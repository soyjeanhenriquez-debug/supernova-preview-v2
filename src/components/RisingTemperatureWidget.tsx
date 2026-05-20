import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface RisingAd {
  ad_id: string;
  page_name: string | null;
  offer_type: string | null;
  market: string | null;
  old_level: number;
  new_level: number;
  level_jump: number;
  new_duplicates: number;
  old_duplicates: number;
}

const LEVEL_NAMES = ["", "TIBIO", "CALENTANDO", "HOT", "MUY HOT", "ARDIENTE", "NUCLEAR"];

function fires(level: number) {
  return "🔥".repeat(Math.max(0, Math.min(6, level)));
}

interface Props {
  onSeeAll?: () => void;
}

export function RisingTemperatureWidget({ onSeeAll }: Props) {
  const [ads, setAds] = useState<RisingAd[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_rising_temperature_ads", {
        hours_back: 48,
        min_jump: 1,
      });
      if (cancelled) return;
      if (!error && Array.isArray(data)) {
        setAds(data as RisingAd[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="card-surface rounded-2xl p-7">
      <div className="flex items-end justify-between mb-5 gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium mb-1 flex items-center gap-2">
            <Flame className="w-3 h-3" /> Últimas 48h
          </div>
          <h3 className="font-display font-semibold text-lg text-foreground">⚡ JARVIS DETECTÓ — Subiendo de temperatura</h3>
          <p className="text-[12px] text-muted-foreground mt-1">Anuncios que JARVIS marcó como urgentes en 48h.</p>
        </div>
        {onSeeAll && (
          <button onClick={onSeeAll} className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1">
            Ver en Buscar <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-6">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando alertas de velocidad…
        </div>
      ) : ads.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground space-y-1">
          <div className="inline-flex items-center gap-2 text-xs">
            <span className="live-dot" /> Monitoreando el mercado
          </div>
          <p className="text-[12px] max-w-md mx-auto">
            Las primeras alertas aparecerán en cuanto detectemos anuncios subiendo de temperatura.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {ads.slice(0, 6).map((a) => (
            <div key={a.ad_id} className="rounded-xl border border-border bg-card/50 p-4 flex items-center justify-between gap-3 hover:border-primary/30 transition-colors">
              <div className="min-w-0">
                <div className="font-mono text-sm mb-1 tracking-wider">
                  <span className="text-muted-foreground/60">{fires(a.old_level)}</span>
                  <span className="text-muted-foreground/40 mx-1.5">→</span>
                  <span>{fires(a.new_level)}</span>
                </div>
                <div className="text-[13px] font-semibold text-foreground truncate">
                  {a.offer_type ?? "Oferta"} · {a.market ?? "—"}
                  <span className="text-muted-foreground font-normal"> · +{Math.max(0, a.new_duplicates - a.old_duplicates)} duplicados</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  De {LEVEL_NAMES[a.old_level] ?? "—"} a {LEVEL_NAMES[a.new_level] ?? "—"} en 48h
                </div>
              </div>
              {a.page_name && (
                <div className="text-[11px] text-muted-foreground truncate max-w-[180px] hidden sm:block">
                  {a.page_name}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
