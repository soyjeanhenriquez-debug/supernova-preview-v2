-- 1) search_path fijo en compute_level (advisor: function_search_path_mutable)
CREATE OR REPLACE FUNCTION public.compute_level(p_xp INTEGER)
RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_xp >= 25001 THEN 9
    WHEN p_xp >= 10001 THEN 8
    WHEN p_xp >= 5001  THEN 7
    WHEN p_xp >= 2001  THEN 6
    WHEN p_xp >= 1001  THEN 5
    WHEN p_xp >= 601   THEN 4
    WHEN p_xp >= 301   THEN 3
    WHEN p_xp >= 101   THEN 2
    ELSE 1
  END
$$;

-- 2) Revocar EXECUTE de anon en las funciones SECURITY DEFINER
--    (defensa en profundidad). Excepción: is_email_approved (signup público).
REVOKE EXECUTE ON FUNCTION public.add_xp(integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_adjust_credits(uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_terminate_session(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_toggle_user_status(uuid, boolean, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.approve_access_request(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_mission_bonus(date, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.consume_credits(integer, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_rising_temperature_ads(integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.grant_monthly_if_due() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_suspended() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_action(text, text, text, jsonb, jsonb, boolean, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.register_daily_login() FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_access_request(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_scraper_cron(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.unlock_badge(text) FROM anon;

-- handle_new_user es un trigger interno: nadie debe invocarlo via RPC
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;

-- check_rate_limit es de uso interno (edge functions con service role)
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer) FROM authenticated;

-- 3) pg_net fuera de public (no soporta SET SCHEMA; se recrea).
--    Sus objetos viven siempre en el schema interno "net", así que
--    recrearla no rompe llamadas net.http_post existentes.
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;
