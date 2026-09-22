-- Los catálogos de las redes cambian a diario (precios, comisiones, productos retirados).
-- 9:00 UTC: temprano para LATAM, y lejos de las horas cargadas del radar.
SELECT cron.schedule('supernova-market-feed-sync-daily', '0 9 * * *', $$
  SELECT net.http_post(
    url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/market-feed-sync',
    headers := private.cron_headers(),
    body := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 150000
  );
$$);
