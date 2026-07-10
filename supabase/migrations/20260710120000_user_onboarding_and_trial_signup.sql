-- Onboarding quiz: nivel de expertise para adaptar la app y medir uso
CREATE TABLE IF NOT EXISTS public.user_onboarding (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  experience_level TEXT,
  runs_ads TEXT,
  sells_what TEXT,
  main_goal TEXT,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY uo_select_own_or_admin ON public.user_onboarding
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE POLICY uo_insert_own ON public.user_onboarding
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY uo_update_own ON public.user_onboarding
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- handle_new_user: además de profile y créditos, si el signup viene del
-- funnel de trial (metadata signup_source='trial'), guarda el quiz y
-- auto-aprueba el email para que RequireAccess lo deje entrar.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_quiz JSONB := NEW.raw_user_meta_data -> 'onboarding';
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'display_name')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_credits (user_id, balance, monthly_grant, last_grant_at)
  VALUES (NEW.id, 2000, 2000, now())
  ON CONFLICT (user_id) DO NOTHING;

  IF NEW.raw_user_meta_data ->> 'signup_source' = 'trial' THEN
    INSERT INTO public.user_onboarding (user_id, experience_level, runs_ads, sells_what, main_goal, answers)
    VALUES (
      NEW.id,
      v_quiz ->> 'experience_level',
      v_quiz ->> 'runs_ads',
      v_quiz ->> 'sells_what',
      v_quiz ->> 'main_goal',
      COALESCE(v_quiz, '{}'::jsonb)
    )
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.approved_emails (email, full_name, notes)
    VALUES (lower(NEW.email), NEW.raw_user_meta_data ->> 'display_name', 'Trial self-serve signup')
    ON CONFLICT (email) DO UPDATE SET is_active = TRUE;
  END IF;

  RETURN NEW;
END;
$$;
