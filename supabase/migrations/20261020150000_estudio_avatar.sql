-- Estudio de avatar (20-oct-2026, pedido de Jean): plantillas de imagen y video con un avatar (sin tu
-- cara) o con tu foto (con tu cara). Función avatar-studio. Reglas: supabase/functions/_shared/avatarStudio.ts.
--
-- 1) Precios: costo mínimo publicado del proveedor × 6 (decisión de Jean, 20-oct-2026), con el crédito
--    más barato (US$0,008): créditos = ceil(costo × 6 / 0,008). Deben coincidir con creditsFor() del
--    módulo compartido (lo revisa src/lib/avatarStudio.test.ts).
--    Imagen (APIMart): GPT Image 2 US$0,0115 (real_cost medido de gen_ad_image) → 9 · Nano Banana 2
--    US$0,0143 → 11 · Nano Banana Pro US$0,0285 → 22. La persona elige el modelo en cada plantilla.
--    Video 720p (US$/s): Seedance 2.0 Mini APIMart 0,0236 · Wan 3.0 Higgsfield 0,050 (precio de lista;
--    la promo de 0,020 vence el 31-oct) · Kling 2.5 Turbo 0,042 · Kling 3.0 0,084 · Seedance 2.0 0,141.
--    Omni y Grok (APIMart, opción A aprobada por Jean el 20-oct-2026; no hacen 5 s, la opción corta da 6 s):
--    Omni = gemini-omni-1.1-flash-ext, por video: 6 s US$0,30 → 225 · 10 s US$0,40 → 300.
--    Grok = grok-imagine-1.5-video-ext, US$0,01912/s: 6 s → 87 · 10 s → 144.
INSERT INTO public.credit_prices (action, cost, label, charged_by, real_cost_usd) VALUES
  ('av_img_gpt',        9,    'Estudio de avatar · imagen (GPT Image 2)',     'server', 0.0115),
  ('av_img',            11,   'Estudio de avatar · imagen (Nano Banana 2)',   'server', 0.0143),
  ('av_img_pro',        22,   'Estudio de avatar · imagen (Nano Banana Pro)', 'server', 0.0285),
  ('av_vid_omni_5',     225,  'Estudio de avatar · video 6 s (Omni)',           'server', 0.30),
  ('av_vid_omni_10',    300,  'Estudio de avatar · video 10 s (Omni)',          'server', 0.40),
  ('av_vid_grok_5',     87,   'Estudio de avatar · video 6 s (Grok)',           'server', 0.1147),
  ('av_vid_grok_10',    144,  'Estudio de avatar · video 10 s (Grok)',          'server', 0.1912),
  ('av_vid_smini_5',    89,   'Estudio de avatar · video 5 s (Seedance Mini)',  'server', 0.118),
  ('av_vid_smini_10',   177,  'Estudio de avatar · video 10 s (Seedance Mini)', 'server', 0.236),
  ('av_vid_wan30_5',    188,  'Estudio de avatar · video 5 s (Wan 3.0)',        'server', 0.25),
  ('av_vid_wan30_10',   375,  'Estudio de avatar · video 10 s (Wan 3.0)',       'server', 0.5),
  ('av_vid_kling25_5',  158,  'Estudio de avatar · video 5 s (Kling 2.5)',      'server', 0.21),
  ('av_vid_kling25_10', 315,  'Estudio de avatar · video 10 s (Kling 2.5)',     'server', 0.42),
  ('av_vid_kling30_5',  315,  'Estudio de avatar · video 5 s (Kling 3.0)',      'server', 0.42),
  ('av_vid_kling30_10', 630,  'Estudio de avatar · video 10 s (Kling 3.0)',     'server', 0.84),
  ('av_vid_seed20_5',   529,  'Estudio de avatar · video 5 s (Seedance 2.0)',   'server', 0.705),
  ('av_vid_seed20_10',  1058, 'Estudio de avatar · video 10 s (Seedance 2.0)',  'server', 1.41)
ON CONFLICT (action) DO UPDATE SET cost = EXCLUDED.cost, label = EXCLUDED.label, real_cost_usd = EXCLUDED.real_cost_usd, updated_at = now();

-- 2) Los videos del estudio van en video_jobs con kind 'avatar' (provider apimart | higgsfield).
ALTER TABLE public.video_jobs DROP CONSTRAINT IF EXISTS video_jobs_kind_check;
ALTER TABLE public.video_jobs ADD CONSTRAINT video_jobs_kind_check
  CHECK (kind = ANY (ARRAY['clip', 'serie', 'anuncio', 'ugc', 'yt_scene', 'avatar']));

-- 3) Bucket privado para lo que GENERA el estudio. Solo escribe el servidor (service_role): no hay
--    política de INSERT para usuarios. Así una imagen de aquí es, con seguridad, una cara creada con
--    IA, y es la única que se acepta como "cara nueva" en la plantilla "Poner tu avatar en esta toma".
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('estudio-avatar', 'estudio-avatar', false, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS estudio_avatar_select_own ON storage.objects;
CREATE POLICY estudio_avatar_select_own ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'estudio-avatar' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS estudio_avatar_delete_own ON storage.objects;
CREATE POLICY estudio_avatar_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'estudio-avatar' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- 4) Interruptores de admin: false = solo admins hasta que Jean lo abra. Topes por hora/día.
INSERT INTO public.edge_limits (fn, enabled, max_hour, max_day, note) VALUES
  ('avatar-studio', true, 30, 120, 'Estudio de avatar: imágenes y videos (topes por persona).'),
  ('avatar-studio:open', false, NULL, NULL, 'Estudio de avatar: false = solo admins hasta que Jean lo pruebe y lo abra.'),
  ('avatar-studio:higgsfield', false, NULL, NULL, 'Modelos de Higgsfield en el estudio: false = solo admins hasta medir su costo real.')
ON CONFLICT (fn) DO NOTHING;
