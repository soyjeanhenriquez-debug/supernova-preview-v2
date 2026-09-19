-- Chequeo de seguridad 2026-09-19 · parte 2: las edge functions.
--
--  I. verify_jwt del gateway NO distingue a un usuario de la llave pública
--     (anon) que viaja en el bundle de la web: cualquiera la extrae y llama a
--     las funciones de IA/scraping sin cuenta y sin gastar créditos
--     (comprobado: POST a analyze-ad con la llave pública → respondió la
--     función, no el gateway). Las funciones ahora exigen un USUARIO real con
--     acceso, y aquí vive el tope de uso por usuario que lo acompaña.
-- II. Las funciones de cron (enrich-offers, generate-kit, extract-hooks,
--     master-rotate, send-daily-digest) corren sin JWT y no pedían nada:
--     cualquiera con la URL gastaba el saldo prepago de Gemini (comprobado:
--     POST anónimo sin cabeceras → HTTP 200). Ahora piden un secreto que solo
--     conoce la base de datos (Vault); ni el repo ni el chat lo ven.

-- ═════════════════════════════════════════════════════════════════════
-- 1. Registro de uso + compuerta para funciones de usuario
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.edge_usage (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL,
  fn TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS edge_usage_user_fn_time ON public.edge_usage (user_id, fn, created_at DESC);
CREATE INDEX IF NOT EXISTS edge_usage_created_at ON public.edge_usage (created_at);
ALTER TABLE public.edge_usage ENABLE ROW LEVEL SECURITY;
-- Sin políticas a propósito: solo service_role (edge functions) y el admin por SQL.
REVOKE ALL ON public.edge_usage FROM anon, authenticated;

-- Devuelve {ok:true} y registra el uso, o {ok:false, reason:'no_access'|'rate_limited'}.
-- Los admins no tienen tope (pero su uso también queda registrado).
CREATE OR REPLACE FUNCTION public.edge_guard(p_user_id uuid, p_fn text, p_max_hour integer, p_max_day integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hour INT;
  v_day INT;
  v_admin BOOLEAN;
BEGIN
  IF p_user_id IS NULL OR p_fn IS NULL OR NOT public.user_has_access(p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_access');
  END IF;
  v_admin := EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'admin'::app_role);
  -- Un candado por usuario+función: dos llamadas simultáneas no se cuelan juntas bajo el tope.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_fn, 0));
  SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour'), count(*)
    INTO v_hour, v_day
  FROM public.edge_usage
  WHERE user_id = p_user_id AND fn = p_fn AND created_at > now() - interval '24 hours';
  IF NOT v_admin AND (v_hour >= p_max_hour OR v_day >= p_max_day) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited', 'hour', v_hour, 'day', v_day);
  END IF;
  INSERT INTO public.edge_usage (user_id, fn) VALUES (p_user_id, left(p_fn, 60));
  RETURN jsonb_build_object('ok', true, 'hour', v_hour + 1, 'day', v_day + 1);
END;
$$;
REVOKE ALL ON FUNCTION public.edge_guard(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edge_guard(uuid, text, integer, integer) TO service_role;

-- ═════════════════════════════════════════════════════════════════════
-- 2. Secreto de cron en Vault (se genera AQUÍ, en el servidor; nunca sale)
-- ═════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'supernova_cron_secret') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'supernova_cron_secret',
      'Secreto compartido: pg_cron → edge functions internas (cabecera x-cron-secret)'
    );
  END IF;
END $$;

-- La edge function pregunta "¿es este?"; nunca recibe el secreto. Se comparan
-- los SHA-256, así el tiempo de respuesta no filtra cuántos caracteres acertó.
CREATE OR REPLACE FUNCTION public.verify_cron_secret(p_secret text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions, vault AS $$
  SELECT p_secret IS NOT NULL
     AND length(p_secret) BETWEEN 32 AND 128
     AND EXISTS (
       SELECT 1 FROM vault.decrypted_secrets s
       WHERE s.name = 'supernova_cron_secret'
         AND extensions.digest(s.decrypted_secret, 'sha256') = extensions.digest(p_secret, 'sha256')
     );
$$;
REVOKE ALL ON FUNCTION public.verify_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text) TO service_role;

-- Cabeceras para net.http_post. Vive en un esquema que la API REST no expone
-- (PostgREST solo publica `public`): esta función DEVUELVE el secreto y no
-- debe ser alcanzable por ningún rol de la API, ni por error de GRANT futuro.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.cron_headers()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, vault AS $$
  SELECT jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supernova_cron_secret')
  );
$$;
REVOKE ALL ON FUNCTION private.cron_headers() FROM PUBLIC, anon, authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════
-- 3. Tareas programadas: mismas horas, ahora con la cabecera secreta.
--    cron.schedule con un nombre existente actualiza esa tarea en sitio.
--    timeout 150 s: pg_net es asíncrono (no bloquea la base) y así la tabla
--    net._http_response guarda la respuesta REAL de cada corrida en vez de un
--    "timeout" a los 5 s que no dice si la función terminó bien.
-- ═════════════════════════════════════════════════════════════════════
SELECT cron.schedule('supernova-master-rotate-hourly', '0 * * * *', $$
  SELECT net.http_post(
    url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/master-rotate',
    headers := private.cron_headers(),
    body := '{"triggered_by": "cron", "batch_size": 5}'::jsonb,
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('supernova-daily-digest', '0 13 * * *', $$
  SELECT net.http_post(
    url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/send-daily-digest',
    headers := private.cron_headers(),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('supernova-extract-hooks-daily', '0 12 * * *', $$
  SELECT net.http_post(
    url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/extract-hooks',
    headers := private.cron_headers(),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('supernova-enrich-offers-hourly', '20 * * * *', $$
  SELECT net.http_post(
    url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/enrich-offers',
    headers := private.cron_headers(),
    body := '{"batches": 2}'::jsonb,
    timeout_milliseconds := 150000
  );
$$);

-- Mini Apps: DOS kits nuevos por semana (antes: uno los días 1 y 15).
-- Lunes y jueves 10:00 UTC, uno por ejecución: generar un kit tarda ~1-2 min
-- en el modelo grande y dos seguidos rozan el límite de tiempo de la función.
SELECT cron.unschedule('supernova-generate-kit-biweekly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'supernova-generate-kit-biweekly');

SELECT cron.schedule('supernova-generate-kit-twice-weekly', '0 10 * * 1,4', $$
  SELECT net.http_post(
    url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/generate-kit',
    headers := private.cron_headers(),
    body := '{"count": 1}'::jsonb,
    timeout_milliseconds := 150000
  );
$$);

-- Limpieza del registro de uso: 7 días bastan para los topes (miran 24 h).
SELECT cron.schedule('supernova-edge-usage-cleanup', '15 4 * * *', $$
  DELETE FROM public.edge_usage WHERE created_at < now() - interval '7 days';
$$);

-- ═════════════════════════════════════════════════════════════════════
-- 4. set_scraper_cron (panel admin): creaba una SEGUNDA tarea con otro nombre
--    ('supernova-master-rotate') y llevaba la llave anon incrustada. Ahora
--    reprograma la tarea real y usa la cabecera secreta.
-- ═════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_scraper_cron(p_hours integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, cron AS $$
DECLARE
  v_schedule text;
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
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'supernova-master-rotate';
  PERFORM cron.schedule(
    'supernova-master-rotate-hourly',
    v_schedule,
    $job$
      SELECT net.http_post(
        url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/master-rotate',
        headers := private.cron_headers(),
        body := '{"triggered_by": "cron", "batch_size": 5}'::jsonb,
        timeout_milliseconds := 150000
      );
    $job$
  );
  UPDATE public.scraper_settings
  SET interval_hours = p_hours, updated_at = now(), updated_by = auth.uid()
  WHERE id = 1;
  RETURN jsonb_build_object('ok', true, 'hours', p_hours, 'schedule', v_schedule);
END;
$$;
REVOKE ALL ON FUNCTION public.set_scraper_cron(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_scraper_cron(integer) TO authenticated;
