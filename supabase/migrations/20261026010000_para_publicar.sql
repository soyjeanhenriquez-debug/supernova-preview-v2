-- =====================================================================================================
-- Para publicar (26-oct-2026, pedido de Jean): biblioteca visual de lo que sale cada día y a qué hora.
-- Cada pieza terminada (reel MP4 o carrusel) se guarda en el bucket privado «publicaciones» y ocupa una casilla
-- con hora (slot_at) en content_items. Estado: borrador → listo → programado (Upload-Post) → publicado (o error).
-- Programar lo hace el servidor (edge function «publicar»), nunca el navegador; el navegador solo ve y ordena.
-- =====================================================================================================
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS slot_at timestamptz,
  ADD COLUMN IF NOT EXISTS media_tipo text CHECK (media_tipo IN ('reel', 'carrusel')),
  ADD COLUMN IF NOT EXISTS media_paths text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS caption text,
  ADD COLUMN IF NOT EXISTS ref_borrador uuid,
  ADD COLUMN IF NOT EXISTS notion_page text,
  ADD COLUMN IF NOT EXISTS pub_estado text NOT NULL DEFAULT 'borrador' CHECK (pub_estado IN ('borrador', 'listo', 'programado', 'publicado', 'error')),
  ADD COLUMN IF NOT EXISTS pub_redes text[] NOT NULL DEFAULT '{instagram}',
  ADD COLUMN IF NOT EXISTS pub_job text,
  ADD COLUMN IF NOT EXISTS pub_error text;
-- Una pieza por casilla y por persona.
CREATE UNIQUE INDEX IF NOT EXISTS content_items_slot_unico ON public.content_items (user_id, slot_at) WHERE slot_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS content_items_slot ON public.content_items (user_id, slot_at) WHERE slot_at IS NOT NULL;

-- Bucket privado: cada quien su carpeta ({uid}/…). Reels de hasta 100 MB; fotos de carrusel.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('publicaciones', 'publicaciones', false, 104857600, ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS publicaciones_select_own ON storage.objects;
DROP POLICY IF EXISTS publicaciones_insert_own ON storage.objects;
DROP POLICY IF EXISTS publicaciones_update_own ON storage.objects;
DROP POLICY IF EXISTS publicaciones_delete_own ON storage.objects;
CREATE POLICY publicaciones_select_own ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'publicaciones' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY publicaciones_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'publicaciones' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY publicaciones_update_own ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'publicaciones' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY publicaciones_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'publicaciones' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
