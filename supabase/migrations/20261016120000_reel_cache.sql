-- Analizador de Reels v2 · bloque 1 (16-oct-2026, Jean): el Reel se paga UNA vez para todos.
--  · reel_extractions: caché GLOBAL por Reel (shortcode). Lo que trae Apify (texto, cifras, enlaces del
--    video y la portada) y, desde el bloque 3, el análisis base de la IA (capa A). Vale 7 días; después
--    se vuelve a leer. El video nunca se guarda: solo el enlace temporal de Instagram.
--  · reel_analyses: cada análisis de cada usuario (nivel, resultado, créditos y costo real: Apify, capa A,
--    capa B y si salió de la caché). Es lo que mide el margen (panel de costos, bloque 7).
--  · apify_runs + provider_caps: cada corrida de Apify (de cualquier función) queda anotada con su costo;
--    si el gasto del mes llega al tope, las lecturas nuevas se pausan y lo que está en caché sigue.
-- Todo lo escribe SOLO el servidor (service_role). El usuario lee sus análisis; el admin, todo.

CREATE TABLE IF NOT EXISTS public.reel_extractions (
  shortcode     text PRIMARY KEY CHECK (shortcode ~ '^[A-Za-z0-9_-]{5,40}$'),
  url           text NOT NULL CHECK (url ~ '^https://www\.instagram\.com/reel/' AND char_length(url) <= 200),
  owner         text CHECK (owner IS NULL OR char_length(owner) <= 40),
  caption       text CHECK (caption IS NULL OR char_length(caption) <= 1500),
  duration_s    numeric(8,2),
  views         bigint,
  likes         bigint,
  comments      bigint,
  is_video      boolean NOT NULL DEFAULT true,
  video_url     text CHECK (video_url IS NULL OR char_length(video_url) <= 2000),
  cover_url     text CHECK (cover_url IS NULL OR char_length(cover_url) <= 2000),
  apify_usd     numeric(10,6) NOT NULL DEFAULT 0,
  extracted_at  timestamptz NOT NULL DEFAULT now(),
  base          jsonb CHECK (base IS NULL OR pg_column_size(base) <= 49152),
  base_model    text CHECK (base_model IS NULL OR char_length(base_model) <= 60),
  llm_a_usd     numeric(10,6),
  analyzed_at   timestamptz
);

ALTER TABLE public.reel_extractions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reel_extractions_admin_select ON public.reel_extractions;
CREATE POLICY reel_extractions_admin_select ON public.reel_extractions
  FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));

CREATE TABLE IF NOT EXISTS public.reel_analyses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shortcode     text NOT NULL REFERENCES public.reel_extractions(shortcode) ON DELETE CASCADE,
  nivel         text NOT NULL DEFAULT 'adaptacion' CHECK (nivel IN ('espejo', 'adaptacion', 'inspiracion')),
  angulo_id     text CHECK (angulo_id IS NULL OR angulo_id ~ '^[a-z0-9_-]{1,40}$'),
  palabra_clave text CHECK (palabra_clave IS NULL OR char_length(palabra_clave) <= 30),
  source        text NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'api')),
  result        jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(result) <= 49152),
  cache_hit     boolean NOT NULL DEFAULT false,
  apify_usd     numeric(10,6) NOT NULL DEFAULT 0,
  llm_a_usd     numeric(10,6) NOT NULL DEFAULT 0,
  llm_b_usd     numeric(10,6) NOT NULL DEFAULT 0,
  credits       integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reel_analyses_user_idx ON public.reel_analyses (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reel_analyses_shortcode_idx ON public.reel_analyses (shortcode);
CREATE INDEX IF NOT EXISTS reel_analyses_created_idx ON public.reel_analyses (created_at DESC);

ALTER TABLE public.reel_analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reel_analyses_select ON public.reel_analyses;
CREATE POLICY reel_analyses_select ON public.reel_analyses
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()), 'admin'));
-- Sin INSERT/UPDATE/DELETE para usuarios: solo escribe el servidor.

CREATE TABLE IF NOT EXISTS public.apify_runs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fn          text NOT NULL CHECK (char_length(fn) <= 40),
  urls        integer NOT NULL DEFAULT 0,
  items       integer NOT NULL DEFAULT 0,
  cost_usd    numeric(10,6) NOT NULL DEFAULT 0,
  ok          boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS apify_runs_created_idx ON public.apify_runs (created_at DESC);

ALTER TABLE public.apify_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS apify_runs_admin_select ON public.apify_runs;
CREATE POLICY apify_runs_admin_select ON public.apify_runs
  FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));

CREATE TABLE IF NOT EXISTS public.provider_caps (
  provider     text PRIMARY KEY CHECK (provider ~ '^[a-z0-9_]{2,30}$'),
  monthly_usd  numeric(10,2) NOT NULL CHECK (monthly_usd >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
-- Tope inicial: el plan gratis de Apify trae US$5 al mes. Jean lo cambia cuando quiera.
INSERT INTO public.provider_caps (provider, monthly_usd) VALUES ('apify', 5.00)
ON CONFLICT (provider) DO NOTHING;

ALTER TABLE public.provider_caps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_caps_admin_select ON public.provider_caps;
CREATE POLICY provider_caps_admin_select ON public.provider_caps
  FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));
DROP POLICY IF EXISTS provider_caps_admin_update ON public.provider_caps;
CREATE POLICY provider_caps_admin_update ON public.provider_caps
  FOR UPDATE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'));

-- Tope y gasto de Apify en el mes (UTC). Solo para el servidor.
CREATE OR REPLACE FUNCTION public.apify_budget()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'cap',   COALESCE((SELECT monthly_usd FROM public.provider_caps WHERE provider = 'apify'), 0),
    'spent', COALESCE((SELECT sum(cost_usd) FROM public.apify_runs
                       WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'), 0)
  );
$$;
REVOKE ALL ON FUNCTION public.apify_budget() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apify_budget() TO service_role;
