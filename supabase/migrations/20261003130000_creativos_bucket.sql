-- Estudio de imágenes (Creativos, Miniaturas, Carruseles): cada imagen generada se guarda en el
-- bucket privado "creativos", en <user_id>/<product_id>/..., comprimida a WebP en el navegador.
-- Mismo patrón que "personajes": cada usuario solo ve y toca su carpeta.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('creativos', 'creativos', false, 2097152, ARRAY['image/webp', 'image/png', 'image/jpeg'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY creativos_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'creativos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY creativos_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'creativos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY creativos_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'creativos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY creativos_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'creativos' AND (storage.foldername(name))[1] = auth.uid()::text);
