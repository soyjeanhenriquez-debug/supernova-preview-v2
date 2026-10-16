-- Analizador de Reels v2 · Fase 1 (16-oct-2026, decisiones de Jean): niveles y dos capas.
--  · Primera llamada ("base"): cobra el análisis completo (reel_analyze = 25 créditos), lee el Reel
--    (caché global o Apify) y hace el análisis base con la IA mirando el video (capa A, una vez por Reel
--    para todos). Deja una fila en reel_analyses con stage = 'base'.
--  · Segunda llamada ("version"): escribe tu versión según el nivel (Espejo / Adaptación / Inspiración)
--    sin volver a mirar el video (capa B). La primera versión de cada análisis va incluida: se reclama
--    con un UPDATE atómico de stage 'base' → 'escribiendo' (así no se puede sacar gratis dos veces).
--    Cada versión siguiente ("probar otro nivel") cobra reel_level = 5 créditos y crea su propia fila.
-- Costos medidos el 16-oct: capa A + Apify ≈ US$0,03; capa B ≈ US$0,01 (se vigila en admin_margin).

ALTER TABLE public.reel_analyses
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'listo' CHECK (stage IN ('base', 'escribiendo', 'listo')),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

INSERT INTO public.credit_prices (action, cost, label, charged_by, real_cost_usd, updated_at) VALUES
  ('reel_analyze', 25, 'Analiza un Reel', 'server', 0.04, now()),
  ('reel_level',    5, 'Analiza un Reel · otra versión', 'server', 0.01, now())
ON CONFLICT (action) DO UPDATE
  SET cost = EXCLUDED.cost, label = EXCLUDED.label, charged_by = 'server',
      real_cost_usd = EXCLUDED.real_cost_usd, updated_at = now();
