-- Auditoría de seguridad del 24-sep-2026, segunda parte.

-- 1. La búsqueda en vivo (search_ads) la cobra ahora la edge function facebook-ads en el servidor.
--    Con charged_by='server', consume_credits del cliente ya no la acepta.
UPDATE public.credit_prices SET charged_by = 'server', updated_at = now() WHERE action = 'search_ads';

-- 2. get_user_id_by_email (lo usan los webhooks de pago para acreditar): solo cuentas con el correo
--    CONFIRMADO. Si no, alguien podía registrar primero el correo de un comprador (sin confirmarlo)
--    y quedarse con sus créditos o su suscripción.
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users
  WHERE lower(email) = lower(trim(p_email)) AND email_confirmed_at IS NOT NULL
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC, anon, authenticated;

-- 3. Gamificación: XP con tope por llamada e insignias solo de la lista que usa la app.
CREATE OR REPLACE FUNCTION public.add_xp(p_amount integer, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_xp INT; v_level INT; v_new_level INT; v_badges TEXT[];
  v_leveled BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL OR p_amount <= 0 OR p_amount > 100 THEN
    RETURN jsonb_build_object('error','invalid');
  END IF;

  INSERT INTO public.user_gamification (user_id, xp)
  VALUES (v_uid, 0) ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.user_gamification
  SET xp = xp + p_amount, updated_at = now()
  WHERE user_id = v_uid
  RETURNING xp, level, badges INTO v_xp, v_level, v_badges;

  v_new_level := public.compute_level(v_xp);
  IF v_new_level > v_level THEN
    v_leveled := TRUE;
    UPDATE public.user_gamification SET level = v_new_level WHERE user_id = v_uid;
    IF v_new_level >= 5 AND NOT ('level_5' = ANY(v_badges)) THEN
      v_badges := v_badges || 'level_5';
    END IF;
  END IF;

  UPDATE public.user_gamification SET badges = v_badges WHERE user_id = v_uid;

  RETURN jsonb_build_object('xp', v_xp, 'level', v_new_level, 'leveled_up', v_leveled, 'badges', v_badges);
END;
$$;

CREATE OR REPLACE FUNCTION public.unlock_badge(p_badge text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid(); v_badges TEXT[]; v_new BOOLEAN := FALSE;
BEGIN
  -- level_5 la pone add_xp; las demás las pide la app al cumplirse.
  IF v_uid IS NULL OR p_badge IS NULL OR p_badge NOT IN
     ('first_search', 'fifty_searches', 'first_offer', 'first_funnel', 'ten_oracles', 'streak_3', 'streak_7') THEN
    RETURN jsonb_build_object('error','invalid');
  END IF;
  INSERT INTO public.user_gamification (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT badges INTO v_badges FROM public.user_gamification WHERE user_id = v_uid FOR UPDATE;
  IF NOT (p_badge = ANY(v_badges)) THEN
    v_badges := v_badges || p_badge;
    v_new := TRUE;
    UPDATE public.user_gamification SET badges = v_badges, updated_at = now() WHERE user_id = v_uid;
  END IF;
  RETURN jsonb_build_object('badges', v_badges, 'new', v_new);
END;
$$;

-- 4. active_sessions: el usuario escribe su propia fila, pero ya no puede poner otro correo ni
--    quitarse la marca de sesión sospechosa (engañaba al panel de sesiones del admin).
CREATE OR REPLACE FUNCTION public.tg_active_sessions_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.user_email := lower(auth.jwt() ->> 'email');
    NEW.is_suspicious := CASE WHEN TG_OP = 'UPDATE' THEN OLD.is_suspicious ELSE false END;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS active_sessions_guard ON public.active_sessions;
CREATE TRIGGER active_sessions_guard BEFORE INSERT OR UPDATE ON public.active_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_active_sessions_guard();

-- 5. get_daily_winner: la compuerta va PRIMERO. Antes calculaba el grupo de 60 anuncios (≈9 s)
--    antes de mirar el acceso: cualquier cuenta sin pago ocupaba la base 8 s por llamada.
CREATE OR REPLACE FUNCTION public.get_daily_winner()
RETURNS SETOF public.winning_ads
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR public.has_access()) THEN
    RETURN;
  END IF;
  RETURN QUERY
    WITH top_pool AS (
      SELECT * FROM public.winning_ads
      WHERE tier = 'mega'
        AND length(coalesce(ad_body,'')) > 120
        AND delivery_stop_time IS NULL
      ORDER BY winner_score DESC, days_active DESC
      LIMIT 60
    )
    SELECT * FROM top_pool
    OFFSET (EXTRACT(EPOCH FROM CURRENT_DATE)::bigint / 86400) % GREATEST((SELECT count(*) FROM top_pool), 1)
    LIMIT 1;
END $$;
REVOKE ALL ON FUNCTION public.get_daily_winner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_winner() TO authenticated, service_role;
