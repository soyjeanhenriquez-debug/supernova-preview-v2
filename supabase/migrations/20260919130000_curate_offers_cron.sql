-- La pantalla de Ofertas ahora DEPENDE de is_primary / is_winner:
--   · pestaña "Ganadoras"      → is_winner  = true
--   · pestañas de exploración  → is_primary = true (una tarjeta por anunciante)
-- Esas columnas solo las mantiene curate_offers(). Sin una tarea programada,
-- un anunciante que entra con el refresco diario nace con is_primary = false
-- (valor por defecto) y sería INVISIBLE en el catálogo hasta un recálculo a
-- mano; y la lista de ganadoras se queda vieja mientras la IA sigue fichando
-- (pasó el 2026-09-19: calculada con 1.283 anunciantes fichados, 90 minutos
-- después había 2.202 y el corte había subido de 76,0 a 78,1).
--
-- Cada hora al minuto 40: después del enriquecimiento (:20) y, a las 11:40,
-- justo tras el refresco diario (11:30). Es barata e idempotente (los UPDATE
-- llevan IS DISTINCT FROM). pg_cron corre como superusuario, así que puede
-- llamar a la función aunque esté restringida a service_role.
SELECT cron.schedule(
  'supernova-curate-offers-hourly',
  '40 * * * *',
  $$ SELECT public.curate_offers(300); $$
);
