-- Sección "Con tu cara" (13-oct-2026, precios decididos por Jean):
--   · video_subtitles = 20 créditos (Sube tu video: subtítulos + 3 ganchos; costo real ≈ US$0,01–0,02).
--   · reel_analyze    = 15 créditos (Analiza un Reel: lector de Instagram + IA; ≈ US$0,015–0,025).
-- Con el crédito más barato (US$0,008): 20 cr = US$0,16 (≈ ×8–16) y 15 cr = US$0,12 (≈ ×5–8).
INSERT INTO public.credit_prices (action, cost, label, charged_by, real_cost_usd, updated_at) VALUES
  ('video_subtitles', 20, 'Sube tu video: subtítulos y gancho', 'server', 0.02, now()),
  ('reel_analyze',    15, 'Analiza un Reel', 'server', 0.025, now())
ON CONFLICT (action) DO UPDATE
  SET cost = EXCLUDED.cost, label = EXCLUDED.label, charged_by = 'server',
      real_cost_usd = EXCLUDED.real_cost_usd, updated_at = now();
