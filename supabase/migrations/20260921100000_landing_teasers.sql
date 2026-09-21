-- SUPERNOVA — Ofertas de muestra para la landing pública, distintas cada día.
--
-- La landing /fundador/ traía 3 ofertas escritas a mano (y eran las 3 MEJORES del
-- catálogo): siempre las mismas y regalando lo mejor. Esta función da una muestra que:
--   · rota sola cada día (orden determinista por fecha: todos ven lo mismo ese día),
--   · sale del tramo 60–250 del ranking de ganadoras: buenas de verdad, pero no las top
--     (esas se quedan dentro, que es lo que se vende),
--   · enseña solo lo que ya se veía en la landing: nombre, anunciante, nicho, país,
--     días, anuncios, índice y el porqué. Sin enlaces, sin ids, sin página de ventas,
--     sin checkout, sin veredicto.
-- Es pública a propósito (anon): es material de marketing. El catálogo sigue tras el
-- muro de pago (RLS con has_access()).

CREATE OR REPLACE FUNCTION public.landing_teasers()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT o.*, row_number() OVER (ORDER BY o.winner_index DESC NULLS LAST) AS rk
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
  -- una por país para que la baraja no salga toda del mismo mercado
  deck AS (
    SELECT * FROM (
      SELECT DISTINCT ON (market) * FROM shuffled ORDER BY market, h
    ) d ORDER BY h LIMIT 3
  ),
  scan AS (
    SELECT * FROM shuffled WHERE id NOT IN (SELECT id FROM deck) ORDER BY h DESC LIMIT 7
  )
  SELECT jsonb_build_object(
    'date', current_date,
    'deck', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'name', product_name, 'advertiser', page_name, 'niche', niche, 'market', market,
        'index', round(winner_index)::int, 'ads', active_ads, 'days', days_active,
        'why', left(why_wins, 220), 'type', offer_type, 'model', business_model) ORDER BY h), '[]'::jsonb) FROM deck),
    'scan', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'name', left(product_name, 40), 'market', market, 'days', days_active) ORDER BY h DESC), '[]'::jsonb) FROM scan),
    'stats', (SELECT jsonb_build_object(
        'offers', count(*), 'ads', coalesce(sum(active_ads), 0),
        'markets', count(DISTINCT market), 'niches', count(DISTINCT niche))
      FROM public.offers WHERE is_primary AND excluded_reason IS NULL)
  );
$$;

REVOKE ALL ON FUNCTION public.landing_teasers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.landing_teasers() TO anon, authenticated, service_role;
