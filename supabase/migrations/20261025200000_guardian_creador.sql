-- =====================================================================================================
-- GUARDIÁN DEL CREADOR (24-oct-2026, pedido de Jean)
-- Política permanente: "la prioridad es que SUPERNOVA resuelva el trabajo del creador, no que le obligue
-- a aprender cómo funciona la IA". Supervisor interno, sin chat ni avisos al usuario.
--
-- Cómo trabaja (todo en el servidor, no depende de un navegador abierto):
--  · guardian_runs      cada auditoría (completa, diaria, semanal, prelanzamiento) con su avance real.
--  · guardian_checks    cada prueba que corrió: pasó / falló / no se pudo probar (ok = null) y cómo se probó.
--  · guardian_findings  cada problema con funcionalidad, problema, impacto, evidencia, propuesta, estado y
--                       verificación. Una huella (fingerprint) por problema: no se duplican.
--  · guardian_decisions historial de decisiones de Jean (aprendizaje): un hallazgo rechazado no vuelve
--                       salvo con evidencia nueva (el doble de casos, y al menos 3 más).
--  · guardian_journey   pasos de los recorridos (Reel Studio primero) con cómo se verificó cada uno.
-- Pasos de la auditoría: private.guardian_step(run). El panel (Admin → Guardián del Creador) los avanza para
-- mostrar el progreso; si se cierra la pestaña, el cron "guardian-procesar" la termina.
-- Datos: solo agregados (conteos, fechas, mensajes de error). Sin correos ni textos de los usuarios.
-- Nada de esto cambia el catálogo, los precios, los cobros ni los permisos: solo lee y anota.
-- =====================================================================================================

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS public.guardian_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('completa', 'diaria', 'semanal', 'prelanzamiento')),
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'corriendo', 'terminada', 'fallo')),
  requested_by uuid,
  run_day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz,
  steps text[] NOT NULL DEFAULT '{}',
  steps_done int NOT NULL DEFAULT 0,
  current_step text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);
-- Una auditoría a la vez (evita duplicadas y bucles) y una diaria/semanal por día.
CREATE UNIQUE INDEX IF NOT EXISTS guardian_runs_one_active ON public.guardian_runs ((true)) WHERE status IN ('pendiente', 'corriendo');
CREATE UNIQUE INDEX IF NOT EXISTS guardian_runs_daily ON public.guardian_runs (kind, run_day) WHERE kind IN ('diaria', 'semanal');
CREATE INDEX IF NOT EXISTS guardian_runs_recent ON public.guardian_runs (requested_at DESC);

CREATE TABLE IF NOT EXISTS public.guardian_checks (
  id bigserial PRIMARY KEY,
  run_id uuid REFERENCES public.guardian_runs (id) ON DELETE CASCADE,
  area text NOT NULL,
  name text NOT NULL,
  ok boolean,                                   -- null = no se pudo probar (se dice por qué en detail)
  method text NOT NULL CHECK (method IN ('servidor', 'datos', 'codigo', 'inspeccion', 'punta_a_punta')),
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guardian_checks_run ON public.guardian_checks (run_id);

CREATE TABLE IF NOT EXISTS public.guardian_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  feature text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critico', 'importante', 'mejora')),
  perspective text NOT NULL CHECK (perspective IN ('claridad', 'esfuerzo', 'inteligencia', 'calidad', 'confianza')),
  problem text NOT NULL,
  impact text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_kind text NOT NULL DEFAULT 'observado' CHECK (evidence_kind IN ('observado', 'hipotesis')),
  proposal text NOT NULL,
  fix_type text NOT NULL DEFAULT 'autonoma' CHECK (fix_type IN ('autonoma', 'requiere_ok')),
  status text NOT NULL DEFAULT 'abierto' CHECK (status IN ('abierto', 'pendiente_ok', 'aprobado', 'corregido', 'rechazado', 'resuelto')),
  verification text,
  source text NOT NULL DEFAULT 'senal' CHECK (source IN ('senal', 'auditoria', 'codigo')),
  occurrences int NOT NULL DEFAULT 1,
  occurrences_at_decision int,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  last_event_at timestamptz,
  last_run uuid,
  fixed_at timestamptz,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guardian_findings_open ON public.guardian_findings (status, severity);

CREATE TABLE IF NOT EXISTS public.guardian_decisions (
  id bigserial PRIMARY KEY,
  finding_id uuid REFERENCES public.guardian_findings (id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  decision text NOT NULL,
  note text,
  occurrences int,
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guardian_journey (
  journey text NOT NULL,
  step_order int NOT NULL,
  step text NOT NULL,
  status text NOT NULL CHECK (status IN ('funciona', 'con_friccion', 'falla', 'no_probado')),
  method text NOT NULL CHECK (method IN ('servidor', 'datos', 'codigo', 'inspeccion', 'punta_a_punta')),
  evidence text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (journey, step_order)
);

ALTER TABLE public.guardian_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_journey ENABLE ROW LEVEL SECURITY;
-- Solo lectura para admins; toda escritura pasa por las funciones de abajo.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['guardian_runs', 'guardian_checks', 'guardian_findings', 'guardian_decisions', 'guardian_journey'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''::public.app_role))', t || '_admin_read', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------------
-- Anotar una prueba y un hallazgo (con la memoria de decisiones).
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.guardian_check(p_run uuid, p_area text, p_name text, p_ok boolean, p_method text, p_detail text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.guardian_checks (run_id, area, name, ok, method, detail) VALUES (p_run, p_area, p_name, p_ok, p_method, p_detail);
$$;

CREATE OR REPLACE FUNCTION private.guardian_finding(
  p_run uuid, p_fp text, p_feature text, p_severity text, p_perspective text, p_problem text, p_impact text,
  p_evidence jsonb, p_kind text, p_proposal text, p_fix text, p_count int, p_last_event timestamptz, p_source text DEFAULT 'senal')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.guardian_findings;
BEGIN
  SELECT * INTO f FROM public.guardian_findings WHERE fingerprint = p_fp FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.guardian_findings (fingerprint, feature, severity, perspective, problem, impact, evidence, evidence_kind,
      proposal, fix_type, status, source, occurrences, last_event_at, last_run)
    VALUES (p_fp, p_feature, p_severity, p_perspective, p_problem, p_impact, coalesce(p_evidence, '{}'), p_kind, p_proposal, p_fix,
      CASE WHEN p_fix = 'requiere_ok' THEN 'pendiente_ok' ELSE 'abierto' END, p_source, greatest(p_count, 1), p_last_event, p_run);
    RETURN;
  END IF;

  -- Rechazado: no se repite salvo con evidencia nueva (el doble de casos y al menos 3 más que al decidir).
  IF f.status = 'rechazado' THEN
    IF p_count >= greatest(coalesce(f.occurrences_at_decision, 0) * 2, coalesce(f.occurrences_at_decision, 0) + 3) THEN
      UPDATE public.guardian_findings SET status = CASE WHEN p_fix = 'requiere_ok' THEN 'pendiente_ok' ELSE 'abierto' END,
        verification = format('Reabierto con evidencia nueva: %s casos ahora, %s cuando se rechazó.', p_count, f.occurrences_at_decision),
        evidence = coalesce(p_evidence, evidence), occurrences = p_count, last_seen = now(), last_event_at = p_last_event, last_run = p_run, updated_at = now()
      WHERE id = f.id;
    ELSE
      UPDATE public.guardian_findings SET occurrences = p_count, last_seen = now(), last_run = p_run WHERE id = f.id;
    END IF;
    RETURN;
  END IF;

  -- Corregido o resuelto: solo vuelve si hay casos DESPUÉS del arreglo (regresión).
  IF f.status IN ('corregido', 'resuelto') THEN
    IF p_last_event IS NOT NULL AND p_last_event > coalesce(f.fixed_at, f.decided_at, f.updated_at) THEN
      UPDATE public.guardian_findings SET status = CASE WHEN p_fix = 'requiere_ok' THEN 'pendiente_ok' ELSE 'abierto' END,
        verification = format('Volvió a pasar el %s, después del arreglo (regresión).', to_char(p_last_event AT TIME ZONE 'America/Santo_Domingo', 'DD-MM-YYYY HH24:MI')),
        severity = p_severity, evidence = coalesce(p_evidence, evidence), occurrences = p_count, last_seen = now(), last_event_at = p_last_event,
        last_run = p_run, updated_at = now()
      WHERE id = f.id;
    ELSE
      UPDATE public.guardian_findings SET last_run = p_run WHERE id = f.id;
    END IF;
    RETURN;
  END IF;

  UPDATE public.guardian_findings SET severity = p_severity, problem = p_problem, impact = p_impact, evidence = coalesce(p_evidence, evidence),
    evidence_kind = p_kind, proposal = p_proposal, occurrences = greatest(p_count, 1), last_seen = now(),
    last_event_at = coalesce(p_last_event, last_event_at), last_run = p_run, updated_at = now()
  WHERE id = f.id;
END $$;

-- ---------------------------------------------------------------------------------------------------
-- Los pasos. Cada uno lee poco (tablas chicas o filtradas por fecha) para caber en el límite de 8 s.
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.guardian_steps_for(p_kind text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_kind
    WHEN 'diaria' THEN ARRAY['pantallazos', 'cobros_sin_resultado', 'reembolsos', 'repeticiones', 'atascados', 'tareas', 'opiniones', 'cerrar']
    WHEN 'prelanzamiento' THEN ARRAY['cobros_sin_resultado', 'precios', 'seguridad', 'cerrar']
    ELSE ARRAY['pantallazos', 'cobros_sin_resultado', 'reembolsos', 'repeticiones', 'atascados', 'tareas', 'opiniones',
               'precios', 'seguridad', 'reel_studio', 'pruebas_funcionales', 'indicadores', 'cerrar']
  END;
$$;

CREATE OR REPLACE FUNCTION private.guardian_step(p_run uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  r public.guardian_runs;
  st text;
  x record;
  n int;
  v jsonb;
BEGIN
  SELECT * INTO r FROM public.guardian_runs WHERE id = p_run FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN jsonb_build_object('busy', true); END IF;
  IF r.status IN ('terminada', 'fallo') THEN RETURN jsonb_build_object('status', r.status, 'done', r.steps_done, 'total', cardinality(r.steps)); END IF;
  IF r.status = 'pendiente' THEN
    UPDATE public.guardian_runs SET status = 'corriendo', started_at = now() WHERE id = p_run;
  END IF;
  st := r.steps[r.steps_done + 1];
  UPDATE public.guardian_runs SET current_step = st, heartbeat_at = now() WHERE id = p_run;

  BEGIN
  -- 1) Pantallazos: errores que vieron las personas (7 días). Los de versión vieja se recargan solos.
  IF st = 'pantallazos' THEN
    FOR x IN
      SELECT left(regexp_replace(e.message, '[0-9]+', 'N', 'g'), 110) AS msg, count(*) AS c, count(DISTINCT coalesce(e.user_id::text, e.user_agent)) AS u,
             max(e.created_at) AS last, mode() WITHIN GROUP (ORDER BY e.path) AS path,
             mode() WITHIN GROUP (ORDER BY substring(e.component FROM 'assets/([A-Za-z]+)-')) AS pantalla
      FROM public.client_errors e
      WHERE e.created_at > now() - interval '7 days'
        AND NOT e.message ~* 'dynamically imported module|Importing a module script failed|ChunkLoadError|Failed to fetch dynamically|Unable to preload CSS|reading .default.|reading .[A-Z][A-Za-z]+Page.'
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10
    LOOP
      PERFORM private.guardian_finding(p_run, 'error:' || md5(x.msg), coalesce(x.pantalla, x.path, 'App'),
        CASE WHEN x.u >= 3 THEN 'critico' WHEN x.c >= 2 THEN 'importante' ELSE 'mejora' END, 'calidad',
        'La pantalla se cae con un error: ' || x.msg,
        format('%s veces, %s persona(s), en %s. Quien lo ve pierde lo que estaba haciendo.', x.c, x.u, coalesce(x.pantalla, x.path)),
        jsonb_build_object('veces', x.c, 'personas', x.u, 'ultima', x.last, 'ruta', x.path, 'pantalla', x.pantalla, 'fuente', 'client_errors (7 días)'),
        'observado', 'Abrir la pantalla con el mismo dato, encontrar el campo que llega mal y pintarlo como texto (o capturar el error con un mensaje claro).',
        'autonoma', x.c::int, x.last);
    END LOOP;
    SELECT count(*) INTO n FROM public.client_errors WHERE created_at > now() - interval '7 days';
    PERFORM private.guardian_check(p_run, 'Calidad', 'Errores en pantalla (7 días)', n = 0, 'datos', format('%s errores registrados en 7 días.', n));

  -- 2) Cobros sin resultado: trabajo pagado que falló y no se devolvió (CRÍTICO).
  ELSIF st = 'cobros_sin_resultado' THEN
    SELECT count(*) INTO n FROM (
      SELECT j.id FROM public.video_jobs j
      WHERE j.status = 'failed' AND coalesce(j.credits_charged, 0) > 0 AND j.created_at > now() - interval '30 days'
        AND NOT EXISTS (SELECT 1 FROM public.credit_transactions c WHERE c.action = 'refund' AND c.meta->>'refund_of' = j.credit_tx_id::text)
    ) j;
    IF n > 0 THEN
      PERFORM private.guardian_finding(p_run, 'cobro-sin-resultado:video_jobs', 'Videos con IA', 'critico', 'confianza',
        'Videos que fallaron, se cobraron y no se devolvieron.',
        format('%s video(s) en 30 días: la persona pagó y no recibió nada.', n),
        jsonb_build_object('casos', n, 'fuente', 'video_jobs fallidos sin reembolso (refund_of)'), 'observado',
        'Revisar cada caso, devolver los créditos con refund_charge y corregir el camino que no reembolsa.', 'requiere_ok', n,
        (SELECT max(updated_at) FROM public.video_jobs WHERE status = 'failed' AND created_at > now() - interval '30 days'));
    END IF;
    PERFORM private.guardian_check(p_run, 'Cobros', 'Videos fallidos siempre se devuelven (30 días)', n = 0, 'datos', format('%s video(s) fallidos sin reembolso.', n));
    SELECT count(*) INTO n FROM public.media_generation_jobs
      WHERE status = 'failed' AND coalesce(cost_media_credits, 0) > 0 AND refunded_at IS NULL AND coalesce(dry_run, false) = false AND created_at > now() - interval '30 days';
    IF n > 0 THEN
      PERFORM private.guardian_finding(p_run, 'cobro-sin-resultado:media_jobs', 'Videos con avatar', 'critico', 'confianza',
        'Videos con avatar que fallaron y no devolvieron los Media Credits.', format('%s caso(s) en 30 días.', n),
        jsonb_build_object('casos', n, 'fuente', 'media_generation_jobs'), 'observado', 'Devolver los Media Credits y revisar el webhook de estado.', 'requiere_ok', n, now());
    END IF;
    PERFORM private.guardian_check(p_run, 'Cobros', 'Videos con avatar fallidos se devuelven (30 días)', n = 0, 'datos', format('%s caso(s) sin devolver.', n));

  -- 3) Reembolsos: generaciones pagadas que no produjeron nada (se devolvió, pero la persona se quedó sin resultado).
  ELSIF st = 'reembolsos' THEN
    FOR x IN
      SELECT t.*, (SELECT jsonb_object_agg(m.k, m.cnt) FROM (SELECT coalesce(c2.meta->>'reason', 'sin motivo') AS k, count(*) AS cnt
                FROM public.credit_transactions c2 WHERE c2.action = 'refund' AND c2.created_at > now() - interval '7 days'
                AND split_part(c2.label, ' · ', 2) = t.tool GROUP BY 1) m) AS reasons
      FROM (SELECT split_part(c.label, ' · ', 2) AS tool, count(*) AS c, count(DISTINCT c.user_id) AS u, max(c.created_at) AS last
            FROM public.credit_transactions c WHERE c.action = 'refund' AND c.created_at > now() - interval '7 days'
            GROUP BY 1 HAVING count(*) >= 2 ORDER BY 2 DESC LIMIT 8) t
    LOOP
      PERFORM private.guardian_finding(p_run, 'reembolsos:' || md5(x.tool), coalesce(nullif(x.tool, ''), 'Herramienta'),
        CASE WHEN x.c >= 3 THEN 'importante' ELSE 'mejora' END, 'calidad',
        format('«%s» falló y devolvió los créditos %s veces en 7 días.', x.tool, x.c),
        format('%s persona(s) se quedaron sin resultado aunque no perdieron créditos.', x.u),
        jsonb_build_object('reembolsos', x.c, 'personas', x.u, 'motivos', x.reasons, 'ultima', x.last, 'fuente', 'credit_transactions action=refund (7 días)'),
        'observado', 'Atacar el motivo más frecuente (proveedor lento, tope de gasto, error de la IA) y avisar antes de cobrar si el proveedor no está disponible.',
        'autonoma', x.c::int, x.last);
    END LOOP;
    SELECT count(*) INTO n FROM public.credit_transactions WHERE action = 'refund' AND created_at > now() - interval '7 days';
    PERFORM private.guardian_check(p_run, 'Calidad', 'Generaciones pagadas que fallan (7 días)', n < 3, 'datos', format('%s reembolso(s) automáticos en 7 días.', n));

  -- 4) Repeticiones: la misma acción pagada 4+ veces en una hora por la misma persona (hipótesis: el resultado no sirvió).
  ELSIF st = 'repeticiones' THEN
    FOR x IN
      SELECT b.action, coalesce(max(p.label), b.action) AS label, count(*) AS bursts, count(DISTINCT b.user_id) AS u, max(b.h) AS last
      FROM (SELECT user_id, action, date_trunc('hour', created_at) h FROM public.credit_transactions
            WHERE cost > 0 AND action NOT IN ('search_ads', 'refund') AND created_at > now() - interval '30 days'
            GROUP BY 1, 2, 3 HAVING count(*) >= 4) b
      LEFT JOIN public.credit_prices p ON p.action = b.action
      GROUP BY 1 HAVING count(*) >= 2 ORDER BY 3 DESC LIMIT 8
    LOOP
      PERFORM private.guardian_finding(p_run, 'repite:' || x.action, x.label, 'importante', 'esfuerzo',
        format('«%s» se repite 4 o más veces en una hora (%s veces en 30 días).', x.label, x.bursts),
        format('%s persona(s). Puede ser uso normal (variaciones) o que el primer resultado no sirvió.', x.u),
        jsonb_build_object('rafagas', x.bursts, 'personas', x.u, 'ultima', x.last, 'fuente', 'credit_transactions (30 días)'),
        'hipotesis', 'Mirar las grabaciones de PostHog de esas sesiones antes de cambiar nada. Si es por resultados malos: mejorar el primer resultado o dejar ajustar sin regenerar todo.',
        'autonoma', x.bursts::int, x.last);
    END LOOP;
    -- Búsquedas en vivo masivas (cobradas): suele ser el descubrimiento automático.
    FOR x IN
      SELECT c.user_id, count(*) AS c, max(c.created_at) AS last, public.has_role(c.user_id, 'admin'::public.app_role) AS adm
      FROM public.credit_transactions c WHERE c.action = 'search_ads' AND c.created_at > now() - interval '30 days'
      GROUP BY 1 HAVING count(*) >= 150
    LOOP
      PERFORM private.guardian_finding(p_run, 'busquedas-automaticas:' || CASE WHEN x.adm THEN 'admin' ELSE 'cliente' END, 'Radar · búsqueda en vivo',
        CASE WHEN x.adm THEN 'importante' ELSE 'critico' END, 'confianza',
        format('%s búsquedas en vivo cobradas en 30 días a una sola cuenta (%s).', x.c, CASE WHEN x.adm THEN 'admin' ELSE 'cliente' END),
        CASE WHEN x.adm THEN 'El descubrimiento automático del Radar (solo admin) corre cada 5 minutos con la página abierta: cobra 5 créditos por búsqueda y gasta la cuota de Meta que comparte toda la app.'
             ELSE 'Un cliente pagó búsquedas que probablemente no pidió.' END,
        jsonb_build_object('busquedas', x.c, 'creditos', x.c * 5, 'ultima', x.last, 'fuente', 'credit_transactions action=search_ads', 'codigo', 'src/pages/WinningAdsPage.tsx:602'),
        'observado', 'Que el descubrimiento automático no cobre a la cuenta admin o que corra solo al pulsar un botón; el catálogo ya lo llena el cron. Toca el recolector de datos: necesita el OK de Jean.',
        'requiere_ok', x.c::int, x.last);
    END LOOP;
    PERFORM private.guardian_check(p_run, 'Esfuerzo', 'Acciones repetidas por la misma persona (30 días)', true, 'datos', 'Revisado: se anotan como hipótesis, no como fallas.');

  -- 5) Trabajos atascados: "trabajando" para siempre confunde (¿terminó o no?).
  ELSIF st = 'atascados' THEN
    SELECT count(*) INTO n FROM public.video_jobs WHERE status NOT IN ('done', 'failed') AND created_at < now() - interval '1 hour' AND created_at > now() - interval '30 days';
    IF n > 0 THEN
      PERFORM private.guardian_finding(p_run, 'atascados:video_jobs', 'Videos con IA', 'importante', 'confianza',
        format('%s video(s) llevan más de una hora "en proceso".', n), 'La persona no sabe si terminó, si falló o si le van a devolver los créditos.',
        jsonb_build_object('casos', n, 'fuente', 'video_jobs (30 días)'), 'observado',
        'Cerrar como fallido a la hora con reembolso automático y avisar en pantalla.', 'requiere_ok', n, now());
    END IF;
    PERFORM private.guardian_check(p_run, 'Confianza', 'Videos que se quedan "en proceso" más de 1 hora', n = 0, 'datos', format('%s caso(s).', n));

  -- 6) Tareas automáticas fallidas (24 h).
  ELSIF st = 'tareas' THEN
    n := 0;
    FOR x IN
      SELECT j.jobname, count(*) AS fails, left(max(d.return_message), 140) AS sample, max(d.start_time) AS last
      FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
      WHERE d.status <> 'succeeded' AND d.start_time > now() - interval '24 hours' GROUP BY 1
    LOOP
      n := n + 1;
      PERFORM private.guardian_finding(p_run, 'cron:' || x.jobname, 'Tarea automática · ' || x.jobname, 'importante', 'calidad',
        format('La tarea automática «%s» falló %s vez/veces en 24 h.', x.jobname, x.fails), 'Si alimenta datos o correos, la persona ve información vieja o no recibe avisos.',
        jsonb_build_object('fallos', x.fails, 'mensaje', x.sample, 'ultima', x.last, 'fuente', 'cron.job_run_details'), 'observado',
        CASE WHEN x.jobname ~ '(offer|seed|rotate|enrich|score|radar|curate|hooks|kit|market)' THEN 'Leer el mensaje y revisar la función en un Postgres local. Es el pipeline de datos: necesita el OK de Jean.'
             ELSE 'Leer el mensaje, corregir la función y volver a correrla.' END,
        CASE WHEN x.jobname ~ '(offer|seed|rotate|enrich|score|radar|curate|hooks|kit|market)' THEN 'requiere_ok' ELSE 'autonoma' END, x.fails::int, x.last);
    END LOOP;
    PERFORM private.guardian_check(p_run, 'Calidad', 'Tareas automáticas (24 h)', n = 0, 'servidor', format('%s tarea(s) con fallos.', n));

  -- 7) Opiniones "no me sirvió".
  ELSIF st = 'opiniones' THEN
    FOR x IN
      SELECT tool, count(*) FILTER (WHERE NOT helpful) AS no, count(*) AS total, max(created_at) AS last
      FROM public.creation_feedback WHERE created_at > now() - interval '30 days' GROUP BY 1 HAVING count(*) FILTER (WHERE NOT helpful) >= 1
    LOOP
      PERFORM private.guardian_finding(p_run, 'opinion-no:' || x.tool, x.tool, CASE WHEN x.no >= 2 THEN 'importante' ELSE 'mejora' END, 'calidad',
        format('%s de %s personas dijeron que «%s» no les sirvió (30 días).', x.no, x.total, x.tool), 'Resultado que no se usa = créditos y tiempo perdidos.',
        jsonb_build_object('no', x.no, 'total', x.total, 'ultima', x.last, 'fuente', 'creation_feedback (Admin → Aprendizaje)'), 'observado',
        'Leer las notas en Admin → Aprendizaje y corregir lo que se repite.', 'autonoma', x.no::int, x.last);
    END LOOP;
    SELECT count(*) INTO n FROM public.creation_feedback WHERE created_at > now() - interval '30 days';
    PERFORM private.guardian_check(p_run, 'Calidad', 'Opiniones de las personas (30 días)', NULL, 'datos',
      format('%s opinión(es) en 30 días: muy pocas para concluir. Falta pedir la opinión en más herramientas.', n));

  -- 8) Precios: nunca por debajo de costo × 5 (piso 3×) con el crédito más barato (US$0,008).
  ELSIF st = 'precios' THEN
    n := 0;
    FOR x IN SELECT action, label, cost, real_cost_usd FROM public.credit_prices WHERE real_cost_usd > 0 AND cost * 0.008 < real_cost_usd * 5 LOOP
      n := n + 1;
      PERFORM private.guardian_finding(p_run, 'precio:' || x.action, coalesce(x.label, x.action), CASE WHEN x.cost * 0.008 < x.real_cost_usd * 3 THEN 'critico' ELSE 'importante' END, 'confianza',
        format('«%s» cobra %s créditos y su costo real es US$%s: margen de %s×.', coalesce(x.label, x.action), x.cost, x.real_cost_usd, round(x.cost * 0.008 / x.real_cost_usd, 1)),
        'Por debajo de la regla de costo × 5 (piso 3×). Primero se optimiza el costo del proveedor; el precio lo decide Jean.',
        jsonb_build_object('creditos', x.cost, 'costo_real_usd', x.real_cost_usd, 'fuente', 'credit_prices'), 'observado',
        'Optimizar el proveedor (caché, modelo más barato, lotes). Si no alcanza, que Jean decida el precio.', 'requiere_ok', 1, now());
    END LOOP;
    PERFORM private.guardian_check(p_run, 'Cobros', 'Precios ≥ costo real × 5', n = 0, 'datos', format('%s precio(s) por debajo de la regla.', n));
    SELECT count(DISTINCT c.action) INTO n FROM public.credit_transactions c
      WHERE c.cost > 0 AND c.action <> 'refund' AND c.created_at > now() - interval '30 days' AND NOT EXISTS (SELECT 1 FROM public.credit_prices p WHERE p.action = c.action);
    IF n > 0 THEN
      PERFORM private.guardian_finding(p_run, 'precio-sin-registro', 'Cobros', 'importante', 'confianza',
        format('%s acción(es) cobradas en 30 días no están en la tabla de precios.', n), 'Su margen no se vigila y el precio no se puede revisar desde Admin → Modelos y precios.',
        jsonb_build_object('acciones', (SELECT jsonb_agg(DISTINCT c.action) FROM public.credit_transactions c WHERE c.cost > 0 AND c.action <> 'refund' AND c.created_at > now() - interval '30 days'
          AND NOT EXISTS (SELECT 1 FROM public.credit_prices p WHERE p.action = c.action)), 'fuente', 'credit_transactions vs credit_prices'), 'observado',
        'Registrar esas acciones en credit_prices con su costo real (sin cambiar lo que se cobra).', 'requiere_ok', n, now());
    END IF;
    PERFORM private.guardian_check(p_run, 'Cobros', 'Todo lo cobrado tiene precio registrado', n = 0, 'datos', format('%s acción(es) sin registro.', n));
    SELECT count(*) INTO n FROM public.credit_prices WHERE real_cost_usd IS NULL;
    PERFORM private.guardian_check(p_run, 'Cobros', 'Precios con costo real medido', NULL, 'datos', format('%s precio(s) sin costo real medido: su margen no se puede comprobar.', n));

  -- 9) Seguridad básica del esquema público.
  ELSIF st = 'seguridad' THEN
    SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace WHERE s.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
    IF n > 0 THEN
      PERFORM private.guardian_finding(p_run, 'seguridad:sin-rls', 'Seguridad', 'critico', 'confianza', format('%s tabla(s) públicas sin RLS.', n),
        'Cualquiera con la llave pública podría leerlas o escribirlas.',
        jsonb_build_object('tablas', (SELECT jsonb_agg(c.relname) FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace WHERE s.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity)),
        'observado', 'Activar RLS con su política.', 'requiere_ok', n, now());
    END IF;
    PERFORM private.guardian_check(p_run, 'Seguridad', 'Todas las tablas públicas con RLS', n = 0, 'servidor', format('%s tabla(s) sin RLS.', n));
    SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
      WHERE s.nspname = 'public' AND p.prosecdef AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%');
    IF n > 0 THEN
      PERFORM private.guardian_finding(p_run, 'seguridad:definer-sin-search-path', 'Seguridad', 'importante', 'confianza',
        format('%s función(es) SECURITY DEFINER sin search_path fijo.', n), 'El manual pide search_path fijo en todas.',
        jsonb_build_object('funciones', (SELECT jsonb_agg(p.proname) FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
          WHERE s.nspname = 'public' AND p.prosecdef AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%'))),
        'observado', 'Fijar search_path en cada una (ALTER FUNCTION … SET search_path = public).', 'requiere_ok', n, now());
    END IF;
    PERFORM private.guardian_check(p_run, 'Seguridad', 'Funciones con privilegios tienen search_path fijo', n = 0, 'servidor', format('%s sin search_path.', n));

  -- 10) Reel Studio (primer caso): lo que el servidor sí puede comprobar del recorrido.
  ELSIF st = 'reel_studio' THEN
    PERFORM private.guardian_check(p_run, 'Reel Studio', 'Mi identidad se guarda en el servidor (subir la foto una sola vez)',
      to_regclass('public.reel_identidad') IS NOT NULL, 'servidor', CASE WHEN to_regclass('public.reel_identidad') IS NOT NULL THEN 'Existe reel_identidad.' ELSE 'Falta reel_identidad.' END);
    PERFORM private.guardian_check(p_run, 'Reel Studio', 'Biblioteca de clips guardada en el servidor',
      EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'biblioteca'), 'servidor', 'Bucket «biblioteca».');
    PERFORM private.guardian_check(p_run, 'Reel Studio', 'Plantillas y borradores guardados en el servidor',
      to_regclass('public.reel_plantillas') IS NOT NULL AND to_regclass('public.reel_borradores') IS NOT NULL, 'servidor', 'reel_plantillas y reel_borradores.');
    SELECT count(*) INTO n FROM public.credit_transactions WHERE label LIKE 'Reel Studio%' AND created_at > now() - interval '30 days';
    PERFORM private.guardian_check(p_run, 'Reel Studio', 'Uso real en 30 días', NULL, 'datos',
      format('%s cobro(s) con etiqueta «Reel Studio». Hoy es solo de la cuenta de Jean: no hay datos de clientes.', n));
    SELECT count(*) INTO n FROM public.guardian_journey WHERE journey = 'Reel Studio' AND method = 'punta_a_punta' AND status = 'funciona';
    PERFORM private.guardian_check(p_run, 'Reel Studio', 'Recorrido de punta a punta (pegar referencia → descargar)', CASE WHEN n > 0 THEN true ELSE NULL END, 'punta_a_punta',
      CASE WHEN n > 0 THEN format('%s paso(s) probados de punta a punta.', n)
           ELSE 'No probado: la herramienta es solo de la cuenta de Jean y el Guardián no inicia sesión por él. Ver los pasos en «Recorridos».' END);

  -- 11) Pruebas funcionales automáticas (agente probador).
  ELSIF st = 'pruebas_funcionales' THEN
    SELECT count(*) INTO n FROM public.qa_agent_runs WHERE created_at > now() - interval '7 days';
    PERFORM private.guardian_check(p_run, 'Pruebas', 'Agente probador corrió en los últimos 7 días', CASE WHEN n > 0 THEN true ELSE NULL END, 'punta_a_punta',
      CASE WHEN n > 0 THEN format('%s prueba(s) en 7 días.', n) ELSE 'No hay pruebas del agente probador (qa_agent_runs vacío): nadie está probando los flujos como cliente.' END);
    IF n = 0 THEN
      PERFORM private.guardian_finding(p_run, 'pruebas:sin-agente-probador', 'Pruebas de punta a punta', 'importante', 'calidad',
        'Ningún flujo se prueba de punta a punta de forma automática.', 'Un cambio puede romper una herramienta pagada sin que nadie lo note hasta que un cliente se queja.',
        jsonb_build_object('qa_agent_runs_7d', 0, 'cuenta_probadora', 'hany.agente@supernova.jeanhenriquez.com'), 'observado',
        'Activar el agente probador (cuenta probadora ya creada) con 3 recorridos fijos: analizar un reel, crear una imagen, crear un carrusel.', 'requiere_ok', 1, now(), 'auditoria');
    END IF;

  -- 12) Indicadores por herramienta: solo los que tienen instrumentación real.
  ELSIF st = 'indicadores' THEN
    SELECT jsonb_build_object(
      'ventana', '30 días',
      'por_herramienta', coalesce((SELECT jsonb_agg(t ORDER BY t.cobros DESC) FROM (
        SELECT coalesce(p.label, c.action) AS herramienta, count(*) AS cobros, count(DISTINCT c.user_id) AS personas,
          (SELECT count(*) FROM public.credit_transactions rf WHERE rf.action = 'refund' AND rf.created_at > now() - interval '30 days'
             AND rf.meta->>'refund_of' IN (SELECT c3.id::text FROM public.credit_transactions c3 WHERE c3.action = c.action AND c3.created_at > now() - interval '30 days')) AS reembolsos
        FROM public.credit_transactions c LEFT JOIN public.credit_prices p ON p.action = c.action
        WHERE c.cost > 0 AND c.action NOT IN ('refund') AND c.created_at > now() - interval '30 days'
        GROUP BY coalesce(p.label, c.action), c.action ORDER BY 2 DESC LIMIT 15) t), '[]'::jsonb),
      'sin_medir', jsonb_build_array('Porcentaje de tareas completadas', 'Tiempo hasta el primer resultado útil', 'Acciones necesarias por tarea',
        'Abandono en pasos críticos', 'Producciones que se regeneran', 'Costo por resultado satisfactorio'),
      'nota', 'Lo de "sin_medir" necesita eventos de inicio y fin por herramienta (PostHog o tabla propia). No se inventan cifras.'
    ) INTO v;
    UPDATE public.guardian_runs SET summary = summary || jsonb_build_object('indicadores', v) WHERE id = p_run;
    PERFORM private.guardian_check(p_run, 'Indicadores', 'Tasa de finalización por herramienta', NULL, 'datos', 'Sin instrumentación de inicio y fin de tareas: no se puede medir todavía.');

  -- Cierre: lo que ya no aparece se da por resuelto (solo señales automáticas) y se resume.
  ELSIF st = 'cerrar' THEN
    IF r.kind IN ('completa', 'semanal', 'diaria') THEN
      UPDATE public.guardian_findings SET status = 'resuelto', fixed_at = now(), updated_at = now(),
        verification = format('La señal no apareció en la auditoría %s del %s.', r.kind, to_char(now() AT TIME ZONE 'America/Santo_Domingo', 'DD-MM-YYYY'))
      WHERE source = 'senal' AND status IN ('abierto', 'pendiente_ok') AND coalesce(last_run, '00000000-0000-0000-0000-000000000000'::uuid) <> p_run
        -- Si un paso falló en esta corrida, sus señales no se refrescaron: no se da nada por resuelto.
        AND NOT EXISTS (SELECT 1 FROM public.guardian_checks g WHERE g.run_id = p_run AND g.area = 'Guardián' AND g.ok = false)
        AND (fingerprint LIKE ANY (CASE r.kind WHEN 'diaria'
              THEN ARRAY['error:%', 'cobro-sin-resultado:%', 'reembolsos:%', 'repite:%', 'busquedas-automaticas:%', 'atascados:%', 'cron:%', 'opinion-no:%']
              ELSE ARRAY['%'] END));
    END IF;
    SELECT jsonb_build_object(
      'abiertos', jsonb_build_object(
        'critico', count(*) FILTER (WHERE severity = 'critico' AND status IN ('abierto', 'pendiente_ok', 'aprobado')),
        'importante', count(*) FILTER (WHERE severity = 'importante' AND status IN ('abierto', 'pendiente_ok', 'aprobado')),
        'mejora', count(*) FILTER (WHERE severity = 'mejora' AND status IN ('abierto', 'pendiente_ok', 'aprobado'))),
      'pendientes_ok', count(*) FILTER (WHERE status = 'pendiente_ok'),
      'corregidos', count(*) FILTER (WHERE status IN ('corregido', 'resuelto')))
    INTO v FROM public.guardian_findings;
    UPDATE public.guardian_runs SET summary = summary || v || jsonb_build_object('pruebas', (
      SELECT jsonb_build_object('pasaron', count(*) FILTER (WHERE ok), 'fallaron', count(*) FILTER (WHERE ok = false), 'sin_probar', count(*) FILTER (WHERE ok IS NULL))
      FROM public.guardian_checks WHERE run_id = p_run))
    WHERE id = p_run;
  END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Un paso que falla no tumba la auditoría: queda anotado como prueba fallida del propio Guardián.
    PERFORM private.guardian_check(p_run, 'Guardián', 'Paso «' || st || '»', false, 'servidor', left('No se pudo ejecutar: ' || SQLERRM, 300));
  END;

  UPDATE public.guardian_runs SET steps_done = steps_done + 1, heartbeat_at = now(),
    status = CASE WHEN steps_done + 1 >= cardinality(steps) THEN 'terminada' ELSE 'corriendo' END,
    finished_at = CASE WHEN steps_done + 1 >= cardinality(steps) THEN now() END,
    current_step = CASE WHEN steps_done + 1 >= cardinality(steps) THEN NULL ELSE steps[steps_done + 2] END
  WHERE id = p_run RETURNING * INTO r;
  RETURN jsonb_build_object('status', r.status, 'done', r.steps_done, 'total', cardinality(r.steps), 'step', r.current_step);
END $$;

-- ---------------------------------------------------------------------------------------------------
-- Encolar y procesar (cron). Sin navegador: el cron termina lo que el panel dejó a medias.
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.guardian_enqueue(p_kind text, p_by uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.guardian_runs (kind, requested_by, steps) VALUES (p_kind, p_by, private.guardian_steps_for(p_kind))
  ON CONFLICT DO NOTHING RETURNING guardian_runs.id INTO v_id;
  RETURN v_id;  -- null si ya hay una corriendo o la del día ya existe
END $$;

CREATE OR REPLACE FUNCTION private.guardian_process()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_run uuid; res jsonb; k int := 0;
BEGIN
  -- Corridas que nadie está avanzando: pendientes o sin latido hace 3 minutos (se cerró el panel).
  SELECT g.id INTO v_run FROM public.guardian_runs g
   WHERE g.status = 'pendiente' OR (g.status = 'corriendo' AND coalesce(g.heartbeat_at, g.started_at) < now() - interval '3 minutes')
   ORDER BY g.requested_at LIMIT 1;
  IF v_run IS NULL THEN RETURN 0; END IF;
  LOOP
    res := private.guardian_step(v_run);
    k := k + 1;
    EXIT WHEN res->>'status' IN ('terminada', 'fallo') OR res ? 'busy' OR k > 30;
  END LOOP;
  RETURN k;
END $$;

-- Lo que llama el panel (solo admin).
CREATE OR REPLACE FUNCTION public.guardian_request_audit(p_kind text DEFAULT 'completa')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_id uuid; act public.guardian_runs;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'solo admin'; END IF;
  IF p_kind NOT IN ('completa', 'prelanzamiento') THEN RAISE EXCEPTION 'tipo no válido'; END IF;
  v_id := private.guardian_enqueue(p_kind, auth.uid());
  IF v_id IS NULL THEN
    SELECT * INTO act FROM public.guardian_runs WHERE status IN ('pendiente', 'corriendo') LIMIT 1;
    RETURN jsonb_build_object('run_id', act.id, 'ya_corriendo', true);
  END IF;
  RETURN jsonb_build_object('run_id', v_id, 'ya_corriendo', false);
END $$;

CREATE OR REPLACE FUNCTION public.guardian_advance(p_run uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'solo admin'; END IF;
  RETURN private.guardian_step(p_run);
END $$;

-- Decisión de Jean sobre un hallazgo: aprobar, rechazar, marcar corregido o reabrir. Queda en el historial.
CREATE OR REPLACE FUNCTION public.guardian_decide(p_finding uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.guardian_findings;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'solo admin'; END IF;
  IF p_decision NOT IN ('aprobado', 'rechazado', 'corregido', 'abierto') THEN RAISE EXCEPTION 'decisión no válida'; END IF;
  SELECT * INTO f FROM public.guardian_findings WHERE id = p_finding FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no existe'; END IF;
  UPDATE public.guardian_findings SET status = p_decision, decided_by = auth.uid(), decided_at = now(), decision_note = left(p_note, 500),
    occurrences_at_decision = occurrences, fixed_at = CASE WHEN p_decision = 'corregido' THEN now() ELSE fixed_at END, updated_at = now()
  WHERE id = p_finding;
  INSERT INTO public.guardian_decisions (finding_id, fingerprint, decision, note, occurrences, decided_by)
  VALUES (p_finding, f.fingerprint, p_decision, left(p_note, 500), f.occurrences, auth.uid());
END $$;

REVOKE ALL ON FUNCTION public.guardian_request_audit(text), public.guardian_advance(uuid), public.guardian_decide(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_request_audit(text), public.guardian_advance(uuid), public.guardian_decide(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION private.guardian_check(uuid, text, text, boolean, text, text),
  private.guardian_finding(uuid, text, text, text, text, text, text, jsonb, text, text, text, int, timestamptz, text),
  private.guardian_step(uuid), private.guardian_enqueue(text, uuid), private.guardian_process() FROM PUBLIC, anon, authenticated;

-- Tareas programadas: diaria (señales), semanal (todo) y el procesador cada 5 minutos (barato si no hay nada).
SELECT cron.schedule('guardian-diaria', '20 10 * * *', $$ SELECT private.guardian_enqueue('diaria'); $$);
SELECT cron.schedule('guardian-semanal', '10 11 * * 1', $$ SELECT private.guardian_enqueue('semanal'); $$);
SELECT cron.schedule('guardian-procesar', '*/5 * * * *', $$ SELECT private.guardian_process(); $$);
