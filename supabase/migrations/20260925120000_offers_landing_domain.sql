-- Fase 0, paso 3 de docs/propuestas/2026-09-24-negocio-completo-ltv.md:
-- propagar el dominio de venta más frecuente de cada página a offers.landing_domain.
-- Sirve para agrupar por DOMINIO (no solo por página de Facebook): varias páginas
-- empujando el mismo dominio = señal fuerte de oferta ganadora.
--
-- Cuidado con la carga: refresh_offers() ya roza el límite de 2 min del cron cuando
-- coincide con score_unscored_ads. El dominio sale de un índice parcial (solo filas con
-- link_domain, que llena bulk-seed-ads desde el 24-sep), así que no agrega otra pasada
-- por toda winning_ads. El resto de la función queda idéntico.

ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS landing_domain text;
COMMENT ON COLUMN public.offers.landing_domain IS 'Dominio de venta más frecuente entre los anuncios de la página (winning_ads.link_domain). Lo llena refresh_offers().';

CREATE INDEX IF NOT EXISTS idx_winning_ads_link_domain
  ON public.winning_ads (page_id, market, link_domain)
  WHERE link_domain IS NOT NULL;

CREATE OR REPLACE FUNCTION public.refresh_offers()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ), dom AS (
    -- Dominio más repetido por página y mercado (empate: el primero alfabético).
    SELECT DISTINCT ON (page_id, market) page_id, market, link_domain
    FROM (
      SELECT page_id, market, link_domain, count(*) AS n
      FROM public.winning_ads
      WHERE link_domain IS NOT NULL AND page_id IS NOT NULL AND market IS NOT NULL
      GROUP BY page_id, market, link_domain
    ) d
    ORDER BY page_id, market, n DESC, link_domain
  ), up AS (
    INSERT INTO public.offers (page_id, market, page_name, ads_count, active_ads, days_active, duplicate_count,
      winner_score, tier, sample_ad_id, sample_title, sample_body, sample_ad_url, first_seen, last_seen, lang_guess,
      landing_domain, updated_at)
    SELECT a.page_id, a.market, a.page_name, a.ads_count, a.active_ads, a.days_active, a.duplicate_count, a.winner_score,
           CASE WHEN a.winner_score >= 75 THEN 'mega' WHEN a.winner_score >= 50 THEN 'rising' ELSE 'solid' END,
           s.id, left(s.ad_title, 200), left(s.ad_body, 1200), s.ad_url, a.first_seen, a.last_seen,
           public.guess_lang(coalesce(s.ad_body, '') || ' ' || coalesce(s.ad_title, '')),
           dm.link_domain, now()
    FROM agg a
    LEFT JOIN sample s ON s.page_id = a.page_id AND s.market = a.market
    LEFT JOIN dom dm ON dm.page_id = a.page_id AND dm.market = a.market
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
      landing_domain = COALESCE(EXCLUDED.landing_domain, offers.landing_domain),
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
$function$;
