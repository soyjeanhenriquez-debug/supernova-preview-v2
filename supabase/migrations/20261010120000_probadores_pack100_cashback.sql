-- Probadores, pack de US$100 y cashback (decisión de Jean, 10-oct-2026).
--
-- 1) PROBADORES: cuentas aprobadas a mano sin plan (approved_emails.tester = true). Usan todas las
--    funciones gratis (cobro de 0 créditos, queda registrado) mientras lo que nos cuesta su uso real
--    (ai_usage.cost_usd, la suma de toda su cuenta) no pase de US$1,50. Cuando pasa, o cuando una sola
--    acción cuesta más de US$1,50, el servidor responde 'recharge_required': debe recargar al menos
--    US$20 (1.000 créditos comprados = 2 packs Boost o 1 Power o más). Ya recargado, paga créditos
--    como cualquier cliente. Todo se decide aquí, en el servidor; el navegador no puede saltárselo.
--
-- 2) CASHBACK: al comprar el pack de US$100 (11.000 créditos) se anota un cashback de 1.500 créditos
--    que se entrega solo cuando la persona ya gastó en la app 11.000 créditos desde la compra.
--    11.000 + 1.500 = 12.500 créditos por US$100 = US$0,008 por crédito: el piso de la regla de margen
--    (costo real × 5 con el crédito más barato). No es dinero en efectivo: son créditos.

-- ── 1. Probadores ────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.approved_emails ADD COLUMN IF NOT EXISTS tester boolean NOT NULL DEFAULT false;

-- Costo real conocido por acción (lo de los modelos de video e imagen). Si falta, se estima con la
-- regla de margen: créditos × 0,008 / 5.
ALTER TABLE public.credit_prices ADD COLUMN IF NOT EXISTS real_cost_usd numeric;
UPDATE public.credit_prices p SET real_cost_usd = m.cost_usd
FROM public.media_models m WHERE m.action = p.action AND m.cost_usd IS NOT NULL;

CREATE OR REPLACE FUNCTION private.tester_state(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'tester', EXISTS (
      SELECT 1 FROM public.approved_emails a JOIN auth.users u ON lower(u.email) = lower(a.email)
      WHERE u.id = p_user_id AND a.tester AND a.is_active),
    'spent_usd', coalesce((SELECT sum(cost_usd) FROM public.ai_usage WHERE user_id = p_user_id), 0),
    'recharged', coalesce((SELECT sum((meta->>'granted')::int) FROM public.credit_transactions
                           WHERE user_id = p_user_id AND action = 'recharge' AND label ILIKE 'Recarga %'), 0)
  );
$$;
REVOKE ALL ON FUNCTION private.tester_state(uuid) FROM PUBLIC, anon, authenticated;

-- Para la pantalla: el probador ve cuánto le queda de prueba gratis (en %, nunca en dólares).
CREATE OR REPLACE FUNCTION public.my_tester_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE s jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('tester', false); END IF;
  s := private.tester_state(auth.uid());
  IF NOT (s->>'tester')::boolean THEN RETURN jsonb_build_object('tester', false); END IF;
  RETURN jsonb_build_object(
    'tester', true,
    'recharged', (s->>'recharged')::int >= 1000,
    'free_used_pct', least(100, round((s->>'spent_usd')::numeric / 1.5 * 100))
  );
END $$;
REVOKE ALL ON FUNCTION public.my_tester_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_tester_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.edge_guard_charge(p_user_id uuid, p_fn text, p_max_hour integer, p_max_day integer, p_action text DEFAULT NULL::text, p_label text DEFAULT NULL::text, p_kind text DEFAULT NULL::text, p_receipt uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gate JSONB;
  v_price RECORD;
  v_tx RECORD;
  v_uses INT;
  v_res JSONB;
  v_balance INT;
  v_tester JSONB;
  -- Pasos que cubre un cobro de "Mi App" (gen_master_prompt), hasta 3 veces
  -- cada uno durante 2 horas: alcanza para el flujo completo y para reintentos.
  c_mi_app_kinds CONSTANT TEXT[] := ARRAY['blueprint', 'master_prompt', 'whatsapp_script', 'vsl_prompt'];
  -- Probadores: tope gratis (costo real nuestro) y recarga mínima (1.000 créditos = US$20).
  c_tester_free_usd CONSTANT NUMERIC := 1.50;
  c_tester_min_recharge CONSTANT INT := 1000;
BEGIN
  v_gate := public.edge_guard(p_user_id, p_fn, p_max_hour, p_max_day);
  IF coalesce((v_gate->>'ok')::boolean, false) = false THEN RETURN v_gate; END IF;

  IF p_action IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'charged', 0);
  END IF;

  -- ¿Trae un recibo que cubra este paso?
  IF p_receipt IS NOT NULL AND p_kind IS NOT NULL THEN
    SELECT id, action, meta INTO v_tx
    FROM public.credit_transactions
    WHERE id = p_receipt AND user_id = p_user_id AND cost > 0
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

  -- Probador sin recarga de US$20: gratis hasta US$1,50 de costo real; después, a recargar.
  v_tester := private.tester_state(p_user_id);
  IF (v_tester->>'tester')::boolean AND (v_tester->>'recharged')::int < c_tester_min_recharge THEN
    IF (v_tester->>'spent_usd')::numeric >= c_tester_free_usd
       OR coalesce(v_price.real_cost_usd, v_price.cost * 0.008 / 5) > c_tester_free_usd THEN
      SELECT balance INTO v_balance FROM public.user_credits WHERE user_id = p_user_id;
      RETURN jsonb_build_object('ok', false, 'reason', 'recharge_required', 'min_usd', 20,
                                'balance', v_balance, 'cost', v_price.cost);
    END IF;
    v_res := private.debit_credits(
      p_user_id, 0, p_action,
      coalesce(nullif(left(p_label, 120), ''), v_price.label) || ' · prueba gratis',
      jsonb_build_object('fn', p_fn, 'tester_free', true, 'list_cost', v_price.cost)
        || CASE WHEN p_kind IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('uses', jsonb_build_object(p_kind, 1)) END
    );
    RETURN jsonb_build_object('ok', true, 'charged', 0, 'balance', v_res->'balance',
                              'tx_id', v_res->'tx_id', 'receipt', v_res->'tx_id', 'tester_free', true);
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

-- ── 2. Cashback del pack de US$100 ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.credit_cashback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL UNIQUE,              -- ej. whop_pack:mega:<pago>: una vez por compra
  spend_target int NOT NULL,                -- créditos que hay que gastar desde la compra
  amount int NOT NULL,                      -- créditos que se regalan al llegar
  starts_at timestamptz NOT NULL DEFAULT now(),
  granted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_cashback_pending ON public.credit_cashback (user_id) WHERE granted_at IS NULL;
ALTER TABLE public.credit_cashback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "credit_cashback_own" ON public.credit_cashback;
CREATE POLICY "credit_cashback_own" ON public.credit_cashback FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Lo llama el webhook de Whop (service_role) al acreditar el pack.
CREATE OR REPLACE FUNCTION public.register_cashback(p_user_id uuid, p_source text, p_spend_target int, p_amount int)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.credit_cashback (user_id, source, spend_target, amount)
  VALUES (p_user_id, p_source, p_spend_target, p_amount)
  ON CONFLICT (source) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.register_cashback(uuid, text, int, int) FROM PUBLIC, anon, authenticated;

-- Cuánto lleva gastado desde la compra (lo cobrado menos lo devuelto).
CREATE OR REPLACE FUNCTION private.cashback_spent(p_user_id uuid, p_since timestamptz)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(sum(cost), 0)::int FROM public.credit_transactions
  WHERE user_id = p_user_id AND created_at >= p_since
    AND (cost > 0 AND coalesce((meta->>'refunded')::boolean, false) = false);
$$;
REVOKE ALL ON FUNCTION private.cashback_spent(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- Entrega los cashbacks que ya se ganaron (cron cada hora).
CREATE OR REPLACE FUNCTION public.grant_due_cashback()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN SELECT * FROM public.credit_cashback WHERE granted_at IS NULL FOR UPDATE SKIP LOCKED LOOP
    IF private.cashback_spent(r.user_id, r.starts_at) >= r.spend_target THEN
      UPDATE public.user_credits SET balance = balance + r.amount, updated_at = now() WHERE user_id = r.user_id;
      INSERT INTO public.credit_transactions (user_id, action, label, cost, meta)
      VALUES (r.user_id, 'cashback', 'Cashback del pack de US$100', 0, jsonb_build_object('granted', r.amount, 'cashback_id', r.id));
      UPDATE public.credit_cashback SET granted_at = now() WHERE id = r.id;
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.grant_due_cashback() FROM PUBLIC, anon, authenticated;

-- Para la pantalla de Créditos: cuánto le falta para su cashback.
CREATE OR REPLACE FUNCTION public.my_cashback()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'amount', c.amount, 'target', c.spend_target, 'granted', c.granted_at IS NOT NULL,
    'spent', least(c.spend_target, private.cashback_spent(c.user_id, c.starts_at))
  ) ORDER BY c.created_at DESC), '[]'::jsonb)
  FROM public.credit_cashback c WHERE c.user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_cashback() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_cashback() TO authenticated;

DO $$ BEGIN
  PERFORM cron.unschedule('grant-due-cashback');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('grant-due-cashback', '7 * * * *', 'SELECT public.grant_due_cashback()');

-- ── 3. La probadora real ─────────────────────────────────────────────────────────────────────────
UPDATE public.approved_emails SET tester = true WHERE lower(email) = 'hanybonaldy@gmail.com';
