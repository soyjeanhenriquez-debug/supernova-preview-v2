-- Test A/B de la landing (decisión de Jean, 23-sep-2026).
-- A = "Descubre qué vender, valídalo con datos…"; B = la promesa anterior, corta ("ofertas que ya se
-- venden en otro país"). Cada visitante recibe una versión fija (o la del anuncio con ?v=a|b), y aquí
-- se cuenta: visita, clic al checkout, test de 30 s y correo. La compra se cruza por correo
-- (subscriptions.email) o porque el visitante entra después a la app en el mismo navegador.
-- Nota: los eventos llegan desde la web pública (anon): alguien podría inflar números a propósito; los
-- límites de abajo acotan el ruido, y la compra (lo que decide) no se puede falsear desde aquí.

create table if not exists public.landing_visitors (
  id uuid primary key,
  variant text not null check (variant in ('A', 'B')),
  utm jsonb check (utm is null or pg_column_size(utm) <= 1000),
  cta_clicks smallint not null default 0,
  quiz_opened boolean not null default false,
  quiz_done boolean not null default false,
  user_id uuid references auth.users(id) on delete set null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists landing_visitors_variant on public.landing_visitors (first_seen desc, variant);
create index if not exists landing_visitors_user on public.landing_visitors (user_id) where user_id is not null;
alter table public.landing_visitors enable row level security;
create policy "landing_visitors: admin lee" on public.landing_visitors
  for select to authenticated using ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));

-- (landing_leads ya existía: ver 20260923231000_landing_ab_leads_fix.sql)

-- Evento desde la landing: view | cta | quiz_open | quiz_done.
create or replace function public.landing_track(p_visitor uuid, p_variant text, p_event text, p_utm jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_visitor is null or p_variant not in ('A', 'B') or p_event not in ('view', 'cta', 'quiz_open', 'quiz_done') then
    return;
  end if;
  insert into public.landing_visitors (id, variant, utm)
  values (p_visitor, p_variant,
          case when p_utm is not null and jsonb_typeof(p_utm) = 'object' and pg_column_size(p_utm) <= 1000 then p_utm end)
  on conflict (id) do update set last_seen = now();
  update public.landing_visitors set
    cta_clicks = least(cta_clicks + (case when p_event = 'cta' then 1 else 0 end), 50),
    quiz_opened = quiz_opened or p_event in ('quiz_open', 'quiz_done'),
    quiz_done = quiz_done or p_event = 'quiz_done'
  where id = p_visitor;
end $$;
revoke all on function public.landing_track(uuid, text, text, jsonb) from public;
grant execute on function public.landing_track(uuid, text, text, jsonb) to anon, authenticated;

-- Al entrar a la app en el mismo navegador, el visitante queda ligado a su cuenta.
create or replace function public.claim_landing_visitor(p_visitor uuid)
returns void language sql security definer set search_path = public as $$
  update public.landing_visitors set user_id = auth.uid()
  where id = p_visitor and user_id is null and auth.uid() is not null;
$$;
revoke all on function public.claim_landing_visitor(uuid) from public, anon;
grant execute on function public.claim_landing_visitor(uuid) to authenticated;

-- Reporte para el admin: embudo por versión en los últimos p_days días.
create or replace function public.admin_landing_ab(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.has_role(auth.uid(), 'admin'::public.app_role) then raise exception 'solo admin'; end if;
  with v as (
    select * from public.landing_visitors where first_seen > now() - make_interval(days => greatest(1, least(p_days, 365)))
  ), l as (
    select * from public.landing_leads where created_at > now() - make_interval(days => greatest(1, least(p_days, 365)))
  ), buyers as (
    -- Quién empezó la prueba o pagó, por versión: por la cuenta ligada o por el correo del test.
    select distinct x.variant, s.id, s.status
    from (
      select v.variant, u.email from v join auth.users u on u.id = v.user_id
      union
      select l.variant, l.email from l
    ) x
    join public.subscriptions s on lower(s.email) = lower(x.email)
  )
  select jsonb_build_object(
    'days', p_days,
    'variants', coalesce(jsonb_agg(t order by t.variant), '[]'::jsonb)
  ) into r
  from (
    select k.variant,
      (select count(*) from v where v.variant = k.variant) as visitors,
      (select count(*) from v where v.variant = k.variant and v.cta_clicks > 0) as clicked,
      (select count(*) from v where v.variant = k.variant and v.quiz_opened) as quiz_opened,
      (select count(*) from l where l.variant = k.variant) as leads,
      (select count(*) from v where v.variant = k.variant and v.user_id is not null) as signed_in,
      (select count(*) from buyers b where b.variant = k.variant) as trials,
      (select count(*) from buyers b where b.variant = k.variant and b.status = 'active') as paying
    from (values ('A'), ('B')) k(variant)
  ) t;
  return r;
end $$;
revoke all on function public.admin_landing_ab(integer) from public, anon;
grant execute on function public.admin_landing_ab(integer) to authenticated;
