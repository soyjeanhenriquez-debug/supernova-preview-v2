
DROP VIEW IF EXISTS public.master_keyword_performance;
CREATE VIEW public.master_keyword_performance
WITH (security_invoker = true)
AS
SELECT
  k.keyword,
  k.language,
  k.category,
  k.priority,
  k.source,
  k.risk_flag,
  k.is_paused,
  k.activated_at,
  COUNT(w.id)::int                                    AS total_ads_found,
  COUNT(DISTINCT w.page_id)::int                      AS unique_advertisers_found,
  COUNT(DISTINCT split_part(regexp_replace(coalesce(w.ad_url,''),'^https?://(www\.)?',''),'/',1))::int AS unique_landing_domains_found,
  COUNT(w.id) FILTER (WHERE w.delivery_stop_time IS NULL AND w.scraped_at > now() - interval '14 days')::int AS active_ads_found,
  COALESCE(AVG(w.winner_score), 0)::numeric(10,2)     AS average_opportunity_score,
  CASE WHEN COUNT(w.id) > 0
       THEN (SUM(COALESCE(w.duplicate_count,1))::numeric / COUNT(w.id))
       ELSE 0
  END                                                  AS duplicate_rate
FROM public.master_keyword_state k
LEFT JOIN public.winning_ads w ON lower(w.keyword) = lower(k.keyword)
GROUP BY k.keyword, k.language, k.category, k.priority, k.source, k.risk_flag, k.is_paused, k.activated_at;

GRANT SELECT ON public.master_keyword_performance TO authenticated;
