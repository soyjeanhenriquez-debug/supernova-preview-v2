-- "Apoya SUPERNOVA" (decisión de Jean, 23-sep-2026): aportes de pago único en Whop.
-- Quien aporta desbloquea la escritura de "Crear producto" (cuenta como recarga), recibe créditos
-- de regalo y queda registrado como impulsor (acceso anticipado a las IAs premium cuando se activen).
-- Los planes viven en support_plans: Jean crea el producto en Whop y aquí se pega su plan_id; el
-- webhook y la app los leen de esta tabla, sin redesplegar.

create table if not exists public.support_plans (
  plan_id text primary key check (plan_id ~ '^plan_[A-Za-z0-9]{6,40}$'),
  tier text not null check (tier in ('apoyo', 'impulso', 'fundador')),
  label text not null check (char_length(label) between 2 and 40),
  amount_usd numeric(8,2) not null check (amount_usd > 0 and amount_usd <= 1000),
  bonus_credits integer not null check (bonus_credits between 0 and 3000),
  perks text[] not null default '{}',
  enabled boolean not null default true,
  sort_order smallint not null default 100,
  updated_at timestamptz not null default now()
);
alter table public.support_plans enable row level security;
drop policy if exists "support_plans: ver activos" on public.support_plans;
create policy "support_plans: ver activos" on public.support_plans
  for select to authenticated using (enabled or (select public.has_role((select auth.uid()), 'admin'::public.app_role)));
drop policy if exists "support_plans: admin edita" on public.support_plans;
create policy "support_plans: admin edita" on public.support_plans
  for all to authenticated
  using ((select public.has_role((select auth.uid()), 'admin'::public.app_role)))
  with check ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));
revoke all on public.support_plans from anon;

-- Quién aportó (lo escribe solo el webhook con service_role).
create table if not exists public.supporters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  tier text not null,
  amount_usd numeric(8,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists supporters_user on public.supporters (user_id, created_at desc);
alter table public.supporters enable row level security;
drop policy if exists "supporters: ver lo propio o admin" on public.supporters;
create policy "supporters: ver lo propio o admin" on public.supporters
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_role((select auth.uid()), 'admin'::public.app_role)));
revoke all on public.supporters from anon;
revoke insert, update, delete on public.supporters from authenticated;

-- Acreditar un aporte: créditos de regalo como recarga (desbloquea "Crear producto") + registro.
create or replace function public.grant_support(p_user_id uuid, p_plan_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_plan public.support_plans;
begin
  select * into v_plan from public.support_plans where plan_id = p_plan_id;
  if not found then return jsonb_build_object('success', false, 'error', 'plan desconocido'); end if;
  insert into public.supporters (user_id, plan_id, tier, amount_usd) values (p_user_id, v_plan.plan_id, v_plan.tier, v_plan.amount_usd);
  -- Siempre deja una transacción 'recharge' (aunque el regalo fuera 0) para desbloquear.
  if v_plan.bonus_credits > 0 then
    perform public.grant_purchased_credits(p_user_id, v_plan.bonus_credits, 'Aporte ' || v_plan.label || ' (Whop)');
  else
    insert into public.credit_transactions (user_id, action, label, cost, meta)
    values (p_user_id, 'recharge', 'Aporte ' || v_plan.label || ' (Whop)', 0, jsonb_build_object('granted', 0));
  end if;
  return jsonb_build_object('success', true, 'tier', v_plan.tier, 'credits', v_plan.bonus_credits);
end $$;
revoke all on function public.grant_support(uuid, text) from public, anon, authenticated;
grant execute on function public.grant_support(uuid, text) to service_role;
