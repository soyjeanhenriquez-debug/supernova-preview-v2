-- Cupos de fundador que quedan: 20 menos las suscripciones REALES que han entrado desde que
-- abrió la campaña (21-sep-2026) y siguen vivas (en prueba o activas). Público a propósito:
-- la landing enseña un número verdadero, no un contador de mentira. Solo devuelve números.
CREATE OR REPLACE FUNCTION public.founder_spots()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total', 20,
    'used', LEAST(20, count(*)),
    'left', GREATEST(0, 20 - count(*))
  )
  FROM public.subscriptions
  WHERE created_at >= '2026-09-21T00:00:00-04:00'
    AND status IN ('trialing', 'active');
$$;
REVOKE ALL ON FUNCTION public.founder_spots() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.founder_spots() TO anon, authenticated, service_role;
