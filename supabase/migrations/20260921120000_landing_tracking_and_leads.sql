-- Medición propia de la landing (sin cookies de terceros ni datos personales) y captura de correos.
CREATE TABLE IF NOT EXISTS public.landing_events (
  day    DATE NOT NULL DEFAULT current_date,
  event  TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'directo',
  n      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, source)
);
CREATE TABLE IF NOT EXISTS public.landing_leads (
  email      TEXT PRIMARY KEY,
  source     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.landing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_leads  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS landing_events_admin ON public.landing_events;
CREATE POLICY landing_events_admin ON public.landing_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS landing_leads_admin ON public.landing_leads;
CREATE POLICY landing_leads_admin ON public.landing_leads FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
REVOKE ALL ON public.landing_events, public.landing_leads FROM anon, authenticated;
GRANT SELECT ON public.landing_events, public.landing_leads TO authenticated;

-- Contadores agregados por día: solo eventos de una lista cerrada, y la fuente se limpia.
CREATE OR REPLACE FUNCTION public.landing_track(p_event TEXT, p_source TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_src TEXT := left(regexp_replace(lower(coalesce(nullif(btrim(p_source), ''), 'directo')), '[^a-z0-9_.-]', '', 'g'), 40);
BEGIN
  IF p_event NOT IN ('view', 'scroll50', 'cta_click', 'popup_shown', 'popup_closed', 'lead') THEN RETURN; END IF;
  IF v_src = '' THEN v_src := 'directo'; END IF;
  INSERT INTO public.landing_events (day, event, source, n) VALUES (current_date, p_event, v_src, 1)
  ON CONFLICT (day, event, source) DO UPDATE SET n = public.landing_events.n + 1;
END $$;

-- Correo del popup. Tope diario global para que nadie llene la tabla de basura.
CREATE OR REPLACE FUNCTION public.landing_lead(p_email TEXT, p_source TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email TEXT := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF length(v_email) > 120 OR v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN RETURN FALSE; END IF;
  IF (SELECT count(*) FROM public.landing_leads WHERE created_at > now() - interval '1 day') >= 500 THEN RETURN FALSE; END IF;
  INSERT INTO public.landing_leads (email, source) VALUES (v_email, left(coalesce(p_source, 'directo'), 40))
  ON CONFLICT (email) DO NOTHING;
  PERFORM public.landing_track('lead', p_source);
  RETURN TRUE;
END $$;

REVOKE ALL ON FUNCTION public.landing_track(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.landing_lead(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.landing_track(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.landing_lead(TEXT, TEXT) TO anon, authenticated, service_role;
