-- Guardián del Creador · agente probador de punta a punta (Playwright en la Mac de Jean, 25-oct-2026).
-- Cada recorrido que corre e2e/ se anota aquí con la sesión del admin: qa_agent_runs (prueba) y, si trae paso de
-- recorrido, guardian_journey con método punta_a_punta. Sin datos de usuarios: solo qué se probó y cómo salió.
CREATE OR REPLACE FUNCTION public.guardian_log_e2e(p_step text, p_ok boolean, p_ms int, p_summary text,
  p_journey text DEFAULT NULL, p_journey_step int DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'solo admin'; END IF;
  IF p_step !~ '^[A-Za-z0-9 ·áéíóúñÁÉÍÓÚÑ:/().,-]{2,80}$' THEN RAISE EXCEPTION 'paso inválido'; END IF;
  INSERT INTO public.qa_agent_runs (agent, step, attempt, ok, status, ms, charged, summary)
  VALUES ('guardian-e2e', p_step, 1, p_ok, NULL, greatest(0, least(p_ms, 3600000)), NULL, left(p_summary, 500));
  IF p_journey IS NOT NULL AND p_journey_step IS NOT NULL THEN
    UPDATE public.guardian_journey SET status = CASE WHEN p_ok THEN 'funciona' ELSE 'falla' END, method = 'punta_a_punta',
      evidence = left(format('Prueba de punta a punta del %s: %s', to_char(now() AT TIME ZONE 'America/Santo_Domingo', 'DD-MM-YYYY HH24:MI'), p_summary), 400),
      checked_at = now()
    WHERE journey = p_journey AND step_order = p_journey_step;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.guardian_log_e2e(text, boolean, int, text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_log_e2e(text, boolean, int, text, text, int) TO authenticated;
