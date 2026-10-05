-- Sistema de diseño del Carrusel (05-oct-2026): 3 colores con papel (fondo, principal, acento), el
-- par de fuentes y el @usuario, guardados por producto para que todos sus carruseles se vean como una
-- sola marca. Va en brand_kits (mismas políticas RLS: solo lo propio). Sin cambios de precios.
alter table public.brand_kits
  add column if not exists carousel jsonb
    check (carousel is null or (jsonb_typeof(carousel) = 'object' and pg_column_size(carousel) <= 2000));
