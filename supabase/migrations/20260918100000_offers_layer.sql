-- FASE 1 — Capa "producto-primero": anuncios agrupados por anunciante+mercado
-- = una OFERTA (lo que Escala Ads llama "oferta"). Se enriquece por IA
-- (enrich-offers) con nombre de producto, nicho, tipo, modelo, idioma, precio,
-- mecanismo y por qué gana. Todo lo nuevo (picks diarios, catálogo, Cazador
-- de ROI, kits) se apoya en esta tabla.

CREATE TABLE IF NOT EXISTS public.offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id TEXT NOT NULL,
  market TEXT NOT NULL,
  page_name TEXT,
  -- métricas (la "prueba con dinero real"), refrescadas a diario
  ads_count INT NOT NULL DEFAULT 0,
  active_ads INT NOT NULL DEFAULT 0,
  days_active INT NOT NULL DEFAULT 0,
  duplicate_count INT NOT NULL DEFAULT 0,
  winner_score INT NOT NULL DEFAULT 0,
  tier TEXT,
  sample_ad_id UUID,
  sample_title TEXT,
  sample_body TEXT,
  sample_ad_url TEXT,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  -- enriquecimiento IA (enrich-offers); NULL = pendiente
  product_name TEXT,
  niche TEXT,
  offer_type TEXT,
  business_model TEXT,
  language TEXT,
  price_hint TEXT,
  mechanism TEXT,
  why_wins TEXT,
  target_audience TEXT,
  enriched_at TIMESTAMPTZ,
  enrich_failed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page_id, market)
);

CREATE INDEX IF NOT EXISTS idx_offers_market_score ON public.offers (market, winner_score DESC);
CREATE INDEX IF NOT EXISTS idx_offers_niche ON public.offers (niche);
CREATE INDEX IF NOT EXISTS idx_offers_type ON public.offers (offer_type);
CREATE INDEX IF NOT EXISTS idx_offers_enrich_queue ON public.offers (winner_score DESC)
  WHERE enriched_at IS NULL AND enrich_failed = false;

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
-- Contenido derivado compartido: cualquier usuario logueado lo lee; escribe solo service_role.
CREATE POLICY offers_select_authenticated ON public.offers
  FOR SELECT TO authenticated USING (true);

-- Historial diario → insights del Cazador de ROI ("+40% anuncios en 7 días").
CREATE TABLE IF NOT EXISTS public.offer_snapshots (
  offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  snap_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ads_count INT,
  active_ads INT,
  days_active INT,
  winner_score INT,
  PRIMARY KEY (offer_id, snap_date)
);
ALTER TABLE public.offer_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY offer_snapshots_select_authenticated ON public.offer_snapshots
  FOR SELECT TO authenticated USING (true);

-- Agrega winning_ads → offers. Idempotente; NUNCA pisa el enriquecimiento IA.
-- Umbral: ≥3 anuncios y ≥14 días (RU/KZ: ≥2 anuncios, hay pocos datos).
CREATE OR REPLACE FUNCTION public.refresh_offers()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows INTEGER;
BEGIN
  WITH agg AS (
    SELECT page_id, market,
           max(page_name) AS page_name,
           count(*)::int AS ads_count,
           count(*) FILTER (WHERE delivery_stop_time IS NULL)::int AS active_ads,
           max(days_active) AS days_active,
           max(duplicate_count) AS duplicate_count,
           max(winner_score) AS winner_score,
           min(delivery_start_time) AS first_seen,
           max(scraped_at) AS last_seen
    FROM public.winning_ads
    WHERE page_id IS NOT NULL AND market IS NOT NULL AND market <> 'LATAM'
    GROUP BY page_id, market
    HAVING (count(*) >= 3 AND max(days_active) >= 14)
        OR (market IN ('RU','KZ') AND count(*) >= 2)
  ), sample AS (
    -- El anuncio más representativo: con texto, mejor score, más días
    SELECT DISTINCT ON (page_id, market) page_id, market, id, ad_title, ad_body, ad_url
    FROM public.winning_ads
    WHERE page_id IS NOT NULL AND market IS NOT NULL
    ORDER BY page_id, market, (length(coalesce(ad_body, '')) >= 40) DESC, winner_score DESC, days_active DESC
  ), up AS (
    INSERT INTO public.offers (page_id, market, page_name, ads_count, active_ads, days_active, duplicate_count,
      winner_score, tier, sample_ad_id, sample_title, sample_body, sample_ad_url, first_seen, last_seen, updated_at)
    SELECT a.page_id, a.market, a.page_name, a.ads_count, a.active_ads, a.days_active, a.duplicate_count, a.winner_score,
           CASE WHEN a.winner_score >= 75 THEN 'mega' WHEN a.winner_score >= 50 THEN 'rising' ELSE 'solid' END,
           s.id, left(s.ad_title, 200), left(s.ad_body, 1200), s.ad_url, a.first_seen, a.last_seen, now()
    FROM agg a LEFT JOIN sample s ON s.page_id = a.page_id AND s.market = a.market
    ON CONFLICT (page_id, market) DO UPDATE SET
      page_name = COALESCE(EXCLUDED.page_name, offers.page_name),
      ads_count = EXCLUDED.ads_count,
      active_ads = EXCLUDED.active_ads,
      days_active = EXCLUDED.days_active,
      duplicate_count = EXCLUDED.duplicate_count,
      winner_score = EXCLUDED.winner_score,
      tier = EXCLUDED.tier,
      sample_ad_id = COALESCE(EXCLUDED.sample_ad_id, offers.sample_ad_id),
      sample_title = COALESCE(EXCLUDED.sample_title, offers.sample_title),
      sample_body = COALESCE(EXCLUDED.sample_body, offers.sample_body),
      sample_ad_url = COALESCE(EXCLUDED.sample_ad_url, offers.sample_ad_url),
      first_seen = EXCLUDED.first_seen,
      last_seen = EXCLUDED.last_seen,
      updated_at = now()
    RETURNING id, ads_count, active_ads, days_active, winner_score
  )
  INSERT INTO public.offer_snapshots (offer_id, snap_date, ads_count, active_ads, days_active, winner_score)
  SELECT id, CURRENT_DATE, ads_count, active_ads, days_active, winner_score FROM up
  ON CONFLICT (offer_id, snap_date) DO UPDATE SET
    ads_count = EXCLUDED.ads_count, active_ads = EXCLUDED.active_ads,
    days_active = EXCLUDED.days_active, winner_score = EXCLUDED.winner_score;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_offers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_offers() TO service_role;

-- Cron diario 11:30 UTC (antes de hooks 12:00 y digest 13:00). pg_cron corre
-- como superusuario, puede llamar la función directamente.
SELECT cron.schedule('supernova-refresh-offers-daily', '30 11 * * *', $$ SELECT public.refresh_offers(); $$);

-- Enriquecimiento IA cada 2h (5 lotes de 25 por corrida → ~1,500 ofertas/día).
SELECT cron.schedule(
  'supernova-enrich-offers-2h',
  '15 */2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/enrich-offers',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"batches": 5}'::jsonb
  );
  $$
);
