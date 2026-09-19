-- Lista curada de GANADORAS (decisiones de producto de Jean, 2026-09-19):
--   · audiencia: principiante que quiere copiar y pegar un negocio
--   · solo negocios digitales: infoproducto, saas_app, comunidad
--   · ranking 50/50: prueba de dinero + facilidad de copiar
--   · 200-300 por defecto; el resto solo bajo demanda ("Explorar todo")
--   · salud sexual masculina: NO se excluye por tema (las pastillas caen fuera
--     solas por ser ecommerce); el contenido explícito sigue excluido (adult).
--
-- Una tarjeta por ANUNCIANTE: las 6.960 ofertas son 4.319 anunciantes; 1.316
-- se repetían en 2+ países y eso era buena parte del ruido del catálogo.

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_winner BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS winner_index NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS markets TEXT[];

CREATE INDEX IF NOT EXISTS idx_offers_winners ON public.offers (winner_index DESC) WHERE is_winner;
CREATE INDEX IF NOT EXISTS idx_offers_primary ON public.offers (is_primary) WHERE is_primary;

-- Recalcula representante por anunciante, índice y top N. Idempotente.
-- winner_score se satura en 100 (tope 60 días / 30 anuncios) y no discrimina
-- arriba, así que la "prueba de dinero" usa escala logarítmica con topes altos.
CREATE OR REPLACE FUNCTION public.curate_offers(p_top INT DEFAULT 300)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_primaries INT; v_winners INT;
BEGIN
  -- 1) Representante por anunciante: fichada antes que sin fichar, luego más
  --    anuncios activos, luego score. Las excluidas nunca representan.
  WITH ranked AS (
    SELECT id, page_id,
           row_number() OVER (PARTITION BY page_id
             ORDER BY (enriched_at IS NOT NULL) DESC, active_ads DESC, winner_score DESC, id) AS rn
    FROM public.offers
    WHERE excluded_reason IS NULL AND NOT enrich_failed
  ), mk AS (
    SELECT page_id, array_agg(DISTINCT market ORDER BY market) AS markets
    FROM public.offers WHERE excluded_reason IS NULL GROUP BY page_id
  )
  UPDATE public.offers o
  SET is_primary = (r.rn = 1),
      markets = CASE WHEN r.rn = 1 THEN mk.markets ELSE NULL END
  FROM ranked r JOIN mk ON mk.page_id = r.page_id
  WHERE o.id = r.id
    AND (o.is_primary IS DISTINCT FROM (r.rn = 1)
         OR o.markets IS DISTINCT FROM CASE WHEN r.rn = 1 THEN mk.markets ELSE NULL END);

  UPDATE public.offers SET is_primary = false, markets = NULL
  WHERE is_primary AND (excluded_reason IS NOT NULL OR enrich_failed);

  -- 2) Índice 50/50 para toda representante fichada
  UPDATE public.offers o
  SET winner_index = round((
        0.5 * (50 * LEAST(1, ln(1 + o.days_active) / ln(1 + 365)) + 50 * LEAST(1, ln(1 + o.active_ads) / ln(1 + 100)))
      + 0.5 * (o.copy_score / 5.0 * 100))::numeric, 1)
  WHERE o.is_primary AND o.enriched_at IS NOT NULL AND o.copy_score IS NOT NULL;

  -- 3) Top N entre las que cumplen el mínimo de "ganadora"
  WITH top AS (
    SELECT id FROM public.offers
    WHERE is_primary AND enriched_at IS NOT NULL
      AND offer_type IN ('infoproducto', 'saas_app', 'comunidad')
      AND language IN ('es', 'pt', 'en', 'ru')
      AND copy_score >= 3 AND active_ads >= 3 AND days_active >= 30
    ORDER BY winner_index DESC NULLS LAST, active_ads DESC, id
    LIMIT GREATEST(1, p_top)
  )
  UPDATE public.offers o
  SET is_winner = (o.id IN (SELECT id FROM top))
  WHERE o.is_winner IS DISTINCT FROM (o.id IN (SELECT id FROM top));

  SELECT count(*) FILTER (WHERE is_primary), count(*) FILTER (WHERE is_winner)
  INTO v_primaries, v_winners FROM public.offers;
  RETURN jsonb_build_object('primaries', v_primaries, 'winners', v_winners);
END;
$$;
REVOKE ALL ON FUNCTION public.curate_offers(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.curate_offers(INT) TO service_role;
