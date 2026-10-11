-- Probadores (11-oct-2026, ronda 2 de Hany): la ventana de "mismo clic" (3 min) solo vale para herramientas
-- que hacen varias piezas por clic. En las de una pieza ("Mejorar esta oferta") dejaba usos ilimitados, y el
-- conteo de usos anteriores también las agrupaba. Se aplica sobre la definición vigente de edge_guard_charge.
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.edge_guard_charge'::regproc);
  d := replace(d,
    'IF v_last IS NOT NULL AND now() - v_last <= interval ''3 minutes'' THEN',
    'IF v_last IS NOT NULL AND now() - v_last <= interval ''3 minutes''
       AND p_fn IN (''generate-ad-creative'', ''video-studio'', ''yt-produce'', ''image-generate'', ''video-generate'', ''carousel-slide-model'') THEN');
  d := replace(d,
    'count(*) FILTER (WHERE prev IS NULL OR created_at - prev > interval ''3 minutes'')',
    'count(*) FILTER (WHERE prev IS NULL OR created_at - prev > interval ''3 minutes''
             OR p_fn NOT IN (''generate-ad-creative'', ''video-studio'', ''yt-produce'', ''image-generate'', ''video-generate'', ''carousel-slide-model''))');
  EXECUTE d;
END $$;
