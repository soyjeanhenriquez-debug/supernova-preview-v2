-- Producir video de YouTube faceless (04-oct-2026, ECO). PRECIOS PROPUESTOS: Jean los confirma
-- antes de aplicar esta migración.
--
-- Costo real (lista de APIMart del 03-oct-2026) y margen con el crédito más barato (US$0,008):
--   yt_voice_scene  gpt-4o-mini-tts ≈ US$0,015/min; una escena de hasta 700 caracteres (~45 s)
--                   cuesta ≤ US$0,011 → 5 créditos = US$0,04 → 3,6× en el peor caso, ~5× en una
--                   escena normal de ~30 s.
--   yt_scene_image  gpt-image-2 1k ≈ US$0,0081 → 6 créditos = US$0,048 → 5,9×.
-- Un video de 8 min (16 escenas) sin animar: 176 créditos; con 20 % animado (3 × vid_mini_5): 341.
-- Los dos los cobra el servidor (edge function yt-produce) ANTES de llamar a la IA y los devuelve
-- con refund_charge si falla.
INSERT INTO public.credit_prices (action, cost, label, charged_by) VALUES
  ('yt_voice_scene', 5, 'Voz de una escena (hasta ~45 s)', 'server'),
  ('yt_scene_image', 6, 'Imagen de una escena de tu video', 'server')
ON CONFLICT (action) DO UPDATE SET cost = EXCLUDED.cost, label = EXCLUDED.label, updated_at = now();

-- Producciones: solo el guion, el estado y los metadatos (nunca audio, imágenes ni video: eso vive
-- en el navegador del usuario y el video final se descarga; plan Free = 1 GB de almacenamiento).
CREATE TABLE IF NOT EXISTS public.yt_productions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NULL,
  title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 200),
  format text NOT NULL DEFAULT '16:9' CHECK (format IN ('16:9', '9:16', '3:4')),
  script text NOT NULL DEFAULT '' CHECK (char_length(script) <= 60000),
  plan jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(plan) = 'object'
    AND pg_column_size(plan) <= 32768
    AND (NOT (plan ? 'scenes') OR (jsonb_typeof(plan->'scenes') = 'array' AND jsonb_array_length(plan->'scenes') <= 40))
    AND (NOT (plan ? 'narration_seconds') OR (jsonb_typeof(plan->'narration_seconds') = 'number' AND (plan->>'narration_seconds')::numeric <= 1800))
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS yt_productions_user_created_idx ON public.yt_productions (user_id, created_at DESC);

ALTER TABLE public.yt_productions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS yt_productions_select_own ON public.yt_productions;
CREATE POLICY yt_productions_select_own ON public.yt_productions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS yt_productions_insert_own ON public.yt_productions;
CREATE POLICY yt_productions_insert_own ON public.yt_productions
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS yt_productions_update_own ON public.yt_productions;
CREATE POLICY yt_productions_update_own ON public.yt_productions
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS yt_productions_delete_own ON public.yt_productions;
CREATE POLICY yt_productions_delete_own ON public.yt_productions
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.yt_productions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yt_productions TO authenticated;

-- Tope de 50 producciones guardadas por usuario (la tabla no debe crecer sin límite en el plan Free).
CREATE OR REPLACE FUNCTION public.yt_productions_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (SELECT count(*) FROM public.yt_productions WHERE user_id = NEW.user_id) >= 50 THEN
      RAISE EXCEPTION 'Llegaste a 50 producciones guardadas. Borra alguna para crear otra.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yt_productions_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS yt_productions_guard ON public.yt_productions;
CREATE TRIGGER yt_productions_guard
  BEFORE INSERT OR UPDATE ON public.yt_productions
  FOR EACH ROW EXECUTE FUNCTION public.yt_productions_guard();
