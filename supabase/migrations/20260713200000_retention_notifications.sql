-- Preferencias de notificación (canal-agnóstico) + digest diario cron.
CREATE TABLE IF NOT EXISTS public.notification_prefs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  daily_winner_email BOOLEAN NOT NULL DEFAULT true,
  streak_reminder_email BOOLEAN NOT NULL DEFAULT true,
  whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false,
  whatsapp_phone TEXT,
  unsub_token UUID NOT NULL DEFAULT gen_random_uuid(),
  last_digest_sent DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY np_select_own ON public.notification_prefs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY np_update_own ON public.notification_prefs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY np_service_all ON public.notification_prefs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS notification_prefs_updated_at ON public.notification_prefs;
CREATE TRIGGER notification_prefs_updated_at BEFORE UPDATE ON public.notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- handle_new_user siembra prefs (opt-in email por defecto)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_quiz JSONB := NEW.raw_user_meta_data -> 'onboarding';
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'display_name') ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_credits (user_id, balance, monthly_grant, last_grant_at)
  VALUES (NEW.id, 2000, 2000, now()) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.notification_prefs (user_id, email)
  VALUES (NEW.id, lower(NEW.email)) ON CONFLICT (user_id) DO NOTHING;
  IF NEW.raw_user_meta_data ->> 'signup_source' = 'trial' THEN
    INSERT INTO public.user_onboarding (user_id, experience_level, runs_ads, sells_what, main_goal, answers)
    VALUES (NEW.id, v_quiz ->> 'experience_level', v_quiz ->> 'runs_ads',
            v_quiz ->> 'sells_what', v_quiz ->> 'main_goal', COALESCE(v_quiz, '{}'::jsonb))
    ON CONFLICT (user_id) DO NOTHING;
    INSERT INTO public.approved_emails (email, full_name, notes)
    VALUES (lower(NEW.email), NEW.raw_user_meta_data ->> 'display_name', 'Trial self-serve signup')
    ON CONFLICT (email) DO UPDATE SET is_active = TRUE;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

INSERT INTO public.notification_prefs (user_id, email)
SELECT id, lower(email) FROM auth.users ON CONFLICT (user_id) DO NOTHING;

-- Cron: digest diario 13:00 UTC (llama edge function send-daily-digest)
-- SELECT cron.schedule('supernova-daily-digest','0 13 * * *', $$ ... net.http_post ... $$);
