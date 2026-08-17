-- Cron diario de la Bóveda de Hooks: extrae hooks nuevos de los ganadores
-- del radar 1x/día, a las 12:00 UTC — una hora antes del digest diario
-- (13:00), para que el email salga siempre con hooks frescos disponibles.
SELECT cron.schedule(
  'supernova-extract-hooks-daily',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/extract-hooks',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
