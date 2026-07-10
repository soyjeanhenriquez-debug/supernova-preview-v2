-- Suscripciones sincronizadas desde Whop vía webhook
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  whop_membership_id TEXT,
  plan_id TEXT,
  status TEXT NOT NULL DEFAULT 'inactive'
    CHECK (status IN ('active','trialing','past_due','canceled','inactive')),
  current_period_end TIMESTAMPTZ,
  raw JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subs_select_own_or_admin ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR email = lower(auth.jwt() ->> 'email')
    OR public.has_role(auth.uid(),'admin')
  );

CREATE POLICY subs_service_all ON public.subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Helper para gating de features: ¿el usuario actual tiene plan activo?
CREATE OR REPLACE FUNCTION public.has_active_subscription()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE (user_id = auth.uid() OR email = lower(auth.jwt() ->> 'email'))
      AND status IN ('active','trialing')
  );
$$;
GRANT EXECUTE ON FUNCTION public.has_active_subscription() TO authenticated;

-- Lookup de user_id por email (solo service_role; usado por el webhook)
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email TEXT)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(trim(p_email)) LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_user_id_by_email(TEXT) FROM PUBLIC, anon, authenticated;
