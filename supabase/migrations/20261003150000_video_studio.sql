-- Estudio de video (03-oct-2026): clips y series con APIMart (Seedance 2.0 Mini 720p).
-- Precio decidido con Jean: por debajo de Higgsfield y nunca por debajo del costo de APIMart
-- (costo ~US$0,0217/s → 5 s ≈ US$0,109; 55 créditos ≈ 4× con el crédito más barato).
INSERT INTO public.credit_prices (action, cost, label, charged_by) VALUES
  ('vid_mini_5', 55, 'Video IA 5 s (720p)', 'server'),
  ('vid_mini_10', 110, 'Video IA 10 s (720p)', 'server')
ON CONFLICT (action) DO UPDATE SET cost = EXCLUDED.cost, label = EXCLUDED.label, updated_at = now();

-- Último cuadro del clip (lo devuelve APIMart): es la imagen inicial del siguiente clip de la serie.
ALTER TABLE public.video_jobs ADD COLUMN IF NOT EXISTS last_frame_url text;
