-- SUPERNOVA — Envío automático del popup de salida ("te mando 3 ofertas por correo").
--
-- landing_leads ya guardaba el correo; le falta cómo:
--   · no reenviar dos veces (sent_welcome_at),
--   · darse de baja sin cuenta (unsub_token, igual que el digest diario),
--   · saber si ya se dio de baja (unsubscribed).

ALTER TABLE public.landing_leads
  ADD COLUMN IF NOT EXISTS unsub_token     UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS sent_welcome_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unsubscribed    BOOLEAN NOT NULL DEFAULT false;

-- Baja de un clic sin sesión, igual patrón que unsubscribe_digest.
CREATE OR REPLACE FUNCTION public.unsubscribe_lead(p_token UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows INT;
BEGIN
  IF p_token IS NULL THEN RETURN false; END IF;
  UPDATE public.landing_leads SET unsubscribed = true WHERE unsub_token = p_token;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.unsubscribe_lead(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unsubscribe_lead(UUID) TO anon, authenticated;

-- La edge function necesita leer/marcar filas con la service role (ya la tiene); nada nuevo
-- que exponer a PostgREST aquí.

-- Cron cada 15 min: manda el correo a quien lo dejó y sigue sin recibirlo.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'supernova-landing-lead-welcome';
SELECT cron.schedule(
  'supernova-landing-lead-welcome',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/landing-lead-welcome',
    headers := private.cron_headers(),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
