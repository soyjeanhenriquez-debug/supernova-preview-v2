-- Modelar UNA lámina de un carrusel (06-oct-2026, edge function carousel-slide-model).
-- Precio aprobado por Jean (06-oct-2026): 6 créditos. Su regla: entre 3× y 6× del costo, nunca menos de 3×.
--
-- Costo real estimado (Gemini 3 Flash, US$0,50 por millón de tokens de entrada y US$3,00 de salida,
-- ver ai_model_prices): 1 imagen (~1.100 tokens) + ~2.500 de instrucciones ≈ 3.600 de entrada
-- (≈ US$0,0018) y ~2.000 de salida (≈ US$0,0060) → ≈ US$0,008 por lámina.
-- Regla del manual: precio ≥ costo × 5 con el crédito más barato (US$0,008):
--   6 créditos × US$0,008 = US$0,048 → ≈ 6× el costo normal.
-- Ojo: si Gemini "piensa" mucho (los tokens de razonamiento se cobran como salida) y la salida llega
-- a ~4.000 tokens, el costo sube a ≈ US$0,014 y el margen queda en ≈ 3,4× (sobre el piso de 3×).
-- Vigilarlo en admin_margin.
-- No hay Apify: la imagen ya viene del análisis del carrusel (CDN de Instagram).
-- Lo cobra la edge function ANTES de llamar a la IA y lo devuelve si algo falla.
insert into public.credit_prices (action, cost, label, charged_by) values
  ('model_slide', 6, 'Modelar una lámina de un carrusel', 'server')
on conflict (action) do update set cost = excluded.cost, label = excluded.label, updated_at = now();
-- El costo del modelo (gemini-3-flash-preview) ya está en ai_model_prices (20260923150000_ai_usage_costs.sql).
