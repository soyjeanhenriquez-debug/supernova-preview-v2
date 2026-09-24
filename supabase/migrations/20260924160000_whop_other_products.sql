-- Productos propios de Jean que se cobran en la MISMA cuenta de Whop que SUPERNOVA (primero:
-- "Edúcate con IA"). Sin esto, el webhook trataba cualquier membresía como suscripción de SUPERNOVA
-- y daba acceso a la app a quien compraba otro producto. Sus ventas se anotan aparte para el
-- agente de ventas y nunca tocan subscriptions ni approved_emails.
create table if not exists public.whop_other_plans (
  plan_id text primary key check (plan_id ~ '^plan_[A-Za-z0-9]{6,40}$'),
  product text not null check (char_length(product) between 2 and 80),
  funnel_slug text references public.funnels(slug) on delete set null,
  label text check (char_length(label) <= 80),
  created_at timestamptz not null default now()
);
alter table public.whop_other_plans enable row level security;
drop policy if exists "whop_other_plans: admin" on public.whop_other_plans;
create policy "whop_other_plans: admin" on public.whop_other_plans for all to authenticated
  using ((select public.has_role((select auth.uid()), 'admin'::public.app_role)))
  with check ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));
revoke all on public.whop_other_plans from anon;

create table if not exists public.whop_product_sales (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null,
  product text not null,
  event text not null,
  status text,
  email text check (char_length(email) <= 200),
  membership_id text,
  amount numeric(10,2),
  currency text,
  created_at timestamptz not null default now()
);
create index if not exists whop_product_sales_product on public.whop_product_sales (product, created_at desc);
alter table public.whop_product_sales enable row level security;
drop policy if exists "whop_product_sales: admin lee" on public.whop_product_sales;
create policy "whop_product_sales: admin lee" on public.whop_product_sales for select to authenticated
  using ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));
revoke all on public.whop_product_sales from anon;
revoke insert, update, delete on public.whop_product_sales from authenticated;
