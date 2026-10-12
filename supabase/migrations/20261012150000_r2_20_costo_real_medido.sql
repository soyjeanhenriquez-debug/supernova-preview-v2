-- R2-20 (12-oct-2026) · SOLO rellena credit_prices.real_cost_usd con el costo real medido.
-- NO cambia ningún precio (columna cost intacta). Sin aplicar: la aplica Jean o quien él diga.
--
-- Fuente: ai_usage, últimos 30 días (12-sep → 12-oct-2026). Valor guardado = p90 del costo por uso
-- (9 de cada 10 usos cuestan esto o menos): más prudente que la mediana. Mediana y peor caso en
-- docs/agentes/2026-10-12-r2-20-margenes.md.
-- Por uso = todas las llamadas de IA que hace UN cobro (ej.: "Hacer mi versión" = winner-blueprint +
-- oraculo master_prompt y las piezas extra que cubre el recibo; carrusel = Gemini + Apify).
--
-- Solo se rellena donde está vacío (real_cost_usd IS NULL): no pisa lo que Jean ya fijó hoy
-- (gen_ad_image 0,0115 · vid_mini_5 0,118 · vid_mini_10 0,217) ni los modelos de Media Studio.
--
-- ¿Cambia algo para el usuario? No. Hoy real_cost_usd solo lo lee edge_guard_charge para los
-- probadores (bloquea la prueba gratis si una acción cuesta más de US$1). Todos los valores de aquí
-- son menores de US$0,07, igual que el cálculo de respaldo que usaba (cost × 0,008 ÷ 5).
--
-- Acciones sin uso en 30 días (se quedan vacías hasta tener datos): adaptar, ai_intel, analyze_url,
-- blueprint, build_piece_astra/fable/opus/sonnet/gpt, chat_message, gen_ad_copies, gen_avatar,
-- gen_funnel, gen_landing, landing_intelligence, model_slide, pain_discovery, pillar_assist,
-- yt_reference_long, yt_reference_short, yt_translate.

UPDATE public.credit_prices AS cp
SET real_cost_usd = v.usd, updated_at = now()
FROM (VALUES
  -- Textos (Gemini 3 Flash). gen_light incluye recovery-sequence, que cobra gen_light.
  ('gen_light',          0.0083::numeric),  -- 69 usos · mediana 0,0060
  ('gen_medium',         0.0108),           -- 37 usos · mediana 0,0065
  ('gen_heavy',          0.0072),           -- 1 uso (VSL principal)
  ('gen_master_prompt',  0.0215),           -- 9 usos · mediana 0,0208 (blueprint + mega-prompt + piezas del recibo)
  ('business_map',       0.0077),           -- 7 usos · mediana 0,0064
  ('sofisticar',         0.0080),           -- 8 usos · mediana 0,0067
  ('build_piece_std',    0.0089),           -- 22 capítulos · mediana 0,0076 (Gemini 3.8 Flash)
  ('content_month',      0.0164),           -- 2 usos · mediana 0,0157
  ('motion_ad',          0.0126),           -- 3 usos · mediana 0,0114
  ('motion_style',       0.0094),           -- 2 usos · mediana 0,0093
  ('clone_carousel',     0.0193),           -- 7 usos · mediana 0,0171 (Gemini + Apify 0,0027)
  ('yt_reference',       0.0633),           -- 1 uso (video de hasta 15 min)
  -- Imagen y voz (APIMart, precio fijo por pieza)
  ('yt_scene_image',     0.0081),           -- 8 usos · GPT Image 2
  ('yt_voice_scene',     0.0027),           -- 8 usos · mediana 0,0026 (gpt-4o-mini-tts)
  ('gen_ad_image_nb2',   0.0143),           -- 1 uso · Nano Banana 2
  ('gen_ad_image_nbpro', 0.0285),           -- 4 usos · Nano Banana Pro
  -- Sin IA: la búsqueda usa la API de Meta (gratis), seguir oferta es una RPC y la Mini App se
  -- generó una sola vez por cron (costo fijo del catálogo, no del que la desbloquea).
  ('search_ads',         0),
  ('follow_offer',       0),
  ('unlock_kit',         0)
) AS v(action, usd)
WHERE cp.action = v.action
  AND cp.real_cost_usd IS NULL;
