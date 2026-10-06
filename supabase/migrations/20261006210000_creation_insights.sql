-- Aprender de lo que crean los usuarios (06-oct-2026, pedido de Jean: "tenemos que retroalimentarnos
-- de los usuarios para optimizar y mejorar").
--  · carousel_clones: cada carrusel viral que alguien clona queda guardado con su análisis (gancho,
--    por qué funciona, ADN, composición de cada lámina, estilo). Solo texto: nunca se guardan las fotos
--    del original. Es la biblioteca de "lo que funciona" que ve el admin, ordenada por me gusta.
--    La escribe SOLO el servidor (carousel-clone, con service_role); el usuario puede leer lo suyo.
--  · creation_feedback: "¿Te sirvió?" (sí / no + una nota opcional) en las herramientas, para encontrar
--    los muros: lo que no sirve o no está optimizado. Cada usuario escribe y lee lo suyo; el admin, todo.

CREATE TABLE IF NOT EXISTS public.carousel_clones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url         text NOT NULL CHECK (url ~ '^https://www\.instagram\.com/p/' AND char_length(url) <= 200),
  owner       text CHECK (owner IS NULL OR char_length(owner) <= 40),
  likes       integer,
  comments    integer,
  mode        text NOT NULL DEFAULT 'tema' CHECK (mode IN ('tema', 'producto')),
  hook        text CHECK (hook IS NULL OR char_length(hook) <= 200),
  summary     text CHECK (summary IS NULL OR char_length(summary) <= 300),
  why         text CHECK (why IS NULL OR char_length(why) <= 600),
  analysis    jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(analysis) <= 32768),
  result      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(result) <= 16384),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS carousel_clones_created_idx ON public.carousel_clones (created_at DESC);
CREATE INDEX IF NOT EXISTS carousel_clones_user_idx ON public.carousel_clones (user_id);

ALTER TABLE public.carousel_clones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carousel_clones_select ON public.carousel_clones;
CREATE POLICY carousel_clones_select ON public.carousel_clones
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()), 'admin'));
-- Sin políticas de INSERT/UPDATE/DELETE para usuarios: solo escribe el servidor.

CREATE TABLE IF NOT EXISTS public.creation_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  tool        text NOT NULL CHECK (tool ~ '^[a-z0-9-]{2,40}$'),
  ref_id      uuid,
  helpful     boolean NOT NULL,
  note        text CHECK (note IS NULL OR char_length(note) <= 500),
  context     jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(context) <= 2048),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creation_feedback_created_idx ON public.creation_feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS creation_feedback_user_idx ON public.creation_feedback (user_id);

ALTER TABLE public.creation_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS creation_feedback_select ON public.creation_feedback;
CREATE POLICY creation_feedback_select ON public.creation_feedback
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()), 'admin'));

DROP POLICY IF EXISTS creation_feedback_insert ON public.creation_feedback;
CREATE POLICY creation_feedback_insert ON public.creation_feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Cambiar de opinión (sí → no) o completar la nota: solo lo propio.
DROP POLICY IF EXISTS creation_feedback_update ON public.creation_feedback;
CREATE POLICY creation_feedback_update ON public.creation_feedback
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Freno contra abuso: máximo 60 opiniones por usuario al día.
CREATE OR REPLACE FUNCTION public.creation_feedback_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.creation_feedback
      WHERE user_id = NEW.user_id AND created_at > now() - interval '1 day') >= 60 THEN
    RAISE EXCEPTION 'Demasiadas opiniones hoy' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.creation_feedback_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS creation_feedback_limit ON public.creation_feedback;
CREATE TRIGGER creation_feedback_limit BEFORE INSERT ON public.creation_feedback
  FOR EACH ROW EXECUTE FUNCTION public.creation_feedback_limit();
