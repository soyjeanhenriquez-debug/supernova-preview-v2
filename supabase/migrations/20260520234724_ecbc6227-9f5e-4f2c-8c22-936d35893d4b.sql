-- user_gamification table
CREATE TABLE IF NOT EXISTS public.user_gamification (
  user_id UUID PRIMARY KEY,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_login_date DATE,
  badges TEXT[] NOT NULL DEFAULT '{}',
  total_hours_saved NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_gamification ENABLE ROW LEVEL SECURITY;

CREATE POLICY ug_select_own ON public.user_gamification
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY ug_insert_own ON public.user_gamification
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY ug_update_own ON public.user_gamification
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY ug_admin_all ON public.user_gamification
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER user_gamification_updated_at
BEFORE UPDATE ON public.user_gamification
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- level lookup
CREATE OR REPLACE FUNCTION public.compute_level(p_xp INTEGER)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_xp >= 25001 THEN 9
    WHEN p_xp >= 10001 THEN 8
    WHEN p_xp >= 5001  THEN 7
    WHEN p_xp >= 2001  THEN 6
    WHEN p_xp >= 1001  THEN 5
    WHEN p_xp >= 601   THEN 4
    WHEN p_xp >= 301   THEN 3
    WHEN p_xp >= 101   THEN 2
    ELSE 1
  END
$$;

-- register daily login & streak
CREATE OR REPLACE FUNCTION public.register_daily_login()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_today DATE := CURRENT_DATE;
  v_last DATE;
  v_streak INT;
  v_broke BOOLEAN := FALSE;
  v_milestone INT := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','no auth'); END IF;

  INSERT INTO public.user_gamification (user_id, last_login_date, streak_days)
  VALUES (v_uid, v_today, 1)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT last_login_date, streak_days INTO v_last, v_streak
  FROM public.user_gamification WHERE user_id = v_uid FOR UPDATE;

  IF v_last = v_today THEN
    -- already counted today
    RETURN jsonb_build_object('streak', v_streak, 'broke', false, 'milestone', 0, 'already', true);
  ELSIF v_last = v_today - 1 THEN
    v_streak := v_streak + 1;
  ELSE
    v_broke := COALESCE(v_last < v_today - 1, false);
    v_streak := 1;
  END IF;

  IF v_streak IN (3,7,14,30,60,100) THEN
    v_milestone := v_streak;
  END IF;

  UPDATE public.user_gamification
  SET streak_days = v_streak, last_login_date = v_today, updated_at = now()
  WHERE user_id = v_uid;

  RETURN jsonb_build_object('streak', v_streak, 'broke', v_broke, 'milestone', v_milestone);
END;
$$;

-- add XP and unlock badges
CREATE OR REPLACE FUNCTION public.add_xp(p_amount INTEGER, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_xp INT; v_level INT; v_new_level INT; v_badges TEXT[];
  v_leveled BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('error','invalid');
  END IF;

  INSERT INTO public.user_gamification (user_id, xp)
  VALUES (v_uid, 0) ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.user_gamification
  SET xp = xp + p_amount, updated_at = now()
  WHERE user_id = v_uid
  RETURNING xp, level, badges INTO v_xp, v_level, v_badges;

  v_new_level := public.compute_level(v_xp);
  IF v_new_level > v_level THEN
    v_leveled := TRUE;
    UPDATE public.user_gamification SET level = v_new_level WHERE user_id = v_uid;
    IF v_new_level >= 5 AND NOT ('level_5' = ANY(v_badges)) THEN
      v_badges := v_badges || 'level_5';
    END IF;
  END IF;

  UPDATE public.user_gamification SET badges = v_badges WHERE user_id = v_uid;

  RETURN jsonb_build_object('xp', v_xp, 'level', v_new_level, 'leveled_up', v_leveled, 'badges', v_badges);
END;
$$;

-- unlock badge
CREATE OR REPLACE FUNCTION public.unlock_badge(p_badge TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid(); v_badges TEXT[]; v_new BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL OR p_badge IS NULL THEN RETURN jsonb_build_object('error','invalid'); END IF;
  INSERT INTO public.user_gamification (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT badges INTO v_badges FROM public.user_gamification WHERE user_id = v_uid FOR UPDATE;
  IF NOT (p_badge = ANY(v_badges)) THEN
    v_badges := v_badges || p_badge;
    v_new := TRUE;
    UPDATE public.user_gamification SET badges = v_badges, updated_at = now() WHERE user_id = v_uid;
  END IF;
  RETURN jsonb_build_object('badges', v_badges, 'new', v_new);
END;
$$;

-- award mission bonus credits
CREATE OR REPLACE FUNCTION public.award_mission_bonus(p_mission_date DATE, p_amount INTEGER DEFAULT 50)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_already BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error','no auth'); END IF;
  IF p_amount <= 0 OR p_amount > 100 THEN RETURN jsonb_build_object('success', false, 'error','invalid amount'); END IF;
  IF p_mission_date <> CURRENT_DATE THEN RETURN jsonb_build_object('success', false, 'error','only today'); END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE user_id = v_uid
      AND action = 'mission_bonus'
      AND created_at::date = p_mission_date
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('success', false, 'error','already_claimed');
  END IF;

  INSERT INTO public.user_credits (user_id, balance) VALUES (v_uid, p_amount)
  ON CONFLICT (user_id) DO UPDATE SET balance = public.user_credits.balance + p_amount, updated_at = now();

  INSERT INTO public.credit_transactions (user_id, action, cost, label, meta)
  VALUES (v_uid, 'mission_bonus', -p_amount, 'Misión diaria completada', jsonb_build_object('date', p_mission_date));

  RETURN jsonb_build_object('success', true, 'amount', p_amount);
END;
$$;