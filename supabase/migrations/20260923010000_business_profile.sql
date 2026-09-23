-- "Mi negocio": los datos del negocio de cada usuario en un solo sitio, para que
-- todas las herramientas (Mándala, Generadores, Media Studio, ejemplos con IA)
-- los tengan a mano y no haya que escribirlos en cada pantalla.
-- Antes vivían solo en el navegador (localStorage de la Mándala).
create table if not exists public.business_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_type text check (business_type in ('infoproducto','ecommerce','servicios','afiliado','otro')),
  product text check (char_length(product) <= 300),
  who text check (char_length(who) <= 300),
  promise text check (char_length(promise) <= 300),
  price text check (char_length(price) <= 30),
  proof text check (char_length(proof) <= 300),
  store_url text check (char_length(store_url) <= 300),
  updated_at timestamptz not null default now()
);

alter table public.business_profile enable row level security;

create policy "business_profile: leer el propio o admin" on public.business_profile
  for select to authenticated using (user_id = (select auth.uid()) or (select public.has_role((select auth.uid()), 'admin'::public.app_role)));
create policy "business_profile: crear el propio" on public.business_profile
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "business_profile: editar el propio" on public.business_profile
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update on public.business_profile to authenticated;

-- Relleno: la última ficha que cada usuario ya escribió en la Mándala (mandala_ads.brief
-- guarda líneas "Producto: …", "Para quién: …", etc.), para que nadie tenga que repetirla.
insert into public.business_profile (user_id, product, who, promise, price, proof)
select distinct on (m.user_id)
  m.user_id,
  left(substring(m.brief from 'Producto: ([^\n]*)'), 300),
  left(substring(m.brief from 'Para quién: ([^\n]*)'), 300),
  left(substring(m.brief from 'Resultado que promete: ([^\n]*)'), 300),
  left(substring(m.brief from 'Precio: ([0-9.,]+)'), 30),
  left(substring(m.brief from 'Prueba o garantía: ([^\n]*)'), 300)
from public.mandala_ads m
where m.brief like 'Producto:%'
order by m.user_id, m.created_at desc
on conflict (user_id) do nothing;
