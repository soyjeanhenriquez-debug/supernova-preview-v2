-- Biblioteca de clips para reels (25-oct-2026, pedido de Jean: "graba las mejores funciones y guárdalas en una
-- biblioteca para próximos reels"). Grabaciones de pantalla de la app (y capturas) que se reutilizan en el reel de
-- herramienta IA sin volver a grabar. Ningún bucket aceptaba video (creativos: solo imágenes de 2 MB).
--
-- Bucket privado: cada cuenta solo ve, sube y borra lo de su carpeta ({uid}/…). Subir pide acceso activo
-- (has_access(), igual que creativos). Tope 50 MB por archivo: un clip de 3 a 10 s pesa menos de 2 MB.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('biblioteca', 'biblioteca', false, 52428800,
  ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS biblioteca_select_own ON storage.objects;
CREATE POLICY biblioteca_select_own ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'biblioteca' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS biblioteca_insert_own ON storage.objects;
CREATE POLICY biblioteca_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'biblioteca' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND (SELECT has_access()));
DROP POLICY IF EXISTS biblioteca_delete_own ON storage.objects;
CREATE POLICY biblioteca_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'biblioteca' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
