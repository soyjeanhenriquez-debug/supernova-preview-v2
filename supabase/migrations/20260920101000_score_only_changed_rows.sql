-- SUPERNOVA — La puntuación horaria deja de reescribir la tabla entera.
--
-- score_unscored_ads() (cron, cada hora) hacía UPDATE sobre los 79 000 anuncios SIN
-- WHERE: cada hora se reescribía toda la tabla aunque no cambiara nada (1,9 millones de
-- filas muertas al día). Es de donde salía la hinchazón (206 MB para ~70 MB de datos),
-- el disco ocupado y parte de la lentitud del Radar.
-- Misma fórmula, mismos resultados: ahora solo se tocan las filas cuyo valor cambia
-- (los días suben una vez al día, no 24).

CREATE OR REPLACE FUNCTION public.score_unscored_ads()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_updated INTEGER;
BEGIN
  -- 1) refrescar la señal de escala real (ads activos por anunciante)
  PERFORM public.recompute_advertiser_scale();

  -- 2) re-puntuar con la fórmula unificada, solo donde el resultado cambia
  WITH calc AS (
    SELECT w.id,
           GREATEST(1, COALESCE(EXTRACT(DAY FROM now() - w.delivery_start_time)::int, w.days_active, 1)) AS d,
           COALESCE(w.duplicate_count, 1) AS dup
    FROM public.winning_ads w
  ),
  scored AS (
    SELECT id, d,
           -- longevidad (0-50): 60 días = tope  +  escala del anunciante (0-50): 30+ ads = tope
           LEAST(100, GREATEST(1, LEAST(50, d * 50 / 60) + LEAST(50, dup * 50 / 30))) AS s
    FROM calc
  ),
  upd AS (
    UPDATE public.winning_ads w
    SET days_active  = s.d,
        winner_score = s.s,
        tier = CASE WHEN s.s >= 75 THEN 'mega' WHEN s.s >= 50 THEN 'rising' ELSE 'solid' END
    FROM scored s
    WHERE w.id = s.id
      AND (w.days_active  IS DISTINCT FROM s.d
        OR w.winner_score IS DISTINCT FROM s.s
        OR w.tier IS DISTINCT FROM (CASE WHEN s.s >= 75 THEN 'mega' WHEN s.s >= 50 THEN 'rising' ELSE 'solid' END))
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM upd;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.score_unscored_ads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.score_unscored_ads() TO service_role;
