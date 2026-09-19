-- SUPERNOVA — Precalienta las fichas de las ofertas ganadoras.
--
-- La primera persona que abre una oferta sin ficha espera ~20 s a que se genere.
-- Para las ganadoras (lo primero que ve todo el mundo) eso se hace de fondo:
-- 3 fichas por hora, de mayor a menor índice, hasta cubrir las ~300. Después
-- solo trabaja cuando entra una ganadora nueva.
--
-- Costo por ficha nueva: 1 lectura del anuncio (Firecrawl) + a veces 1 de la
-- página + una llamada corta de IA. Para pausarlo sin tocar nada más:
--   UPDATE public.edge_limits SET enabled = false WHERE fn = 'offer-intel';
-- (eso también pausa la generación a pedido; las fichas ya hechas se siguen leyendo).

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'supernova-offer-intel-prewarm';

SELECT cron.schedule(
  'supernova-offer-intel-prewarm',
  '50 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/offer-intel',
    headers := private.cron_headers(),
    body := '{"batch":3}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
