-- Prueba gratis como Higgsfield (Jean lo aprobó el 12-oct-2026: "aplica la prueba gratis").
-- Toda cuenta con el correo confirmado entra a la app y PRUEBA todas las herramientas, sin tarjeta:
--   · 5 usos por herramienta (1 clic = 1 uso en herramientas de varias piezas).
--   · Tope: US$2 de costo real de IA por cuenta (ai_usage); ninguna acción de más de US$1.
--   · Freno global: máximo 1.000 pruebas gratis al día entre todas las cuentas.
--   · PRO completo (2.000 créditos al mes, sin tope de pruebas) SOLO por Whop (approved_emails).
--     Una cuenta gratis nunca gasta créditos de regalo: si compra un pack, gasta solo lo comprado.
--   · Cada prueba deja meta.trial = 'free' para saber qué necesita la gente.
-- Probadores (approved_emails.tester) siguen igual: 3 usos por herramienta y US$5 de tope.

CREATE OR REPLACE FUNCTION private.free_trial_user(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p_user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id AND u.email_confirmed_at IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM public.user_roles r
                     WHERE r.user_id = p_user_id AND r.role IN ('suspended'::app_role, 'admin'::app_role))
     AND NOT EXISTS (SELECT 1 FROM public.approved_emails a JOIN auth.users u ON lower(u.email) = lower(a.email)
                     WHERE u.id = p_user_id AND a.is_active = TRUE);
$$;
REVOKE ALL ON FUNCTION private.free_trial_user(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.has_access()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.user_roles r
                     WHERE r.user_id = auth.uid() AND r.role = 'suspended'::app_role)
     AND (
       EXISTS (SELECT 1 FROM public.user_roles r
               WHERE r.user_id = auth.uid() AND r.role = 'admin'::app_role)
       OR EXISTS (SELECT 1 FROM public.approved_emails a
                  WHERE lower(a.email) = lower(auth.jwt() ->> 'email') AND a.is_active = TRUE)
       OR private.free_trial_user(auth.uid())
     );
$function$;

CREATE OR REPLACE FUNCTION public.user_has_access(p_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p_user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.user_roles r
                     WHERE r.user_id = p_user_id AND r.role = 'suspended'::app_role)
     AND (
       EXISTS (SELECT 1 FROM public.user_roles r
               WHERE r.user_id = p_user_id AND r.role = 'admin'::app_role)
       OR EXISTS (SELECT 1 FROM public.approved_emails a
                  JOIN auth.users u ON lower(u.email) = lower(a.email)
                  WHERE u.id = p_user_id AND a.is_active = TRUE)
       OR private.free_trial_user(p_user_id)
     );
$function$;

CREATE OR REPLACE FUNCTION private.tester_state(p_user_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'tester', EXISTS (
      SELECT 1 FROM public.approved_emails a JOIN auth.users u ON lower(u.email) = lower(a.email)
      WHERE u.id = p_user_id AND a.tester AND a.is_active),
    'free', private.free_trial_user(p_user_id),
    'spent_usd', coalesce((SELECT sum(cost_usd) FROM public.ai_usage WHERE user_id = p_user_id), 0),
    'recharged', coalesce((SELECT sum((meta->>'granted')::int) FROM public.credit_transactions
                           WHERE user_id = p_user_id AND action = 'recharge' AND label ILIKE 'Recarga %'), 0)
  );
$function$;

CREATE OR REPLACE FUNCTION public.edge_guard_charge(p_user_id uuid, p_fn text, p_max_hour integer, p_max_day integer, p_action text DEFAULT NULL::text, p_label text DEFAULT NULL::text, p_kind text DEFAULT NULL::text, p_receipt uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_gate JSONB;
  v_price RECORD;
  v_tx RECORD;
  v_uses INT;
  v_res JSONB;
  v_balance INT;
  v_tester JSONB;
  v_is_free BOOLEAN;
  v_used INT;
  v_tool TEXT;
  v_last TIMESTAMPTZ;
  v_burst INT;
  v_free_uses INT;
  v_total_usd NUMERIC;
  v_today INT;
  c_mi_app_kinds CONSTANT TEXT[] := ARRAY['blueprint', 'master_prompt', 'whatsapp_script', 'vsl_prompt'];
  c_multi_fns CONSTANT TEXT[] := ARRAY['generate-ad-creative', 'video-studio', 'yt-produce', 'image-generate', 'video-generate', 'carousel-slide-model'];
  c_tester_free_uses CONSTANT INT := 3;
  c_tester_total_usd CONSTANT NUMERIC := 5.00;
  c_free_uses CONSTANT INT := 5;
  c_free_total_usd CONSTANT NUMERIC := 2.00;
  c_free_daily_global CONSTANT INT := 1000;
  c_max_action_usd CONSTANT NUMERIC := 1.00;
  c_min_recharge CONSTANT INT := 1000;
BEGIN
  v_gate := public.edge_guard(p_user_id, p_fn, p_max_hour, p_max_day);
  IF coalesce((v_gate->>'ok')::boolean, false) = false THEN RETURN v_gate; END IF;

  IF p_action IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'charged', 0);
  END IF;

  IF p_receipt IS NOT NULL AND p_kind IS NOT NULL THEN
    SELECT id, action, meta INTO v_tx
    FROM public.credit_transactions
    WHERE id = p_receipt AND user_id = p_user_id
      AND (cost > 0 OR coalesce((meta->>'tester_free')::boolean, false))
      AND created_at > now() - interval '2 hours'
      AND coalesce((meta->>'refunded')::boolean, false) = false
    FOR UPDATE;
    IF FOUND AND v_tx.action = 'gen_master_prompt' AND p_kind = ANY (c_mi_app_kinds) THEN
      v_uses := coalesce((v_tx.meta->'uses'->>p_kind)::int, 0);
      IF v_uses < 3 THEN
        UPDATE public.credit_transactions
        SET meta = jsonb_set(coalesce(meta, '{}'::jsonb) || jsonb_build_object('uses', coalesce(meta->'uses', '{}'::jsonb)),
                             ARRAY['uses', p_kind], to_jsonb(v_uses + 1))
        WHERE id = v_tx.id;
        SELECT balance INTO v_balance FROM public.user_credits WHERE user_id = p_user_id;
        RETURN jsonb_build_object('ok', true, 'charged', 0, 'balance', v_balance, 'receipt', v_tx.id, 'covered', true);
      END IF;
    END IF;
  END IF;

  SELECT cost, label, charged_by, real_cost_usd INTO v_price FROM public.credit_prices WHERE action = p_action;
  IF NOT FOUND OR v_price.charged_by <> 'server' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_action');
  END IF;

  v_tester := private.tester_state(p_user_id);
  v_is_free := coalesce((v_tester->>'free')::boolean, false);
  IF ((v_tester->>'tester')::boolean OR v_is_free) AND (v_tester->>'recharged')::int < c_min_recharge THEN
    v_free_uses := CASE WHEN v_is_free THEN c_free_uses ELSE c_tester_free_uses END;
    v_total_usd := CASE WHEN v_is_free THEN c_free_total_usd ELSE c_tester_total_usd END;
    v_tool := CASE WHEN p_fn = 'ai-chat' THEN coalesce(nullif(left(p_label, 120), ''), p_fn) ELSE p_fn END;
    SELECT count(*) FILTER (WHERE prev IS NULL OR created_at - prev > interval '3 minutes' OR NOT (p_fn = ANY (c_multi_fns))),
           max(created_at)
      INTO v_used, v_last
    FROM (
      SELECT created_at, lag(created_at) OVER (ORDER BY created_at) AS prev
      FROM public.credit_transactions
      WHERE user_id = p_user_id AND action = p_action
        AND coalesce((meta->>'tester_free')::boolean, false)
        AND coalesce(meta->>'tool', meta->>'fn') = v_tool
        AND coalesce((meta->>'refunded')::boolean, false) = false
    ) t;
    IF v_last IS NOT NULL AND now() - v_last <= interval '3 minutes' AND p_fn = ANY (c_multi_fns) THEN
      SELECT count(*) INTO v_burst FROM public.credit_transactions
      WHERE user_id = p_user_id AND action = p_action
        AND coalesce((meta->>'tester_free')::boolean, false)
        AND coalesce(meta->>'tool', meta->>'fn') = v_tool
        AND created_at > now() - interval '15 minutes';
      IF v_burst < 20 THEN v_used := v_used - 1; END IF;
    END IF;
    IF v_is_free THEN
      SELECT count(*) INTO v_today FROM public.credit_transactions
      WHERE created_at > now() - interval '24 hours' AND meta->>'trial' = 'free';
    ELSE
      v_today := 0;
    END IF;
    IF v_used >= v_free_uses
       OR coalesce(v_price.real_cost_usd, v_price.cost * 0.008 / 5) > c_max_action_usd
       OR (v_tester->>'spent_usd')::numeric >= v_total_usd
       OR v_today >= c_free_daily_global THEN
      SELECT balance INTO v_balance FROM public.user_credits WHERE user_id = p_user_id;
      RETURN jsonb_build_object('ok', false, 'reason', 'recharge_required', 'min_usd', 20,
                                'trial', CASE WHEN v_is_free THEN 'free' ELSE 'tester' END,
                                'used', v_used, 'free_uses', v_free_uses,
                                'balance', v_balance, 'cost', v_price.cost);
    END IF;
    v_res := private.debit_credits(
      p_user_id, 0, p_action,
      coalesce(nullif(left(p_label, 120), ''), v_price.label) || ' · prueba gratis ' || least(v_used + 1, v_free_uses) || ' de ' || v_free_uses,
      jsonb_build_object('fn', p_fn, 'tool', v_tool, 'tester_free', true, 'list_cost', v_price.cost,
                         'trial', CASE WHEN v_is_free THEN 'free' ELSE 'tester' END)
        || CASE WHEN p_kind IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('uses', jsonb_build_object(p_kind, 1)) END
    );
    RETURN jsonb_build_object('ok', true, 'charged', 0, 'balance', v_res->'balance',
                              'tx_id', v_res->'tx_id', 'receipt', v_res->'tx_id', 'tester_free', true,
                              'free_left', greatest(0, v_free_uses - v_used - 1));
  END IF;

  v_res := private.debit_credits(
    p_user_id, v_price.cost, p_action,
    coalesce(nullif(left(p_label, 120), ''), v_price.label),
    jsonb_build_object('fn', p_fn) || CASE WHEN p_kind IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('uses', jsonb_build_object(p_kind, 1)) END
  );
  IF coalesce((v_res->>'success')::boolean, false) = false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_credits', 'balance', v_res->'balance', 'cost', v_price.cost);
  END IF;
  RETURN jsonb_build_object('ok', true, 'charged', v_price.cost, 'balance', v_res->'balance',
                            'tx_id', v_res->'tx_id', 'receipt', v_res->'tx_id');
END;
$function$;

CREATE OR REPLACE FUNCTION private.tester_free_use(p_user_id uuid, p_action text, p_label text, p_meta jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s jsonb; v_used int; v_res jsonb; v_free boolean; v_max int;
BEGIN
  s := private.tester_state(p_user_id);
  v_free := coalesce((s->>'free')::boolean, false);
  IF NOT ((s->>'tester')::boolean OR v_free) OR (s->>'recharged')::int >= 1000 THEN
    RETURN jsonb_build_object('handled', false);
  END IF;
  -- Cuenta gratis: 1 Mini App y 3 ofertas seguidas; probador: 3 de cada una.
  v_max := CASE WHEN v_free AND p_action = 'unlock_kit' THEN 1 ELSE 3 END;
  SELECT count(*) INTO v_used FROM public.credit_transactions
  WHERE user_id = p_user_id AND action = p_action AND coalesce((meta->>'tester_free')::boolean, false);
  IF v_used >= v_max THEN
    RETURN jsonb_build_object('handled', true, 'success', false, 'reason', 'recharge_required', 'min_usd', 20,
      'trial', CASE WHEN v_free THEN 'free' ELSE 'tester' END,
      'error', CASE WHEN v_free
        THEN 'Ya usaste tus pruebas gratis de esto. Activa PRO para seguir; mientras, puedes probar todo lo demás.'
        ELSE 'Ya usaste tus pruebas gratis de esta herramienta. Recarga al menos US$20 para seguir usándola; mientras, puedes probar todo lo demás.' END);
  END IF;
  v_res := private.debit_credits(p_user_id, 0, p_action, p_label || ' · prueba gratis ' || (v_used + 1) || ' de ' || v_max,
                                 coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('tester_free', true, 'tool', p_action,
                                   'trial', CASE WHEN v_free THEN 'free' ELSE 'tester' END));
  RETURN jsonb_build_object('handled', true, 'success', true, 'balance', v_res->'balance', 'cost', 0);
END $function$;

-- Red de seguridad: una cuenta gratis nunca gasta créditos que no compró.
CREATE OR REPLACE FUNCTION private.debit_credits(p_user_id uuid, p_amount integer, p_action text, p_label text, p_meta jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_balance INT;
  v_purchased INT;
  v_from_purchased INT;
  v_tx UUID;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'No autenticado'); END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Monto inválido'); END IF;
  INSERT INTO public.user_credits (user_id, balance) VALUES (p_user_id, 0) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance, purchased INTO v_balance, v_purchased FROM public.user_credits WHERE user_id = p_user_id FOR UPDATE;
  IF p_amount > 0 AND private.free_trial_user(p_user_id) THEN
    IF v_purchased < p_amount THEN
      RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente', 'balance', v_purchased, 'cost', p_amount);
    END IF;
    v_from_purchased := p_amount;
  ELSE
    IF v_balance < p_amount THEN
      RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente', 'balance', v_balance, 'cost', p_amount);
    END IF;
    v_from_purchased := greatest(0, p_amount - (v_balance - v_purchased));
  END IF;
  UPDATE public.user_credits
     SET balance = balance - p_amount, purchased = purchased - v_from_purchased, updated_at = now()
   WHERE user_id = p_user_id;
  INSERT INTO public.credit_transactions (user_id, action, cost, label, meta)
  VALUES (p_user_id, p_action, p_amount, p_label,
          coalesce(p_meta, '{}'::jsonb) || CASE WHEN v_from_purchased > 0 THEN jsonb_build_object('from_purchased', v_from_purchased) ELSE '{}'::jsonb END)
  RETURNING id INTO v_tx;
  RETURN jsonb_build_object('success', true, 'balance', v_balance - p_amount, 'tx_id', v_tx, 'cost', p_amount);
END;
$function$;

-- Los 2.000 créditos del mes son solo de PRO.
CREATE OR REPLACE FUNCTION public.grant_monthly_if_due()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_last timestamptz; v_grant int; v_balance int; v_purchased int; v_month int; v_new_month int;
  c_cap constant int := 3000;
begin
  if v_uid is null then return jsonb_build_object('granted', false); end if;
  if not public.has_access() or private.free_trial_user(v_uid) then return jsonb_build_object('granted', false); end if;

  select last_grant_at, monthly_grant, balance, purchased into v_last, v_grant, v_balance, v_purchased
  from public.user_credits where user_id = v_uid for update;
  if not found then
    insert into public.user_credits (user_id, balance, monthly_grant, last_grant_at)
    values (v_uid, 2000, 2000, now()) on conflict (user_id) do nothing;
    return jsonb_build_object('granted', true, 'amount', 2000);
  end if;

  -- last_grant_at vacío = nunca recibió su mes (cuenta creada en la prueba gratis): se da ya.
  if v_last is null or v_last < now() - interval '30 days' then
    v_month := v_balance - v_purchased;
    v_new_month := least(v_month + coalesce(v_grant, 2000), greatest(c_cap, v_month));
    update public.user_credits
    set balance = v_new_month + v_purchased, last_grant_at = now(), updated_at = now()
    where user_id = v_uid;
    return jsonb_build_object('granted', true, 'amount', v_new_month - v_month, 'cap', c_cap);
  end if;

  return jsonb_build_object('granted', false);
end $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_quiz JSONB := NEW.raw_user_meta_data -> 'onboarding';
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'display_name')
  ON CONFLICT (user_id) DO NOTHING;

  -- Sin créditos de regalo: la prueba gratis va por usos con tope; el mes llega al pagar.
  INSERT INTO public.user_credits (user_id, balance, monthly_grant, last_grant_at)
  VALUES (NEW.id, 0, 2000, NULL) ON CONFLICT (user_id) DO NOTHING;

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
$function$;

-- Lo que ve la persona: cuánto le queda de su prueba, en % (nunca dólares).
CREATE OR REPLACE FUNCTION public.my_trial_state()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); s jsonb; v_free boolean; v_cap numeric; v_spent numeric; v_uses int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('kind', null); END IF;
  s := private.tester_state(v_uid);
  v_free := coalesce((s->>'free')::boolean, false);
  IF NOT (v_free OR (s->>'tester')::boolean) OR (s->>'recharged')::int >= 1000 THEN
    RETURN jsonb_build_object('kind', 'paid');
  END IF;
  v_cap := CASE WHEN v_free THEN 2.00 ELSE 5.00 END;
  v_spent := (s->>'spent_usd')::numeric;
  SELECT count(*) INTO v_uses FROM public.credit_transactions
  WHERE user_id = v_uid AND coalesce((meta->>'tester_free')::boolean, false)
    AND coalesce((meta->>'refunded')::boolean, false) = false;
  RETURN jsonb_build_object(
    'kind', CASE WHEN v_free THEN 'free' ELSE 'tester' END,
    'left_pct', greatest(0, least(100, round(100 * (1 - v_spent / v_cap)))),
    'uses', v_uses,
    'per_tool', CASE WHEN v_free THEN 5 ELSE 3 END
  );
END $$;
REVOKE ALL ON FUNCTION public.my_trial_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_trial_state() TO authenticated;

-- Para Jean: qué prueba más la gente (solo admin).
CREATE OR REPLACE FUNCTION public.admin_uso_prueba_gratis(p_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r jsonb;
BEGIN
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'solo admin';
  END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x.usos DESC), '[]'::jsonb) INTO r FROM (
    SELECT coalesce(meta->>'tool', action) AS herramienta, action,
           count(*) AS usos, count(DISTINCT user_id) AS personas, max(created_at) AS ultimo
    FROM public.credit_transactions
    WHERE meta->>'trial' = 'free' AND created_at > now() - make_interval(days => least(greatest(p_days, 1), 90))
    GROUP BY 1, 2 LIMIT 60
  ) x;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.admin_uso_prueba_gratis(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_uso_prueba_gratis(integer) TO authenticated;
