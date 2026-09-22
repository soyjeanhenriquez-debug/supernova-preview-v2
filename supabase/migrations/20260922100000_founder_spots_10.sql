-- El techo baja de 20 a 10: con 20 el contador real no se movía visiblemente durante días
-- (0 suscripciones en 48h con el alcance actual). Sigue siendo el mismo conteo real de
-- suscripciones trialing/active desde el 21-sep, solo que ahora el número tiene sentido
-- con el volumen de gente al que Jean le está escribiendo esta semana.
CREATE OR REPLACE FUNCTION public.founder_spots()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total', 10,
    'used', LEAST(10, count(*)),
    'left', GREATEST(0, 10 - count(*))
  )
  FROM public.subscriptions
  WHERE created_at >= '2026-09-21T00:00:00-04:00'
    AND status IN ('trialing', 'active');
$$;
