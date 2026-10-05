-- Clonar un carrusel viral con su ADN ganador (05-oct-2026, aprobado por Jean: 15 créditos).
-- Costo real: Apify instagram-scraper ~US$0,0027 por publicación + Gemini 3 Flash con ~9 imágenes
-- (~10 000 tokens de entrada, ~4 000 de salida ≈ US$0,017) → ~US$0,02 → 15 créditos ≈ 6×.
-- Lo cobra la edge function carousel-clone ANTES de llamar a Apify y lo devuelve si algo falla.
insert into public.credit_prices (action, cost, label, charged_by) values
  ('clone_carousel', 15, 'Clonar un carrusel viral (ADN ganador)', 'server')
on conflict (action) do update set cost = excluded.cost, label = excluded.label, updated_at = now();

insert into public.ai_model_prices (model, input_per_m, output_per_m, per_image) values
  ('apify/instagram-scraper', 0, 0, 0.0027)
on conflict (model) do update set per_image = excluded.per_image, updated_at = now();
