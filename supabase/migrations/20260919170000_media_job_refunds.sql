-- SUPERNOVA — Media Studio: reembolso automático de Media Credits.
--
-- Antes, si HeyGen rechazaba o fallaba un video, el usuario perdía sus Media
-- Credits y el reembolso era manual (grant_media_credits desde el panel). Con
-- la migración a la API v3 el servidor consulta el estado REAL del video en
-- HeyGen, así que puede devolver el saldo solo y una única vez.

ALTER TABLE public.media_generation_jobs
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

COMMENT ON COLUMN public.media_generation_jobs.refunded_at IS
  'Cuándo se devolvieron los Media Credits de este job (NULL = no reembolsado). Lo escribe refund_media_job().';

-- Devuelve los Media Credits de un job que no produjo video. Idempotente: el
-- bloqueo de fila + refunded_at garantizan un solo reembolso aunque lleguen a la
-- vez el webhook, el sondeo del cliente y un reintento.
CREATE OR REPLACE FUNCTION public.refund_media_job(p_job_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.media_generation_jobs%ROWTYPE;
  v_res JSONB;
BEGIN
  SELECT * INTO v_job FROM public.media_generation_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_not_found');
  END IF;
  IF v_job.refunded_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;
  -- Un video entregado no se reembolsa (ni por un evento de fallo tardío o falso).
  IF v_job.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_completed');
  END IF;

  IF COALESCE(v_job.cost_media_credits, 0) > 0 THEN
    v_res := public.grant_media_credits(
      v_job.user_id, v_job.cost_media_credits,
      'Reembolso: ' || COALESCE(NULLIF(left(p_reason, 120), ''), 'video no generado'));
    IF COALESCE((v_res ->> 'success')::boolean, false) IS NOT TRUE THEN
      RETURN jsonb_build_object('success', false, 'error', 'grant_failed');
    END IF;
  END IF;

  UPDATE public.media_generation_jobs
     SET refunded_at = now(), updated_at = now()
   WHERE id = p_job_id;

  RETURN jsonb_build_object('success', true, 'refunded', COALESCE(v_job.cost_media_credits, 0),
                            'balance', v_res -> 'balance');
END;
$$;

REVOKE ALL ON FUNCTION public.refund_media_job(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_media_job(UUID, TEXT) TO service_role;
