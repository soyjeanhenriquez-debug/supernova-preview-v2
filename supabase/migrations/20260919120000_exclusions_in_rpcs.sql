-- Las funciones que leen `offers` ignoraban excluded_reason: el contenido
-- adulto y las apps de dramas/novelas marcadas por flag_excluded_offers()
-- podían salir como pick del día, contar en las estadísticas y verse en
-- "Siguiendo". Medido antes de aplicar (2026-09-19): 6 excluidas pasaban el
-- filtro de picks; 0 picks entregados, 0 seguidas y 0 kits las contenían.
--
-- Cuerpos copiados del texto VIVO (pg_get_functiondef), con una sola condición
-- añadida en cada lectura de candidatas. No cambia nada más.

CREATE OR REPLACE FUNCTION public.get_daily_picks()
RETURNS TABLE (slot SMALLINT, market_group TEXT, offer JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_groups TEXT[] := ARRAY['ES','BR','US','RU'];
  v_start INT;
  v_slot INT;
  v_group TEXT;
  v_markets TEXT[];
  v_lang TEXT;
  v_offer_id UUID;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  -- Ya generados hoy → idempotente
  IF NOT EXISTS (SELECT 1 FROM public.daily_picks dp WHERE dp.user_id = v_uid AND dp.pick_date = CURRENT_DATE) THEN
    v_start := (CURRENT_DATE - DATE '2026-01-01') % 4;

    FOR v_slot IN 0..2 LOOP
      v_group := v_groups[((v_start + v_slot) % 4) + 1];
      v_markets := CASE v_group
        WHEN 'ES' THEN ARRAY['ES','MX','AR','CO']
        WHEN 'BR' THEN ARRAY['BR','PT']
        WHEN 'US' THEN ARRAY['US','GB']
        ELSE ARRAY['RU','KZ'] END;
      v_lang := CASE v_group WHEN 'ES' THEN 'es' WHEN 'BR' THEN 'pt' WHEN 'US' THEN 'en' ELSE 'ru' END;

      -- Mejor oferta COPIABLE del grupo que este usuario no haya visto
      -- (ni la oferta ni el mismo anunciante en otro mercado). Idioma coherente
      -- con el grupo: el `market` es donde llegó el anuncio, no su idioma.
      SELECT o.id INTO v_offer_id
      FROM public.offers o
      WHERE o.market = ANY(v_markets)
        AND o.enrich_failed = false
        AND o.excluded_reason IS NULL
        AND o.enriched_at IS NOT NULL
        AND o.language = v_lang
        AND COALESCE(o.copy_score, 0) >= 3
        AND o.sample_body IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.daily_picks dp JOIN public.offers o2 ON o2.id = dp.offer_id
                        WHERE dp.user_id = v_uid AND o2.page_id = o.page_id)
      ORDER BY o.copy_score DESC, o.winner_score DESC, o.active_ads DESC, o.days_active DESC
      LIMIT 1;

      -- Fallback 1: mismo grupo sin exigir enriquecimiento (IA en cuota / mercado chico)
      IF v_offer_id IS NULL THEN
        SELECT o.id INTO v_offer_id
        FROM public.offers o
        WHERE o.market = ANY(v_markets)
          AND o.enrich_failed = false
          AND o.excluded_reason IS NULL
          AND (o.language IS NULL OR o.language = v_lang)
          AND COALESCE(o.copy_score, 3) >= 3
          AND o.sample_body IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.daily_picks dp JOIN public.offers o2 ON o2.id = dp.offer_id
                          WHERE dp.user_id = v_uid AND o2.page_id = o.page_id)
        ORDER BY (o.enriched_at IS NOT NULL) DESC, o.winner_score DESC, o.active_ads DESC
        LIMIT 1;
      END IF;

      -- Fallback 2: cualquier mercado (el grupo se agotó para este usuario)
      IF v_offer_id IS NULL THEN
        SELECT o.id INTO v_offer_id
        FROM public.offers o
        WHERE o.enrich_failed = false
          AND o.excluded_reason IS NULL
          AND COALESCE(o.copy_score, 3) >= 3
          AND o.sample_body IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.daily_picks dp JOIN public.offers o2 ON o2.id = dp.offer_id
                          WHERE dp.user_id = v_uid AND o2.page_id = o.page_id)
        ORDER BY (o.enriched_at IS NOT NULL) DESC, o.copy_score DESC NULLS LAST, o.winner_score DESC
        LIMIT 1;
      END IF;

      IF v_offer_id IS NOT NULL THEN
        INSERT INTO public.daily_picks (user_id, offer_id, pick_date, slot, market_group)
        VALUES (v_uid, v_offer_id, CURRENT_DATE, v_slot, v_group)
        ON CONFLICT DO NOTHING;
        v_offer_id := NULL;
      END IF;
    END LOOP;
  END IF;

  -- Los picks YA entregados hoy se devuelven tal cual (sin filtro): un pick
  -- mostrado no debe desaparecer a mitad del día.
  RETURN QUERY
    SELECT dp.slot, dp.market_group, to_jsonb(o.*)
    FROM public.daily_picks dp JOIN public.offers o ON o.id = dp.offer_id
    WHERE dp.user_id = v_uid AND dp.pick_date = CURRENT_DATE
    ORDER BY dp.slot;
END;
$$;
REVOKE ALL ON FUNCTION public.get_daily_picks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_picks() TO authenticated, service_role;

-- Estadísticas del catálogo: cuentan solo lo que el catálogo muestra.
CREATE OR REPLACE FUNCTION public.get_offers_stats()
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'offers', count(*),
    'active_ads', coalesce(sum(active_ads), 0),
    'markets', count(DISTINCT market),
    'niches', count(DISTINCT niche) FILTER (WHERE niche IS NOT NULL AND niche <> 'otro'),
    'updated_at', max(updated_at)
  )
  FROM public.offers WHERE enrich_failed = false AND excluded_reason IS NULL;
$$;
REVOKE ALL ON FUNCTION public.get_offers_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_offers_stats() TO authenticated, service_role;

-- Seguidas: una oferta que pasa a excluida deja de mostrarse (el registro de
-- seguimiento NO se borra; si se levanta la exclusión, reaparece).
CREATE OR REPLACE FUNCTION public.get_followed_offers()
RETURNS TABLE (
  offer JSONB, followed_at TIMESTAMPTZ,
  ads_delta INT, score_delta INT, days_tracked INT, first_active_ads INT
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT to_jsonb(o.*) AS offer, f.created_at AS followed_at,
         (o.active_ads - coalesce(s.active_ads, o.active_ads))::int AS ads_delta,
         (o.winner_score - coalesce(s.winner_score, o.winner_score))::int AS score_delta,
         coalesce((CURRENT_DATE - s.snap_date)::int, 0) AS days_tracked,
         coalesce(s.active_ads, o.active_ads)::int AS first_active_ads
  FROM public.offer_follows f
  JOIN public.offers o ON o.id = f.offer_id
  LEFT JOIN LATERAL (
    SELECT snap_date, active_ads, winner_score FROM public.offer_snapshots os
    WHERE os.offer_id = o.id AND os.snap_date >= GREATEST(f.created_at::date, CURRENT_DATE - 7)
    ORDER BY os.snap_date ASC LIMIT 1
  ) s ON true
  WHERE f.user_id = auth.uid() AND o.excluded_reason IS NULL
  ORDER BY ads_delta DESC, f.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_followed_offers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_followed_offers() TO authenticated;
