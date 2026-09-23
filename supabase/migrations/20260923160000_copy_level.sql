-- Tono de los anuncios que escribe la IA, elegido por cada usuario en "Mi negocio":
-- 1 suave (seguro en cualquier plataforma), 2 persuasivo (por defecto), 3 agresivo
-- (máxima persuasión de respuesta directa dentro de las políticas de anuncios).
-- Ningún nivel permite promesas médicas o de ingresos, testimonios inventados ni trucos
-- para esquivar la revisión de las plataformas (ver copyLevelHint en src/lib/businessProfile.ts).
alter table public.business_profile
  add column if not exists copy_level smallint not null default 2 check (copy_level between 1 and 3);
