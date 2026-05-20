-- ============================================
-- TABLA: Emails con acceso aprobado
-- ============================================
CREATE TABLE IF NOT EXISTS public.approved_emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  added_by UUID,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_access TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.approved_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approved_emails_admin_all"
  ON public.approved_emails
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Permitir que el propio usuario actualice su last_access
CREATE POLICY "approved_emails_self_touch"
  ON public.approved_emails
  FOR UPDATE
  TO authenticated
  USING (email = (auth.jwt() ->> 'email'))
  WITH CHECK (email = (auth.jwt() ->> 'email'));

-- ============================================
-- TABLA: Solicitudes de acceso
-- ============================================
CREATE TABLE IF NOT EXISTS public.access_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'landing',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- Cualquiera (anónimo o autenticado) puede crear solicitudes
CREATE POLICY "access_requests_anyone_insert"
  ON public.access_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (TRUE);

CREATE POLICY "access_requests_admin_select"
  ON public.access_requests
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "access_requests_admin_update"
  ON public.access_requests
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "access_requests_admin_delete"
  ON public.access_requests
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================
-- FUNCIÓN PÚBLICA: Verificar si email tiene acceso
-- (usada por el formulario de signup ANTES de crear cuenta)
-- ============================================
CREATE OR REPLACE FUNCTION public.is_email_approved(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.approved_emails
    WHERE lower(email) = lower(trim(p_email))
      AND is_active = TRUE
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_email_approved(TEXT) TO anon, authenticated;

-- ============================================
-- FUNCIÓN: Aprobar solicitud (1 clic, solo admin)
-- ============================================
CREATE OR REPLACE FUNCTION public.approve_access_request(
  p_request_id UUID,
  p_notes TEXT DEFAULT 'Aprobado desde panel admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.access_requests%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can approve access requests';
  END IF;

  SELECT * INTO v_request
  FROM public.access_requests
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitud no encontrada o ya procesada');
  END IF;

  INSERT INTO public.approved_emails (email, full_name, added_by, notes)
  VALUES (lower(trim(v_request.email)), v_request.full_name, auth.uid(), p_notes)
  ON CONFLICT (email) DO UPDATE
  SET is_active = TRUE,
      notes = COALESCE(EXCLUDED.notes, public.approved_emails.notes),
      approved_at = NOW();

  UPDATE public.access_requests
  SET status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = NOW()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true, 'email', v_request.email);
END;
$$;

-- ============================================
-- FUNCIÓN: Rechazar solicitud (solo admin)
-- ============================================
CREATE OR REPLACE FUNCTION public.reject_access_request(
  p_request_id UUID,
  p_reason TEXT DEFAULT 'No cumple los requisitos'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can reject access requests';
  END IF;

  UPDATE public.access_requests
  SET status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = NOW(),
      rejection_reason = p_reason
  WHERE id = p_request_id AND status = 'pending';

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- ============================================
-- Insertar admin fundador
-- ============================================
INSERT INTO public.approved_emails (email, full_name, notes)
VALUES ('soyjeanhenriquez@gmail.com', 'Jean Henríquez', 'Admin — fundador SUPERNOVA')
ON CONFLICT (email) DO NOTHING;

-- Realtime para solicitudes
ALTER PUBLICATION supabase_realtime ADD TABLE public.access_requests;