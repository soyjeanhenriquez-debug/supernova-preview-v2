-- SUPERNOVA — ADN de marca 2.0 + Ofertas + 4 modos de modelado (decisiones de Jean, 19-oct-2026).
--
-- 1) brand_dna: el ADN del creador, una fila por usuario. 6 preguntas esenciales y 8 opcionales.
--    Los topes se cuentan en caracteres Unicode (char_length = puntos de código), igual que el
--    navegador (supabase/functions/_shared/brandDna.ts usa [...texto].length). Mínimo de 20 para dar
--    una esencial por "completada": lo decide la app con la misma función; la base acepta borradores.
--    formative_experiences (P8) es privada: no entra a ningún prompt hasta formative_editorial_ok.
--    Sin lectura de admin: es información personal.
-- 2) editorial_prefs: preferencias editoriales que la persona guarda a mano ("Guardar como preferencia").
-- 3) products = Ofertas: estado (borrador · validacion · disponible · pausado), precio estructurado y
--    campos opcionales. Los topes suben (nunca bajan sobre datos existentes: se comprobó en producción
--    que ningún product pasa de 250). El precio en texto (price) se conserva para las herramientas
--    que ya lo leen; el estructurado se rellena solo cuando el texto es un número.
--    Los productos existentes con ficha completa quedan "disponible" (nada de lo que venden hoy deja
--    de funcionar); los incompletos, "borrador". Los nuevos nacen en "borrador".
-- 4) reel_analyses.nivel acepta 'recrear' (RECREAR 75 %). 'adaptacion' = VENDER, 'inspiracion' = REINVENTAR.

-- ---------------- 1) ADN de marca ----------------
create table if not exists public.brand_dna (
  user_id uuid primary key references auth.users(id) on delete cascade,
  identity text not null default '' check (char_length(identity) <= 500),
  recognized_value text not null default '' check (char_length(recognized_value) <= 400),
  unique_perspective text not null default '' check (char_length(unique_perspective) <= 600),
  target_audience text not null default '' check (char_length(target_audience) <= 500),
  editorial_value text not null default '' check (char_length(editorial_value) <= 450),
  desired_perception text not null default '' check (char_length(desired_perception) <= 350),
  credibility text not null default '' check (char_length(credibility) <= 600),
  formative_experiences text not null default '' check (char_length(formative_experiences) <= 1200),
  changed_beliefs text not null default '' check (char_length(changed_beliefs) <= 600),
  boundaries text not null default '' check (char_length(boundaries) <= 450),
  intrinsic_interests text not null default '' check (char_length(intrinsic_interests) <= 450),
  communication_style text not null default '' check (char_length(communication_style) <= 550),
  preferred_formats text not null default '' check (char_length(preferred_formats) <= 400),
  creative_references text not null default '' check (char_length(creative_references) <= 500),
  formative_editorial_ok boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.brand_dna enable row level security;
drop policy if exists "brand_dna: lo propio" on public.brand_dna;
create policy "brand_dna: lo propio" on public.brand_dna
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.brand_dna from anon;
drop trigger if exists brand_dna_updated_at on public.brand_dna;
create trigger brand_dna_updated_at before update on public.brand_dna
  for each row execute function public.handle_updated_at();

-- ---------------- 2) Preferencias editoriales ----------------
create table if not exists public.editorial_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 3 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists editorial_prefs_user on public.editorial_prefs (user_id, created_at);
alter table public.editorial_prefs enable row level security;
drop policy if exists "editorial_prefs: lo propio" on public.editorial_prefs;
create policy "editorial_prefs: lo propio" on public.editorial_prefs
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.editorial_prefs from anon;
drop trigger if exists editorial_prefs_updated_at on public.editorial_prefs;
create trigger editorial_prefs_updated_at before update on public.editorial_prefs
  for each row execute function public.handle_updated_at();

-- Tope de 30 preferencias por persona (se valida en el servidor, no solo en la pantalla).
create or replace function public.editorial_prefs_cap()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.editorial_prefs where user_id = new.user_id) >= 30 then
    raise exception 'Llegaste a 30 preferencias. Borra alguna para guardar otra.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.editorial_prefs_cap() from public, anon, authenticated;
drop trigger if exists editorial_prefs_cap on public.editorial_prefs;
create trigger editorial_prefs_cap before insert on public.editorial_prefs
  for each row execute function public.editorial_prefs_cap();

-- ---------------- 3) Ofertas (tabla products) ----------------
alter table public.products
  add column if not exists offer_status text,
  add column if not exists price_amount numeric(12,2) check (price_amount is null or price_amount >= 0),
  add column if not exists price_currency text check (price_currency is null or price_currency ~ '^[A-Z]{3}$'),
  add column if not exists price_mode text check (price_mode is null or price_mode in ('unico', 'mensual', 'anual', 'otra')),
  add column if not exists problem text check (problem is null or char_length(problem) <= 500),
  add column if not exists delivers text check (delivers is null or char_length(delivers) <= 700),
  add column if not exists differentiator text check (differentiator is null or char_length(differentiator) <= 450),
  add column if not exists limitations text check (limitations is null or char_length(limitations) <= 400),
  add column if not exists next_action text check (next_action is null or char_length(next_action) <= 200);

-- Topes nuevos de los obligatorios (producto 250 · a quién 400 · resultado 500 · pruebas 700).
alter table public.products drop constraint if exists products_product_check;
alter table public.products add constraint products_product_check check (char_length(product) <= 250);
alter table public.products drop constraint if exists products_who_check;
alter table public.products add constraint products_who_check check (char_length(who) <= 400);
alter table public.products drop constraint if exists products_promise_check;
alter table public.products add constraint products_promise_check check (char_length(promise) <= 500);
alter table public.products drop constraint if exists products_proof_check;
alter table public.products add constraint products_proof_check check (char_length(proof) <= 700);

-- Precio estructurado desde el texto, solo si es un número (el texto original no se toca).
update public.products set
  price_amount = replace(replace(btrim(price), '.', ''), ',', '.')::numeric,
  price_currency = case coalesce(pricing->>'currency', 'US$') when 'RD$' then 'DOP' when 'COP$' then 'COP' when 'MX$' then 'MXN' when '€' then 'EUR' else 'USD' end,
  price_mode = 'unico'
where price_amount is null and price ~ '^\s*[0-9]{1,3}(\.[0-9]{3})*(,[0-9]{1,2})?\s*$';
update public.products set
  price_amount = btrim(price)::numeric,
  price_currency = case coalesce(pricing->>'currency', 'US$') when 'RD$' then 'DOP' when 'COP$' then 'COP' when 'MX$' then 'MXN' when '€' then 'EUR' else 'USD' end,
  price_mode = 'unico'
where price_amount is null and price ~ '^\s*[0-9]+(\.[0-9]{1,2})?\s*$';

-- Estado: los que ya existen y tienen la ficha completa siguen vendiendo; el resto, borrador.
update public.products set offer_status = case
  when coalesce(btrim(product), '') <> '' and coalesce(btrim(who), '') <> '' and coalesce(btrim(promise), '') <> ''
       and price_amount is not null then 'disponible'
  else 'borrador' end
where offer_status is null;
alter table public.products alter column offer_status set default 'borrador';
alter table public.products alter column offer_status set not null;
alter table public.products drop constraint if exists products_offer_status_check;
alter table public.products add constraint products_offer_status_check
  check (offer_status in ('borrador', 'validacion', 'disponible', 'pausado'));
-- Solo se publica (validación o disponible) con lo obligatorio: qué, a quién, resultado y precio.
alter table public.products drop constraint if exists products_offer_ready_check;
alter table public.products add constraint products_offer_ready_check check (
  offer_status in ('borrador', 'pausado') or (
    coalesce(btrim(product), '') <> '' and coalesce(btrim(who), '') <> '' and coalesce(btrim(promise), '') <> ''
    and price_amount is not null and price_currency is not null and price_mode is not null));

-- ---------------- 4) RECREAR ----------------
alter table public.reel_analyses drop constraint if exists reel_analyses_nivel_check;
alter table public.reel_analyses add constraint reel_analyses_nivel_check
  check (nivel in ('espejo', 'recrear', 'adaptacion', 'inspiracion'));
