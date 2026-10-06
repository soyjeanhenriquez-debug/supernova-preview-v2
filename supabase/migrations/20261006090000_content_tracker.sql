-- Tracker de publicaciones (06-oct-2026, pedido de Jean: "de la creación a la ejecución").
-- Cada pieza del calendario de contenido se publica en VARIAS redes, con un check y el enlace en
-- cada una, y guarda su palabra clave y los leads y ventas que la persona anota (datos reales,
-- nada estimado). Tipos: corto (Reels · TikTok · Shorts), largo (YouTube), texto (Threads · X) y
-- carrusel (Instagram). La meta semanal va en content_goals, una fila por usuario y producto.

alter table public.content_items
  add column if not exists kind text check (kind in ('corto', 'largo', 'texto', 'carrusel')),
  -- { "<red>": { "done": bool, "url": "https://…", "at": "YYYY-MM-DD" } }; las claves son las redes elegidas.
  add column if not exists channels jsonb not null default '{}'::jsonb
    check (jsonb_typeof(channels) = 'object' and pg_column_size(channels) <= 4000),
  add column if not exists keyword text check (char_length(keyword) <= 30),
  add column if not exists leads integer not null default 0 check (leads between 0 and 100000),
  add column if not exists sales integer not null default 0 check (sales between 0 and 100000);

-- Redes nuevas en el campo de plataforma principal.
alter table public.content_items drop constraint if exists content_items_platform_check;
alter table public.content_items add constraint content_items_platform_check
  check (platform in ('reels', 'tiktok', 'youtube', 'blog', 'whatsapp', 'shorts', 'threads', 'x', 'instagram'));

create table if not exists public.content_goals (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  -- { "corto": n, "largo": n, "texto": n, "carrusel": n } piezas por semana
  goals jsonb not null default '{}'::jsonb check (jsonb_typeof(goals) = 'object' and pg_column_size(goals) <= 500),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table public.content_goals enable row level security;
-- Cada quien lee y escribe solo lo suyo, y solo para un producto suyo.
create policy "content_goals: leer lo propio" on public.content_goals
  for select to authenticated using (user_id = (select auth.uid()));
create policy "content_goals: crear lo propio" on public.content_goals
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.products p where p.id = product_id and p.user_id = (select auth.uid()))
  );
create policy "content_goals: cambiar lo propio" on public.content_goals
  for update to authenticated using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.products p where p.id = product_id and p.user_id = (select auth.uid()))
  );
create policy "content_goals: borrar lo propio" on public.content_goals
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.content_goals from anon;
grant select, insert, update, delete on public.content_goals to authenticated;
