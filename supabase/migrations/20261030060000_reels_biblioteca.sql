-- SUPERNOVA — «Reels que funcionan» (30-oct-2026, Jean: «dale con los puntos del 1 al 4 en la app»).
--
-- Los reels que ya se pagaron en Apify (en la app o fuera de ella) dejan de perderse: quedan en una biblioteca que
-- cualquier cuenta con acceso mira gratis, ordenada por vistas, con su transcripción y su lectura (gancho, tema,
-- estructura, por qué funciona). Analizar uno a fondo sigue siendo «Analiza un Reel» (cobra el servidor).
--
-- reel_biblioteca   un reel por shortcode. source: 'apify' (corridas de Apify importadas con
--                   scripts/reels-apify-a-biblioteca.py) o 'app' (lo leyó «Analiza un Reel»: entra solo por el trigger).
--                   lectura = lo que escribe la función reel-biblioteca, una vez por reel, para todas las cuentas.
-- hook_vault        source 'anuncio' (lo de siempre) o 'reel'; los de reel van con winner_score NULL, así que el orden
--                   de los ganchos de anuncios no cambia.
-- Solo añade: no borra ni oculta nada de lo que ya estaba.

CREATE TABLE IF NOT EXISTS public.reel_biblioteca (
  shortcode   text PRIMARY KEY,
  url         text NOT NULL,
  owner       text,
  owner_name  text,
  caption     text,
  transcript  text,
  duration_s  numeric,
  views       bigint,
  likes       bigint,
  comments    bigint,
  posted_at   timestamptz,
  music       text,
  hashtags    text[],
  language    text,
  source      text NOT NULL DEFAULT 'apify' CHECK (source IN ('apify', 'app')),
  gancho      text,
  tema        text,
  tipo        text,
  intencion   text,
  lectura     jsonb,
  lectura_usd numeric,
  oculto      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reel_biblioteca_views_idx ON public.reel_biblioteca (views DESC NULLS LAST) WHERE NOT oculto;
CREATE INDEX IF NOT EXISTS reel_biblioteca_pendiente_idx ON public.reel_biblioteca (views DESC NULLS LAST)
  WHERE lectura IS NULL AND transcript IS NOT NULL;

ALTER TABLE public.reel_biblioteca ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rb_select_with_access ON public.reel_biblioteca;
CREATE POLICY rb_select_with_access ON public.reel_biblioteca FOR SELECT TO authenticated
  USING ((SELECT public.has_access()) AND NOT oculto);
DROP POLICY IF EXISTS rb_admin_all ON public.reel_biblioteca;
CREATE POLICY rb_admin_all ON public.reel_biblioteca FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));
REVOKE ALL ON public.reel_biblioteca FROM anon;
GRANT SELECT ON public.reel_biblioteca TO authenticated;

-- Todo Reel que lee «Analiza un Reel» entra a la biblioteca (punto 4: lo que se paga una vez sirve para todos).
-- Nunca rompe el análisis: si algo falla aquí, se anota y se sigue.
CREATE OR REPLACE FUNCTION private.reel_a_biblioteca()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  BEGIN
    INSERT INTO public.reel_biblioteca AS b (shortcode, url, owner, caption, transcript, duration_s, views, likes, comments, language, source)
    VALUES (NEW.shortcode, COALESCE(NEW.url, 'https://www.instagram.com/reel/' || NEW.shortcode || '/'), NEW.owner, NEW.caption,
            NULLIF(NEW.base ->> 'transcripcion', ''), NEW.duration_s, NEW.views, NEW.likes, NEW.comments,
            NULLIF(NEW.base ->> 'idioma', ''), 'app')
    ON CONFLICT (shortcode) DO UPDATE SET
      views = GREATEST(b.views, EXCLUDED.views),
      likes = GREATEST(b.likes, EXCLUDED.likes),
      comments = GREATEST(b.comments, EXCLUDED.comments),
      transcript = COALESCE(b.transcript, EXCLUDED.transcript),
      language = COALESCE(b.language, EXCLUDED.language),
      updated_at = now();
  EXCEPTION WHEN others THEN
    RAISE WARNING 'reel_a_biblioteca %: %', NEW.shortcode, SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.reel_a_biblioteca() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS reel_extractions_a_biblioteca ON public.reel_extractions;
CREATE TRIGGER reel_extractions_a_biblioteca
  AFTER INSERT OR UPDATE OF base, views ON public.reel_extractions
  FOR EACH ROW EXECUTE FUNCTION private.reel_a_biblioteca();

-- Los que ya leyó la app.
UPDATE public.reel_extractions SET views = views WHERE is_video;

-- Ganchos: de anuncios (lo de siempre) o de reels (con sus vistas y el enlace al reel).
ALTER TABLE public.hook_vault
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'anuncio',
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS views bigint;

-- Lectura diaria de los reels nuevos que entren (función reel-biblioteca, ≈ US$0,003 por reel, una sola vez).
SELECT cron.schedule('supernova-reel-biblioteca-daily', '25 12 * * *',
  $$SELECT net.http_post(url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/reel-biblioteca',
    headers := private.cron_headers(), body := '{"limit": 60}'::jsonb, timeout_milliseconds := 150000)$$);
