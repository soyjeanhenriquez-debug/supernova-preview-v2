-- FASE 5 — Mini Apps Rentables: negocios digitales listos para copiar y
-- cobrar, generados por IA a partir de ofertas que están pagando anuncios
-- ahora mismo. Metadata pública (teaser); contenido privado que se
-- desbloquea con créditos (150 ⚡, atómico). "2 nuevos cada mes" automático
-- por cron (generate-kit los días 1 y 15).

CREATE TABLE IF NOT EXISTS public.mini_app_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  tagline TEXT,
  niche TEXT,
  market_group TEXT,            -- ES | BR | US | RU
  offer_id UUID REFERENCES public.offers(id) ON DELETE SET NULL,
  cover_emoji TEXT DEFAULT '🧩',
  summary TEXT,                 -- teaser público (sin la salsa secreta)
  whats_inside JSONB NOT NULL DEFAULT '[]'::jsonb,   -- lista pública de entregables
  proof JSONB NOT NULL DEFAULT '{}'::jsonb,          -- días pagando, anuncios activos, score, mercado
  price_credits INT NOT NULL DEFAULT 150,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,        -- PRIVADO: blueprint, miniapp_prompt, whatsapp, vsl, ads, landing, hooks, pricing
  status TEXT NOT NULL DEFAULT 'published',
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mini_app_kits ENABLE ROW LEVEL SECURITY;
-- Sin políticas: nadie lee la tabla directo (protege `content`). Todo pasa por RPC.

CREATE TABLE IF NOT EXISTS public.kit_unlocks (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kit_id UUID NOT NULL REFERENCES public.mini_app_kits(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kit_id)
);
ALTER TABLE public.kit_unlocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY kit_unlocks_select_own ON public.kit_unlocks
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Catálogo público (sin `content`) + flag de desbloqueo del usuario actual.
CREATE OR REPLACE FUNCTION public.get_kits()
RETURNS TABLE (
  id UUID, slug TEXT, title TEXT, tagline TEXT, niche TEXT, market_group TEXT, offer_id UUID,
  cover_emoji TEXT, summary TEXT, whats_inside JSONB, proof JSONB, price_credits INT,
  published_at TIMESTAMPTZ, unlocked BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT k.id, k.slug, k.title, k.tagline, k.niche, k.market_group, k.offer_id,
         k.cover_emoji, k.summary, k.whats_inside, k.proof, k.price_credits, k.published_at,
         EXISTS (SELECT 1 FROM public.kit_unlocks u WHERE u.kit_id = k.id AND u.user_id = auth.uid()) AS unlocked
  FROM public.mini_app_kits k
  WHERE k.status = 'published' AND auth.uid() IS NOT NULL
  ORDER BY k.published_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_kits() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kits() TO authenticated;

-- Desbloqueo atómico: cobra con la RPC de créditos de siempre y registra.
CREATE OR REPLACE FUNCTION public.unlock_kit(p_kit_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_kit RECORD;
  v_res JSONB;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'No autenticado'); END IF;
  SELECT id, title, price_credits INTO v_kit FROM public.mini_app_kits WHERE id = p_kit_id AND status = 'published';
  IF v_kit.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Kit no encontrado'); END IF;
  IF EXISTS (SELECT 1 FROM public.kit_unlocks WHERE user_id = v_uid AND kit_id = p_kit_id) THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  v_res := public.consume_credits(v_kit.price_credits, 'unlock_kit', 'Mini App · ' || left(v_kit.title, 40), jsonb_build_object('kit_id', p_kit_id));
  IF coalesce((v_res->>'success')::boolean, false) = false THEN RETURN v_res; END IF;

  INSERT INTO public.kit_unlocks (user_id, kit_id) VALUES (v_uid, p_kit_id) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('success', true, 'balance', v_res->'balance');
END;
$$;
REVOKE ALL ON FUNCTION public.unlock_kit(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_kit(UUID) TO authenticated;

-- Contenido privado: solo si el usuario lo desbloqueó (o es admin).
CREATE OR REPLACE FUNCTION public.get_kit_content(p_kit_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT k.content
  FROM public.mini_app_kits k
  WHERE k.id = p_kit_id
    AND (
      EXISTS (SELECT 1 FROM public.kit_unlocks u WHERE u.kit_id = k.id AND u.user_id = auth.uid())
      OR public.has_role(auth.uid(), 'admin')
    );
$$;
REVOKE ALL ON FUNCTION public.get_kit_content(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kit_content(UUID) TO authenticated;

-- "2 nuevos cada mes", automático: días 1 y 15 a las 10:00 UTC.
SELECT cron.schedule(
  'supernova-generate-kit-biweekly',
  '0 10 1,15 * *',
  $$
  SELECT net.http_post(
    url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/generate-kit',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"count": 1}'::jsonb
  );
  $$
);
