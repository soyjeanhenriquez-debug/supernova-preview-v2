-- Genjutsu (07-oct-2026, pedido de Jean): sección oculta SOLO para su usuario para probar video de
-- referencia (Seedance 2.0 reference-to-video) con Higgsfield o APIMart. Sin créditos ni planes.
-- Todo se cierra a su user_id (soyjeanhenriquez@gmail.com = 2687ca65-02c7-40db-b2fc-8ed0d57a4424):
-- la tabla solo se lee con su sesión y la escriben las edge functions (service role), que además
-- validan en el servidor que quien llama es él.

CREATE TABLE IF NOT EXISTS public.genjutsu_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('higgsfield', 'apimart')),
  task_id         text CHECK (task_id IS NULL OR char_length(task_id) <= 200),
  status          text NOT NULL DEFAULT 'queued' CHECK (char_length(status) <= 40),
  prompt          text NOT NULL CHECK (char_length(prompt) <= 4000),
  ref_video_path  text NOT NULL CHECK (char_length(ref_video_path) <= 300),
  image_path      text CHECK (image_path IS NULL OR char_length(image_path) <= 300),
  result_url      text CHECK (result_url IS NULL OR char_length(result_url) <= 2000),
  error           text CHECK (error IS NULL OR char_length(error) <= 500),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS genjutsu_jobs_user_idx ON public.genjutsu_jobs (user_id, created_at DESC);

ALTER TABLE public.genjutsu_jobs ENABLE ROW LEVEL SECURITY;

-- Leer: solo Jean, y solo lo suyo. Escribir: nadie desde el navegador (lo hacen las edge functions).
DROP POLICY IF EXISTS genjutsu_jobs_select ON public.genjutsu_jobs;
CREATE POLICY genjutsu_jobs_select ON public.genjutsu_jobs
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT auth.uid()) = '2687ca65-02c7-40db-b2fc-8ed0d57a4424'::uuid);

-- Bucket privado para el video de referencia y la imagen opcional del personaje.
-- 50 MB es el tope de subida del plan Free de Supabase.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('genjutsu', 'genjutsu', false, 52428800, ARRAY['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Solo Jean, solo en su carpeta ({uid}/…).
DROP POLICY IF EXISTS genjutsu_select_own ON storage.objects;
CREATE POLICY genjutsu_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'genjutsu' AND (SELECT auth.uid()) = '2687ca65-02c7-40db-b2fc-8ed0d57a4424'::uuid
         AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS genjutsu_insert_own ON storage.objects;
CREATE POLICY genjutsu_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'genjutsu' AND (SELECT auth.uid()) = '2687ca65-02c7-40db-b2fc-8ed0d57a4424'::uuid
              AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS genjutsu_delete_own ON storage.objects;
CREATE POLICY genjutsu_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'genjutsu' AND (SELECT auth.uid()) = '2687ca65-02c7-40db-b2fc-8ed0d57a4424'::uuid
         AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- Varias imágenes de referencia (personajes, productos o ropa; Seedance acepta hasta 9) y el modo
-- (transferencia de movimiento o intercambio de objetos), como el Genjutsu de Higgsfield.
ALTER TABLE public.genjutsu_jobs
  ADD COLUMN IF NOT EXISTS image_paths text[] NOT NULL DEFAULT '{}' CHECK (cardinality(image_paths) <= 9),
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'movimiento' CHECK (mode IN ('movimiento', 'objetos'));
