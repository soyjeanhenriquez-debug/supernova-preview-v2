-- Costo real de la IA por cliente (Admin → Salud). Antes solo sabíamos cuántos créditos
-- gastaba cada uno, no cuánto nos costaba a nosotros. Cada llamada a Gemini registra los
-- tokens que devuelve Google (incluido el razonamiento, que se cobra como salida) y el costo
-- se calcula con ai_model_prices, que se edita a mano cuando Google cambie precios.
-- Precios del 23-sep-2026 (https://ai.google.dev/gemini-api/docs/pricing, nivel ≤200k).
-- OJO: Google anuncia que los modelos 3.x duplican precio desde el 1-ene-2027: actualizar la tabla.

create table if not exists public.ai_model_prices (
  model text primary key,
  input_per_m numeric not null,   -- US$ por millón de tokens de entrada
  output_per_m numeric not null,  -- US$ por millón de tokens de salida (incluye razonamiento)
  per_image numeric not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.ai_model_prices enable row level security;  -- sin políticas: solo servidor

insert into public.ai_model_prices (model, input_per_m, output_per_m, per_image) values
  ('gemini-3-flash-preview', 0.50, 3.00, 0),
  ('gemini-3-pro-preview', 2.00, 12.00, 0),
  ('gemini-3.1-pro-preview', 2.00, 12.00, 0),
  ('gemini-3.1-flash-lite', 0.25, 1.50, 0),
  ('gemini-3.5-flash', 1.50, 9.00, 0),
  ('gemini-3.5-flash-lite', 0.30, 2.50, 0),
  ('gemini-3.6-flash', 0.75, 3.75, 0),
  ('gemini-3.7-flash', 0.75, 3.75, 0),
  ('gemini-3.8-flash', 0.75, 3.75, 0),
  -- alias sin precio publicado: se toma el del flash-lite más caro para no quedarnos cortos
  ('gemini-flash-lite-latest', 0.30, 2.50, 0),
  ('gemini-2.5-flash', 0.30, 2.50, 0),
  ('gemini-2.5-flash-lite', 0.10, 0.40, 0),
  ('gemini-2.5-pro', 1.25, 10.00, 0),
  ('gemini-2.5-flash-image', 0.30, 0, 0.039),
  ('gemini-3.1-flash-image', 0.50, 3.00, 0.067)
on conflict (model) do update set input_per_m = excluded.input_per_m, output_per_m = excluded.output_per_m,
  per_image = excluded.per_image, updated_at = now();

create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,  -- null = tarea de fondo
  fn text not null,            -- función o generador (p. ej. "ai-chat:mandala-ad")
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  images integer not null default 0,
  cost_usd numeric(12,6) not null default 0
);
create index if not exists ai_usage_user_created on public.ai_usage (user_id, created_at desc);
create index if not exists ai_usage_created on public.ai_usage (created_at desc);
alter table public.ai_usage enable row level security;  -- sin políticas: se lee por admin_health_report

-- La registran las edge functions con la service role. Precio desconocido → el del modelo más
-- caro de la tabla, para no subestimar.
create or replace function public.log_ai_usage(
  p_user_id uuid, p_fn text, p_model text,
  p_input integer, p_output integer, p_images integer default 0
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_in numeric; v_out numeric; v_img numeric; v_cost numeric;
begin
  select input_per_m, output_per_m, per_image into v_in, v_out, v_img
  from public.ai_model_prices where model = p_model;
  if not found then
    select max(input_per_m), max(output_per_m), max(per_image) into v_in, v_out, v_img from public.ai_model_prices;
  end if;
  v_cost := coalesce(p_input, 0) * v_in / 1e6 + coalesce(p_output, 0) * v_out / 1e6 + coalesce(p_images, 0) * v_img;
  insert into public.ai_usage (user_id, fn, model, input_tokens, output_tokens, images, cost_usd)
  values (p_user_id, left(p_fn, 80), left(p_model, 60), greatest(0, coalesce(p_input, 0)), greatest(0, coalesce(p_output, 0)),
          greatest(0, coalesce(p_images, 0)), v_cost);
  return v_cost;
end $$;
revoke all on function public.log_ai_usage(uuid, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.log_ai_usage(uuid, text, text, integer, integer, integer) to service_role;

-- Resumen para Admin → Salud: costo de IA de los últimos 30 días por cliente, frente a lo que
-- paga y a los créditos que gastó, y el costo de las tareas de fondo (user_id null).
create or replace function public.admin_ai_costs(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r jsonb;
begin
  if not (coalesce(auth.role(), '') = 'service_role'
          or public.has_role(auth.uid(), 'admin'::public.app_role)) then
    raise exception 'solo admin';
  end if;
  select jsonb_build_object(
    'days', p_days,
    'since', min(created_at),
    'total_usd', coalesce(sum(cost_usd), 0),
    'background_usd', coalesce(sum(cost_usd) filter (where user_id is null), 0),
    'by_user', coalesce((
      select jsonb_agg(t order by t.cost_usd desc) from (
        select u.email, round(sum(a.cost_usd), 4) as cost_usd, count(*) as calls,
               (select coalesce(sum(c.cost), 0) from public.credit_transactions c
                 where c.user_id = a.user_id and c.cost > 0 and c.created_at > now() - make_interval(days => p_days)) as credits_spent,
               (select s.status from public.subscriptions s where s.user_id = a.user_id limit 1) as plan_status
        from public.ai_usage a join auth.users u on u.id = a.user_id
        where a.created_at > now() - make_interval(days => p_days)
        group by a.user_id, u.email
      ) t), '[]'::jsonb),
    'by_fn', coalesce((
      select jsonb_agg(t order by t.cost_usd desc) from (
        select fn, round(sum(cost_usd), 4) as cost_usd, count(*) as calls,
               round(avg(cost_usd), 5) as avg_usd
        from public.ai_usage where created_at > now() - make_interval(days => p_days)
        group by fn
      ) t), '[]'::jsonb)
  ) into r
  from public.ai_usage where created_at > now() - make_interval(days => p_days);
  return r;
end $$;
revoke all on function public.admin_ai_costs(integer) from public, anon;
grant execute on function public.admin_ai_costs(integer) to authenticated, service_role;
