-- Gamificación estilo Duolingo: la racha diaria paga créditos reales.
-- Hitos: 3 días → +30 ⚡ · 7 → +70 · 14 → +140 · 30 → +300 · 60 → +600 · 100 → +1000
-- Idempotente: cada hito se paga una sola vez por racha (registrado en credit_transactions).
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
  v_reward INT := 0;
  v_already_paid BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','no auth'); END IF;

  INSERT INTO public.user_gamification (user_id, last_login_date, streak_days)
  VALUES (v_uid, v_today, 1)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT last_login_date, streak_days INTO v_last, v_streak
  FROM public.user_gamification WHERE user_id = v_uid FOR UPDATE;

  IF v_last = v_today THEN
    RETURN jsonb_build_object('streak', v_streak, 'broke', false, 'milestone', 0, 'reward', 0, 'already', true);
  ELSIF v_last = v_today - 1 THEN
    v_streak := v_streak + 1;
  ELSE
    v_broke := COALESCE(v_last < v_today - 1, false);
    v_streak := 1;
  END IF;

  IF v_streak IN (3,7,14,30,60,100) THEN
    v_milestone := v_streak;
    v_reward := v_streak * 10;

    SELECT EXISTS (
      SELECT 1 FROM public.credit_transactions
      WHERE user_id = v_uid AND action = 'streak_reward'
        AND (meta->>'milestone')::int = v_milestone
        AND created_at > now() - (v_streak || ' days')::interval
    ) INTO v_already_paid;

    IF NOT v_already_paid THEN
      UPDATE public.user_credits
      SET balance = balance + v_reward, updated_at = now()
      WHERE user_id = v_uid;

      INSERT INTO public.credit_transactions (user_id, action, cost, label, meta)
      VALUES (v_uid, 'streak_reward', -v_reward,
              'Racha de ' || v_milestone || ' días 🔥',
              jsonb_build_object('milestone', v_milestone));
    ELSE
      v_reward := 0;
    END IF;
  END IF;

  UPDATE public.user_gamification
  SET streak_days = v_streak, last_login_date = v_today, updated_at = now()
  WHERE user_id = v_uid;

  RETURN jsonb_build_object('streak', v_streak, 'broke', v_broke, 'milestone', v_milestone, 'reward', v_reward);
END;
$$;
REVOKE ALL ON FUNCTION public.register_daily_login() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_daily_login() TO authenticated, service_role;
