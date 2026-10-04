-- Creador de YouTube (03-oct-2026): analizar un video de referencia con Gemini (Google ve el video
-- público y devuelve estructura + guion propio) y traducir el guion. Costo real: análisis de un video
-- de hasta 30 min ≈ US$0,05–0,10 (video en baja resolución + audio + salida); traducción ≈ US$0,01.
INSERT INTO public.credit_prices (action, cost, label, charged_by) VALUES
  ('yt_reference', 50, 'Analizar video de YouTube y escribir tu versión', 'server'),
  ('yt_translate', 15, 'Traducir guion de YouTube', 'server')
ON CONFLICT (action) DO UPDATE SET cost = EXCLUDED.cost, label = EXCLUDED.label, updated_at = now();
