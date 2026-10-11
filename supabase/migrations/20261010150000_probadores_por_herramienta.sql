-- Probadores (10-oct-2026): los 3 usos gratis se cuentan por HERRAMIENTA, no por tipo de cobro.
-- Antes ganchos, carrusel, guion UGC y WhatsApp compartían gen_light y entre todos tenían 3 usos.
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
  v_used INT;
  v_tool TEXT;
  c_mi_app_kinds CONSTANT TEXT[] := ARRAY['blueprint', 'master_prompt', 'whatsapp_script', 'vsl_prompt'];
  c_tester_free_uses CONSTANT INT := 3;         -- usos gratis por acción
  c_tester_max_action_usd CONSTANT NUMERIC := 1.00; -- acción más cara que esto: recarga desde la 1.ª
  c_tester_total_usd CONSTANT NUMERIC := 5.00;  -- tope de seguridad del total
  c_tester_min_recharge CONSTANT INT := 1000;   -- 1.000 créditos comprados = US$20
BEGIN
  v_gate := public.edge_guard(p_user_id, p_fn, p_max_hour, p_max_day);
  IF coalesce((v_gate->>'ok')::boolean, false) = false THEN RETURN v_gate; END IF;

  IF p_action IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'charged', 0);
  END IF;

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

  v_tester := private.tester_state(p_user_id);
  IF (v_tester->>'tester')::boolean AND (v_tester->>'recharged')::int < c_tester_min_recharge THEN
    -- Los usos se cuentan por HERRAMIENTA: cada generador de ai-chat por su nombre (todos comparten
    -- la acción gen_light/medium/heavy); el resto, por función.
    v_tool := CASE WHEN p_fn = 'ai-chat' THEN coalesce(nullif(left(p_label, 120), ''), p_fn) ELSE p_fn END;
    SELECT count(*) INTO v_used FROM public.credit_transactions
    WHERE user_id = p_user_id AND action = p_action
      AND coalesce((meta->>'tester_free')::boolean, false)
      AND coalesce(meta->>'tool', meta->>'fn') = v_tool
      AND coalesce((meta->>'refunded')::boolean, false) = false;
    IF v_used >= c_tester_free_uses
       OR coalesce(v_price.real_cost_usd, v_price.cost * 0.008 / 5) > c_tester_max_action_usd
       OR (v_tester->>'spent_usd')::numeric >= c_tester_total_usd THEN
      SELECT balance INTO v_balance FROM public.user_credits WHERE user_id = p_user_id;
      RETURN jsonb_build_object('ok', false, 'reason', 'recharge_required', 'min_usd', 20,
                                'used', v_used, 'free_uses', c_tester_free_uses,
                                'balance', v_balance, 'cost', v_price.cost);
    END IF;
    v_res := private.debit_credits(
      p_user_id, 0, p_action,
      coalesce(nullif(left(p_label, 120), ''), v_price.label) || ' · prueba gratis ' || (v_used + 1) || ' de ' || c_tester_free_uses,
      jsonb_build_object('fn', p_fn, 'tool', v_tool, 'tester_free', true, 'list_cost', v_price.cost)
        || CASE WHEN p_kind IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('uses', jsonb_build_object(p_kind, 1)) END
    );
    RETURN jsonb_build_object('ok', true, 'charged', 0, 'balance', v_res->'balance',
                              'tx_id', v_res->'tx_id', 'receipt', v_res->'tx_id', 'tester_free', true,
                              'free_left', c_tester_free_uses - v_used - 1);
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

