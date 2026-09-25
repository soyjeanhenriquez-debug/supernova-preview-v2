-- Crons del Radar con menos carga (24-sep-2026). Mismo resultado, menos lecturas.
--
-- Problema: el límite de 2 min de pg_cron. Entre 04:00 y 14:00 UTC del 24-sep
-- supernova-score-ads-hourly (corre cada 10 min) falló el 100 % y arrastró a
-- refresh_offers() de las 11:30 (ofertas sin refrescar ese día).
--
-- 1) recompute_advertiser_scale(): el LIMIT dentro del join hacía que el planificador
--    eligiera un merge join recorriendo DOS veces toda winning_ads por el índice de
--    page_id (~240 000 lecturas de bloques por corrida, casi siempre para actualizar
--    cero filas). Ahora se calcula lo pendiente de una vez (hash join sobre dos
--    lecturas secuenciales) y el LIMIT se aplica después. Mismas filas, mismo valor.
--
-- 2) refresh_offers(): para elegir la muestra de cada oferta se ordenaban las 123 000
--    filas con el texto completo y se descomprimía cada ad_body solo para saber si
--    tenía 40 caracteres. Ahora se elige el id con columnas livianas y los textos se
--    traen solo de las muestras elegidas. La regla es idéntica: octet_length >= 160
--    garantiza >= 40 caracteres (máx. 4 bytes por carácter) y no descomprime; si es
--    más corto, length() sobre un texto corto es barato.
--
-- NO cambia: fórmula de winner_score, días, tier, duplicate_count, ni qué ofertas existen.

CREATE OR REPLACE FUNCTION public.recompute_advertiser_scale(p_batch integer DEFAULT 3000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_updated integer;
begin
  with counts as (
    select page_id, count(*) as ads_running
    from public.winning_ads
    where page_id is not null and delivery_stop_time is null
    group by page_id
  ),
  pending as materialized (
    select w.id, greatest(1, c.ads_running) as dup
    from public.winning_ads w join counts c on c.page_id = w.page_id
    where w.duplicate_count is distinct from greatest(1, c.ads_running)
  ),
  todo as (
    select id, dup from pending limit p_batch
  ),
  upd as (
    update public.winning_ads w set duplicate_count = t.dup
    from todo t where w.id = t.id
    returning 1
  )
  select count(*) into v_updated from upd;
  return v_updated;
end $function$;

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
  ), sample_pick AS (
    -- Solo columnas livianas: el texto se trae después, únicamente de la muestra.
    SELECT DISTINCT ON (page_id, market) page_id, market, id
    FROM public.winning_ads
    WHERE page_id IS NOT NULL AND market IS NOT NULL
    ORDER BY page_id, market,
      (CASE WHEN ad_body IS NULL THEN false
            WHEN octet_length(ad_body) >= 160 THEN true
            ELSE length(ad_body) >= 40 END) DESC,
      winner_score DESC, days_active DESC
  ), sample AS (
    SELECT p.page_id, p.market, w.id, w.ad_title, w.ad_body, w.ad_url
    FROM sample_pick p JOIN public.winning_ads w ON w.id = p.id
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
