-- Los feeds de Awin (y varios más) no traen la comisión del programa: se fija aquí una vez
-- y se aplica a los productos que lleguen sin ella.
ALTER TABLE public.market_feeds
  ADD COLUMN IF NOT EXISTS default_commission_pct numeric
  CHECK (default_commission_pct IS NULL OR (default_commission_pct >= 0 AND default_commission_pct <= 100));
