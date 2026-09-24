-- Crear producto: formato "reto" (reto de días, 15 minutos al día).
--   corto  = 14 días (2 semanas × 7 lecciones) + 1 bono = 15 piezas
--   normal = 28 días (4 semanas × 7 lecciones) + 1 bono = 29 piezas
-- Las lecciones del reto usan kind 'leccion' con module = "Semana N: <tema>" (sin columna nueva).
-- Cambios: el check de format acepta 'reto' y el tope de piezas por libro sube de 20 a 30.
-- El check de idx (0..99) ya alcanza. Idempotente: se puede volver a correr.

-- ═══ 1. Formato ═══
-- El check original es inline (20260924100000): Postgres lo nombra product_builds_format_check.
alter table public.product_builds drop constraint if exists product_builds_format_check;
alter table public.product_builds add constraint product_builds_format_check
  check (format in ('ebook', 'curso', 'reto'));

-- ═══ 2. Tope de piezas por libro: 30 (reto normal = 29) ═══
-- Mismo cuerpo que la versión original salvo el tope (debe coincidir con MAX_PIECES del servidor
-- y de src/lib/productBuilder.ts).
create or replace function private.pb_piece_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.product_builds b where b.id = new.build_id and b.user_id = new.user_id) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  if (select count(*) from public.product_build_pieces where build_id = new.build_id) >= 30 then
    raise exception 'too_many_pieces' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.pb_piece_guard() from public, anon, authenticated;
