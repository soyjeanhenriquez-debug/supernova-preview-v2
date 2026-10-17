-- Reel → Carrusel (17-oct-2026, plan aprobado por Jean).
--  · Desde "Analiza un Reel" o pegando un Reel en Carrusel → "Modelar uno que ya funciona", la IA
--    convierte el análisis base del Reel (capa A, ya guardado) en un carrusel. No vuelve a mirar el video.
--  · Precio (Jean): si el análisis todavía no usó su versión incluida, el carrusel va incluido (el Reel
--    sin analizar cuesta reel_analyze = 25). Si ya la usó, cuesta reel_carousel = 10 créditos.
--  · Costo medido el 16-oct: capa B de texto ≈ US$0,0145 en promedio (peor caso ≈ US$0,02) →
--    10 créditos × US$0,008 = US$0,08 ≈ 5,3× promedio, 4× peor caso (piso 3×).
--  · kind distingue en el historial si la fila es un guion o un carrusel.

ALTER TABLE public.reel_analyses
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'guion' CHECK (kind IN ('guion', 'carrusel'));

INSERT INTO public.credit_prices (action, cost, label, charged_by, real_cost_usd, updated_at) VALUES
  ('reel_carousel', 10, 'Reel → Carrusel', 'server', 0.015, now())
ON CONFLICT (action) DO UPDATE
  SET cost = EXCLUDED.cost, label = EXCLUDED.label, charged_by = 'server',
      real_cost_usd = EXCLUDED.real_cost_usd, updated_at = now();

-- carousel_clones (aprendizaje y "¿Te sirvió?") también guarda los carruseles que salen de un Reel.
ALTER TABLE public.carousel_clones DROP CONSTRAINT IF EXISTS carousel_clones_url_check;
ALTER TABLE public.carousel_clones ADD CONSTRAINT carousel_clones_url_check
  CHECK (url ~ '^https://www\.instagram\.com/(p|reel)/' AND char_length(url) <= 200);
