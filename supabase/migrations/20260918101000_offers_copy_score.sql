-- copy_score (1-5): qué tan replicable es la oferta por un emprendedor solo
-- como producto digital / mini app. Es el criterio de curación de los picks:
-- un gigante (app de dramas con 199 anuncios) puntúa alto en score pero bajo
-- en copy_score; un infoproducto de nicho con 12 anuncios y 90 días, al revés.
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS copy_score SMALLINT;
CREATE INDEX IF NOT EXISTS idx_offers_copy_score ON public.offers (copy_score DESC, winner_score DESC);
