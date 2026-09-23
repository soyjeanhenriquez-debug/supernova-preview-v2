-- "Tu semana": plan semanal del socio IA (edge function weekly-plan). Cada lunes, 3–5 tareas
-- concretas según el estado real del negocio del usuario. Es la función de retención: siempre hay
-- trabajo pendiente y se ve el avance semana a semana. Una fila por usuario y semana (lunes).
create table if not exists public.weekly_plans (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,                 -- lunes de la semana (hora RD)
  focus text,                               -- el foco de la semana, en una frase
  tasks jsonb not null default '[]'::jsonb, -- [{id, title, why, page, minutes, done}]
  regenerations smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);
alter table public.weekly_plans enable row level security;

-- El usuario lee su plan y marca tareas hechas; lo crea el servidor (weekly-plan, service_role).
create policy "weekly_plans: leer el propio" on public.weekly_plans
  for select to authenticated using (user_id = (select auth.uid()));
create policy "weekly_plans: marcar tareas propias" on public.weekly_plans
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, update (tasks, updated_at) on public.weekly_plans to authenticated;
