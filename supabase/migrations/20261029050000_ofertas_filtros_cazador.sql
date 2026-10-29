-- SUPERNOVA — Filtros de Ofertas como Cazador Swipe (29-oct-2026, Jean: «si la venta ocurre en WhatsApp el checkout es
-- WhatsApp… integremos los filtros mejorados de cazadorswipe»).
--
-- offers.escala   el número de anuncios que ve la persona en la tarjeta: el conteo en vivo de Meta o, si Meta no lo da
--                 (anuncios solo de Brasil), el que trae la oferta (Cazador o nuestro recolector). Para ordenar «por escala».
-- offers.checkout dónde cobra, con un solo nombre por plataforma («hotmart» y «Hotmart» eran dos). Si vende por
--                 WhatsApp, el checkout es WhatsApp, siempre; y si el checkout detectado es WhatsApp, vende por WhatsApp.
-- offers.embudo   camino de venta (offer_intel.funnel_type; WhatsApp si vende por WhatsApp).
-- offers.tags     etiquetas que trae Cazador.
-- refresh_offer_checkout() los recalcula; corre cada hora a los :55 (después de curate_offers y del canal de las 11:50).
-- offer_filter_options(p_canal) da las opciones de cada filtro con su conteo real, dentro del canal elegido.
-- Solo añade columnas y funciones: no borra, no oculta ni cambia winner_score ni el orden por puntaje.

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS escala integer GENERATED ALWAYS AS (GREATEST(COALESCE(live_active_ads, 0), active_ads)) STORED,
  ADD COLUMN IF NOT EXISTS checkout text,
  ADD COLUMN IF NOT EXISTS embudo text,
  ADD COLUMN IF NOT EXISTS tags text[];

CREATE OR REPLACE FUNCTION private.nombre_checkout(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT CASE
    WHEN p IS NULL OR btrim(p) = '' THEN NULL
    ELSE CASE lower(btrim(p))
      WHEN 'hotmart' THEN 'Hotmart' WHEN 'kiwify' THEN 'Kiwify' WHEN 'whatsapp' THEN 'WhatsApp'
      WHEN 'otra' THEN 'Otra' WHEN 'outra' THEN 'Otra' WHEN 'other' THEN 'Otra'
      WHEN 'eduzz' THEN 'Eduzz' WHEN 'cakto' THEN 'Cakto' WHEN 'kirvano' THEN 'Kirvano' WHEN 'lastlink' THEN 'Lastlink'
      WHEN 'green' THEN 'Greenn' WHEN 'greenn' THEN 'Greenn' WHEN 'guru' THEN 'Guru' WHEN 'cart panda' THEN 'CartPanda'
      WHEN 'cartpanda' THEN 'CartPanda' WHEN 'doppus' THEN 'Doppus' WHEN 'hubla' THEN 'Hubla' WHEN 'payt' THEN 'Payt'
      WHEN 'perfectpay' THEN 'PerfectPay' WHEN 'wiapy' THEN 'Wiapy' WHEN 'checkout proprio' THEN 'Checkout propio'
      WHEN 'checkout propio' THEN 'Checkout propio' WHEN 'impultienda' THEN 'Impultienda'
      ELSE upper(left(btrim(p), 1)) || substr(btrim(p), 2)
    END
  END
$$;

CREATE OR REPLACE FUNCTION public.refresh_offer_checkout()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE n integer;
BEGIN
  WITH s AS (
    SELECT o.id,
      private.nombre_checkout(COALESCE(p.platform, i.checkout_platform)) AS det,
      i.funnel_type,
      CASE WHEN jsonb_typeof(o.source_data -> 'tags') = 'array' AND jsonb_array_length(o.source_data -> 'tags') > 0
           THEN ARRAY(SELECT jsonb_array_elements_text(o.source_data -> 'tags')) END AS tg,
      o.canal
    FROM public.offers o
    LEFT JOIN public.offer_platform p ON p.offer_id = o.id
    LEFT JOIN public.offer_intel i ON i.offer_id = o.id
  ), c AS (
    SELECT id, tg,
      CASE WHEN canal = 'whatsapp' OR det = 'WhatsApp' THEN 'whatsapp' ELSE canal END AS canal,
      CASE WHEN canal = 'whatsapp' OR det = 'WhatsApp' THEN 'WhatsApp' ELSE det END AS ck,
      CASE WHEN canal = 'whatsapp' OR det = 'WhatsApp' THEN 'whatsapp' ELSE NULLIF(funnel_type, '') END AS emb
    FROM s
  )
  UPDATE public.offers o
     SET checkout = c.ck, embudo = c.emb, tags = c.tg, canal = c.canal,
         canal_url = CASE WHEN c.canal = 'whatsapp' THEN NULL ELSE o.canal_url END
    FROM c
   WHERE c.id = o.id
     AND (o.checkout IS DISTINCT FROM c.ck OR o.embudo IS DISTINCT FROM c.emb OR o.tags IS DISTINCT FROM c.tg
          OR o.canal IS DISTINCT FROM c.canal);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_offer_checkout() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_offer_checkout() TO service_role;

-- Opciones de cada filtro con su conteo, una tarjeta por anunciante (is_primary), dentro del canal elegido.
-- Invoker: la RLS de offers decide qué ve cada quien (adultas solo a mayores confirmados).
CREATE OR REPLACE FUNCTION public.offer_filter_options(p_canal text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO '' AS $$
  WITH base AS (
    SELECT checkout, embudo, tags, offer_type, language, market, niche
    FROM public.offers
    WHERE is_primary AND NOT enrich_failed AND (excluded_reason IS NULL OR excluded_reason = 'adult')
      AND (p_canal IS NULL OR canal = p_canal)
  ),
  g AS (
    SELECT 'checkout' AS k, checkout AS v, count(*) AS n FROM base WHERE checkout IS NOT NULL GROUP BY checkout
    UNION ALL SELECT 'embudo', embudo, count(*) FROM base WHERE embudo IS NOT NULL GROUP BY embudo
    UNION ALL SELECT 'tags', t, count(*) FROM base, unnest(tags) t GROUP BY t
    UNION ALL SELECT 'tipo', offer_type, count(*) FROM base WHERE offer_type IS NOT NULL GROUP BY offer_type
    UNION ALL SELECT 'idioma', language, count(*) FROM base WHERE language IS NOT NULL GROUP BY language
    UNION ALL SELECT 'pais', market, count(*) FROM base WHERE market IS NOT NULL GROUP BY market
    UNION ALL SELECT 'nicho', niche, count(*) FROM base WHERE niche IS NOT NULL GROUP BY niche
  )
  SELECT COALESCE(jsonb_object_agg(k, opciones), '{}'::jsonb)
  FROM (SELECT k, jsonb_agg(jsonb_build_object('v', v, 'n', n) ORDER BY n DESC, v) AS opciones FROM g GROUP BY k) x
$$;
REVOKE ALL ON FUNCTION public.offer_filter_options(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.offer_filter_options(text) TO authenticated;

SELECT public.refresh_offer_checkout();

SELECT cron.schedule('supernova-offer-checkout-hourly', '55 * * * *', $$SELECT public.refresh_offer_checkout()$$);
