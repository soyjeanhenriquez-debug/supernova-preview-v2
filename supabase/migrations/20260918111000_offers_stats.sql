-- Stats del catálogo en una sola llamada (evita traer miles de filas al cliente).
CREATE OR REPLACE FUNCTION public.get_offers_stats()
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'offers', count(*),
    'active_ads', coalesce(sum(active_ads), 0),
    'markets', count(DISTINCT market),
    'niches', count(DISTINCT niche) FILTER (WHERE niche IS NOT NULL AND niche <> 'otro'),
    'updated_at', max(updated_at)
  )
  FROM public.offers WHERE enrich_failed = false;
$$;
REVOKE ALL ON FUNCTION public.get_offers_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_offers_stats() TO authenticated, service_role;
