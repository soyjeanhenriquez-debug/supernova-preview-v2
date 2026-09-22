-- Mándala Creativa: cada anuncio creado se guarda con su resultado real.
-- Así el progreso sigue al usuario entre dispositivos y la rueda aprende qué ganó.
CREATE TABLE IF NOT EXISTS public.mandala_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('atraer','conectar','convertir','recuperar')),
  angle text NOT NULL CHECK (char_length(angle) <= 40),
  format text NOT NULL DEFAULT '' CHECK (char_length(format) <= 60),
  platform text NOT NULL DEFAULT 'meta' CHECK (platform IN ('meta','tiktok','youtube','organico')),
  brief text NOT NULL DEFAULT '' CHECK (char_length(brief) <= 3000),
  output text NOT NULL DEFAULT '' CHECK (char_length(output) <= 30000),
  status text NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','publicado','ganador','descartado')),
  spend numeric CHECK (spend IS NULL OR spend >= 0),
  ctr numeric CHECK (ctr IS NULL OR (ctr >= 0 AND ctr <= 100)),
  sales integer CHECK (sales IS NULL OR sales >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mandala_ads_user_created ON public.mandala_ads (user_id, created_at DESC);

ALTER TABLE public.mandala_ads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mandala_ads FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mandala_ads TO authenticated;

CREATE POLICY mandala_ads_select ON public.mandala_ads FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT public.has_access()));
CREATE POLICY mandala_ads_insert ON public.mandala_ads FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.has_access()));
CREATE POLICY mandala_ads_update ON public.mandala_ads FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT public.has_access()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.has_access()));
CREATE POLICY mandala_ads_delete ON public.mandala_ads FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Tope por usuario: nadie llena la base con miles de filas.
CREATE OR REPLACE FUNCTION public.mandala_ads_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.mandala_ads WHERE user_id = NEW.user_id) >= 500 THEN
    RAISE EXCEPTION 'Llegaste al máximo de 500 anuncios guardados: borra algunos descartados.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mandala_ads_limit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER mandala_ads_limit BEFORE INSERT ON public.mandala_ads
  FOR EACH ROW EXECUTE FUNCTION public.mandala_ads_limit();

CREATE OR REPLACE FUNCTION public.mandala_ads_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); NEW.user_id := OLD.user_id; RETURN NEW; END $$;
CREATE TRIGGER mandala_ads_touch BEFORE UPDATE ON public.mandala_ads
  FOR EACH ROW EXECUTE FUNCTION public.mandala_ads_touch();
