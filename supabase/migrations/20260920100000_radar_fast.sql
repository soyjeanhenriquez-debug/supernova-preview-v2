-- SUPERNOVA — Radar rápido.
--
-- Medido en producción antes de esto (79k anuncios; la tabla pesa 206 MB + 373 MB de
-- TOAST y no cabe en memoria):
--   · Abrir el Radar = recorrer la tabla entera dos veces (página ordenada por score +
--     conteo exacto)                                            → 2,7–7 s   (ahora 0,04 s)
--   · Buscar una palabra = ilike sobre el texto completo de cada anuncio; hay
--     anuncios-novela de 35 000 caracteres                      → 50 s      (ahora 0,2 s)
--     El usuario tiene un límite de 8 s por consulta: la búsqueda NUNCA respondía y la
--     pantalla se tragaba el error.
--   · Otras 5 consultas por usuario y por minuto para las cifras de la cabecera.
--
--   1. Índices que coinciden EXACTAMENTE con el ORDER BY que manda la app
--      (DESC NULLS LAST; el índice viejo era DESC = NULLS FIRST y no servía).
--   2. Índice por país (filtro de idioma/región y su conteo) y por anunciante.
--   3. Dos campos calculados (PostgREST los trata como columnas):
--        ad_search_text  → título + anunciante + arranque del texto, con índice de trigramas
--        ad_body_preview → lo que viaja al navegador en la lista (antes, hasta 35 KB por fila)
--      No se borra ni se recorta ningún dato guardado.
--   4. Las cifras de la cabecera salen de una fila que refresca un cron, y traen la hora
--      REAL del último scrape (el aviso "actualizó hace N min" contaba los minutos desde
--      que se abría la página).

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS idx_winning_ads_score_nl ON public.winning_ads (winner_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_winning_ads_dups_nl  ON public.winning_ads (duplicate_count DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_winning_ads_days_nl  ON public.winning_ads (days_active DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_winning_ads_market   ON public.winning_ads (market);
CREATE INDEX IF NOT EXISTS idx_winning_ads_page_id  ON public.winning_ads (page_id);

CREATE OR REPLACE FUNCTION public.ad_search_text(w public.winning_ads)
RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT coalesce(w.ad_title, '') || ' ' || coalesce(w.page_name, '') || ' ' || left(coalesce(w.ad_body, ''), 1000) $$;

CREATE OR REPLACE FUNCTION public.ad_body_preview(w public.winning_ads)
RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT left(w.ad_body, 3000) $$;

REVOKE ALL ON FUNCTION public.ad_search_text(public.winning_ads) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ad_body_preview(public.winning_ads) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ad_search_text(public.winning_ads) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ad_body_preview(public.winning_ads) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_winning_ads_search_trgm
  ON public.winning_ads USING gin (public.ad_search_text(winning_ads) extensions.gin_trgm_ops);

-- Cifras de la cabecera del Radar: una fila, la refresca el cron.
CREATE TABLE IF NOT EXISTS public.radar_stats_cache (
  id                 BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  total              INTEGER NOT NULL DEFAULT 0,
  unique_advertisers INTEGER NOT NULL DEFAULT 0,
  mega               INTEGER NOT NULL DEFAULT 0,
  rising             INTEGER NOT NULL DEFAULT 0,
  solid              INTEGER NOT NULL DEFAULT 0,
  last_scraped_at    TIMESTAMPTZ,
  refreshed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.radar_stats_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "radar_stats_cache_select_access" ON public.radar_stats_cache;
CREATE POLICY "radar_stats_cache_select_access" ON public.radar_stats_cache
  FOR SELECT TO authenticated USING (public.has_access());

REVOKE ALL ON public.radar_stats_cache FROM anon, authenticated;
GRANT SELECT ON public.radar_stats_cache TO authenticated;

-- Cada dato en su subconsulta: así cada uno se resuelve con su índice
-- (sin recorrer la tabla, que no cabe en memoria).
CREATE OR REPLACE FUNCTION public.refresh_radar_stats()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.radar_stats_cache AS c (id, total, unique_advertisers, mega, rising, solid, last_scraped_at, refreshed_at)
  SELECT TRUE,
         (SELECT count(*) FROM public.winning_ads),
         (SELECT count(*) FROM (SELECT DISTINCT page_id FROM public.winning_ads WHERE page_id IS NOT NULL) d),
         (SELECT count(*) FROM public.winning_ads WHERE tier = 'mega'),
         (SELECT count(*) FROM public.winning_ads WHERE tier = 'rising'),
         (SELECT count(*) FROM public.winning_ads WHERE tier = 'solid'),
         -- la última actualización que ve el usuario es la del último anuncio REAL (con fecha
         -- de inicio), no la del relleno que entra cada hora
         (SELECT max(scraped_at) FROM public.winning_ads WHERE delivery_start_time IS NOT NULL),
         now()
  ON CONFLICT (id) DO UPDATE SET
    total = EXCLUDED.total, unique_advertisers = EXCLUDED.unique_advertisers,
    mega = EXCLUDED.mega, rising = EXCLUDED.rising, solid = EXCLUDED.solid,
    last_scraped_at = EXCLUDED.last_scraped_at, refreshed_at = now();
$$;

REVOKE ALL ON FUNCTION public.refresh_radar_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_radar_stats() TO service_role;

SELECT public.refresh_radar_stats();

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'supernova-radar-stats';
SELECT cron.schedule('supernova-radar-stats', '*/15 * * * *', $$ SELECT public.refresh_radar_stats(); $$);

-- "Más recientes" en el Radar, solo anuncios reales (los que traen fecha de inicio): sin este
-- índice parcial había que saltarse ~8 000 filas de relleno antes del primer anuncio real (8,8 s).
CREATE INDEX IF NOT EXISTS idx_winning_ads_real_recent
  ON public.winning_ads (scraped_at DESC) WHERE delivery_start_time IS NOT NULL;
