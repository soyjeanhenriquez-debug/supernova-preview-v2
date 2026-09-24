-- Embudos de prueba para los productos de los usuarios (primer caso: "IA Sin Miedo" de Jean,
-- 23-sep-2026). Una landing pública con test A/B y quiz manda eventos y correos aquí; el dueño ve
-- sus números. Contadores por día (sin cookies ni datos personales) + correos del quiz.
-- Mientras el producto no tenga checkout, el botón de compra funciona como "preventa": mide la
-- intención real de compra (clic + correo) antes de crear nada.

create table if not exists public.funnels (
  slug text primary key check (slug ~ '^[a-z0-9-]{3,40}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null check (char_length(name) between 2 and 80),
  created_at timestamptz not null default now()
);
alter table public.funnels enable row level security;
drop policy if exists "funnels: dueño o admin" on public.funnels;
create policy "funnels: dueño o admin" on public.funnels for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_role((select auth.uid()), 'admin'::public.app_role)));
revoke all on public.funnels from anon;
revoke insert, update, delete on public.funnels from authenticated;

create table if not exists public.funnel_events (
  slug text not null references public.funnels(slug) on delete cascade,
  day date not null default current_date,
  variant text not null check (variant in ('A', 'B')),
  event text not null check (event in ('view', 'quiz_start', 'quiz_done', 'cta', 'lead')),
  n integer not null default 0,
  primary key (slug, day, variant, event)
);
alter table public.funnel_events enable row level security;
drop policy if exists "funnel_events: dueño o admin" on public.funnel_events;
create policy "funnel_events: dueño o admin" on public.funnel_events for select to authenticated
  using (exists (select 1 from public.funnels f where f.slug = funnel_events.slug
                 and (f.user_id = (select auth.uid()) or (select public.has_role((select auth.uid()), 'admin'::public.app_role)))));
revoke all on public.funnel_events from anon;
revoke insert, update, delete on public.funnel_events from authenticated;

create table if not exists public.funnel_leads (
  id uuid primary key default gen_random_uuid(),
  slug text not null references public.funnels(slug) on delete cascade,
  contact text not null check (char_length(contact) between 5 and 120),
  variant text not null check (variant in ('A', 'B')),
  answers jsonb check (answers is null or pg_column_size(answers) <= 1000),
  created_at timestamptz not null default now(),
  unique (slug, contact)
);
alter table public.funnel_leads enable row level security;
drop policy if exists "funnel_leads: dueño o admin" on public.funnel_leads;
create policy "funnel_leads: dueño o admin" on public.funnel_leads for select to authenticated
  using (exists (select 1 from public.funnels f where f.slug = funnel_leads.slug
                 and (f.user_id = (select auth.uid()) or (select public.has_role((select auth.uid()), 'admin'::public.app_role)))));
revoke all on public.funnel_leads from anon;
revoke insert, update, delete on public.funnel_leads from authenticated;

create or replace function public.funnel_track(p_slug text, p_variant text, p_event text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_variant not in ('A', 'B') or p_event not in ('view', 'quiz_start', 'quiz_done', 'cta', 'lead')
     or not exists (select 1 from public.funnels where slug = p_slug) then return; end if;
  insert into public.funnel_events (slug, day, variant, event, n) values (p_slug, current_date, p_variant, p_event, 1)
  on conflict (slug, day, variant, event) do update set n = public.funnel_events.n + 1;
end $$;
revoke all on function public.funnel_track(text, text, text) from public;
grant execute on function public.funnel_track(text, text, text) to anon, authenticated;

-- Correo o WhatsApp del quiz. Tope de 300 por embudo y día contra basura.
create or replace function public.funnel_lead(p_slug text, p_variant text, p_contact text, p_answers jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare c text := lower(btrim(coalesce(p_contact, '')));
begin
  if p_variant not in ('A', 'B') or not exists (select 1 from public.funnels where slug = p_slug) then return false; end if;
  if not (c ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' or regexp_replace(c, '[^0-9]', '', 'g') ~ '^[0-9]{8,15}$')
     or char_length(c) > 120 then return false; end if;
  if (select count(*) from public.funnel_leads where slug = p_slug and created_at > now() - interval '1 day') >= 300 then return false; end if;
  insert into public.funnel_leads (slug, contact, variant, answers)
  values (p_slug, c, p_variant, case when jsonb_typeof(p_answers) = 'object' and pg_column_size(p_answers) <= 1000 then p_answers end)
  on conflict (slug, contact) do nothing;
  perform public.funnel_track(p_slug, p_variant, 'lead');
  return true;
end $$;
revoke all on function public.funnel_lead(text, text, text, jsonb) from public;
grant execute on function public.funnel_lead(text, text, text, jsonb) to anon, authenticated;

insert into public.funnels (slug, user_id, product_id, name)
select 'ia-sin-miedo', '2687ca65-02c7-40db-b2fc-8ed0d57a4424', 'a9ebf553-82e4-43bb-bb43-b0654f798fe0', 'IA Sin Miedo · Reto de 7 días'
where exists (select 1 from public.products where id = 'a9ebf553-82e4-43bb-bb43-b0654f798fe0')
on conflict (slug) do nothing;
