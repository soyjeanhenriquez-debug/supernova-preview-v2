-- SUPERNOVA — La landing lee los ejemplos de ofertas ya calculados (antes: 1,8 s por visita y error 500
-- cada hora en punto, cuando master-rotate carga la base y la consulta pasaba su tiempo límite).
--
-- · private.landing_teasers_compute(): la misma lógica de siempre, pero pidiendo SOLO las columnas que
--   usa (antes "o.*" arrastraba los textos largos de cada oferta: era lo lento).
-- · landing_teasers_cache: una fila con el resultado. Se recalcula a las :47 de cada hora (después de
--   curate-offers a las :40 y en un minuto sin otros crons). No toca el catálogo: solo lo lee.
-- · public.landing_teasers(): misma firma y mismo resultado para la landing; lee la caché y, si faltara
--   o tuviera más de 3 horas, calcula en vivo como antes (nunca peor que hoy).

CREATE TABLE IF NOT EXISTS public.landing_teasers_cache (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload jsonb NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.landing_teasers_cache ENABLE ROW LEVEL SECURITY; -- sin políticas: solo vía funciones

CREATE OR REPLACE FUNCTION private.landing_teasers_compute()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ranked AS (
    SELECT o.id, o.product_name, o.page_name, o.niche, o.market, o.winner_index, o.active_ads,
           o.days_active, o.why_wins, o.offer_type, o.business_model, o.copy_score,
           row_number() OVER (ORDER BY o.winner_index DESC NULLS LAST) AS rk
    FROM public.offers o
    WHERE o.is_winner AND o.is_primary AND o.excluded_reason IS NULL
  ),
  pool AS (
    SELECT * FROM ranked
    WHERE rk BETWEEN 60 AND 250
      AND product_name IS NOT NULL AND length(product_name) BETWEEN 4 AND 70
      AND why_wins IS NOT NULL AND coalesce(niche, 'otro') <> 'otro'
      AND coalesce(copy_score, 0) >= 4
  ),
  shuffled AS (
    SELECT *, md5(id::text || current_date::text) AS h FROM pool
  ),
  deck AS (
    SELECT * FROM (
      SELECT DISTINCT ON (market) * FROM shuffled ORDER BY market, h
    ) d ORDER BY h LIMIT 3
  ),
  scan AS (
    SELECT * FROM shuffled WHERE id NOT IN (SELECT id FROM deck) ORDER BY h DESC LIMIT 12
  )
  SELECT jsonb_build_object(
    'date', current_date,
    'deck', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'name', product_name, 'advertiser', page_name, 'niche', niche, 'market', market,
        'index', round(winner_index)::int, 'ads', active_ads, 'days', days_active,
        'why', left(why_wins, 220), 'type', offer_type, 'model', business_model) ORDER BY h), '[]'::jsonb) FROM deck),
    'scan', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'name', left(product_name, 40), 'market', market, 'days', days_active,
        'ads', active_ads, 'niche', niche) ORDER BY h DESC), '[]'::jsonb) FROM scan),
    'stats', (SELECT jsonb_build_object(
        'offers', count(*), 'ads', coalesce(sum(active_ads), 0),
        'markets', count(DISTINCT market), 'niches', count(DISTINCT niche))
      FROM public.offers WHERE is_primary AND excluded_reason IS NULL)
  );
$$;
REVOKE ALL ON FUNCTION private.landing_teasers_compute() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_landing_teasers()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.landing_teasers_cache (id, payload, refreshed_at)
  VALUES (1, private.landing_teasers_compute(), now())
  ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, refreshed_at = EXCLUDED.refreshed_at;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_landing_teasers() FROM PUBLIC, anon, authenticated;

-- Misma firma que antes: la landing (anon) y landing-lead-welcome no cambian nada.
CREATE OR REPLACE FUNCTION public.landing_teasers()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT payload FROM public.landing_teasers_cache WHERE id = 1 AND refreshed_at > now() - interval '3 hours'),
    private.landing_teasers_compute()
  );
$$;

SELECT public.refresh_landing_teasers();

SELECT cron.unschedule('supernova-landing-teasers-cache') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'supernova-landing-teasers-cache');
SELECT cron.schedule('supernova-landing-teasers-cache', '47 * * * *', $$SELECT public.refresh_landing_teasers();$$);
