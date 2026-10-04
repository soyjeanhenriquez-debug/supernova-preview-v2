-- Creador de YouTube (03-oct-2026): analizar un video de referencia con Gemini (Google ve el video
-- público y devuelve estructura + guion propio) y traducir el guion. Costo real: análisis de un video
-- de hasta 30 min ≈ US$0,05–0,10 (video en baja resolución + audio + salida); traducción ≈ US$0,01.
INSERT INTO public.credit_prices (action, cost, label, charged_by) VALUES
  ('yt_reference', 50, 'Analizar video de YouTube y escribir tu versión', 'server'),
  ('yt_translate', 15, 'Traducir guion de YouTube', 'server')
ON CONFLICT (action) DO UPDATE SET cost = EXCLUDED.cost, label = EXCLUDED.label, updated_at = now();

-- Ajuste (03-oct-2026): gemini-2.5-flash ya no está disponible; con gemini-3.8-flash (US$0,75/M entrada,
-- US$3,75/M salida) el precio va por duración para no bajar de 3× el costo: Short (≤3 min) 20,
-- hasta 15 min 50, de 15 a 30 min 100.
INSERT INTO public.credit_prices (action, cost, label, charged_by) VALUES
  ('yt_reference_short', 20, 'Analizar Short de YouTube y escribir tu versión', 'server'),
  ('yt_reference', 50, 'Analizar video de YouTube (hasta 15 min) y escribir tu versión', 'server'),
  ('yt_reference_long', 100, 'Analizar video de YouTube (15 a 30 min) y escribir tu versión', 'server')
ON CONFLICT (action) DO UPDATE SET cost = EXCLUDED.cost, label = EXCLUDED.label, updated_at = now();
