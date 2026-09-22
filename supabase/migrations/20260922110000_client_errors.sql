-- SUPERNOVA — Errores de interfaz reportados por el navegador.
--
-- El primer usuario real (Enmanuel, 22-sep) vio "Esta pantalla tuvo un problema" y no
-- hubo forma de saber qué falló: el error solo quedaba en SU consola. A partir de aquí la
-- pantalla de error manda mensaje + pila + ruta (sin query ni hash: ahí viajan tokens de
-- sesión) a esta tabla, que solo lee un admin.
CREATE TABLE IF NOT EXISTS public.client_errors (
  id         BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id    UUID,
  path       TEXT,
  message    TEXT,
  stack      TEXT,
  component  TEXT,
  user_agent TEXT
);
ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_errors_admin ON public.client_errors;
CREATE POLICY client_errors_admin ON public.client_errors FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
REVOKE ALL ON public.client_errors FROM anon, authenticated;
GRANT SELECT ON public.client_errors TO authenticated;

-- Pública (también falla gente sin sesión: registro, login). Todo recortado y con tope
-- diario global para que nadie pueda llenar la tabla.
CREATE OR REPLACE FUNCTION public.log_client_error(
  p_path TEXT, p_message TEXT, p_stack TEXT DEFAULT NULL, p_component TEXT DEFAULT NULL, p_user_agent TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.client_errors WHERE created_at > now() - interval '1 day') >= 1000 THEN RETURN; END IF;
  INSERT INTO public.client_errors (user_id, path, message, stack, component, user_agent)
  VALUES (auth.uid(), left(p_path, 200), left(p_message, 500), left(p_stack, 3000), left(p_component, 2000), left(p_user_agent, 300));
END $$;
REVOKE ALL ON FUNCTION public.log_client_error(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_client_error(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
