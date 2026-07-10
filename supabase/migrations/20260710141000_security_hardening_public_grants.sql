-- Postgres concede EXECUTE a PUBLIC por defecto: hay que revocarlo
-- explícitamente y re-otorgar solo a los roles correctos.
DO $$
DECLARE
  fn TEXT;
  fns TEXT[] := ARRAY[
    'public.add_xp(integer, text)',
    'public.admin_adjust_credits(uuid, integer, text)',
    'public.admin_terminate_session(uuid)',
    'public.admin_toggle_user_status(uuid, boolean, text)',
    'public.approve_access_request(uuid, text)',
    'public.award_mission_bonus(date, integer)',
    'public.consume_credits(integer, text, text, jsonb)',
    'public.get_rising_temperature_ads(integer, integer)',
    'public.grant_monthly_if_due()',
    'public.has_active_subscription()',
    'public.has_role(uuid, public.app_role)',
    'public.is_suspended()',
    'public.log_action(text, text, text, jsonb, jsonb, boolean, text)',
    'public.register_daily_login()',
    'public.reject_access_request(uuid, text)',
    'public.set_scraper_cron(integer)',
    'public.spend_credits(text, jsonb)',
    'public.unlock_badge(text)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- Solo uso interno (service role / triggers): ni authenticated
REVOKE ALL ON FUNCTION public.check_rate_limit(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;

REVOKE ALL ON FUNCTION public.compute_level(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_level(integer) TO authenticated, service_role;

-- is_email_approved se queda accesible para anon (formulario público de signup):
-- es de solo lectura y devuelve solo un boolean.
