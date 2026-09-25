-- SUPERNOVA — Catálogo de modelos de video e imagen (fal.ai), aprobado por Jean el 25-sep-2026.
--
-- Precio = costo real de fal × 5 ÷ US$0,008 (crédito más barato), redondeado arriba de 5 en 5.
-- Parámetros fijos (input) leídos de la especificación oficial de fal (openapi) el 25-sep-2026:
--   · Seedance, Kling 2.6 y Kling 3.0 generan AUDIO por defecto (casi el doble de costo): se manda
--     generate_audio=false salvo en "Kling 2.6 con audio".
--   · Veo 3.1 Fast NO acepta 5 s (4s/6s/8s, 8s por defecto): se fija 4 s sin audio (US$0,40).
--   · Wan 2.2 trae los filtros de contenido APAGADOS por defecto: se encienden (nada NSFW).
--   · Todo vertical 9:16 cuando el modelo lo permite (Kling toma el formato de la foto).
-- status: 'admin' = solo admins (pruebas), 'live' = clientes, 'soon' = se ve como PRONTO, 'off' = oculto.
-- tier: 'pro' = cualquier plan activo, 'comunidad' = plan Comunidad Creativos 10X (y admins).

CREATE TABLE IF NOT EXISTS public.media_models (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('video', 'image', 'avatar')),
  grp text NOT NULL,
  label text NOT NULL,
  description text NOT NULL,
  endpoint text NOT NULL,
  image_field text,                       -- nombre del campo de la foto en fal (image_url / start_image_url)
  tier text NOT NULL CHECK (tier IN ('pro', 'comunidad')),
  action text NOT NULL REFERENCES public.credit_prices(action),
  seconds smallint,
  status text NOT NULL DEFAULT 'admin' CHECK (status IN ('admin', 'live', 'soon', 'off')),
  recommended boolean NOT NULL DEFAULT false,
  sort smallint NOT NULL DEFAULT 100,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.media_models ENABLE ROW LEVEL SECURITY;
-- El catálogo se ve (sin endpoint ni parámetros sensibles no hay nada que esconder), no se escribe.
CREATE POLICY media_models_select ON public.media_models FOR SELECT TO authenticated USING (status <> 'off');

INSERT INTO public.credit_prices (action, cost, label, charged_by) VALUES
  ('vid_seedance15',       85, 'Video 5 s · Seedance 1.5 Pro',        'server'),
  ('vid_wan22',           250, 'Video 5 s · Wan 2.2',                 'server'),
  ('vid_kling26pro',      220, 'Video 5 s · Kling 2.6 Pro',           'server'),
  ('vid_kling26pro_audio',440, 'Video 5 s · Kling 2.6 Pro con audio', 'server'),
  ('vid_kling30',         265, 'Video 5 s · Kling 3.0',               'server'),
  ('vid_veo31fast',       315, 'Video 4 s · Veo 3.1 Fast',            'server'),
  ('avatar_kling',        175, 'Avatar que habla · Kling',            'server'),
  ('avatar_omnihuman',    500, 'Avatar que habla · OmniHuman 1.5',    'server'),
  ('img_nanobanana',       25, 'Imagen · Nano Banana',                'server'),
  ('img_seedream4',        20, 'Imagen · Seedream 4',                 'server'),
  ('img_flux2pro',         20, 'Imagen · Flux 2 Pro',                 'server'),
  ('img_nanobananapro',    95, 'Imagen · Nano Banana Pro',            'server'),
  -- Modelos extra (misma fórmula; Jean pidió "agrega todos los modelos", 25-sep-2026)
  ('vid_seedance10fast',  155, 'Video 5 s · Seedance 1.0 Pro Fast',   'server'),
  ('vid_wan25',           315, 'Video 5 s · Wan 2.5',                 'server'),
  ('vid_wan26',           315, 'Video 5 s · Wan 2.6',                 'server'),
  ('vid_ltx23',           300, 'Video 6 s · LTX 2.3',                 'server'),
  ('vid_ltx25fast',       340, 'Video 6 s · LTX 2.5 Fast',            'server'),
  ('avatar_infinitalk',   625, 'Avatar que habla · InfiniTalk',       'server'),
  ('img_fluxdev',          20, 'Imagen · Flux 1 Dev',                 'server'),
  ('img_flux11pro',        25, 'Imagen · Flux 1.1 Pro',               'server'),
  ('img_fluxkontext',      25, 'Imagen · Flux Kontext Pro',           'server'),
  ('img_seedream45',       25, 'Imagen · Seedream 4.5',               'server'),
  ('img_seedream5lite',    25, 'Imagen · Seedream 5 Lite',            'server'),
  ('img_seedream5pro',     45, 'Imagen · Seedream 5 Pro',             'server'),
  ('img_gptimage15',       60, 'Imagen · GPT Image 1.5',              'server'),
  ('img_nanobanana2',      50, 'Imagen · Nano Banana 2',              'server')
ON CONFLICT (action) DO NOTHING;

INSERT INTO public.media_models (id, kind, grp, label, description, endpoint, image_field, tier, action, seconds, status, recommended, sort, input) VALUES
  ('seedance15', 'video', 'Seedance', 'Seedance 1.5 Pro', 'Rápido y económico, movimiento natural. Ideal para empezar.',
   'fal-ai/bytedance/seedance/v1.5/pro/image-to-video', 'image_url', 'pro', 'vid_seedance15', 5, 'admin', true, 10,
   '{"duration":"5","aspect_ratio":"9:16","resolution":"720p","generate_audio":false,"enable_safety_checker":true}'),
  ('wan22', 'video', 'Wan', 'Wan 2.2', 'Buena calidad y movimiento fluido.',
   'fal-ai/wan/v2.2-a14b/image-to-video', 'image_url', 'pro', 'vid_wan22', 5, 'admin', false, 20,
   '{"resolution":"720p","aspect_ratio":"9:16","num_frames":81,"enable_safety_checker":true,"enable_output_safety_checker":true}'),
  ('kling26pro', 'video', 'Kling', 'Kling 2.6 Pro', 'Movimientos realistas y detalle de cine.',
   'fal-ai/kling-video/v2.6/pro/image-to-video', 'start_image_url', 'comunidad', 'vid_kling26pro', 5, 'admin', false, 30,
   '{"duration":"5","generate_audio":false}'),
  ('kling30', 'video', 'Kling', 'Kling 3.0', 'La versión más nueva de Kling: más coherencia entre escenas.',
   'fal-ai/kling-video/v3/standard/image-to-video', 'start_image_url', 'comunidad', 'vid_kling30', 5, 'admin', false, 40,
   '{"duration":"5","generate_audio":false}'),
  ('kling26pro_audio', 'video', 'Kling', 'Kling 2.6 Pro con audio', 'Con sonido ambiente y voz generados en el mismo video.',
   'fal-ai/kling-video/v2.6/pro/image-to-video', 'start_image_url', 'comunidad', 'vid_kling26pro_audio', 5, 'admin', false, 50,
   '{"duration":"5","generate_audio":true}'),
  ('veo31fast', 'video', 'Google', 'Veo 3.1 Fast', 'El modelo de video de Google. Videos de 4 segundos.',
   'fal-ai/veo3.1/fast/image-to-video', 'image_url', 'comunidad', 'vid_veo31fast', 4, 'admin', false, 60,
   '{"duration":"4s","aspect_ratio":"9:16","resolution":"720p","generate_audio":false}'),
  ('avatar_kling', 'avatar', 'Avatar que habla', 'Kling AI Avatar', 'Tu personaje habla a cámara con la boca sincronizada.',
   'fal-ai/kling-video/v1/standard/ai-avatar', 'image_url', 'pro', 'avatar_kling', 5, 'soon', false, 70, '{}'),
  ('avatar_omnihuman', 'avatar', 'Avatar que habla', 'OmniHuman 1.5', 'El avatar más expresivo: gestos y cuerpo, no solo la boca.',
   'fal-ai/bytedance/omnihuman/v1.5', 'image_url', 'comunidad', 'avatar_omnihuman', 5, 'soon', false, 80, '{}'),
  ('nanobanana', 'image', 'Google', 'Nano Banana', 'Retratos realistas y consistentes. Recomendado.',
   'fal-ai/nano-banana', NULL, 'pro', 'img_nanobanana', NULL, 'admin', true, 10,
   '{"aspect_ratio":"9:16","output_format":"jpeg","num_images":1}'),
  ('seedream4', 'image', 'Seedream', 'Seedream 4', 'Fotos muy nítidas y buen color de piel.',
   'fal-ai/bytedance/seedream/v4/text-to-image', NULL, 'pro', 'img_seedream4', NULL, 'admin', false, 20,
   '{"image_size":{"width":1152,"height":2048},"num_images":1,"enable_safety_checker":true}'),
  ('flux2pro', 'image', 'Flux', 'Flux 2 Pro', 'Realismo fotográfico con mucho detalle.',
   'fal-ai/flux-2-pro', NULL, 'pro', 'img_flux2pro', NULL, 'admin', false, 30,
   '{"image_size":"portrait_16_9","output_format":"jpeg","safety_tolerance":"2","enable_safety_checker":true}'),
  ('nanobananapro', 'image', 'Google', 'Nano Banana Pro', 'La máxima calidad de Google para tu personaje.',
   'fal-ai/nano-banana-pro', NULL, 'comunidad', 'img_nanobananapro', NULL, 'admin', false, 40,
   '{"aspect_ratio":"9:16","resolution":"1K","output_format":"jpeg","num_images":1}'),
  -- Extra: video
  ('seedance10fast', 'video', 'Seedance', 'Seedance 1.0 Pro Fast', 'Rápido, en 1080p y con buen movimiento.',
   'fal-ai/bytedance/seedance/v1/pro/fast/image-to-video', 'image_url', 'pro', 'vid_seedance10fast', 5, 'admin', false, 15,
   '{"duration":"5","aspect_ratio":"9:16","resolution":"1080p","enable_safety_checker":true}'),
  ('wan25', 'video', 'Wan', 'Wan 2.5', 'Más detalle que Wan 2.2, en 720p.',
   'fal-ai/wan-25-preview/image-to-video', 'image_url', 'comunidad', 'vid_wan25', 5, 'admin', false, 22,
   '{"duration":"5","resolution":"720p","enable_safety_checker":true}'),
  ('wan26', 'video', 'Wan', 'Wan 2.6', 'Videos fluidos y coherentes que mantienen el estilo de la foto.',
   'wan/v2.6/image-to-video', 'image_url', 'comunidad', 'vid_wan26', 5, 'admin', false, 24,
   '{"duration":"5","resolution":"720p","enable_safety_checker":true}'),
  ('ltx23', 'video', 'LTX', 'LTX 2.3', 'Video en 1080p de 6 segundos.',
   'fal-ai/ltx-2.3/image-to-video', 'image_url', 'comunidad', 'vid_ltx23', 6, 'admin', false, 65,
   '{"duration":6,"resolution":"1080p","aspect_ratio":"9:16","generate_audio":false}'),
  ('ltx25fast', 'video', 'LTX', 'LTX 2.5 Fast', 'Rápido, 6 segundos en 720p.',
   'lightricks/ltx-2.5/image-to-video/fast', 'image_url', 'comunidad', 'vid_ltx25fast', 6, 'admin', false, 66,
   '{"duration":6,"resolution":"720p","aspect_ratio":"9:16","generate_audio":false}'),
  -- Extra: avatar (necesita audio: fase 2)
  ('avatar_infinitalk', 'avatar', 'Avatar que habla', 'InfiniTalk', 'Sincronización labial muy precisa.',
   'fal-ai/infinitalk', 'image_url', 'comunidad', 'avatar_infinitalk', 5, 'soon', false, 85, '{"resolution":"480p"}'),
  -- Extra: imagen
  ('seedream45', 'image', 'Seedream', 'Seedream 4.5', 'Más detalle y mejor texto que Seedream 4.',
   'fal-ai/bytedance/seedream/v4.5/text-to-image', NULL, 'pro', 'img_seedream45', NULL, 'admin', false, 22,
   '{"image_size":{"width":1152,"height":2048},"num_images":1,"enable_safety_checker":true}'),
  ('seedream5lite', 'image', 'Seedream', 'Seedream 5 Lite', 'La generación 5 de Seedream, rápida.',
   'fal-ai/bytedance/seedream/v5/lite/text-to-image', NULL, 'pro', 'img_seedream5lite', NULL, 'admin', false, 24,
   '{"image_size":{"width":1152,"height":2048},"num_images":1,"enable_safety_checker":true}'),
  ('seedream5pro', 'image', 'Seedream', 'Seedream 5 Pro', 'La mejor calidad de Seedream.',
   'bytedance/seedream/v5/pro/text-to-image', NULL, 'comunidad', 'img_seedream5pro', NULL, 'admin', false, 45,
   '{"image_size":{"width":1152,"height":2048},"output_format":"jpeg","num_images":1,"enable_safety_checker":true}'),
  ('fluxdev', 'image', 'Flux', 'Flux 1 Dev', 'Económico y versátil.',
   'fal-ai/flux/dev', NULL, 'pro', 'img_fluxdev', NULL, 'admin', false, 32,
   '{"image_size":"portrait_16_9","output_format":"jpeg","num_images":1,"enable_safety_checker":true}'),
  ('flux11pro', 'image', 'Flux', 'Flux 1.1 Pro', 'Rostros y piel muy naturales.',
   'fal-ai/flux-pro/v1.1', NULL, 'pro', 'img_flux11pro', NULL, 'admin', false, 34,
   '{"image_size":"portrait_16_9","output_format":"jpeg","num_images":1,"safety_tolerance":"2"}'),
  ('fluxkontext', 'image', 'Flux', 'Flux Kontext Pro', 'Sigue muy bien las instrucciones de la escena.',
   'fal-ai/flux-pro/kontext/text-to-image', NULL, 'pro', 'img_fluxkontext', NULL, 'admin', false, 36,
   '{"aspect_ratio":"9:16","output_format":"jpeg","num_images":1,"safety_tolerance":"2"}'),
  ('gptimage15', 'image', 'OpenAI', 'GPT Image 1.5', 'El generador de imágenes de ChatGPT.',
   'fal-ai/gpt-image-1.5', NULL, 'pro', 'img_gptimage15', NULL, 'admin', false, 38,
   '{"quality":"medium","image_size":"1024x1536","output_format":"jpeg","num_images":1}'),
  ('nanobanana2', 'image', 'Google', 'Nano Banana 2', 'La nueva versión de Nano Banana.',
   'fal-ai/nano-banana-2', NULL, 'pro', 'img_nanobanana2', NULL, 'admin', false, 12,
   '{"aspect_ratio":"9:16","resolution":"1K","output_format":"jpeg","num_images":1}')
ON CONFLICT (id) DO NOTHING;

-- La función se enciende: qué puede usar cada quien lo decide media_models.status (hoy: solo admins).
INSERT INTO public.edge_limits (fn, enabled, max_hour, max_day) VALUES ('video-generate', true, 10, 30)
ON CONFLICT (fn) DO UPDATE SET enabled = true;
INSERT INTO public.edge_limits (fn, enabled, max_hour, max_day) VALUES ('image-generate', true, 20, 60)
ON CONFLICT (fn) DO UPDATE SET enabled = true;

-- Las fotos de fal llegan en JPEG/PNG de hasta ~6 MB (Seedream 2048 px): se sube el tope del bucket.
UPDATE storage.buckets SET file_size_limit = 10485760 WHERE id = 'personajes';
