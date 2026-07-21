-- Media Studio (Fase 1: HeyGen) — pool de créditos separado del de texto,
-- porque el costo real (~$1 USD/min en HeyGen) es órdenes de magnitud mayor
-- al de un generador de texto con Gemini Flash. Nunca se mezcla con
-- user_credits para que quede clarísimo en la UI que son economías distintas.

CREATE TABLE public.user_media_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_media_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY umc_select_own_or_admin ON public.user_media_credits
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY umc_admin_all ON public.user_media_credits
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Nota: a diferencia de user_credits, NO hay política de INSERT para
-- "authenticated" — la fila se crea únicamente vía consume_media_credits()
-- (SECURITY DEFINER) o por un admin. El balance solo se mueve server-side.

CREATE TABLE public.media_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'heygen',
  heygen_video_id TEXT,
  script TEXT NOT NULL,
  avatar_id TEXT,
  voice_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  video_url TEXT,
  cost_media_credits INT NOT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX media_generation_jobs_user_idx ON public.media_generation_jobs (user_id, created_at DESC);
CREATE INDEX media_generation_jobs_heygen_video_id_idx ON public.media_generation_jobs (heygen_video_id) WHERE heygen_video_id IS NOT NULL;

ALTER TABLE public.media_generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY mgj_select_own_or_admin ON public.media_generation_jobs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY mgj_admin_all ON public.media_generation_jobs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Igual que la tabla de balances: solo se INSERTA/ACTUALIZA vía service_role
-- (heygen-generate-video crea el job, heygen-webhook lo actualiza al terminar).
-- Ningún cliente autenticado puede escribir directo, así que no hay política
-- de INSERT/UPDATE para "authenticated".

-- RPC de consumo, llamada por el edge function con service_role (no por el
-- cliente): recibe p_user_id explícito porque el service_role no tiene
-- auth.uid() propio. El edge function ya validó el JWT del usuario ANTES de
-- llamar esta función, así que p_user_id es de fiar en ese punto.
CREATE OR REPLACE FUNCTION public.consume_media_credits(
  p_user_id UUID, p_amount INT, p_action TEXT DEFAULT 'video_hook', p_meta JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance INT;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Monto inválido');
  END IF;

  SELECT balance INTO v_balance FROM public.user_media_credits WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_media_credits (user_id, balance) VALUES (p_user_id, 0);
    v_balance := 0;
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Saldo de Media Credits insuficiente', 'balance', v_balance);
  END IF;

  UPDATE public.user_media_credits SET balance = balance - p_amount, updated_at = now() WHERE user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'balance', v_balance - p_amount);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_media_credits(UUID, INT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_media_credits(UUID, INT, TEXT, JSONB) TO service_role;

-- RPC para acreditar packs comprados (también solo service_role — se llamará
-- desde el flujo de pago cuando esté conectado; por ahora sirve para que un
-- admin pueda acreditar manualmente mientras no hay checkout automatizado).
CREATE OR REPLACE FUNCTION public.grant_media_credits(
  p_user_id UUID, p_amount INT, p_reason TEXT DEFAULT 'manual'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance INT;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Monto inválido');
  END IF;

  INSERT INTO public.user_media_credits (user_id, balance) VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE SET balance = public.user_media_credits.balance + p_amount, updated_at = now()
  RETURNING balance INTO v_balance;

  RETURN jsonb_build_object('success', true, 'balance', v_balance);
END;
$$;
REVOKE ALL ON FUNCTION public.grant_media_credits(UUID, INT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_media_credits(UUID, INT, TEXT) TO service_role;
