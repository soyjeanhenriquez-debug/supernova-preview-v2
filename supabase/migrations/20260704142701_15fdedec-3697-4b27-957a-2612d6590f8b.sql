-- 1) Índice único en system_config.key
CREATE UNIQUE INDEX IF NOT EXISTS system_config_key_uidx
  ON public.system_config (key);

-- 2) Seed de costos (single source of truth)
INSERT INTO public.system_config (id, key, value, description, category) VALUES
  (gen_random_uuid(), 'cost_search_ads',          '10',  'Búsqueda de anuncios',              'costs'),
  (gen_random_uuid(), 'cost_analyze_url',         '10',  'Analizar URL básico',               'costs'),
  (gen_random_uuid(), 'cost_chat_message',        '10',  'Consulta IA por mensaje',           'costs'),
  (gen_random_uuid(), 'cost_adaptar',             '10',  'Adaptar anuncio al mercado',        'costs'),
  (gen_random_uuid(), 'cost_ai_intel',            '10',  'Análisis IA del ad',                'costs'),
  (gen_random_uuid(), 'cost_pillar_assist',       '15',  'Asistente IA de Pilar',             'costs'),
  (gen_random_uuid(), 'cost_sofisticar',          '30',  'Sofisticar oferta',                 'costs'),
  (gen_random_uuid(), 'cost_gen_ad_copies',       '30',  '10 variaciones de ad copy',         'costs'),
  (gen_random_uuid(), 'cost_gen_avatar',          '30',  'Avatar del comprador',              'costs'),
  (gen_random_uuid(), 'cost_pain_discovery',      '30',  'Pain Discovery',                    'costs'),
  (gen_random_uuid(), 'cost_gen_light',           '30',  'Generador ligero',                  'costs'),
  (gen_random_uuid(), 'cost_gen_medium',          '60',  'Generador medio',                   'costs'),
  (gen_random_uuid(), 'cost_blueprint',           '80',  'Blueprint completo',                'costs'),
  (gen_random_uuid(), 'cost_gen_landing',         '80',  'Generar landing page',              'costs'),
  (gen_random_uuid(), 'cost_landing_intelligence','80',  'Oráculo completo (IA)',             'costs'),
  (gen_random_uuid(), 'cost_gen_funnel',          '100', 'Funnel completo VSL+emails',        'costs'),
  (gen_random_uuid(), 'cost_gen_master_prompt',   '100', 'Mega-Prompt Replicador',            'costs'),
  (gen_random_uuid(), 'cost_gen_heavy',           '150', 'Generador pesado (VSL)',            'costs'),
  (gen_random_uuid(), 'credits_monthly_free',     '2000','Créditos mensuales gratuitos',      'credits')
ON CONFLICT (key) DO NOTHING;

-- 3) spend_credits: wrapper que reusa consume_credits()
CREATE OR REPLACE FUNCTION public.spend_credits(p_action text, p_meta jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost int;
BEGIN
  SELECT value::int INTO v_cost
  FROM public.system_config
  WHERE key = 'cost_' || p_action AND category = 'costs';

  IF v_cost IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acción sin costo configurado: ' || p_action);
  END IF;

  RETURN public.consume_credits(v_cost, p_action, NULL, p_meta);
END;
$$;

REVOKE ALL ON FUNCTION public.spend_credits(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_credits(text, jsonb) TO authenticated;