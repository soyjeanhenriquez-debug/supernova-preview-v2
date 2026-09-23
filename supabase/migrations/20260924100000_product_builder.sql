-- Fase 1 · "Crear producto" (ebook/guía y mini curso) dentro de SUPERNOVA (etapa 4 · Construir).
-- El índice es GRATIS (Gemini, tope 6/h y 20/día); cada capítulo, lección o bono se cobra aparte en
-- el servidor (edge function product-builder) y se reembolsa si la IA falla.
-- Los modelos viven en ai_builder_models: sumar Opus, Fable u otra IA futura = 3 filas
-- (ai_model_prices + credit_prices + ai_builder_models), sin redesplegar.
-- Idempotente: se puede volver a correr.

-- ═══ 1. Precios (charged_by='server': los cobra edge_guard_charge) ═══
-- Peor caso por pieza: crédito más barato (Pack Nuclear, US$0,0087), 6000 tokens de entrada y la
-- salida completa (max_output_tokens, que ya incluye el razonamiento):
--   Estándar  15 cr = US$0,131 · costo 6000×0,75 + 8000×3,75  = US$0,035 → 3,8×
--             (Gemini sube a 1,50/7,50 el 2027-01-01 → US$0,069 → 1,9×: ese día subir a 25 cr)
--   Sonnet    35 cr = US$0,305 · costo 6000×2    + 8000×10    = US$0,092 → 3,3×
--   Opus      75 cr = US$0,653 · costo 6000×4    + 9000×20    = US$0,204 → 3,2×
--   Fable    180 cr = US$1,566 · costo 6000×10   + 9000×50    = US$0,510 → 3,1×
-- (Si TODA la entrada fuera escritura en caché, ×1,25, Fable quedaría en 3,0×.)
-- Recalibrar con ai_usage (fn='product-builder') tras 5–10 piezas reales por modelo; cambiar aquí,
-- no en el código (y el aviso de CREDIT_COSTS en src/hooks/useCredits.ts).
insert into public.credit_prices (action, cost, label, charged_by) values
  ('build_piece_std',    15,  'Capítulo o lección · Estándar',  'server'),
  ('build_piece_sonnet', 35,  'Capítulo o lección · Sonnet 5',  'server'),
  ('build_piece_opus',   75,  'Capítulo o lección · Opus 5.5',  'server'),
  ('build_piece_fable',  180, 'Capítulo o lección · Fable 5.1', 'server')
on conflict (action) do nothing;

-- ═══ 2. Costo real por token (log_ai_usage cobra lo desconocido al más caro) ═══
insert into public.ai_model_prices (model, input_per_m, output_per_m, per_image) values
  ('claude-sonnet-5',   2.00, 10.00, 0),
  ('claude-opus-5-5',   4.00, 20.00, 0),
  ('claude-fable-5-1', 10.00, 50.00, 0),
  ('gemini-3.8-flash',  0.75,  3.75, 0)   -- sube a 1.50/7.50 el 2027-01-01: actualizar ese día
on conflict (model) do update
  set input_per_m = excluded.input_per_m, output_per_m = excluded.output_per_m, updated_at = now();

-- ═══ 3. Registro de modelos del constructor ═══
create table if not exists public.ai_builder_models (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  provider text not null check (provider in ('gemini', 'anthropic', 'openai')),
  model_id text not null check (char_length(model_id) between 2 and 80),
  label text not null check (char_length(label) between 2 and 40),
  hint text check (hint is null or char_length(hint) <= 80),
  tier text not null check (tier in ('estandar', 'premium', 'maximo')),
  piece_action text not null references public.credit_prices(action) on update cascade,
  enabled boolean not null default false,
  allows_profanity boolean not null default false,
  is_outline_model boolean not null default false,
  effort text check (effort is null or effort in ('low', 'medium', 'high')),
  max_output_tokens integer not null default 8000 check (max_output_tokens between 1000 and 32000),
  -- La función corta a los 125 s pase lo que pase (el plan Free de Supabase mata a los 150 s).
  timeout_ms integer not null default 120000 check (timeout_ms between 20000 and 120000),
  sort_order smallint not null default 100,
  note text,
  updated_at timestamptz not null default now()
);
-- Un solo modelo escribe los índices (gratis).
create unique index if not exists ai_builder_models_one_outline
  on public.ai_builder_models (is_outline_model) where is_outline_model;

alter table public.ai_builder_models enable row level security;
drop policy if exists "ai_builder_models: ver habilitados" on public.ai_builder_models;
create policy "ai_builder_models: ver habilitados" on public.ai_builder_models
  for select to authenticated
  using (enabled or (select public.has_role((select auth.uid()), 'admin'::public.app_role)));
drop policy if exists "ai_builder_models: admin edita" on public.ai_builder_models;
create policy "ai_builder_models: admin edita" on public.ai_builder_models
  for all to authenticated
  using ((select public.has_role((select auth.uid()), 'admin'::public.app_role)))
  with check ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));
revoke all on public.ai_builder_models from anon;

insert into public.ai_builder_models
  (slug, provider, model_id, label, hint, tier, piece_action, enabled, allows_profanity, is_outline_model, effort, max_output_tokens, timeout_ms, sort_order, note) values
  ('estandar', 'gemini',    'gemini-3.8-flash', 'Estándar',           'Rápido y económico', 'estandar', 'build_piece_std',    true,  true, true,  'low',     8000,  90000, 10, 'Si Google lo retira, cambiar model_id aquí.'),
  ('sonnet',   'anthropic', 'claude-sonnet-5',  'Premium · Sonnet 5', 'Mejor redacción',    'premium',  'build_piece_sonnet', false, true, false, 'medium',  8000, 120000, 20, 'Requiere ANTHROPIC_API_KEY.'),
  ('opus',     'anthropic', 'claude-opus-5-5',  'Pro · Opus 5.5',     'Redacción experta',  'maximo',   'build_piece_opus',   false, true, false, 'medium',  9000, 120000, 30, 'Requiere ANTHROPIC_API_KEY.'),
  ('fable',    'anthropic', 'claude-fable-5-1', 'Máximo · Fable 5.1', 'La IA más capaz',    'maximo',   'build_piece_fable',  false, true, false, 'low',     9000, 120000, 40, 'Requiere ANTHROPIC_API_KEY y retención de 30 días.')
on conflict (slug) do nothing;

-- ═══ 4. Topes por función (interruptor sin redesplegar) ═══
-- Las piezas se cobran con fn = 'product-builder-piece-<tier>' (tier de ai_builder_models): cada
-- nivel tiene su propio tope y su propio apagado. Sin fila, mandan los topes del código (iguales).
insert into public.edge_limits (fn, enabled, max_hour, max_day, note) values
  ('product-builder-outline',        true, 6,  20,  'Índice gratis del constructor (Gemini).'),
  ('product-builder-piece-estandar', true, 30, 120, 'Capítulos/lecciones cobrados por pieza · Estándar.'),
  ('product-builder-piece-premium',  true, 8,  25,  'Capítulos/lecciones cobrados por pieza · Premium (Sonnet).'),
  ('product-builder-piece-maximo',   true, 8,  25,  'Capítulos/lecciones cobrados por pieza · Máximo (Opus, Fable).')
on conflict (fn) do nothing;

-- ═══ 5. Libros / cursos ═══
create table if not exists public.product_builds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  format text not null check (format in ('ebook', 'curso')),
  title text not null check (char_length(title) between 1 and 160),
  subtitle text check (subtitle is null or char_length(subtitle) <= 240),
  tone text not null default 'cercano' check (tone in ('limpio', 'cercano', 'groserias')),
  size text not null default 'normal' check (size in ('corto', 'normal')),
  status text not null default 'borrador' check (status in ('borrador', 'listo')),
  outline jsonb check (outline is null or pg_column_size(outline) <= 30000),
  cover jsonb check (cover is null or pg_column_size(cover) <= 4000),
  pieces_total smallint not null default 0,
  pieces_done smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_builds_user on public.product_builds (user_id, product_id, created_at desc);
create index if not exists product_builds_product on public.product_builds (product_id);

create table if not exists public.product_build_pieces (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.product_builds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  idx smallint not null default 0 check (idx between 0 and 99),
  kind text not null check (kind in ('capitulo', 'leccion', 'bono')),
  module text check (module is null or char_length(module) <= 120),
  title text not null check (char_length(title) between 1 and 160),
  brief text check (brief is null or char_length(brief) <= 600),
  content text check (content is null or char_length(content) <= 40000),
  model_slug text,
  tx_id uuid,
  gen_count smallint not null default 0,
  generating_until timestamptz,
  generated_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_build_pieces_build on public.product_build_pieces (build_id, idx);
create index if not exists product_build_pieces_user on public.product_build_pieces (user_id);

-- ═══ 6. Disparadores: dueño, topes, contadores, updated_at ═══
-- Valen también para el servidor (service_role), que es quien crea los libros.
create or replace function private.pb_build_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.products p where p.id = new.product_id and p.user_id = new.user_id) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  if (select count(*) from public.product_builds where user_id = new.user_id) >= 30 then
    raise exception 'too_many_builds' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists pb_build_guard on public.product_builds;
create trigger pb_build_guard before insert on public.product_builds
  for each row execute function private.pb_build_guard();

create or replace function private.pb_piece_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.product_builds b where b.id = new.build_id and b.user_id = new.user_id) then
    raise exception 'not_owner' using errcode = 'P0001';
  end if;
  if (select count(*) from public.product_build_pieces where build_id = new.build_id) >= 20 then
    raise exception 'too_many_pieces' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists pb_piece_guard on public.product_build_pieces;
create trigger pb_piece_guard before insert on public.product_build_pieces
  for each row execute function private.pb_piece_guard();

create or replace function private.pb_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists pb_touch_build on public.product_builds;
create trigger pb_touch_build before update on public.product_builds
  for each row execute function private.pb_touch();
drop trigger if exists pb_touch_piece on public.product_build_pieces;
create trigger pb_touch_piece before update on public.product_build_pieces
  for each row execute function private.pb_touch();

-- pieces_total / pieces_done para "Lo que creaste" y el recorrido. "Hecha" = ≥200 caracteres sin
-- espacios en los extremos (el mismo criterio que isPieceDone en src/lib/productBuilder.ts).
create or replace function private.pb_refresh_counts() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_build uuid := coalesce(new.build_id, old.build_id);
begin
  update public.product_builds b set
    pieces_total = (select count(*) from public.product_build_pieces p where p.build_id = v_build),
    pieces_done  = (select count(*) from public.product_build_pieces p
                    where p.build_id = v_build and char_length(btrim(coalesce(p.content, ''))) >= 200)
  where b.id = v_build;
  return null;
end $$;
drop trigger if exists pb_refresh_counts on public.product_build_pieces;
create trigger pb_refresh_counts after insert or delete or update of content on public.product_build_pieces
  for each row execute function private.pb_refresh_counts();

revoke all on function private.pb_build_guard() from public, anon, authenticated;
revoke all on function private.pb_piece_guard() from public, anon, authenticated;
revoke all on function private.pb_touch() from public, anon, authenticated;
revoke all on function private.pb_refresh_counts() from public, anon, authenticated;

-- ═══ 7. RLS + permisos por columna ═══
alter table public.product_builds enable row level security;
alter table public.product_build_pieces enable row level security;

drop policy if exists "product_builds: ver lo propio" on public.product_builds;
create policy "product_builds: ver lo propio" on public.product_builds
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "product_builds: editar lo propio" on public.product_builds;
create policy "product_builds: editar lo propio" on public.product_builds
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "product_builds: borrar lo propio" on public.product_builds;
create policy "product_builds: borrar lo propio" on public.product_builds
  for delete to authenticated using (user_id = (select auth.uid()));
-- Sin política INSERT: los libros los crea el servidor al generar el índice.

drop policy if exists "pieces: ver lo propio" on public.product_build_pieces;
create policy "pieces: ver lo propio" on public.product_build_pieces
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "pieces: agregar a lo propio" on public.product_build_pieces;
create policy "pieces: agregar a lo propio" on public.product_build_pieces
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.product_builds b where b.id = build_id and b.user_id = (select auth.uid())));
drop policy if exists "pieces: editar lo propio" on public.product_build_pieces;
create policy "pieces: editar lo propio" on public.product_build_pieces
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "pieces: borrar lo propio" on public.product_build_pieces;
create policy "pieces: borrar lo propio" on public.product_build_pieces
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.product_builds from anon;
revoke all on public.product_build_pieces from anon;
revoke insert, update on public.product_builds from authenticated;
grant select, delete on public.product_builds to authenticated;
grant update (title, subtitle, tone, status, outline, cover) on public.product_builds to authenticated;
revoke insert, update on public.product_build_pieces from authenticated;
grant select, delete on public.product_build_pieces to authenticated;
grant insert (build_id, user_id, idx, kind, module, title, brief, content) on public.product_build_pieces to authenticated;
grant update (idx, module, title, brief, content, edited_at) on public.product_build_pieces to authenticated;
-- model_slug, tx_id, gen_count, generating_until, generated_at, pieces_*: solo el servidor (service_role).
