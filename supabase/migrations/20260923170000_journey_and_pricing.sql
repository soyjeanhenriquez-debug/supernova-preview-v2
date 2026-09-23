-- Recorrido "Mi negocio" (6 etapas: Elegir → Validar → Precio → Construir → Vender → Medir) y
-- calculadora de precio y rentabilidad. Viven en la misma ficha del negocio de cada usuario:
--   pricing: escenarios de la calculadora { scenarios: [...], currency, chosen }
--   journey: etapas marcadas a mano como hechas { done: { "2": true, ... } }
-- Las etapas con datos propios (anuncios de la Mándala, números anotados) se calculan solas.
alter table public.business_profile
  add column if not exists pricing jsonb,
  add column if not exists journey jsonb;
