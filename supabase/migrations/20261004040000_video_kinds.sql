-- Estudio de video, 04-oct-2026 (KINEMA): anuncio en video de 3 tomas, UGC con presentador IA y
-- escenas animadas del video largo de YouTube (ECO). SIN APLICAR: Jean la revisa y la aplica.
--
-- Precios: NO cambian. Anuncio = 3 × vid_mini_5 (55) = 165; UGC = vid_mini_10 (110); escena de
-- YouTube = vid_mini_5. Todo con seedance-2.0-mini (US$0,0217/s ≈ 4× con el crédito a US$0,008),
-- precio que Jean ya aprobó el 03-oct-2026. Si las pruebas muestran que UGC necesita seedance-2.0
-- estándar o Kling v3 con audio, se propondrían vid_ugc_5 / vid_ugc_10 = ceil(costo × 4,5 / 0,008),
-- nunca por debajo de 3× ni por encima de Higgsfield; NO se insertan aquí hasta que Jean decida.

-- 1. Qué tipo de video es y con qué plantilla se armó (para filtrar "Tus videos" por pantalla).
ALTER TABLE public.video_jobs ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'clip';
ALTER TABLE public.video_jobs ADD COLUMN IF NOT EXISTS template text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'video_jobs_kind_check') THEN
    ALTER TABLE public.video_jobs ADD CONSTRAINT video_jobs_kind_check
      CHECK (kind IN ('clip', 'serie', 'anuncio', 'ugc', 'yt_scene'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'video_jobs_template_check') THEN
    ALTER TABLE public.video_jobs ADD CONSTRAINT video_jobs_template_check
      CHECK (template IS NULL OR char_length(template) <= 40);
  END IF;
END $$;

-- "Tus videos de hoy" filtra por usuario + tipo + fecha (tabla chica).
CREATE INDEX IF NOT EXISTS video_jobs_user_kind_idx ON public.video_jobs (user_id, kind, created_at DESC);

-- La tabla ya tiene RLS (solo SELECT del propio usuario; escribe solo la función con service_role).
-- Las columnas nuevas no cambian eso.

-- 2. Interruptor de admin para UGC con presentador hablando en español (labios sincronizados):
--    no se pudo probar sin la llave de APIMart. enabled=false → solo admins lo usan (para probar);
--    cuando Jean lo vea bien en producción:
--      UPDATE public.edge_limits SET enabled = true WHERE fn = 'video-studio:ugc';
--    La función solo LEE esta fila (no pasa por edge_guard con este nombre).
INSERT INTO public.edge_limits (fn, enabled, note) VALUES
  ('video-studio:ugc', false, 'UGC con presentador IA (diálogo en español). Solo admins hasta probarlo en producción.')
ON CONFLICT (fn) DO NOTHING;

-- 3. Topes de la acción "file" (descarga del MP4 propio para el montaje de YouTube; no cobra):
--    usa edge_guard con fn 'video-studio:file' y topes 120/h y 600/día definidos en el código.
--    Se puede apagar sin redesplegar:
--      INSERT INTO public.edge_limits (fn, enabled) VALUES ('video-studio:file', false)
--      ON CONFLICT (fn) DO UPDATE SET enabled = false;
