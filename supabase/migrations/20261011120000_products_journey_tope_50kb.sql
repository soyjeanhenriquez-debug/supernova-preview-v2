-- Influencer IA guarda sus 10 guiones en products.journey.personaje: el tope de 5 KB hacía fallar el guardado
-- (prueba de Hany, 11-oct-2026: "el primer clic de los guiones no hace nada"). 50 KB sigue acotando la fila.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_journey_check;
ALTER TABLE public.products ADD CONSTRAINT products_journey_check CHECK (journey IS NULL OR pg_column_size(journey) <= 50000);
