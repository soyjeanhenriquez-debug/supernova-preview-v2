-- Herramientas del recorrido "Mi negocio" (partes 2–5), en la ficha de cada usuario:
--   validation:  matriz de validación (etapa 2)      { answers: { <id>: true|false }, completed_at }
--   launch_plan: plan de lanzamiento (etapa 4)        { start: 'YYYY-MM-DD', tasks: [{ id, title, group, due, done }] }
--   recovery:    recuperación de ventas (etapa 6)     { messages: [{ day, when, text }], generated_at }
alter table public.business_profile
  add column if not exists validation jsonb,
  add column if not exists launch_plan jsonb,
  add column if not exists recovery jsonb;

-- Calendario de contenido orgánico (etapa 5): una pieza por fila.
create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null check (char_length(topic) <= 200),          -- tema / búsqueda real
  title text check (char_length(title) <= 200),                   -- título o gancho de la pieza
  stage text not null default 'atraer' check (stage in ('atraer', 'conectar', 'convertir')),
  platform text not null default 'reels' check (platform in ('reels', 'tiktok', 'youtube', 'blog', 'whatsapp')),
  status text not null default 'idea' check (status in ('idea', 'guion', 'grabado', 'publicado')),
  due date,
  source text check (char_length(source) <= 30),                  -- de dónde salió el tema (google, youtube, ia, manual)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_items_user_due on public.content_items (user_id, due);
alter table public.content_items enable row level security;
create policy "content_items: todo sobre lo propio" on public.content_items
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
