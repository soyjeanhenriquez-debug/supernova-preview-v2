-- Stripe como proveedor principal de cobro.
-- 1) subscriptions aprende de Stripe (customer id + proveedor)
-- 2) stripe_events: idempotencia del webhook (Stripe reintenta entregas)
-- 3) grant_purchased_credits: acreditar packs de créditos de texto comprados
--    (equivalente de grant_media_credits para el pool de texto)

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'whop';

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer
  ON public.subscriptions (stripe_customer_id);

-- Idempotencia: cada event.id de Stripe se procesa una sola vez.
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo service_role (bypassa RLS) puede tocarla.

CREATE OR REPLACE FUNCTION public.grant_purchased_credits(
  p_user_id UUID, p_amount INT, p_label TEXT DEFAULT 'Recarga de créditos'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance INT;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Monto inválido');
  END IF;

  INSERT INTO public.user_credits (user_id, balance) VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.user_credits.balance + p_amount, updated_at = now()
  RETURNING balance INTO v_balance;

  INSERT INTO public.credit_transactions (user_id, action, label, cost, meta)
  VALUES (p_user_id, 'recharge', p_label, 0, jsonb_build_object('granted', p_amount));

  RETURN jsonb_build_object('success', true, 'balance', v_balance);
END;
$$;

-- Mismo estándar de hardening que el resto: nadie más que service_role la invoca.
REVOKE ALL ON FUNCTION public.grant_purchased_credits(UUID, INT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_purchased_credits(UUID, INT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_purchased_credits(UUID, INT, TEXT) TO service_role;
