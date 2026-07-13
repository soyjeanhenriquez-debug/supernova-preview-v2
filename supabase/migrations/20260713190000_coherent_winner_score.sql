-- Señal real de escala: nº de ads activos por anunciante (antes duplicate_count=1
-- en todos → temperatura siempre FRÍO aunque el tier fuera MEGA).
CREATE OR REPLACE FUNCTION public.recompute_advertiser_scale()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_updated INTEGER;
BEGIN
  WITH counts AS (
    SELECT page_id, count(*) AS ads_running FROM public.winning_ads
    WHERE page_id IS NOT NULL AND delivery_stop_time IS NULL GROUP BY page_id
  ), upd AS (
    UPDATE public.winning_ads w SET duplicate_count = GREATEST(1, c.ads_running)
    FROM counts c WHERE w.page_id = c.page_id
      AND w.duplicate_count IS DISTINCT FROM GREATEST(1, c.ads_running)
    RETURNING 1
  ) SELECT count(*) INTO v_updated FROM upd;
  RETURN v_updated;
END;
$$;
REVOKE ALL ON FUNCTION public.recompute_advertiser_scale() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_advertiser_scale() TO service_role;

-- Score coherente: longevidad (0-50) + escala del anunciante (0-50).
-- tier mega >=75, rising >=50, solid resto. Refresca la escala antes de puntuar.
CREATE OR REPLACE FUNCTION public.score_unscored_ads()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_updated INTEGER;
BEGIN
  PERFORM public.recompute_advertiser_scale();
  WITH scored AS (
    UPDATE public.winning_ads w
    SET
      days_active = GREATEST(1, COALESCE(EXTRACT(DAY FROM now() - w.delivery_start_time)::int, w.days_active, 1)),
      winner_score = LEAST(100, GREATEST(1,
        LEAST(50, (GREATEST(1, COALESCE(EXTRACT(DAY FROM now() - w.delivery_start_time)::int, w.days_active, 1)) * 50 / 60))
        + LEAST(50, COALESCE(w.duplicate_count, 1) * 50 / 30))),
      tier = CASE
        WHEN LEAST(100, GREATEST(1,
          LEAST(50, (GREATEST(1, COALESCE(EXTRACT(DAY FROM now() - w.delivery_start_time)::int, w.days_active, 1)) * 50 / 60))
          + LEAST(50, COALESCE(w.duplicate_count, 1) * 50 / 30))) >= 75 THEN 'mega'
        WHEN LEAST(100, GREATEST(1,
          LEAST(50, (GREATEST(1, COALESCE(EXTRACT(DAY FROM now() - w.delivery_start_time)::int, w.days_active, 1)) * 50 / 60))
          + LEAST(50, COALESCE(w.duplicate_count, 1) * 50 / 30))) >= 50 THEN 'rising'
        ELSE 'solid' END
    RETURNING 1
  ) SELECT count(*) INTO v_updated FROM scored;
  RETURN v_updated;
END;
$$;
REVOKE ALL ON FUNCTION public.score_unscored_ads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.score_unscored_ads() TO service_role;
