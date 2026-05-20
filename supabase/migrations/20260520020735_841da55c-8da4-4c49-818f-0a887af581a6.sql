
-- Settings singleton table
CREATE TABLE IF NOT EXISTS public.scraper_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  interval_hours integer NOT NULL DEFAULT 24 CHECK (interval_hours IN (1, 6, 12, 24)),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.scraper_settings (id, interval_hours)
VALUES (1, 24)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.scraper_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scraper_settings_select_authenticated"
  ON public.scraper_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "scraper_settings_admin_update"
  ON public.scraper_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Function to reschedule cron (admin only)
CREATE OR REPLACE FUNCTION public.set_scraper_cron(p_hours integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, cron
AS $$
DECLARE
  v_schedule text;
  v_url text := 'https://quyjsihawxeghsptwltq.supabase.co/functions/v1/master-rotate';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1eWpzaWhhd3hlZ2hzcHR3bHRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjQxNTAsImV4cCI6MjA4NzIwMDE1MH0.VL5PxCwbnnyDN81J8UDs4KY3QMEa7VLWqaBM3x3QW0Q';
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can change scraper schedule';
  END IF;
  IF p_hours NOT IN (1, 6, 12, 24) THEN
    RAISE EXCEPTION 'Invalid interval: must be 1, 6, 12, or 24 hours';
  END IF;

  v_schedule := CASE p_hours
    WHEN 1 THEN '0 * * * *'
    WHEN 6 THEN '0 */6 * * *'
    WHEN 12 THEN '0 */12 * * *'
    WHEN 24 THEN '0 3 * * *'
  END;

  -- Drop any existing job
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'supernova-master-rotate';

  -- Schedule new
  PERFORM cron.schedule(
    'supernova-master-rotate',
    v_schedule,
    format($job$
      select net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := '{"source":"cron"}'::jsonb
      );
    $job$, v_url, '{"Content-Type":"application/json","apikey":"' || v_anon || '","Authorization":"Bearer ' || v_anon || '"}')
  );

  -- Persist preference
  UPDATE public.scraper_settings
  SET interval_hours = p_hours, updated_at = now(), updated_by = auth.uid()
  WHERE id = 1;

  RETURN jsonb_build_object('ok', true, 'hours', p_hours, 'schedule', v_schedule);
END;
$$;

REVOKE ALL ON FUNCTION public.set_scraper_cron(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_scraper_cron(integer) TO authenticated;

-- Ensure extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
