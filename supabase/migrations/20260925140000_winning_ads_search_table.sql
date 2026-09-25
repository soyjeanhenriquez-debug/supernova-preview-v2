-- Búsqueda del Radar en una tabla aparte (1/2): tabla + trigger.
--
-- Por qué: el índice full-text idx_winning_ads_search_fts vivía en winning_ads. Cada
-- actualización de días/puntaje (score_unscored_ads reescribe ~125 000 filas cada
-- medianoche UTC, porque casi todas empiezan a las 00:00) rehacía también la entrada
-- del índice de texto: 0 updates HOT, ~37 MB de WAL por corrida y el cron rozando el
-- límite de 2 min. El texto de un anuncio casi nunca cambia; sus días, todos los días.
--
-- Ahora el texto buscable vive en winning_ads_search y el trigger solo la toca cuando
-- cambia el título, la página o el cuerpo. Mismo tsvector que ad_search_tsv().
-- Orden: (1) esta migración, (2) relleno por tandas, (3) índice GIN + radar_search nuevo
-- + borrar el índice viejo (20260925150000_radar_search_uses_search_table.sql).

CREATE TABLE IF NOT EXISTS public.winning_ads_search (
  id  uuid PRIMARY KEY REFERENCES public.winning_ads(id) ON DELETE CASCADE,
  tsv tsvector NOT NULL
);
COMMENT ON TABLE public.winning_ads_search IS 'Texto buscable de winning_ads (ad_search_tsv). Lo mantiene el trigger winning_ads_search_sync; solo lo lee radar_search().';

-- Nadie la lee directo: solo radar_search() (SECURITY DEFINER).
ALTER TABLE public.winning_ads_search ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.winning_ads_search FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_winning_ads_search_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- strip(): sin posiciones (-35 % de espacio: 981 → 640 bytes por anuncio). radar_search
  -- solo usa palabras con prefijo unidas por "&", nunca frases, así que da lo mismo.
  INSERT INTO public.winning_ads_search (id, tsv)
  VALUES (NEW.id, pg_catalog.strip(public.ad_search_tsv(NEW)))
  ON CONFLICT (id) DO UPDATE SET tsv = EXCLUDED.tsv;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.tg_winning_ads_search_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS winning_ads_search_ins ON public.winning_ads;
CREATE TRIGGER winning_ads_search_ins
  AFTER INSERT ON public.winning_ads
  FOR EACH ROW EXECUTE FUNCTION public.tg_winning_ads_search_sync();

-- El upsert de bulk-seed-ads reescribe título/cuerpo con el mismo valor: el WHEN lo filtra.
DROP TRIGGER IF EXISTS winning_ads_search_upd ON public.winning_ads;
CREATE TRIGGER winning_ads_search_upd
  AFTER UPDATE OF ad_title, page_name, ad_body ON public.winning_ads
  FOR EACH ROW
  WHEN (OLD.ad_title IS DISTINCT FROM NEW.ad_title
     OR OLD.page_name IS DISTINCT FROM NEW.page_name
     OR OLD.ad_body IS DISTINCT FROM NEW.ad_body)
  EXECUTE FUNCTION public.tg_winning_ads_search_sync();

-- Relleno. En producción (25-sep) se hizo aparte, en 5 tandas por rango de id de ~25 s
-- cada una, para no tener una transacción larga: 125 471 filas, 88 MB. Aquí queda para
-- una base nueva o local.
INSERT INTO public.winning_ads_search (id, tsv)
SELECT w.id, pg_catalog.strip(public.ad_search_tsv(w)) FROM public.winning_ads w
ON CONFLICT (id) DO NOTHING;
