-- Límites del recorrido "Mi negocio" (revisión del 23-sep):
-- 1) weekly_plans: el usuario solo puede cambiar sus tareas (tacharlas). Supabase da UPDATE en todas
--    las columnas por defecto; sin esto podía poner regenerations en 0 y rehacer su semana sin límite.
revoke update on public.weekly_plans from authenticated;
grant update (tasks, updated_at) on public.weekly_plans to authenticated;

-- 2) Tamaño máximo de los datos de cada herramienta en la ficha (la base está en el plan Free).
alter table public.business_profile
  add constraint business_profile_validation_size check (validation is null or pg_column_size(validation) <= 20000),
  add constraint business_profile_launch_plan_size check (launch_plan is null or pg_column_size(launch_plan) <= 60000),
  add constraint business_profile_recovery_size check (recovery is null or pg_column_size(recovery) <= 30000),
  add constraint business_profile_pricing_size check (pricing is null or pg_column_size(pricing) <= 10000),
  add constraint business_profile_journey_size check (journey is null or pg_column_size(journey) <= 5000);
alter table public.weekly_plans
  add constraint weekly_plans_tasks_size check (pg_column_size(tasks) <= 20000);

-- 3) Calendario de contenido: hasta 500 piezas por usuario.
create or replace function public.content_items_cap()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.content_items where user_id = new.user_id) >= 500 then
    raise exception 'Llegaste al máximo de 500 piezas en tu calendario. Borra las que ya publicaste.';
  end if;
  return new;
end $$;
drop trigger if exists content_items_cap on public.content_items;
create trigger content_items_cap before insert on public.content_items
  for each row execute function public.content_items_cap();
