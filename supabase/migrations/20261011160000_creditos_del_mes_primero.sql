-- Orden de gasto como Higgsfield (decisión de Jean, 11-oct-2026): primero los créditos del plan (del
-- mes) y después los comprados. Los comprados (packs y cashback) no caducan; los del mes se renuevan
-- con tope de 3.000 (manual). Antes había un solo saldo y la pantalla adivinaba la mitad comprada.
--
-- user_credits.balance sigue siendo el TOTAL (todo lo demás lo lee igual). purchased = parte comprada
-- dentro de ese total; del mes = balance - purchased.

ALTER TABLE public.user_credits ADD COLUMN IF NOT EXISTS purchased integer NOT NULL DEFAULT 0;

-- Nunca negativos ni más que el total (los descuentos de admin o bonos anulados bajan el total).
CREATE OR REPLACE FUNCTION private.clamp_purchased() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.purchased := greatest(0, least(coalesce(NEW.purchased, 0), coalesce(NEW.balance, 0)));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS user_credits_clamp_purchased ON public.user_credits;
CREATE TRIGGER user_credits_clamp_purchased BEFORE INSERT OR UPDATE ON public.user_credits
  FOR EACH ROW EXECUTE FUNCTION private.clamp_purchased();

-- Lo que ya compraron (packs + cashback), hasta su saldo actual.
UPDATE public.user_credits uc SET purchased = least(uc.balance, g.bought)
FROM (SELECT user_id, sum(coalesce((meta->>'granted')::int, 0)) AS bought
      FROM public.credit_transactions WHERE action IN ('recharge', 'cashback') GROUP BY user_id) g
WHERE g.user_id = uc.user_id;

-- Cobro: primero del mes, después de lo comprado. Se anota cuánto salió de lo comprado para devolverlo igual.
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
  INSERT INTO public.user_credits (user_id, balance) VALUES (p_user_id, 2000) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance, purchased INTO v_balance, v_purchased FROM public.user_credits WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente', 'balance', v_balance, 'cost', p_amount);
  END IF;
  -- Del mes = balance - purchased. Lo que no alcance del mes sale de lo comprado.
  v_from_purchased := greatest(0, p_amount - (v_balance - v_purchased));
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

-- Reembolso: vuelve al mismo saldo del que salió.
CREATE OR REPLACE FUNCTION public.refund_charge(p_tx_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tx RECORD;
  v_balance INT;
  v_back_purchased INT;
BEGIN
  SELECT id, user_id, action, cost, label, meta INTO v_tx
  FROM public.credit_transactions
  WHERE id = p_tx_id AND created_at > now() - interval '1 hour'
    AND (cost > 0 OR coalesce((meta->>'tester_free')::boolean, false))
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF coalesce((v_tx.meta->>'refunded')::boolean, false) THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  UPDATE public.credit_transactions SET meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('refunded', true)
  WHERE id = v_tx.id;
  IF v_tx.cost = 0 THEN
    SELECT balance INTO v_balance FROM public.user_credits WHERE user_id = v_tx.user_id;
    RETURN jsonb_build_object('ok', true, 'refunded', 0, 'balance', v_balance);
  END IF;
  v_back_purchased := least(v_tx.cost, coalesce((v_tx.meta->>'from_purchased')::int, 0));
  UPDATE public.user_credits
     SET balance = balance + v_tx.cost, purchased = purchased + v_back_purchased, updated_at = now()
   WHERE user_id = v_tx.user_id RETURNING balance INTO v_balance;
  INSERT INTO public.credit_transactions (user_id, action, cost, label, meta)
  VALUES (v_tx.user_id, 'refund', -v_tx.cost, 'Reembolso · ' || coalesce(v_tx.label, v_tx.action),
          jsonb_build_object('refund_of', v_tx.id, 'reason', left(coalesce(p_reason, ''), 200)));
  RETURN jsonb_build_object('ok', true, 'refunded', v_tx.cost, 'balance', v_balance);
END;
$function$;

-- Compras (packs de Whop): van a lo comprado.
CREATE OR REPLACE FUNCTION public.grant_purchased_credits(p_user_id uuid, p_amount integer, p_label text DEFAULT 'Recarga de créditos'::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_balance INT;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Monto inválido');
  END IF;
  INSERT INTO public.user_credits (user_id, balance, purchased) VALUES (p_user_id, p_amount, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.user_credits.balance + p_amount,
        purchased = public.user_credits.purchased + p_amount, updated_at = now()
  RETURNING balance INTO v_balance;
  INSERT INTO public.credit_transactions (user_id, action, label, cost, meta)
  VALUES (p_user_id, 'recharge', p_label, 0, jsonb_build_object('granted', p_amount));
  RETURN jsonb_build_object('success', true, 'balance', v_balance);
END;
$function$;

-- Cashback de un pack: también es comprado (no caduca).
CREATE OR REPLACE FUNCTION public.grant_due_cashback()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN SELECT * FROM public.credit_cashback WHERE granted_at IS NULL FOR UPDATE SKIP LOCKED LOOP
    IF private.cashback_spent(r.user_id, r.starts_at) >= r.spend_target THEN
      UPDATE public.user_credits SET balance = balance + r.amount, purchased = purchased + r.amount, updated_at = now() WHERE user_id = r.user_id;
      INSERT INTO public.credit_transactions (user_id, action, label, cost, meta)
      VALUES (r.user_id, 'cashback', 'Cashback de tu pack', 0, jsonb_build_object('granted', r.amount, 'cashback_id', r.id));
      UPDATE public.credit_cashback SET granted_at = now() WHERE id = r.id;
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END
$function$;

-- Renovación mensual: solo se renueva la parte del mes (tope 3.000); lo comprado no se toca.
CREATE OR REPLACE FUNCTION public.grant_monthly_if_due()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_last timestamptz; v_grant int; v_balance int; v_purchased int; v_month int; v_new_month int;
  c_cap constant int := 3000;
begin
  if v_uid is null then return jsonb_build_object('granted', false); end if;
  if not public.has_access() then return jsonb_build_object('granted', false); end if;

  select last_grant_at, monthly_grant, balance, purchased into v_last, v_grant, v_balance, v_purchased
  from public.user_credits where user_id = v_uid for update;
  if not found then
    insert into public.user_credits (user_id, balance, monthly_grant, last_grant_at)
    values (v_uid, 2000, 2000, now()) on conflict (user_id) do nothing;
    return jsonb_build_object('granted', true, 'amount', 2000);
  end if;

  if v_last < now() - interval '30 days' then
    v_month := v_balance - v_purchased;
    v_new_month := least(v_month + v_grant, greatest(c_cap, v_month));
    update public.user_credits
    set balance = v_new_month + v_purchased, last_grant_at = now(), updated_at = now()
    where user_id = v_uid;
    return jsonb_build_object('granted', true, 'amount', v_new_month - v_month, 'cap', c_cap);
  end if;

  return jsonb_build_object('granted', false);
end $function$;

-- El navegador lee su propia fila (RLS existente) e incluye purchased para mostrar el desglose real.
