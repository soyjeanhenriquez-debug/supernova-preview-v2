-- Motor de scoring: aplica los parámetros de ganador a los ads sin puntuar.
-- Parámetros designados:
--   days_active  = días desde delivery_start_time (mínimo 1)
--   tier         = mega (60+ días) · rising (14+) · solid (resto)
--   winner_score = base 40 + días/2 + bonus por duplicados e impresiones (cap 100)
CREATE OR REPLACE FUNCTION public.score_unscored_ads()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_updated INTEGER;
BEGIN
  WITH scored AS (
    UPDATE public.winning_ads w
    SET
      days_active = GREATEST(1, COALESCE(
        EXTRACT(DAY FROM now() - w.delivery_start_time)::int,
        w.days_active, 1)),
      winner_score = LEAST(100,
        40
        + (GREATEST(1, COALESCE(EXTRACT(DAY FROM now() - w.delivery_start_time)::int, w.days_active, 1)) / 2)
        + LEAST(20, COALESCE(w.duplicate_count, 1) * 2)
        + CASE WHEN COALESCE(w.impressions_lower, 0) >= 1000000 THEN 10
               WHEN COALESCE(w.impressions_lower, 0) >= 100000 THEN 5
               ELSE 0 END),
      tier = CASE
        WHEN GREATEST(1, COALESCE(EXTRACT(DAY FROM now() - w.delivery_start_time)::int, w.days_active, 1)) >= 60 THEN 'mega'
        WHEN GREATEST(1, COALESCE(EXTRACT(DAY FROM now() - w.delivery_start_time)::int, w.days_active, 1)) >= 14 THEN 'rising'
        ELSE 'solid' END
    WHERE w.winner_score IS NULL OR w.tier IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM scored;
  RETURN v_updated;
END;
$$;
REVOKE ALL ON FUNCTION public.score_unscored_ads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.score_unscored_ads() TO service_role;

-- Puntuar todo lo existente ahora
SELECT public.score_unscored_ads();

-- Cron: rotación de keywords cada hora + scoring 5 min después
SELECT cron.schedule(
  'supernova-master-rotate-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/master-rotate',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"triggered_by": "cron", "batch_size": 5}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'supernova-score-ads-hourly',
  '5 * * * *',
  $$ SELECT public.score_unscored_ads(); $$
);
