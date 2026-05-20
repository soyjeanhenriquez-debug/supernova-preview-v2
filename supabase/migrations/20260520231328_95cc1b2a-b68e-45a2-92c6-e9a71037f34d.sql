
-- ============================================================
-- BLOQUE 0: CRÉDITOS EN BASE DE DATOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INT NOT NULL DEFAULT 2000,
  monthly_grant INT NOT NULL DEFAULT 2000,
  last_grant_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uc_select_own_or_admin ON public.user_credits;
CREATE POLICY uc_select_own_or_admin ON public.user_credits FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS uc_admin_all ON public.user_credits;
CREATE POLICY uc_admin_all ON public.user_credits FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS uc_insert_self ON public.user_credits;
CREATE POLICY uc_insert_self ON public.user_credits FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Trigger updated_at
DROP TRIGGER IF EXISTS user_credits_updated_at ON public.user_credits;
CREATE TRIGGER user_credits_updated_at BEFORE UPDATE ON public.user_credits
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Backfill: dar 2000 a usuarios existentes
INSERT INTO public.user_credits (user_id, balance, monthly_grant, last_grant_at)
SELECT id, 2000, 2000, now() FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- Trigger en signup: actualizar handle_new_user para crear user_credits también
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'display_name')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_credits (user_id, balance, monthly_grant, last_grant_at)
  VALUES (NEW.id, 2000, 2000, now())
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ============================================================
-- BLOQUE 1: AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_admin_select ON public.audit_log;
CREATE POLICY audit_admin_select ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS audit_service_insert ON public.audit_log;
CREATE POLICY audit_service_insert ON public.audit_log FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS audit_authenticated_insert_own ON public.audit_log;
CREATE POLICY audit_authenticated_insert_own ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_user_id_idx ON public.audit_log (user_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON public.audit_log (action);

-- ============================================================
-- BLOQUE 2: SESIONES ACTIVAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  user_email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_suspicious BOOLEAN NOT NULL DEFAULT FALSE
);
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sessions_own_all ON public.active_sessions;
CREATE POLICY sessions_own_all ON public.active_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS sessions_admin_all ON public.active_sessions;
CREATE POLICY sessions_admin_all ON public.active_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS active_sessions_last_seen_idx ON public.active_sessions (last_seen DESC);

-- ============================================================
-- BLOQUE 3: IPs BLOQUEADAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.blocked_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL UNIQUE,
  reason TEXT,
  blocked_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blocked_ips_admin_all ON public.blocked_ips;
CREATE POLICY blocked_ips_admin_all ON public.blocked_ips FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- BLOQUE 4: SYSTEM CONFIG
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sysconfig_admin_all ON public.system_config;
CREATE POLICY sysconfig_admin_all ON public.system_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS sysconfig_select_authenticated ON public.system_config;
CREATE POLICY sysconfig_select_authenticated ON public.system_config FOR SELECT TO authenticated
  USING (true);

INSERT INTO public.system_config (key, value, description, category) VALUES
  ('credits_monthly_free','2000','Créditos gratis por mes','credits'),
  ('cost_search','10','Créditos por búsqueda de anuncios','credits'),
  ('cost_sofisticar','30','Créditos por sofisticar oferta','credits'),
  ('cost_oraculo','80','Créditos por análisis Oráculo','credits'),
  ('cost_chat','10','Créditos por mensaje Chat IA','credits'),
  ('cost_avatar','30','Créditos por avatar del comprador','credits'),
  ('cost_landing','80','Créditos por landing page','credits'),
  ('cost_funnel','100','Créditos por funnel completo','credits'),
  ('cost_blueprint','80','Créditos por blueprint','credits'),
  ('cost_ad_copies','30','Créditos por 10 ad copies','credits'),
  ('cost_generator_light','30','Créditos generadores ligeros','credits'),
  ('cost_generator_medium','60','Créditos generadores medios','credits'),
  ('cost_generator_heavy','150','Créditos VSL y generadores pesados','credits'),
  ('pack_boost_credits','500','Créditos Pack Boost','packs'),
  ('pack_boost_price','7','Precio Pack Boost USD','packs'),
  ('pack_power_credits','2000','Créditos Pack Power','packs'),
  ('pack_power_price','19','Precio Pack Power USD','packs'),
  ('pack_nuclear_credits','6000','Créditos Pack Nuclear','packs'),
  ('pack_nuclear_price','39','Precio Pack Nuclear USD','packs'),
  ('support_email','soyjeanhenriquez@gmail.com','Email de soporte','general'),
  ('skool_link','https://skool.com/tu-comunidad','Link comunidad Skool','general'),
  ('max_searches_per_hour','30','Máximo búsquedas por hora por usuario','limits'),
  ('max_ai_calls_per_hour','20','Máximo llamadas IA por hora','limits'),
  ('maintenance_mode','false','Modo mantenimiento - bloquea acceso','system'),
  ('new_registrations_open','true','Permitir nuevos registros','system'),
  ('tiktok_enabled','true','Búsqueda TikTok activada','features'),
  ('oraculo_enabled','true','Módulo Oráculo activado','features'),
  ('temperature_alerts_enabled','true','Alertas de temperatura activadas','features')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- BLOQUE 5: RATE LIMITS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  count INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, action_type)
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rl_own_all ON public.rate_limits;
CREATE POLICY rl_own_all ON public.rate_limits FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS rl_service_all ON public.rate_limits;
CREATE POLICY rl_service_all ON public.rate_limits FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- FUNCIONES DE NEGOCIO
-- ============================================================

-- Log de acciones (SECURITY DEFINER para que funcione desde policies)
CREATE OR REPLACE FUNCTION public.log_action(
  p_action TEXT,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id TEXT DEFAULT NULL,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL,
  p_success BOOLEAN DEFAULT TRUE,
  p_error TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log (user_id, user_email, action, resource_type,
    resource_id, old_data, new_data, success, error_message)
  SELECT auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    p_action, p_resource_type, p_resource_id,
    p_old_data, p_new_data, p_success, p_error;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- Rate limit check
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID, p_action TEXT, p_max_per_hour INT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT; v_window TIMESTAMPTZ;
BEGIN
  SELECT count, window_start INTO v_count, v_window
  FROM public.rate_limits WHERE user_id = p_user_id AND action_type = p_action;

  IF NOT FOUND OR v_window < now() - INTERVAL '1 hour' THEN
    INSERT INTO public.rate_limits (user_id, action_type, count, window_start)
    VALUES (p_user_id, p_action, 1, now())
    ON CONFLICT (user_id, action_type) DO UPDATE SET count = 1, window_start = now();
    RETURN TRUE;
  END IF;

  IF v_count >= p_max_per_hour THEN RETURN FALSE; END IF;

  UPDATE public.rate_limits SET count = count + 1
  WHERE user_id = p_user_id AND action_type = p_action;
  RETURN TRUE;
END;
$$;

-- Consumir créditos (atómico)
CREATE OR REPLACE FUNCTION public.consume_credits(
  p_amount INT, p_action TEXT, p_label TEXT DEFAULT NULL, p_meta JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_balance INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Monto inválido');
  END IF;

  SELECT balance INTO v_balance FROM public.user_credits WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_credits (user_id, balance) VALUES (v_uid, 2000)
    ON CONFLICT (user_id) DO NOTHING;
    v_balance := 2000;
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente', 'balance', v_balance);
  END IF;

  UPDATE public.user_credits SET balance = balance - p_amount, updated_at = now() WHERE user_id = v_uid;
  INSERT INTO public.credit_transactions (user_id, action, cost, label, meta)
  VALUES (v_uid, p_action, p_amount, p_label, p_meta);

  RETURN jsonb_build_object('success', true, 'balance', v_balance - p_amount);
END;
$$;

-- Renovación mensual (idempotente, llamada al cargar la app)
CREATE OR REPLACE FUNCTION public.grant_monthly_if_due()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_last TIMESTAMPTZ; v_grant INT;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('granted', false); END IF;

  SELECT last_grant_at, monthly_grant INTO v_last, v_grant
  FROM public.user_credits WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_credits (user_id, balance, monthly_grant, last_grant_at)
    VALUES (v_uid, 2000, 2000, now()) ON CONFLICT (user_id) DO NOTHING;
    RETURN jsonb_build_object('granted', true, 'amount', 2000);
  END IF;

  IF v_last < now() - INTERVAL '30 days' THEN
    UPDATE public.user_credits
    SET balance = balance + v_grant, last_grant_at = now(), updated_at = now()
    WHERE user_id = v_uid;
    RETURN jsonb_build_object('granted', true, 'amount', v_grant);
  END IF;

  RETURN jsonb_build_object('granted', false);
END;
$$;

-- Admin: ajustar créditos
CREATE OR REPLACE FUNCTION public.admin_adjust_credits(
  p_target_user_id UUID, p_amount INT, p_reason TEXT DEFAULT 'Ajuste manual del admin'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_current INT; v_new INT;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT balance INTO v_current FROM public.user_credits WHERE user_id = p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_credits (user_id, balance) VALUES (p_target_user_id, GREATEST(0, p_amount));
    v_current := 0;
  END IF;

  v_new := GREATEST(0, v_current + p_amount);
  UPDATE public.user_credits SET balance = v_new, updated_at = now() WHERE user_id = p_target_user_id;

  INSERT INTO public.credit_transactions (user_id, action, cost, label, meta)
  VALUES (p_target_user_id, CASE WHEN p_amount > 0 THEN 'admin_grant' ELSE 'admin_deduct' END,
    p_amount, p_reason, jsonb_build_object('admin_id', auth.uid()));

  PERFORM public.log_action('ADMIN_ADJUST_CREDITS', 'user', p_target_user_id::TEXT,
    jsonb_build_object('before', v_current),
    jsonb_build_object('after', v_new, 'amount', p_amount, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'before', v_current, 'after', v_new);
END;
$$;

-- Admin: suspender / activar
CREATE OR REPLACE FUNCTION public.admin_toggle_user_status(
  p_target_user_id UUID, p_suspend BOOLEAN, p_reason TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;
  IF p_target_user_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes modificarte a ti mismo');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_target_user_id;

  IF p_suspend THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (p_target_user_id, 'suspended'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    DELETE FROM public.user_roles WHERE user_id = p_target_user_id AND role IN ('user'::app_role,'moderator'::app_role);
    UPDATE public.approved_emails SET is_active = FALSE WHERE lower(email) = lower(v_email);
    DELETE FROM public.active_sessions WHERE user_id = p_target_user_id;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = p_target_user_id AND role = 'suspended'::app_role;
    INSERT INTO public.user_roles (user_id, role) VALUES (p_target_user_id, 'user'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    UPDATE public.approved_emails SET is_active = TRUE WHERE lower(email) = lower(v_email);
  END IF;

  PERFORM public.log_action(
    CASE WHEN p_suspend THEN 'ADMIN_SUSPEND_USER' ELSE 'ADMIN_ACTIVATE_USER' END,
    'user', p_target_user_id::TEXT, NULL, jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('success', true, 'suspended', p_suspend);
END;
$$;

-- Admin: terminar sesión
CREATE OR REPLACE FUNCTION public.admin_terminate_session(p_target_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;
  DELETE FROM public.active_sessions WHERE user_id = p_target_user_id;
  PERFORM public.log_action('ADMIN_TERMINATE_SESSION', 'user', p_target_user_id::TEXT);
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Helper: comprobar si el usuario actual está suspendido
CREATE OR REPLACE FUNCTION public.is_suspended()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'suspended'::app_role
  );
$$;

-- ============================================================
-- FORCE RLS en tablas de usuario (NO en scraper/admin/cron)
-- ============================================================
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ad_favorites FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ad_history FORCE ROW LEVEL SECURITY;
ALTER TABLE public.agents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.library_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.keywords FORCE ROW LEVEL SECURITY;
ALTER TABLE public.landing_analyses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_credits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.active_sessions FORCE ROW LEVEL SECURITY;
