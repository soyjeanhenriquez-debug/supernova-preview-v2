-- Portadas de carrusel con IA de imagen, todas por APIMart (decisión de Jean, 05-oct-2026: "que los
-- usuarios usen la IA que más les ayude, siempre que ellos elijan"). Precio = costo real × 5 ÷
-- US$0,008 (crédito más barato), redondeado hacia arriba. Costos de apimart.ai/es/pricing (05-oct-2026,
-- columna "precio actual", 1K):
--   gpt-image-2          US$0,0081 →  6 créditos (ya existía: gen_ad_image)        5,9×
--   nano-banana-2-ext    US$0,0143 → 10 créditos (gen_ad_image_nb2)                5,6×
--   nano-banana-pro-ext  US$0,0285 → 20 créditos (gen_ad_image_nbpro)              5,6×
-- Las cobra generate-ad-creative ANTES de llamar a APIMart y las devuelve si falla.
insert into public.credit_prices (action, cost, label, charged_by) values
  ('gen_ad_image_nb2',   10, 'Imagen con IA · Nano Banana 2',   'server'),
  ('gen_ad_image_nbpro', 20, 'Imagen con IA · Nano Banana Pro', 'server')
on conflict (action) do update set cost = excluded.cost, label = excluded.label, updated_at = now();

-- Costo real por imagen para el panel de margen (log_ai_usage usa el nombre "apimart/<modelo>").
insert into public.ai_model_prices (model, input_per_m, output_per_m, per_image) values
  ('apimart/nano-banana-2-ext',   0, 0, 0.0143),
  ('apimart/nano-banana-pro-ext', 0, 0, 0.0285)
on conflict (model) do update set per_image = excluded.per_image, updated_at = now();
