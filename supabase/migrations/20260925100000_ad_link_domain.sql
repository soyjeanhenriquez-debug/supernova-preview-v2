-- Fase 0 de docs/propuestas/2026-09-24-negocio-completo-ltv.md:
-- dejar de tirar lo que la API de Meta ya nos da gratis.
--   link_domain: dominio visible del anuncio (ad_creative_link_captions), p. ej. "hotmart.com".
--   languages:   idiomas del anuncio según Meta (hoy el filtro "Idioma" adivina por país).
-- Columnas nulas y sin default: el ALTER es solo de catálogo, no reescribe la tabla.
ALTER TABLE public.winning_ads
  ADD COLUMN IF NOT EXISTS link_domain text,
  ADD COLUMN IF NOT EXISTS languages text[];

COMMENT ON COLUMN public.winning_ads.link_domain IS 'Dominio visible del anuncio (ad_creative_link_captions de Meta). Lo llena bulk-seed-ads.';
COMMENT ON COLUMN public.winning_ads.languages IS 'Idiomas del anuncio según la API de Meta. Lo llena bulk-seed-ads.';
