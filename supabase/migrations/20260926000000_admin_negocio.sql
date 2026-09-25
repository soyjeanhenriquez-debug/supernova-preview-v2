-- SUPERNOVA — Panel del dueño: "Negocio" (dinero, Comunidad, etapas, videos) y "Modelos y precios".
-- Todo SOLO para admin (mismo candado que admin_margin): has_role(auth.uid(),'admin') o service_role.
-- Solo LEE datos y cambia el estado de modelos/funciones; no toca catálogo ni precios.

-- 1. Costo real por generación en el catálogo de fal (para margen y para contar el gasto).
ALTER TABLE public.media_models ADD COLUMN IF NOT EXISTS cost_usd numeric(10, 4);
UPDATE public.media_models m SET cost_usd = v.c FROM (VALUES
  ('seedance15', 0.13), ('seedance10fast', 0.243), ('wan22', 0.40), ('wan25', 0.50), ('wan26', 0.50),
  ('kling26pro', 0.35), ('kling26pro_audio', 0.70), ('kling30', 0.42), ('veo31fast', 0.40),
  ('ltx23', 0.48), ('ltx25fast', 0.54), ('avatar_kling', 0.28), ('avatar_omnihuman', 0.80),
  ('avatar_infinitalk', 1.00), ('nanobanana', 0.039), ('nanobanana2', 0.08), ('nanobananapro', 0.15),
  ('seedream4', 0.03), ('seedream45', 0.04), ('seedream5lite', 0.035), ('seedream5pro', 0.0675),
  ('fluxdev', 0.025), ('flux11pro', 0.04), ('flux2pro', 0.03), ('fluxkontext', 0.04), ('gptimage15', 0.07)
) AS v(id, c) WHERE m.id = v.id;

-- 2. Informe de negocio.
CREATE OR REPLACE FUNCTION public.admin_business_report(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE r jsonb; v_since timestamptz := now() - make_interval(days => p_days);
BEGIN
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'solo admin';
  END IF;

  WITH s AS (
    SELECT sub.email, sub.status, sub.created_at, sub.updated_at, sub.current_period_end,
      CASE WHEN sub.plan_id = 'plan_oRht08inLOu39' THEN 'comunidad'
           WHEN sub.plan_id IN ('plan_ukBjctlEKufto', 'plan_VsWbrtokeQOLu') THEN 'pro' ELSE 'otro' END AS plan,
      CASE WHEN sub.plan_id = 'plan_oRht08inLOu39' THEN 99
           WHEN sub.plan_id IN ('plan_ukBjctlEKufto', 'plan_VsWbrtokeQOLu') THEN 29.99 ELSE 0 END AS price
    FROM public.subscriptions sub
  ),
  admins AS (SELECT user_id FROM public.user_roles WHERE role = 'admin'::public.app_role),
  prod AS (  -- productos de clientes (sin admins) y qué etapa tienen hecha (misma regla que src/lib/journey.ts)
    SELECT p.id, p.user_id,
      (length(trim(coalesce(p.product, ''))) > 2 AND length(trim(coalesce(p.who, ''))) > 2 AND length(trim(coalesce(p.promise, ''))) > 2) AS e1,
      (p.validation->>'completed_at' IS NOT NULL AND coalesce((p.validation->>'score')::numeric, 100) >= 50) AS e2,
      (p.pricing->>'chosen' IS NOT NULL) AS e3,
      (coalesce((p.journey->'done'->>'4')::boolean, false)
        OR EXISTS (SELECT 1 FROM public.product_builds b WHERE b.product_id = p.id
                   AND (b.status = 'listo' OR (b.pieces_total > 0 AND b.pieces_done >= b.pieces_total)))) AS e4,
      ((SELECT count(*) FROM public.mandala_ads a WHERE a.product_id = p.id) >= 5) AS e5,
      (EXISTS (SELECT 1 FROM public.mandala_ads a WHERE a.product_id = p.id
               AND (a.spend IS NOT NULL OR a.sales IS NOT NULL OR a.status IN ('ganador', 'descartado')))
        AND jsonb_array_length(coalesce(p.recovery->'messages', '[]'::jsonb)) > 0) AS e6
    FROM public.products p
    WHERE p.user_id NOT IN (SELECT user_id FROM admins)
  ),
  nxt AS (
    SELECT CASE WHEN NOT e1 THEN 1 WHEN NOT e2 THEN 2 WHEN NOT e3 THEN 3 WHEN NOT e4 THEN 4
                WHEN NOT e5 THEN 5 WHEN NOT e6 THEN 6 ELSE 7 END AS etapa
    FROM prod
  )
  SELECT jsonb_build_object(
    'days', p_days,
    'mrr_usd', (SELECT coalesce(sum(price), 0) FROM s WHERE status IN ('active', 'past_due')),
    'counts', (SELECT coalesce(jsonb_agg(jsonb_build_object('plan', plan, 'status', status, 'n', n)), '[]'::jsonb)
               FROM (SELECT plan, status, count(*) n FROM s GROUP BY 1, 2 ORDER BY 1, 2) x),
    'new_subs', (SELECT count(*) FROM s WHERE created_at >= v_since),
    'lost', (SELECT count(*) FROM s WHERE status IN ('canceled', 'inactive') AND updated_at >= v_since),
    -- De las pruebas que ya terminaron (empezaron hace más de 4 días) en el período: cuántas pagan hoy.
    'conversion', (SELECT jsonb_build_object('trials_done', count(*), 'paying', count(*) FILTER (WHERE status IN ('active', 'past_due')))
                   FROM s WHERE created_at >= v_since AND created_at < now() - interval '4 days'),
    'trials_ending', (SELECT coalesce(jsonb_agg(jsonb_build_object('email', email, 'plan', plan,
                        'hours', round(extract(epoch FROM current_period_end - now()) / 3600)) ORDER BY current_period_end), '[]'::jsonb)
                      FROM s WHERE status = 'trialing' AND current_period_end BETWEEN now() AND now() + interval '48 hours'),
    'comunidad', (SELECT coalesce(jsonb_agg(jsonb_build_object('email', email, 'status', status, 'since', created_at,
                    'until', current_period_end, 'changed', updated_at) ORDER BY created_at DESC), '[]'::jsonb)
                  FROM s WHERE plan = 'comunidad'),
    'stages', (SELECT jsonb_build_object(
                  'products', (SELECT count(*) FROM prod),
                  'customers', (SELECT count(DISTINCT user_id) FROM prod),
                  'at', (SELECT coalesce(jsonb_object_agg(etapa, n), '{}'::jsonb) FROM (SELECT etapa, count(*) n FROM nxt GROUP BY 1) y))),
    'video', jsonb_build_object(
      'avisame', (SELECT coalesce(jsonb_agg(DISTINCT u.email), '[]'::jsonb) FROM public.products p JOIN auth.users u ON u.id = p.user_id
                  WHERE (p.journey->'personaje'->>'avisame')::boolean IS TRUE),
      'personajes', (SELECT count(*) FROM public.products p WHERE p.journey->'personaje'->'elegido' IS NOT NULL
                     AND jsonb_typeof(p.journey->'personaje'->'elegido') = 'object'),
      'jobs', (SELECT coalesce(jsonb_object_agg(status, n), '{}'::jsonb) FROM (SELECT status, count(*) n FROM public.video_jobs WHERE created_at >= v_since GROUP BY 1) z),
      'reservations', (SELECT coalesce(jsonb_agg(jsonb_build_object('email', email, 'usd', amount_usd, 'status', status, 'at', created_at) ORDER BY created_at DESC), '[]'::jsonb)
                       FROM public.video_reservations))
  ) INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_business_report(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_business_report(integer) TO authenticated;

-- 3. Modelos y funciones: ver y cambiar su estado.
CREATE OR REPLACE FUNCTION public.admin_media_catalog()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'solo admin';
  END IF;
  RETURN jsonb_build_object(
    'models', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'kind', m.kind, 'grp', m.grp, 'label', m.label, 'tier', m.tier, 'status', m.status,
        'seconds', m.seconds, 'credits', c.cost, 'cost_usd', m.cost_usd,
        'margin', CASE WHEN m.cost_usd > 0 THEN round(c.cost * 0.008 / m.cost_usd, 1) END,
        'uses_30d', (SELECT count(*) FROM public.ai_usage a WHERE a.model = 'fal:' || m.id AND a.created_at > now() - interval '30 days'))
        ORDER BY m.kind DESC, m.sort), '[]'::jsonb)
      FROM public.media_models m JOIN public.credit_prices c ON c.action = m.action),
    'switches', (SELECT coalesce(jsonb_agg(jsonb_build_object('fn', fn, 'enabled', enabled, 'max_hour', max_hour, 'max_day', max_day, 'note', note) ORDER BY fn), '[]'::jsonb)
      FROM public.edge_limits)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_media_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_media_catalog() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_media_model(p_id text, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_old text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'solo admin'; END IF;
  IF p_status NOT IN ('admin', 'live', 'soon', 'off') THEN RAISE EXCEPTION 'estado inválido'; END IF;
  SELECT status INTO v_old FROM public.media_models WHERE id = p_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'modelo no existe'; END IF;
  UPDATE public.media_models SET status = p_status, updated_at = now() WHERE id = p_id;
  INSERT INTO public.audit_log (user_id, action, resource_type, resource_id, old_data, new_data)
  VALUES (auth.uid(), 'ADMIN_MEDIA_MODEL_STATUS', 'media_model', p_id, jsonb_build_object('status', v_old), jsonb_build_object('status', p_status));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_media_model(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_media_model(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_edge_switch(p_fn text, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_old boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'solo admin'; END IF;
  SELECT enabled INTO v_old FROM public.edge_limits WHERE fn = p_fn;
  IF v_old IS NULL THEN RAISE EXCEPTION 'función no existe'; END IF;
  UPDATE public.edge_limits SET enabled = p_enabled, updated_at = now() WHERE fn = p_fn;
  INSERT INTO public.audit_log (user_id, action, resource_type, resource_id, old_data, new_data)
  VALUES (auth.uid(), 'ADMIN_EDGE_SWITCH', 'edge_function', p_fn, jsonb_build_object('enabled', v_old), jsonb_build_object('enabled', p_enabled));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_edge_switch(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_edge_switch(text, boolean) TO authenticated;
