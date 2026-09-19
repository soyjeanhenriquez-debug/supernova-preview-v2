-- Reintentos de enriquecimiento: la IA a veces omite fichas del lote (o la
-- salida se corta). Antes se marcaban fallidas para siempre al primer fallo;
-- ahora cuentan intentos y solo se descartan al tercero.
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS enrich_attempts SMALLINT NOT NULL DEFAULT 0;
-- Las 13 marcadas hoy por un solo fallo vuelven a la cola.
UPDATE public.offers SET enrich_failed = false, enrich_attempts = 1 WHERE enrich_failed = true AND enriched_at IS NULL;
