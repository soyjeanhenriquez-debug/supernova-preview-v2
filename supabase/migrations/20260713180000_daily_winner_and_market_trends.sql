-- Ganador del Día: pick estable por fecha entre los mejores MEGA winners
CREATE OR REPLACE FUNCTION public.get_daily_winner()
RETURNS SETOF public.winning_ads
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH top_pool AS (
    SELECT * FROM public.winning_ads
    WHERE tier = 'mega'
      AND length(coalesce(ad_body,'')) > 120
      AND delivery_stop_time IS NULL
    ORDER BY winner_score DESC, days_active DESC
    LIMIT 60
  )
  SELECT * FROM top_pool
  OFFSET (EXTRACT(EPOCH FROM CURRENT_DATE)::bigint / 86400) % GREATEST((SELECT count(*) FROM top_pool), 1)
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_daily_winner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_winner() TO authenticated, service_role;

-- Tendencias del mercado: nichos con más ads nuevos en 7 días vs 7 previos
CREATE OR REPLACE FUNCTION public.get_market_trends()
RETURNS TABLE(keyword TEXT, ads_7d BIGINT, ads_prev7d BIGINT, growth_pct INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cur AS (
    SELECT w.keyword AS kw, count(*) AS c FROM public.winning_ads w
    WHERE w.scraped_at > now() - interval '7 days' GROUP BY w.keyword
  ), prev AS (
    SELECT w.keyword AS kw, count(*) AS c FROM public.winning_ads w
    WHERE w.scraped_at BETWEEN now() - interval '14 days' AND now() - interval '7 days'
    GROUP BY w.keyword
  )
  SELECT cur.kw, cur.c, COALESCE(prev.c, 0),
         CASE WHEN COALESCE(prev.c, 0) = 0 THEN 100
              ELSE (((cur.c - prev.c)::numeric / prev.c) * 100)::int END
  FROM cur LEFT JOIN prev ON prev.kw = cur.kw
  WHERE cur.c >= 5
  ORDER BY cur.c DESC
  LIMIT 5;
$$;
REVOKE ALL ON FUNCTION public.get_market_trends() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_market_trends() TO authenticated, service_role;
