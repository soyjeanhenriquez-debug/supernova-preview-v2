-- SUPERNOVA — R2-10 (12-oct-2026): "Prueba 9 de 10". SIN APLICAR: la aplica Jean (o quien él diga).
--
-- Para qué: medir la prueba de verdad de la misión 10 (docs/agentes/2026-10-11-mision-10-juez.md):
-- 10 personas reales en prueba de 3 días. Metas: 9 usan "Mi versión", 5 pagan el día 4, 3 recargan
-- en 30 días. Admin → Prueba 9 de 10 (src/pages/admin/AdminPrueba9de10.tsx) lee esta RPC.
--
-- Qué hace: SOLO LEE tablas propias y chicas (landing_visitors, auth.users, user_roles,
-- approved_emails, user_age_country, credit_transactions, creation_feedback, subscriptions).
-- No toca winning_ads ni el catálogo, no escribe nada, no cambia precios.
--
-- Quién cuenta: cuentas creadas en los últimos p_days días (hora de RD), SIN admins y SIN probadores
-- (approved_emails.tester). Cada persona se cuenta una vez, en el día en que creó su cuenta
-- (cohorte): así "9 de 10" se lee directo. Las visitas y clics de la portada van por día de visita.
--
-- Pasos y de dónde sale cada uno (lo que el servidor sabe con certeza):
--   visitas        landing_visitors.first_seen               (visitante único de la portada)
--   clic_prueba    landing_visitors.cta_clicks > 0           (tocó el botón principal)
--   cuentas        auth.users.created_at                     (sin admins ni probadores)
--   entraron       user_age_country (la app SIEMPRE pide edad y país al entrar: es "abrió la app");
--                  para cuentas de antes del 07-oct, haber usado algo que cobra (o cuesta 0)
--   mi_version     credit_transactions.action = 'gen_master_prompt' (winner-blueprint / Mi versión)
--   pieza          imagen (gen_ad_image*, img_*), carrusel (clone_carousel, model_slide, texto de
--                  carrusel "Generador: Carrusel…"), video (vid_*, avatar_*, motion_ad, gen_avatar)
--   sirvio         creation_feedback.helpful = true (cualquier herramienta menos la pregunta semanal)
--   prueba         tiene fila en subscriptions (Whop la crea al empezar la prueba de 3 días)
--   pagaron        subscriptions.status active/past_due y la prueba empezó hace 3 días o más
--                  (APROXIMADO: subscriptions guarda solo el último estado; quien pagó y canceló
--                  después sale como "canceló". Ver el reporte R2-10, decisión 2.)
--   recargaron     credit_transactions.action = 'recharge' con label "Recarga…" (packs de Whop),
--                  sin la recarga interna de pruebas, dentro de 30 días desde la cuenta.
--
-- Seguridad: SECURITY DEFINER con search_path vacío; la primera línea exige admin (o service_role).
-- EXECUTE solo para authenticated (la comprobación de admin va dentro), nunca para anon.

CREATE OR REPLACE FUNCTION public.admin_prueba_9de10(p_days integer DEFAULT 21)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r jsonb;
  v_days  integer := least(greatest(coalesce(p_days, 21), 1), 90);
  v_today date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_since date;
  v_from  timestamptz;
BEGIN
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'solo admin';
  END IF;
  v_since := v_today - (v_days - 1);
  v_from  := v_since::timestamp AT TIME ZONE 'America/Santo_Domingo';

  WITH dias AS (
    SELECT generate_series(v_since, v_today, interval '1 day')::date AS d   -- máx. 90 filas
  ),
  excl AS (
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'::public.app_role
    UNION
    SELECT u.id FROM auth.users u JOIN public.approved_emails a ON lower(a.email) = lower(u.email) WHERE a.tester
  ),
  gente AS (
    SELECT u.id, u.email, u.created_at, (u.created_at AT TIME ZONE 'America/Santo_Domingo')::date AS d
    FROM auth.users u
    WHERE u.created_at >= v_from
      AND NOT EXISTS (SELECT 1 FROM excl e WHERE e.user_id = u.id)
  ),
  persona AS (
    SELECT g.id, g.email, g.d, g.created_at,
      -- Desde el 07-oct la app pide edad y país al entrar; antes de eso, usar algo = entró.
      (EXISTS (SELECT 1 FROM public.user_age_country c WHERE c.user_id = g.id)
        OR EXISTS (SELECT 1 FROM public.credit_transactions t
                   WHERE t.user_id = g.id AND t.action NOT IN ('recharge', 'refund', 'cashback'))) AS entro,
      (SELECT min(t.created_at) FROM public.credit_transactions t
        WHERE t.user_id = g.id AND t.action = 'gen_master_prompt') AS mi_version_at,
      (SELECT min(t.created_at) FROM public.credit_transactions t
        WHERE t.user_id = g.id AND (
          t.action LIKE 'gen\_ad\_image%' OR t.action LIKE 'img\_%' OR t.action LIKE 'vid\_%' OR t.action LIKE 'avatar\_%'
          OR t.action IN ('clone_carousel', 'model_slide', 'motion_ad', 'gen_avatar')
          OR (t.action IN ('gen_light', 'gen_medium') AND t.label ILIKE 'Generador: Carrusel%'))) AS pieza_at,
      EXISTS (SELECT 1 FROM public.creation_feedback f
        WHERE f.user_id = g.id AND f.helpful AND f.tool <> 'resultados') AS sirvio,
      s.status AS sub_status, s.created_at AS sub_at,
      (SELECT min(t.created_at) FROM public.credit_transactions t
        WHERE t.user_id = g.id AND t.action = 'recharge' AND t.label ILIKE 'Recarga%' AND t.label NOT ILIKE '%interna%'
          AND coalesce(t.meta->>'granted', '') ~ '^[0-9]+$' AND (t.meta->>'granted')::integer > 0
          AND t.created_at <= g.created_at + interval '30 days') AS recarga_at
    FROM gente g
    LEFT JOIN LATERAL (
      SELECT sub.status, sub.created_at FROM public.subscriptions sub
      WHERE sub.user_id = g.id OR lower(sub.email) = lower(g.email)
      ORDER BY sub.updated_at DESC LIMIT 1
    ) s ON true
  ),
  marcas AS (
    SELECT p.*,
      (p.mi_version_at IS NOT NULL) AS hizo_mi_version,
      (p.pieza_at IS NOT NULL) AS hizo_pieza,
      (p.sub_at IS NOT NULL) AS en_prueba_o_mas,
      (p.sub_status IN ('active', 'past_due') AND p.sub_at <= now() - interval '3 days') AS pago,
      (p.sub_status = 'trialing') AS aun_en_prueba,
      (p.recarga_at IS NOT NULL) AS recargo
    FROM persona p
  ),
  landing AS (
    SELECT (v.first_seen AT TIME ZONE 'America/Santo_Domingo')::date AS d,
           count(*) AS visitas, count(*) FILTER (WHERE coalesce(v.cta_clicks, 0) > 0) AS clic
    FROM public.landing_visitors v
    WHERE v.first_seen >= v_from
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'days', v_days,
    'since', v_since,
    'today', v_today,
    'por_dia', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'd', x.d,
        'visitas', coalesce(l.visitas, 0),
        'clic_prueba', coalesce(l.clic, 0),
        'cuentas', (SELECT count(*) FROM marcas m WHERE m.d = x.d),
        'entraron', (SELECT count(*) FROM marcas m WHERE m.d = x.d AND m.entro),
        'mi_version', (SELECT count(*) FROM marcas m WHERE m.d = x.d AND m.hizo_mi_version),
        'pieza', (SELECT count(*) FROM marcas m WHERE m.d = x.d AND m.hizo_pieza),
        'sirvio', (SELECT count(*) FROM marcas m WHERE m.d = x.d AND m.sirvio),
        'prueba', (SELECT count(*) FROM marcas m WHERE m.d = x.d AND m.en_prueba_o_mas),
        'pagaron', (SELECT count(*) FROM marcas m WHERE m.d = x.d AND m.pago),
        'recargaron', (SELECT count(*) FROM marcas m WHERE m.d = x.d AND m.recargo)
      ) ORDER BY x.d DESC), '[]'::jsonb)
      FROM dias x LEFT JOIN landing l ON l.d = x.d
    ),
    'total', (
      SELECT jsonb_build_object(
        'visitas', (SELECT coalesce(sum(visitas), 0) FROM landing),
        'clic_prueba', (SELECT coalesce(sum(clic), 0) FROM landing),
        'cuentas', count(*),
        'entraron', count(*) FILTER (WHERE m.entro),
        'mi_version', count(*) FILTER (WHERE m.hizo_mi_version),
        'mi_version_72h', count(*) FILTER (WHERE m.mi_version_at <= m.created_at + interval '72 hours'),
        'pieza', count(*) FILTER (WHERE m.hizo_pieza),
        'sirvio', count(*) FILTER (WHERE m.sirvio),
        'prueba', count(*) FILTER (WHERE m.en_prueba_o_mas),
        'aun_en_prueba', count(*) FILTER (WHERE m.aun_en_prueba),
        'prueba_terminada', count(*) FILTER (WHERE m.sub_at IS NOT NULL AND m.sub_at <= now() - interval '3 days'),
        'pagaron', count(*) FILTER (WHERE m.pago),
        'recargaron', count(*) FILTER (WHERE m.recargo),
        'cuentas_30d', count(*) FILTER (WHERE m.created_at <= now() - interval '30 days')
      ) FROM marcas m
    ),
    -- Para que Jean sepa a quién llamar: solo admin lo ve, y nada de esto va a PostHog.
    'personas', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'd', m.d, 'email', m.email, 'entro', m.entro,
        'mi_version_h', CASE WHEN m.mi_version_at IS NULL THEN NULL
                             ELSE round(extract(epoch FROM m.mi_version_at - m.created_at) / 3600) END,
        'pieza', m.hizo_pieza, 'sirvio', m.sirvio,
        'estado', coalesce(m.sub_status, 'sin_prueba'), 'pago', m.pago, 'recargo', m.recargo,
        'prueba', m.en_prueba_o_mas,
        'prueba_terminada', (m.sub_at IS NOT NULL AND m.sub_at <= now() - interval '3 days'),
        'dias_cuenta', floor(extract(epoch FROM now() - m.created_at) / 86400)::integer
      ) ORDER BY m.created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM marcas ORDER BY created_at DESC LIMIT 100) m
    )
  ) INTO r;

  RETURN r;
END $$;

REVOKE ALL ON FUNCTION public.admin_prueba_9de10(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_prueba_9de10(integer) TO authenticated;

COMMENT ON FUNCTION public.admin_prueba_9de10(integer) IS
  'R2-10: embudo de la prueba 9 de 10 por día (cohorte por cuenta), solo admin, solo lectura.';
