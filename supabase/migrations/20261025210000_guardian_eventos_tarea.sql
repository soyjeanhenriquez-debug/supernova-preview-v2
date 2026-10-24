-- =====================================================================================================
-- Guardián del Creador · eventos de tarea por herramienta (24-oct-2026)
-- Antes, tareas completadas, tiempo hasta el primer resultado, reintentos y abandono quedaban "sin medir".
-- La app manda (src/lib/toolEvents.ts) solo: herramienta, evento, hora y un id de pestaña al azar.
-- Nada de lo que la persona escribe. Solo se insertan eventos de la propia cuenta, con tope diario.
-- =====================================================================================================
CREATE TABLE IF NOT EXISTS public.tool_events (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  sid text NOT NULL,
  tool text NOT NULL,
  evento text NOT NULL CHECK (evento IN ('abrir', 'empezar', 'resultado', 'error', 'descargar')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tool_events_recent ON public.tool_events (created_at);
CREATE INDEX IF NOT EXISTS tool_events_user_day ON public.tool_events (user_id, created_at);
ALTER TABLE public.tool_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tool_events_admin_read ON public.tool_events;
CREATE POLICY tool_events_admin_read ON public.tool_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
REVOKE ALL ON public.tool_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.tool_events FROM authenticated;

CREATE OR REPLACE FUNCTION public.log_tool_events(p_events jsonb)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); n int;
BEGIN
  IF uid IS NULL OR jsonb_typeof(p_events) IS DISTINCT FROM 'array' THEN RETURN 0; END IF;
  IF (SELECT count(*) FROM public.tool_events WHERE user_id = uid AND created_at > now() - interval '1 day') > 2000 THEN RETURN 0; END IF;
  INSERT INTO public.tool_events (user_id, sid, tool, evento, created_at)
  SELECT uid, x.e->>'sid', x.e->>'tool', x.e->>'evento',
    CASE WHEN (x.e->>'at') ~ '^[0-9]{13}$' AND abs(extract(epoch FROM now()) - (x.e->>'at')::bigint / 1000.0) < 600
         THEN to_timestamp((x.e->>'at')::bigint / 1000.0) ELSE now() END
  FROM jsonb_array_elements(p_events) WITH ORDINALITY AS x(e, i)
  WHERE x.i <= 30 AND x.e->>'tool' ~ '^[a-z0-9-]{2,40}$' AND x.e->>'sid' ~ '^[a-z0-9]{8,24}$'
    AND x.e->>'evento' IN ('abrir', 'empezar', 'resultado', 'error', 'descargar');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.log_tool_events(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_tool_events(jsonb) TO authenticated;

-- Indicadores por herramienta (30 días): una fila por herramienta y pestaña.
CREATE OR REPLACE FUNCTION private.guardian_tareas()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT tool, sid,
      min(created_at) FILTER (WHERE evento = 'abrir') AS abrio,
      min(created_at) FILTER (WHERE evento = 'empezar') AS empezo,
      min(created_at) FILTER (WHERE evento = 'resultado') AS primer_resultado,
      count(*) FILTER (WHERE evento = 'empezar') AS intentos,
      count(*) FILTER (WHERE evento = 'resultado') AS resultados,
      count(*) FILTER (WHERE evento = 'error') AS errores,
      bool_or(evento = 'descargar') AS descargo
    FROM public.tool_events WHERE created_at > now() - interval '30 days'
    GROUP BY 1, 2
  ), t AS (
    SELECT tool AS herramienta,
      count(*) FILTER (WHERE abrio IS NOT NULL) AS abiertas,
      count(*) FILTER (WHERE empezo IS NOT NULL) AS empezadas,
      count(*) FILTER (WHERE resultados > 0) AS completadas,
      round(100.0 * count(*) FILTER (WHERE resultados > 0) / nullif(count(*) FILTER (WHERE empezo IS NOT NULL), 0)) AS pct_completadas,
      round((percentile_cont(0.5) WITHIN GROUP (ORDER BY greatest(0, extract(epoch FROM primer_resultado - coalesce(least(abrio, empezo), empezo))))
        FILTER (WHERE primer_resultado IS NOT NULL))::numeric) AS seg_primer_resultado,
      round(avg(intentos) FILTER (WHERE resultados > 0), 1) AS intentos_por_resultado,
      count(*) FILTER (WHERE empezo IS NOT NULL AND resultados = 0 AND errores = 0 AND empezo < now() - interval '30 minutes') AS abandonos,
      count(*) FILTER (WHERE errores > 0 AND resultados = 0) AS fallaron,
      count(*) FILTER (WHERE resultados >= 2) AS regeneraron,
      count(*) FILTER (WHERE descargo) AS descargaron
    FROM s GROUP BY tool
  )
  SELECT jsonb_build_object('por_herramienta', coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.empezadas DESC), '[]'::jsonb),
                            'empezadas', coalesce(sum(t.empezadas), 0))
  FROM t;
$$;
REVOKE ALL ON FUNCTION private.guardian_tareas() FROM PUBLIC, anon, authenticated;

-- El paso «indicadores» usa los eventos; lo que de verdad no se puede medir aún, se dice.
DO $$ DECLARE d text; n int; BEGIN
  d := pg_get_functiondef('private.guardian_step(uuid)'::regprocedure);
  n := length(d);
  d := replace(d, $q$    UPDATE public.guardian_runs SET summary = summary || jsonb_build_object('indicadores', v) WHERE id = p_run;$q$,
$q$    v := (v - 'sin_medir' - 'nota') || jsonb_build_object('tareas', private.guardian_tareas(),
      'sin_medir', jsonb_build_array('Costo por resultado satisfactorio (falta unir cada cobro con su pestaña)'),
      'nota', 'Tareas medidas desde el 24-oct-2026 en Reel Studio, Analiza un Reel, Imagen con IA, Mes de contenido, Sube tu video, Quitar marca y Mi historia animada.');
    UPDATE public.guardian_runs SET summary = summary || jsonb_build_object('indicadores', v) WHERE id = p_run;$q$);
  d := replace(d, $q$    PERFORM private.guardian_check(p_run, 'Indicadores', 'Tasa de finalización por herramienta', NULL, 'datos', 'Sin instrumentación de inicio y fin de tareas: no se puede medir todavía.');$q$,
$q$    PERFORM private.guardian_check(p_run, 'Indicadores', 'Tasa de finalización por herramienta',
      CASE WHEN coalesce((v->'tareas'->>'empezadas')::int, 0) >= 5 THEN true ELSE NULL END, 'datos',
      CASE WHEN coalesce((v->'tareas'->>'empezadas')::int, 0) >= 5
           THEN format('%s tareas empezadas en 30 días; el detalle por herramienta está en Indicadores.', v->'tareas'->>'empezadas')
           ELSE format('Medición activa desde el 24-oct-2026: %s tarea(s) empezadas todavía, muy pocas para concluir.', coalesce(v->'tareas'->>'empezadas', '0')) END);$q$);
  IF length(d) = n THEN RAISE EXCEPTION 'no se encontró el paso indicadores'; END IF;
  EXECUTE d;
END $$;

SELECT cron.schedule('tool-events-cleanup', '25 4 * * *', $$ DELETE FROM public.tool_events WHERE created_at < now() - interval '120 days'; $$);
