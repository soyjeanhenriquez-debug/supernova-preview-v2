-- Videos guardados en nuestro almacenamiento (06-nov-2026, pedido de Jean): los enlaces de los
-- proveedores caducan en unos días. video-guardar copia cada video terminado a este bucket.
-- Público para leer (la ruta lleva dos UUID: uid/job.mp4); solo el service role escribe.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('videos-creados', 'videos-creados', true, 52428800, ARRAY['video/mp4'])
ON CONFLICT (id) DO NOTHING;

SELECT cron.schedule(
  'supernova-video-guardar',
  '*/10 * * * *',
  $$ SELECT net.http_post(
       url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/video-guardar',
       headers := private.cron_headers(),
       body := '{}'::jsonb,
       timeout_milliseconds := 120000); $$
);
