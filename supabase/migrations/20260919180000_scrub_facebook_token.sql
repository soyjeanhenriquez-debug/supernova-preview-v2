-- SUPERNOVA — El token de Facebook no puede vivir en datos que leen los usuarios.
--
-- La Ad Library API devuelve `ad_snapshot_url` con `access_token=<NUESTRO TOKEN>`
-- pegado, y así se guardaba en winning_ads.ad_url (78k filas) y, por copia, en
-- offers.sample_ad_url (7k): cualquier usuario con acceso lo recibía en el
-- navegador. Aquí: (1) se limpia lo guardado, (2) se fusionan los anuncios que
-- quedaron duplicados solo porque el token cambió, (3) un trigger garantiza que
-- no vuelva a entrar aunque alguna función lo olvide.

CREATE OR REPLACE FUNCTION public.strip_fb_token(p_url TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_url IS NULL OR position('access_token=' IN p_url) = 0 THEN p_url
    ELSE regexp_replace(
           regexp_replace(p_url, '([?&])access_token=[^&#]*&?', '\1', 'g'),
           '[?&]+$', '')
  END
$$;

-- (2) Duplicados: mismo keyword + misma URL sin token. Se conserva la fila que
-- alguien referencia (oferta u hook) y, si no, la más reciente; las referencias
-- a las filas que se van se apuntan a la que queda.
CREATE TEMP TABLE _fb_dups ON COMMIT DROP AS
WITH refs AS (
  SELECT sample_ad_id AS id FROM public.offers WHERE sample_ad_id IS NOT NULL
  UNION
  SELECT source_ad_id FROM public.hook_vault WHERE source_ad_id IS NOT NULL
), ranked AS (
  SELECT w.id,
         row_number() OVER win AS rn,
         first_value(w.id) OVER win AS keep_id
  FROM public.winning_ads w
  LEFT JOIN refs r ON r.id = w.id
  WHERE w.ad_url LIKE '%access_token=%'
  WINDOW win AS (PARTITION BY w.keyword, public.strip_fb_token(w.ad_url)
                 ORDER BY (r.id IS NOT NULL) DESC, w.scraped_at DESC NULLS LAST, w.id)
)
SELECT id AS old_id, keep_id FROM ranked WHERE rn > 1;

UPDATE public.offers o SET sample_ad_id = d.keep_id FROM _fb_dups d WHERE o.sample_ad_id = d.old_id;
UPDATE public.hook_vault h SET source_ad_id = d.keep_id FROM _fb_dups d WHERE h.source_ad_id = d.old_id;
DELETE FROM public.winning_ads w USING _fb_dups d WHERE w.id = d.old_id;

-- (1) Limpieza
UPDATE public.winning_ads SET ad_url = public.strip_fb_token(ad_url) WHERE ad_url LIKE '%access_token=%';
UPDATE public.offers SET sample_ad_url = public.strip_fb_token(sample_ad_url) WHERE sample_ad_url LIKE '%access_token=%';

-- (3) Que no vuelva a entrar
CREATE OR REPLACE FUNCTION public.tg_strip_fb_token_winning_ads()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.ad_url := public.strip_fb_token(NEW.ad_url);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tg_strip_fb_token_offers()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.sample_ad_url := public.strip_fb_token(NEW.sample_ad_url);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS strip_fb_token ON public.winning_ads;
CREATE TRIGGER strip_fb_token BEFORE INSERT OR UPDATE OF ad_url ON public.winning_ads
  FOR EACH ROW EXECUTE FUNCTION public.tg_strip_fb_token_winning_ads();

DROP TRIGGER IF EXISTS strip_fb_token ON public.offers;
CREATE TRIGGER strip_fb_token BEFORE INSERT OR UPDATE OF sample_ad_url ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.tg_strip_fb_token_offers();

REVOKE ALL ON FUNCTION public.tg_strip_fb_token_winning_ads() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_strip_fb_token_offers() FROM PUBLIC, anon, authenticated;
