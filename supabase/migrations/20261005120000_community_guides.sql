-- Enseñanzas de la comunidad (05-oct-2026, pedido de Jean): los usuarios comparten cómo usan la app
-- para un caso real (ej.: "videos de GTA 6 con Series y Ganchos"). Se ven en Aprende.
-- Reglas del manual: nada se publica sin revisión de un admin (sin promesas de ingresos, sin textos
-- copiados de otros, crédito a la fuente si es una adaptación). El estado y la fecha de publicación
-- los decide SOLO un admin: un trigger los fuerza para cualquier otro usuario.

CREATE TABLE IF NOT EXISTS public.community_guides (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name    text NOT NULL CHECK (char_length(author_name) BETWEEN 1 AND 60),
  title          text NOT NULL CHECK (char_length(title) BETWEEN 8 AND 120),
  summary        text NOT NULL CHECK (char_length(summary) BETWEEN 10 AND 280),
  body           text NOT NULL CHECK (char_length(body) BETWEEN 200 AND 20000),
  tools          text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tools) <= 8),
  source_credit  text CHECK (source_credit IS NULL OR char_length(source_credit) <= 160),
  source_url     text CHECK (source_url IS NULL OR (source_url ~ '^https?://' AND char_length(source_url) <= 500)),
  status         text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'publicada', 'rechazada')),
  review_note    text CHECK (review_note IS NULL OR char_length(review_note) <= 500),
  helpful_count  integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  published_at   timestamptz
);
CREATE INDEX IF NOT EXISTS community_guides_published_idx ON public.community_guides (published_at DESC) WHERE status = 'publicada';
CREATE INDEX IF NOT EXISTS community_guides_user_idx ON public.community_guides (user_id);
CREATE INDEX IF NOT EXISTS community_guides_pending_idx ON public.community_guides (created_at) WHERE status = 'pendiente';

ALTER TABLE public.community_guides ENABLE ROW LEVEL SECURITY;

-- Leer: las publicadas (cualquier usuario con sesión: Aprende está abierto en la vitrina),
-- las propias en cualquier estado, y todo para un admin.
DROP POLICY IF EXISTS community_guides_select ON public.community_guides;
CREATE POLICY community_guides_select ON public.community_guides
  FOR SELECT TO authenticated
  USING (status = 'publicada'
         OR user_id = (SELECT auth.uid())
         OR public.has_role((SELECT auth.uid()), 'admin'));

-- Escribir: solo quien tiene acceso (prueba o plan), y solo lo suyo.
DROP POLICY IF EXISTS community_guides_insert ON public.community_guides;
CREATE POLICY community_guides_insert ON public.community_guides
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_access()) AND user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS community_guides_update ON public.community_guides;
CREATE POLICY community_guides_update ON public.community_guides
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()), 'admin'))
  WITH CHECK (user_id = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()), 'admin'));

DROP POLICY IF EXISTS community_guides_delete ON public.community_guides;
CREATE POLICY community_guides_delete ON public.community_guides
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()), 'admin'));

-- Compuerta: quien no es admin no puede publicarse solo, ni tocar el contador ni la nota de revisión.
-- Si edita una enseñanza ya publicada o rechazada, vuelve a revisión.
CREATE OR REPLACE FUNCTION public.community_guides_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin boolean := public.has_role(auth.uid(), 'admin');
BEGIN
  -- El contador lo mueve solo el trigger de votos (anidado).
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  NEW.updated_at := now();

  IF TG_OP = 'INSERT' THEN
    NEW.helpful_count := 0;
    IF NOT v_admin THEN
      NEW.user_id := auth.uid();
      NEW.status := 'pendiente';
      NEW.review_note := NULL;
      NEW.published_at := NULL;
    END IF;
  ELSE
    NEW.helpful_count := OLD.helpful_count;
    NEW.user_id := OLD.user_id;
    NEW.created_at := OLD.created_at;
    IF NOT v_admin THEN
      NEW.status := 'pendiente';
      NEW.review_note := OLD.review_note;
      NEW.published_at := NULL;
    END IF;
  END IF;

  IF NEW.status = 'publicada' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  ELSIF NEW.status <> 'publicada' THEN
    NEW.published_at := NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.community_guides_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS community_guides_guard ON public.community_guides;
CREATE TRIGGER community_guides_guard
  BEFORE INSERT OR UPDATE ON public.community_guides
  FOR EACH ROW EXECUTE FUNCTION public.community_guides_guard();

-- "Me sirvió": un voto por persona y enseñanza. Cada uno ve solo sus votos; el total va en la guía.
CREATE TABLE IF NOT EXISTS public.community_guide_votes (
  guide_id    uuid NOT NULL REFERENCES public.community_guides(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guide_id, user_id)
);
CREATE INDEX IF NOT EXISTS community_guide_votes_user_idx ON public.community_guide_votes (user_id);
ALTER TABLE public.community_guide_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_guide_votes_select ON public.community_guide_votes;
CREATE POLICY community_guide_votes_select ON public.community_guide_votes
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS community_guide_votes_insert ON public.community_guide_votes;
CREATE POLICY community_guide_votes_insert ON public.community_guide_votes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid())
              AND EXISTS (SELECT 1 FROM public.community_guides g
                          WHERE g.id = guide_id AND g.status = 'publicada'));

DROP POLICY IF EXISTS community_guide_votes_delete ON public.community_guide_votes;
CREATE POLICY community_guide_votes_delete ON public.community_guide_votes
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.community_guide_votes_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_guides SET helpful_count = helpful_count + 1 WHERE id = NEW.guide_id;
    RETURN NEW;
  ELSE
    UPDATE public.community_guides SET helpful_count = greatest(helpful_count - 1, 0) WHERE id = OLD.guide_id;
    RETURN OLD;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.community_guide_votes_count() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS community_guide_votes_count ON public.community_guide_votes;
CREATE TRIGGER community_guide_votes_count
  AFTER INSERT OR DELETE ON public.community_guide_votes
  FOR EACH ROW EXECUTE FUNCTION public.community_guide_votes_count();
