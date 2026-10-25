-- Producción diaria con varias plantillas que se alternan (25-oct-2026, Jean: Márquez y Diego Vetencourt).
ALTER TABLE public.reel_diario ADD COLUMN IF NOT EXISTS plantilla_ids uuid[] NOT NULL DEFAULT '{}';
UPDATE public.reel_diario SET plantilla_ids = ARRAY[plantilla_id] WHERE plantilla_id IS NOT NULL AND cardinality(plantilla_ids) = 0;
