
create table if not exists public.ad_media_cache (
  ad_id text primary key,
  image_url text,
  video_url text,
  failed boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.ad_media_cache enable row level security;

create policy "ad_media_cache_select_authenticated"
  on public.ad_media_cache for select
  to authenticated
  using (true);

create policy "ad_media_cache_service_all"
  on public.ad_media_cache for all
  to service_role
  using (true) with check (true);

create index if not exists ad_media_cache_updated_at_idx on public.ad_media_cache (updated_at desc);
