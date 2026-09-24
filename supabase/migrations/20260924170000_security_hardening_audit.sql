-- Auditoría de seguridad del 24-sep-2026.
--
-- 1. CRÍTICO: handle_new_user aprobaba en approved_emails a TODO el que se registraba con
--    signup_source='trial' (lo manda siempre /signup, y cualquiera puede mandarlo por la API de
--    Auth). approved_emails no vence, así que era acceso de pago gratis y de por vida con un correo
--    desechable. La prueba de 3 días es la de Whop (pide tarjeta): el acceso lo dan SOLO los
--    webhooks de pago. La encuesta de registro se sigue guardando.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_quiz JSONB := NEW.raw_user_meta_data -> 'onboarding';
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'display_name')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_credits (user_id, balance, monthly_grant, last_grant_at)
  VALUES (NEW.id, 2000, 2000, now()) ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.notification_prefs (user_id, email)
  VALUES (NEW.id, lower(NEW.email)) ON CONFLICT (user_id) DO NOTHING;

  IF NEW.raw_user_meta_data ->> 'signup_source' = 'trial' THEN
    INSERT INTO public.user_onboarding (user_id, experience_level, runs_ads, sells_what, main_goal, answers)
    VALUES (NEW.id, v_quiz ->> 'experience_level', v_quiz ->> 'runs_ads',
            v_quiz ->> 'sells_what', v_quiz ->> 'main_goal', COALESCE(v_quiz, '{}'::jsonb))
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 2. Bono de misión diaria y recarga mensual: solo para cuentas con acceso vigente (antes
--    cualquier cuenta registrada, pagara o no, cobraba 50 créditos al día y 2.000 al mes).
CREATE OR REPLACE FUNCTION public.award_mission_bonus(p_mission_date date, p_amount integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_already BOOLEAN;
  v_bonus CONSTANT INT := 50;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error','no auth'); END IF;
  IF NOT public.has_access() THEN RETURN jsonb_build_object('success', false, 'error','no_access'); END IF;
  IF p_mission_date <> CURRENT_DATE THEN RETURN jsonb_build_object('success', false, 'error','only today'); END IF;
  -- Serializa por usuario: dos reclamos simultáneos no pasan ambos el EXISTS.
  PERFORM 1 FROM public.user_credits WHERE user_id = v_uid FOR UPDATE;
  SELECT EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE user_id = v_uid
      AND action = 'mission_bonus'
      AND created_at::date = p_mission_date
  ) INTO v_already;
  IF v_already THEN
    RETURN jsonb_build_object('success', false, 'error','already_claimed');
  END IF;
  INSERT INTO public.user_credits (user_id, balance) VALUES (v_uid, v_bonus)
  ON CONFLICT (user_id) DO UPDATE SET balance = public.user_credits.balance + v_bonus, updated_at = now();
  INSERT INTO public.credit_transactions (user_id, action, cost, label, meta)
  VALUES (v_uid, 'mission_bonus', -v_bonus, 'Misión diaria completada', jsonb_build_object('date', p_mission_date));
  RETURN jsonb_build_object('success', true, 'amount', v_bonus);
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_monthly_if_due()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_uid uuid := auth.uid();
  v_last timestamptz; v_grant int; v_balance int; v_new int;
  c_cap constant int := 3000;
begin
  if v_uid is null then return jsonb_build_object('granted', false); end if;
  if not public.has_access() then return jsonb_build_object('granted', false); end if;

  select last_grant_at, monthly_grant, balance into v_last, v_grant, v_balance
  from public.user_credits where user_id = v_uid for update;
  if not found then
    insert into public.user_credits (user_id, balance, monthly_grant, last_grant_at)
    values (v_uid, 2000, 2000, now()) on conflict (user_id) do nothing;
    return jsonb_build_object('granted', true, 'amount', 2000);
  end if;

  if v_last < now() - interval '30 days' then
    v_new := least(v_balance + v_grant, greatest(c_cap, v_balance));
    update public.user_credits
    set balance = v_new, last_grant_at = now(), updated_at = now()
    where user_id = v_uid;
    return jsonb_build_object('granted', true, 'amount', v_new - v_balance, 'cap', c_cap);
  end if;

  return jsonb_build_object('granted', false);
end $$;

-- 3. Registro de auditoría: un usuario podía escribir entradas falsas a su nombre (p. ej.
--    "ADMIN_ADJUST_CREDITS"). Solo escriben las funciones del servidor (corren como dueño) y las
--    edge functions con service role.
REVOKE EXECUTE ON FUNCTION public.log_action(text, text, text, jsonb, jsonb, boolean, text) FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS audit_authenticated_insert_own ON public.audit_log;

-- 4. Tokens de Facebook de terceros en ad_media_cache.link_url (legible por usuarios con acceso):
--    se limpian y un trigger los descarta al escribir, igual que en winning_ads y offers.
CREATE OR REPLACE FUNCTION public.tg_strip_fb_token_ad_media_cache()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.link_url := public.strip_fb_token(NEW.link_url);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS strip_fb_token ON public.ad_media_cache;
CREATE TRIGGER strip_fb_token BEFORE INSERT OR UPDATE OF link_url ON public.ad_media_cache
  FOR EACH ROW EXECUTE FUNCTION public.tg_strip_fb_token_ad_media_cache();
UPDATE public.ad_media_cache SET link_url = public.strip_fb_token(link_url)
WHERE link_url LIKE '%access_token=%';

-- 5. strip_fb_token solo quitaba "?access_token=" / "&access_token=": los enlaces de Adjust traen
--    "adj_fb_access_token=". Ahora quita cualquier parámetro que termine en access_token (vale
--    también para los triggers de winning_ads y offers).
CREATE OR REPLACE FUNCTION public.strip_fb_token(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_url IS NULL OR position('access_token=' IN p_url) = 0 THEN p_url
    ELSE regexp_replace(
           regexp_replace(p_url, '([?&])[A-Za-z0-9_.-]*access_token=[^&#]*&?', '\1', 'g'),
           '[?&]+$', '')
  END
$$;
UPDATE public.ad_media_cache SET link_url = public.strip_fb_token(link_url)
WHERE link_url LIKE '%access_token=%';
