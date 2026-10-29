-- SUPERNOVA — El catálogo de Cazador Swipe (de Jean) entra a Ofertas (29-oct-2026, Jean: «coge todo del cazador…
-- las fotos, las imágenes, los videos, los links, todo, tráelo a nuestra app»).
--
-- offers.cover_url   portada fija de la oferta (copiada a nuestro bucket público ofertas-portadas). Si existe, la
--                    tarjeta la muestra en vez de pedirle la imagen al anuncio de Meta.
-- offers.source      de dónde salió la oferta: NULL = nuestro recolector (refresh_offers); 'cazador' = Cazador Swipe.
-- offers.source_data lo que trae Cazador y no tiene columna propia: código, nivel, anuncios contados por Cazador,
--                    links (página, checkout, Drive, VSL), imagen grande y su análisis «Radar».
-- Solo añade: no borra, no oculta ni cambia el orden de nada que ya estaba.

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_data jsonb;

-- Portadas: lectura pública (son imágenes de anuncios públicos); solo el servidor escribe.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ofertas-portadas', 'ofertas-portadas', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO NOTHING;
