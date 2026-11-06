-- Alerta de saldo de la IA (06-nov-2026, pedido de Jean tras quedarse Gemini sin saldo prepago y
-- enterarse por una clienta). health-alert {"check":"ia"} prueba Gemini cada 30 minutos con una llamada
-- mínima y, si el estado cambia (sin saldo ↔ funciona), manda UN correo al admin. Aquí se guarda el
-- último estado para no repetir el correo en cada vuelta.
CREATE TABLE IF NOT EXISTS public.provider_alerts (
  provider    text PRIMARY KEY,
  status      int  NOT NULL,          -- último código HTTP del proveedor (200 = funciona, 402 = sin saldo…)
  ok          boolean NOT NULL,
  checked_at  timestamptz NOT NULL DEFAULT now(),
  alerted_at  timestamptz              -- último correo enviado
);
-- Solo la usa health-alert con service role: RLS activa y sin políticas = nadie más la lee ni la escribe.
ALTER TABLE public.provider_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_alerts FROM anon, authenticated;

SELECT cron.schedule(
  'supernova-ia-saldo-check',
  '*/30 * * * *',
  $$ SELECT net.http_post(
       url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/health-alert',
       headers := private.cron_headers(),
       body := '{"check":"ia"}'::jsonb,
       timeout_milliseconds := 20000); $$
);
