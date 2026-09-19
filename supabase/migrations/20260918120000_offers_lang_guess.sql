-- lang_guess: idioma probable del anuncio por regex (barato, en SQL). El
-- `market` es dónde LLEGÓ el anuncio; el top por score de cada país lo
-- dominan anunciantes globales en inglés, así que sin esto la cola de
-- enriquecimiento gasta la IA en ofertas que luego no sirven para el grupo
-- de mercado. `language` (IA) sigue siendo la fuente autoritativa.
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS lang_guess TEXT;
CREATE INDEX IF NOT EXISTS idx_offers_lang_guess ON public.offers (lang_guess);

CREATE OR REPLACE FUNCTION public.guess_lang(p TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p IS NULL OR length(p) < 12 THEN NULL
    WHEN p ~ '[А-Яа-яЁё]{3,}' THEN 'ru'
    WHEN p ~* '\m(você|vocês|não|também|então|muito|hoje|grátis|isso|já|estão|obrigad[oa])\M' OR p ~* 'ção\M' THEN 'pt'
    WHEN p ~* '\m(que|para|con|los|las|una|por|más|cómo|está|hoy|ahora|gratis|tu|tus|usted)\M'
         AND p ~* '\m(el|la|de|y|en|es)\M' THEN 'es'
    WHEN p ~* '\m(und|der|die|das|nicht|mit|für|ist|sie|jetzt|kostenlos)\M' THEN 'de'
    WHEN p ~* '\m(the|and|you|your|with|for|this|free|now|get)\M' THEN 'en'
    ELSE NULL END;
$$;

UPDATE public.offers
SET lang_guess = public.guess_lang(coalesce(sample_body, '') || ' ' || coalesce(sample_title, ''))
WHERE lang_guess IS NULL;

-- refresh_offers() ahora calcula lang_guess en cada refresco (no pisa `language`).
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
    SELECT DISTINCT ON (page_id, market) page_id, market, id, ad_title, ad_body, ad_url
    FROM public.winning_ads
    WHERE page_id IS NOT NULL AND market IS NOT NULL
    ORDER BY page_id, market, (length(coalesce(ad_body, '')) >= 40) DESC, winner_score DESC, days_active DESC
  ), up AS (
    INSERT INTO public.offers (page_id, market, page_name, ads_count, active_ads, days_active, duplicate_count,
      winner_score, tier, sample_ad_id, sample_title, sample_body, sample_ad_url, first_seen, last_seen, lang_guess, updated_at)
    SELECT a.page_id, a.market, a.page_name, a.ads_count, a.active_ads, a.days_active, a.duplicate_count, a.winner_score,
           CASE WHEN a.winner_score >= 75 THEN 'mega' WHEN a.winner_score >= 50 THEN 'rising' ELSE 'solid' END,
           s.id, left(s.ad_title, 200), left(s.ad_body, 1200), s.ad_url, a.first_seen, a.last_seen,
           public.guess_lang(coalesce(s.ad_body, '') || ' ' || coalesce(s.ad_title, '')), now()
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
      lang_guess = COALESCE(EXCLUDED.lang_guess, offers.lang_guess),
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

-- Cron: lotes cortos (2 × 20) cada hora — 4 lotes por invocación excedían el
-- CPU de la edge function (WORKER_RESOURCE_LIMIT). Misma capacidad diaria.
SELECT cron.unschedule('supernova-enrich-offers-2h');
SELECT cron.schedule(
  'supernova-enrich-offers-hourly',
  '20 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/enrich-offers',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"batches": 2}'::jsonb
  );
  $$
);
