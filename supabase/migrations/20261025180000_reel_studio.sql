-- Reel Studio (24/25-oct-2026, pedido de Jean: "Mi identidad", recrear reels de referencia, plantillas reutilizables y
-- producción diaria de borradores). Todo es de cada cuenta (RLS por user_id). Hoy la herramienta es solo de Jean
-- (compuerta owner() en reel-ia y reel-diario); las tablas ya quedan listas y aisladas por usuario.

-- Mi identidad: se configura una vez y se usa sola en cada reel (se puede cambiar por proyecto en el navegador).
CREATE TABLE IF NOT EXISTS public.reel_identidad (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  fotos jsonb NOT NULL DEFAULT '[]'::jsonb,          -- [{bucket, path}] en estudio-avatar (la primera es la principal)
  logo jsonb,                                         -- {bucket, path}
  voice_id text CHECK (voice_id IS NULL OR voice_id ~ '^[A-Za-z0-9]{10,40}$'),
  paleta text NOT NULL DEFAULT 'cian' CHECK (char_length(paleta) <= 30),
  ropa text NOT NULL DEFAULT 'elegant, well-fitted dark clothing' CHECK (char_length(ropa) <= 120),
  palabra text NOT NULL DEFAULT '' CHECK (char_length(palabra) <= 30),
  velocidad numeric NOT NULL DEFAULT 1.1 CHECK (velocidad BETWEEN 0.9 AND 1.2),
  sfx boolean NOT NULL DEFAULT true,
  clips_desc jsonb NOT NULL DEFAULT '{}'::jsonb,       -- {ruta en biblioteca: qué muestra} (lo usa también reel-diario)
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reel_identidad ENABLE ROW LEVEL SECURITY;
CREATE POLICY reel_identidad_own_select ON public.reel_identidad FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY reel_identidad_own_insert ON public.reel_identidad FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY reel_identidad_own_update ON public.reel_identidad FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- Plantillas: el análisis audiovisual de un reel de referencia, guardado para no volver a analizarlo.
CREATE TABLE IF NOT EXISTS public.reel_plantillas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 80),
  fuente text NOT NULL DEFAULT '' CHECK (char_length(fuente) <= 500),   -- enlace o "video subido"
  video_path text CHECK (video_path IS NULL OR char_length(video_path) <= 300),
  duracion numeric,
  analisis jsonb NOT NULL,
  thumbs text[] NOT NULL DEFAULT '{}',                                  -- rutas en el bucket biblioteca
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reel_plantillas_user ON public.reel_plantillas (user_id, created_at DESC);
ALTER TABLE public.reel_plantillas ENABLE ROW LEVEL SECURITY;
CREATE POLICY reel_plantillas_own_select ON public.reel_plantillas FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY reel_plantillas_own_insert ON public.reel_plantillas FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY reel_plantillas_own_update ON public.reel_plantillas FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY reel_plantillas_own_delete ON public.reel_plantillas FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- Producción diaria: con qué plantilla, sobre qué temas y cuántos borradores al día (1 o 2).
CREATE TABLE IF NOT EXISTS public.reel_diario (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  activo boolean NOT NULL DEFAULT false,
  plantilla_id uuid REFERENCES public.reel_plantillas(id) ON DELETE SET NULL,
  temas text[] NOT NULL DEFAULT '{}' CHECK (cardinality(temas) <= 30),
  por_dia smallint NOT NULL DEFAULT 2 CHECK (por_dia BETWEEN 1 AND 2),
  modo text NOT NULL DEFAULT 'inspiracion' CHECK (modo IN ('espejo', 'recrear', 'inspiracion', 'adaptacion')),
  palabra text NOT NULL DEFAULT '' CHECK (char_length(palabra) <= 30),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reel_diario ENABLE ROW LEVEL SECURITY;
CREATE POLICY reel_diario_own_select ON public.reel_diario FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY reel_diario_own_insert ON public.reel_diario FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY reel_diario_own_update ON public.reel_diario FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- Borradores que deja el productor diario (o la persona): guion + storyboard listos para aprobar y producir.
CREATE TABLE IF NOT EXISTS public.reel_borradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plantilla_id uuid REFERENCES public.reel_plantillas(id) ON DELETE SET NULL,
  tema text NOT NULL DEFAULT '' CHECK (char_length(tema) <= 300),
  modo text NOT NULL DEFAULT 'inspiracion',
  reel jsonb NOT NULL,
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'aprobado', 'descartado')),
  origen text NOT NULL DEFAULT 'diario' CHECK (origen IN ('diario', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reel_borradores_user ON public.reel_borradores (user_id, created_at DESC);
ALTER TABLE public.reel_borradores ENABLE ROW LEVEL SECURITY;
CREATE POLICY reel_borradores_own_select ON public.reel_borradores FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY reel_borradores_own_update ON public.reel_borradores FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY reel_borradores_own_delete ON public.reel_borradores FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
-- Los inserta solo el servidor (reel-diario, con service_role).

-- Cada día a las 11:00 UTC (7:00 en RD): reel-diario deja los borradores del día. Sin configuraciones activas no
-- gasta nada.
SELECT cron.schedule('supernova-reel-diario', '0 11 * * *', $$
  SELECT net.http_post(
    url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/reel-diario',
    headers := private.cron_headers(),
    body := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 150000
  );
$$);
