-- Radar de nichos de YouTube (03-oct-2026): resultados de la API oficial de YouTube guardados 6 h por
-- búsqueda (nicho + idioma + largo/short) para no gastar la cuota diaria (10.000 unidades; una
-- búsqueda cuesta ~102). Solo la escribe y la lee la función youtube-radar (service_role).
CREATE TABLE IF NOT EXISTS public.youtube_radar_cache (
  key text PRIMARY KEY CHECK (char_length(key) <= 200),
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.youtube_radar_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.youtube_radar_cache FROM anon, authenticated;
