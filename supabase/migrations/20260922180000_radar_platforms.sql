-- Tendencias del Radar por plataforma: de qué tienda o pasarela vende cada anunciante
-- que está pagando anuncios ahora. Sale de datos propios (el texto del anuncio, el enlace
-- de destino cacheado y el análisis de la oferta), sin depender de ninguna red externa.

CREATE OR REPLACE FUNCTION public.detect_platform(txt text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN txt IS NULL THEN NULL
    WHEN txt ~* 'hotmart'                        THEN 'Hotmart'
    WHEN txt ~* 'kiwify'                         THEN 'Kiwify'
    WHEN txt ~* 'clickbank|\.hop\.'              THEN 'ClickBank'
    WHEN txt ~* 'digistore24'                    THEN 'Digistore24'
    WHEN txt ~* 'etsy\.com'                      THEN 'Etsy'
    WHEN txt ~* 'myshopify|shopify'              THEN 'Shopify'
    WHEN txt ~* 'ticto\.'                        THEN 'Ticto'
    WHEN txt ~* 'braip'                          THEN 'Braip'
    WHEN txt ~* 'monetizze'                      THEN 'Monetizze'
    WHEN txt ~* 'eduzz'                          THEN 'Eduzz'
    WHEN txt ~* 'cakto\.'                        THEN 'Cakto'
    WHEN txt ~* 'lastlink'                       THEN 'Lastlink'
    WHEN txt ~* 'whop\.com'                      THEN 'Whop'
    WHEN txt ~* 'samcart'                        THEN 'SamCart'
    WHEN txt ~* 'thrivecart'                     THEN 'ThriveCart'
    WHEN txt ~* 'kajabi'                         THEN 'Kajabi'
    WHEN txt ~* 'systeme\.io'                    THEN 'Systeme.io'
    WHEN txt ~* 'gumroad'                        THEN 'Gumroad'
    WHEN txt ~* 'payhip'                         THEN 'Payhip'
    WHEN txt ~* 'teachable'                      THEN 'Teachable'
    WHEN txt ~* 'skool\.com'                     THEN 'Skool'
    WHEN txt ~* 'tiendanube|nuvemshop'           THEN 'Tiendanube'
    WHEN txt ~* 'mercadolibre|mercadolivre'      THEN 'MercadoLibre'
    WHEN txt ~* 'amazon\.'                       THEN 'Amazon'
    WHEN txt ~* 'temu\.com'                      THEN 'Temu'
    WHEN txt ~* 'stripe\.com|buy\.stripe'        THEN 'Stripe'
    WHEN txt ~* 'webinarjam|everwebinar'         THEN 'Webinar'
    ELSE NULL
  END;
$$;

CREATE TABLE IF NOT EXISTS public.radar_platform_offers (
  page_id text PRIMARY KEY,
  platform text NOT NULL,
  evidence text,                       -- de dónde salió la detección, para poder auditarla
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS radar_platform_offers_platform ON public.radar_platform_offers (platform);
ALTER TABLE public.radar_platform_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.radar_platform_offers FROM PUBLIC, anon, authenticated;

-- Recalcula la detección. Tres fuentes, de la más fiable a la menos:
--   1. el análisis de la oferta (checkout real), 2. el enlace de destino cacheado,
--   3. la URL que el anunciante escribe en el texto del anuncio.
CREATE OR REPLACE FUNCTION public.refresh_radar_platforms()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  WITH desde_intel AS (
    SELECT o.page_id,
           coalesce(oi.checkout_platform, public.detect_platform(oi.checkout_url), public.detect_platform(oi.landing_domain)) AS plat,
           'checkout' AS ev
    FROM public.offer_intel oi JOIN public.offers o ON o.id = oi.offer_id
  ),
  desde_enlace AS (
    SELECT w.page_id, public.detect_platform(m.link_url) AS plat, 'enlace' AS ev
    FROM public.ad_media_cache m JOIN public.winning_ads w ON w.id = m.ad_id
    WHERE m.link_url IS NOT NULL
  ),
  desde_texto AS (
    SELECT w.page_id, public.detect_platform(w.ad_body) AS plat, 'texto' AS ev
    FROM public.winning_ads w
    WHERE w.ad_body ~* '(https?://|www\.)'
  ),
  todo AS (
    SELECT * FROM desde_intel UNION ALL SELECT * FROM desde_enlace UNION ALL SELECT * FROM desde_texto
  ),
  mejor AS (
    SELECT DISTINCT ON (page_id) page_id, plat, ev
    FROM todo
    WHERE page_id IS NOT NULL AND plat IS NOT NULL
    ORDER BY page_id, CASE ev WHEN 'checkout' THEN 1 WHEN 'enlace' THEN 2 ELSE 3 END
  )
  INSERT INTO public.radar_platform_offers (page_id, platform, evidence, updated_at)
  SELECT page_id, plat, ev, now() FROM mejor
  ON CONFLICT (page_id) DO UPDATE
    SET platform = EXCLUDED.platform, evidence = EXCLUDED.evidence, updated_at = now()
    WHERE public.radar_platform_offers.platform IS DISTINCT FROM EXCLUDED.platform
       OR public.radar_platform_offers.evidence IS DISTINCT FROM EXCLUDED.evidence;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.refresh_radar_platforms() FROM PUBLIC, anon, authenticated;

-- Qué plataformas hay y cuántos anunciantes activos tiene cada una.
CREATE OR REPLACE FUNCTION public.market_radar_platforms()
RETURNS TABLE (platform text, anunciantes bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.platform, count(DISTINCT r.page_id)
  FROM public.radar_platform_offers r
  JOIN public.offers o ON o.page_id = r.page_id AND o.is_primary
  WHERE (SELECT public.has_access())
  GROUP BY r.platform
  ORDER BY 2 DESC;
$$;
REVOKE ALL ON FUNCTION public.market_radar_platforms() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.market_radar_platforms() TO authenticated;

-- Los anunciantes de una plataforma, ordenados por lo que de verdad importa:
-- cuántos días llevan pagando y cuántos anuncios tienen vivos.
CREATE OR REPLACE FUNCTION public.market_radar(p_platform text DEFAULT NULL, p_limit integer DEFAULT 60)
RETURNS TABLE (
  id uuid, page_id text, page_name text, product_name text, niche text, market text,
  platform text, evidence text, price_hint text, days_active integer, active_ads integer,
  ads_count integer, winner_score numeric, sample_title text, sample_ad_url text, landing_domain text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (o.page_id)
    o.id, o.page_id, o.page_name, o.product_name, o.niche, o.market,
    r.platform, r.evidence, o.price_hint, o.days_active, o.active_ads,
    o.ads_count, o.winner_score, o.sample_title, o.sample_ad_url, oi.landing_domain
  FROM public.radar_platform_offers r
  JOIN public.offers o ON o.page_id = r.page_id AND o.is_primary
  LEFT JOIN public.offer_intel oi ON oi.offer_id = o.id
  WHERE (SELECT public.has_access())
    AND (p_platform IS NULL OR r.platform = p_platform)
    AND o.excluded_reason IS NULL
  ORDER BY o.page_id, o.days_active DESC NULLS LAST, o.active_ads DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 60), 120));
$$;
REVOKE ALL ON FUNCTION public.market_radar(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.market_radar(text, integer) TO authenticated;
