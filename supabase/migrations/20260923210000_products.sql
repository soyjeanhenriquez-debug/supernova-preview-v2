-- Varios productos por usuario (decisión de Jean, 23-sep-2026).
-- Cada producto tiene su propia "inteligencia": ficha, matriz, precio, plan, recuperación, anuncios
-- de la Mándala, calendario de contenido, su plan semanal y lo que guardó con "Hacer mi versión".
-- A nivel de usuario solo queda cómo trabaja (encuesta de registro) y qué producto tiene abierto
-- (business_profile.active_product_id). Límite de productos activos: 3 en PRO; más para Comunidad
-- (lo sube un admin en user_limits); los admin no tienen límite práctico.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Mi producto' check (char_length(name) between 1 and 120),
  status text not null default 'activo' check (status in ('activo', 'archivado')),
  business_type text check (business_type in ('infoproducto', 'ecommerce', 'servicios', 'afiliado', 'otro')),
  copy_level smallint not null default 2 check (copy_level between 1 and 3),
  product text check (char_length(product) <= 300),
  who text check (char_length(who) <= 300),
  promise text check (char_length(promise) <= 300),
  price text check (char_length(price) <= 30),
  proof text check (char_length(proof) <= 300),
  store_url text check (char_length(store_url) <= 300),
  pricing jsonb check (pricing is null or pg_column_size(pricing) <= 10000),
  journey jsonb check (journey is null or pg_column_size(journey) <= 5000),
  validation jsonb check (validation is null or pg_column_size(validation) <= 20000),
  launch_plan jsonb check (launch_plan is null or pg_column_size(launch_plan) <= 60000),
  recovery jsonb check (recovery is null or pg_column_size(recovery) <= 30000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_user on public.products (user_id, status, created_at);
alter table public.products enable row level security;
create policy "products: todo sobre lo propio" on public.products
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "products: admin lee" on public.products
  for select to authenticated using ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));

-- Límite de productos activos por usuario.
create table if not exists public.user_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  max_products smallint not null default 3 check (max_products between 1 and 100),
  note text check (char_length(note) <= 200),
  updated_at timestamptz not null default now()
);
alter table public.user_limits enable row level security;
create policy "user_limits: leer el propio o admin" on public.user_limits
  for select to authenticated using (user_id = (select auth.uid()) or (select public.has_role((select auth.uid()), 'admin'::public.app_role)));
create policy "user_limits: admin escribe" on public.user_limits
  for all to authenticated using ((select public.has_role((select auth.uid()), 'admin'::public.app_role)))
  with check ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));

create or replace function public.product_limit(p_user uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case
    when public.has_role(p_user, 'admin'::public.app_role) then 100
    else coalesce((select max_products from public.user_limits where user_id = p_user), 3)
  end;
$$;
revoke all on function public.product_limit(uuid) from public, anon;
grant execute on function public.product_limit(uuid) to authenticated, service_role;

create or replace function public.products_enforce_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'activo' and (tg_op = 'INSERT' or old.status is distinct from 'activo') then
    if (select count(*) from public.products where user_id = new.user_id and status = 'activo' and id <> new.id)
       >= public.product_limit(new.user_id) then
      raise exception 'LIMITE_PRODUCTOS: tu plan permite % productos activos. Archiva uno o pásate a Comunidad.', public.product_limit(new.user_id);
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists products_enforce_limit on public.products;
create trigger products_enforce_limit before insert or update on public.products
  for each row execute function public.products_enforce_limit();

-- Producto abierto de cada usuario.
alter table public.business_profile add column if not exists active_product_id uuid references public.products(id) on delete set null;

-- Lo que guardó con "Hacer mi versión", mini apps, ofertas mejoradas (antes solo en el navegador).
create table if not exists public.product_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  kind text not null default 'crear' check (kind in ('crear', 'sofisticar', 'blueprint')),
  name text not null check (char_length(name) <= 160),
  context jsonb check (context is null or pg_column_size(context) <= 200000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_assets_user on public.product_assets (user_id, product_id, created_at desc);
alter table public.product_assets enable row level security;
create policy "product_assets: todo sobre lo propio" on public.product_assets
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Relleno: la ficha de cada usuario (y quien tenga anuncios, contenido o planes) pasa a ser su primer producto.
insert into public.products (user_id, name, business_type, copy_level, product, who, promise, price, proof, store_url,
                             pricing, journey, validation, launch_plan, recovery)
select b.user_id, left(coalesce(nullif(trim(b.product), ''), 'Mi primer producto'), 120), b.business_type, b.copy_level,
       b.product, b.who, b.promise, b.price, b.proof, b.store_url, b.pricing, b.journey, b.validation, b.launch_plan, b.recovery
from public.business_profile b
where not exists (select 1 from public.products p where p.user_id = b.user_id);

insert into public.products (user_id, name)
select distinct u.user_id, 'Mi primer producto'
from (select user_id from public.mandala_ads union select user_id from public.content_items union select user_id from public.weekly_plans) u
where not exists (select 1 from public.products p where p.user_id = u.user_id);

insert into public.business_profile (user_id, active_product_id)
select p.user_id, (select id from public.products x where x.user_id = p.user_id order by created_at limit 1)
from (select distinct user_id from public.products) p
on conflict (user_id) do update set active_product_id = excluded.active_product_id
where public.business_profile.active_product_id is null;

-- Anuncios, contenido y planes semanales ligados a su producto.
alter table public.mandala_ads add column if not exists product_id uuid references public.products(id) on delete cascade;
alter table public.content_items add column if not exists product_id uuid references public.products(id) on delete cascade;
alter table public.weekly_plans add column if not exists product_id uuid references public.products(id) on delete cascade;
update public.mandala_ads a set product_id = (select active_product_id from public.business_profile b where b.user_id = a.user_id) where product_id is null;
update public.content_items c set product_id = (select active_product_id from public.business_profile b where b.user_id = c.user_id) where product_id is null;
update public.weekly_plans w set product_id = (select active_product_id from public.business_profile b where b.user_id = w.user_id) where product_id is null;
create index if not exists mandala_ads_product on public.mandala_ads (product_id, created_at desc);
create index if not exists content_items_product on public.content_items (product_id, due);

-- Un plan semanal por producto.
alter table public.weekly_plans drop constraint if exists weekly_plans_pkey;
delete from public.weekly_plans where product_id is null;
alter table public.weekly_plans alter column product_id set not null;
alter table public.weekly_plans add primary key (user_id, product_id, week_start);
