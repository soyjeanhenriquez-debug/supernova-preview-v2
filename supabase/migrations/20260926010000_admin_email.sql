-- SUPERNOVA — Admin → Mensajes: el dueño escribe y envía correos (uno o a grupos) desde la app.
-- · notification_prefs.marketing_email: la baja de un clic (/unsub?t=) también apaga estos correos.
-- · admin_email_recipients(segmento): la lista de destinatarios la arma el SERVIDOR (solo service_role;
--   la usa la función admin-email después de comprobar que quien pide es admin). Nunca incluye a
--   quien se dio de baja.
-- · admin_email_log: historial de envíos (sin el cuerpo de cada correo personalizado).

ALTER TABLE public.notification_prefs ADD COLUMN IF NOT EXISTS marketing_email boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.unsubscribe_digest(p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows INT;
BEGIN
  IF p_token IS NULL THEN RETURN false; END IF;
  UPDATE public.notification_prefs
  SET daily_winner_email = false, streak_reminder_email = false, marketing_email = false, updated_at = now()
  WHERE unsub_token = p_token;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

CREATE TABLE IF NOT EXISTS public.admin_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  segment text NOT NULL,
  subject text NOT NULL,
  recipients integer NOT NULL DEFAULT 0,
  sent integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_email_log ENABLE ROW LEVEL SECURITY; -- sin políticas: solo la función admin-email

CREATE OR REPLACE FUNCTION public.admin_email_recipients(p_segment text)
RETURNS TABLE (email text, name text, unsub text, kind text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'solo servidor'; END IF;
  -- Todo usuario tiene su fila de preferencias (y su token de baja) antes de recibir un correo.
  INSERT INTO public.notification_prefs (user_id, email)
  SELECT u.id, u.email FROM auth.users u
  WHERE u.email IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.notification_prefs n WHERE n.user_id = u.id)
  ON CONFLICT DO NOTHING;

  IF p_segment = 'leads' THEN
    RETURN QUERY
    SELECT lower(l.email), NULL::text, 'tl=' || l.unsub_token::text, 'lead'
    FROM public.landing_leads l
    WHERE NOT coalesce(l.unsubscribed, false)
      AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(l.email));
    RETURN;
  END IF;

  RETURN QUERY
  WITH subs AS (
    SELECT s.user_id, lower(s.email) AS email, s.plan_id, s.status, s.current_period_end FROM public.subscriptions s
  ),
  base AS (
    SELECT u.id, lower(u.email) AS email,
      coalesce(nullif(trim(p.display_name), ''), split_part(u.email, '@', 1)) AS name,
      n.unsub_token
    FROM auth.users u
    JOIN public.notification_prefs n ON n.user_id = u.id
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE u.email IS NOT NULL AND n.marketing_email
  ),
  has AS (  -- qué suscripciones tiene cada usuario (por user_id o por correo)
    SELECT b.id, s.plan_id, s.status, s.current_period_end
    FROM base b JOIN subs s ON s.user_id = b.id OR s.email = b.email
  )
  SELECT b.email, b.name, 't=' || b.unsub_token::text, 'user'
  FROM base b
  WHERE CASE p_segment
    WHEN 'todos' THEN true
    WHEN 'prueba' THEN EXISTS (SELECT 1 FROM has h WHERE h.id = b.id AND h.status = 'trialing')
    WHEN 'pagando' THEN EXISTS (SELECT 1 FROM has h WHERE h.id = b.id AND h.status IN ('active', 'past_due'))
    WHEN 'comunidad' THEN EXISTS (SELECT 1 FROM has h WHERE h.id = b.id AND h.plan_id = 'plan_oRht08inLOu39' AND h.status IN ('active', 'trialing', 'past_due'))
    WHEN 'vencen' THEN EXISTS (SELECT 1 FROM has h WHERE h.id = b.id AND h.status = 'trialing' AND h.current_period_end BETWEEN now() AND now() + interval '48 hours')
    WHEN 'sin_plan' THEN NOT EXISTS (SELECT 1 FROM has h WHERE h.id = b.id AND h.status IN ('active', 'trialing', 'past_due'))
    WHEN 'avisame' THEN EXISTS (SELECT 1 FROM public.products pr WHERE pr.user_id = b.id AND (pr.journey->'personaje'->>'avisame')::boolean IS TRUE)
    ELSE false
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_email_recipients(text) FROM PUBLIC, anon, authenticated;
