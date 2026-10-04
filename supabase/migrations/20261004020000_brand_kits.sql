-- Kit de marca del Estudio de imágenes (plan ATLAS, LUMEN, 04-oct-2026).
-- Una fila por usuario y producto: hasta 5 colores (hex), un estilo corto, el logo y hasta 3 fotos
-- de referencia (rutas del bucket privado "creativos" del propio usuario, nunca URLs). Se añade a cada
-- prompt para que la serie se vea igual; las fotos viajan como `reference_paths` a
-- generate-ad-creative, que vuelve a validarlas y firma URLs de 10 minutos.
--
-- Precio: se mantiene gen_ad_image = 6 créditos también con fotos de referencia. La doc de APIMart
-- (gpt-image-2) cobra por resolución (1k) y no indica recargo por `image_urls`. Si en producción el
-- costo que registra la función (log "apimart costo=… refs=N") sale mayor, se crea
-- gen_ad_image_ref = ceil(costo × 4,5 / 0,008) con el OK de Jean. No hay cambios de precio aquí.

create table if not exists public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  colors text[] not null default '{}'
    check (cardinality(colors) <= 5 and array_to_string(colors, ',') ~ '^(#[0-9a-fA-F]{6}(,#[0-9a-fA-F]{6})*)?$'),
  style text check (char_length(style) <= 200),
  logo_path text check (logo_path is null or (char_length(logo_path) <= 300 and logo_path !~ '\.\.' and logo_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._/-]+$')),
  ref_paths text[] not null default '{}'
    check (cardinality(ref_paths) <= 3 and array_to_string(ref_paths, '|') !~ '\.\.' and char_length(array_to_string(ref_paths, '|')) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

alter table public.brand_kits enable row level security;

-- Cada quien ve y toca solo lo suyo; al escribir, el producto debe ser suyo y las rutas de su carpeta.
create policy "brand_kits: leer lo propio" on public.brand_kits
  for select to authenticated using (user_id = (select auth.uid()));

create policy "brand_kits: crear lo propio" on public.brand_kits
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.products p where p.id = product_id and p.user_id = (select auth.uid()))
    and (logo_path is null or logo_path like ((select auth.uid())::text || '/%'))
    and not exists (select 1 from unnest(ref_paths) r where r not like ((select auth.uid())::text || '/%'))
  );

create policy "brand_kits: cambiar lo propio" on public.brand_kits
  for update to authenticated using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.products p where p.id = product_id and p.user_id = (select auth.uid()))
    and (logo_path is null or logo_path like ((select auth.uid())::text || '/%'))
    and not exists (select 1 from unnest(ref_paths) r where r not like ((select auth.uid())::text || '/%'))
  );

create policy "brand_kits: borrar lo propio" on public.brand_kits
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.brand_kits from anon;
grant select, insert, update, delete on public.brand_kits to authenticated;
