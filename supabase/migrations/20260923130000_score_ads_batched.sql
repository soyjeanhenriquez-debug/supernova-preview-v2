-- Puntuación del radar por tandas.
-- score_unscored_ads() (cron cada hora) intentaba actualizar ~55.000 filas de winning_ads
-- de una vez (13 índices + trigger strip_fb_token por fila): pasaba del statement_timeout de
-- 2 min, la base deshacía todo y la hora siguiente volvía a empezar desde cero (falló 24 de
-- 24 veces el 22-23 sep; lo detectó admin_health_report). Ahora cada ronda actualiza como
-- máximo p_batch filas que de verdad cambiaron, termina y guarda; en pocas horas se pone al
-- día y después cada ronda solo toca lo que cambió.

-- Primero se quitan las versiones sin parámetro (si no, la llamada sin argumentos del cron
-- sería ambigua entre las dos).
drop function if exists public.score_unscored_ads();
drop function if exists public.recompute_advertiser_scale();

create or replace function public.recompute_advertiser_scale(p_batch integer default 3000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_updated integer;
begin
  with counts as (
    select page_id, count(*) as ads_running
    from public.winning_ads
    where page_id is not null and delivery_stop_time is null
    group by page_id
  ),
  todo as (
    select w.id, greatest(1, c.ads_running) as dup
    from public.winning_ads w join counts c on c.page_id = w.page_id
    where w.duplicate_count is distinct from greatest(1, c.ads_running)
    limit p_batch
  ),
  upd as (
    update public.winning_ads w set duplicate_count = t.dup
    from todo t where w.id = t.id
    returning 1
  )
  select count(*) into v_updated from upd;
  return v_updated;
end $$;

create or replace function public.score_unscored_ads(p_batch integer default 3000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_updated integer;
begin
  perform public.recompute_advertiser_scale(p_batch);

  with calc as (
    select w.id, w.days_active, w.winner_score, w.tier,
           greatest(1, coalesce(extract(day from now() - w.delivery_start_time)::int, w.days_active, 1)) as d,
           coalesce(w.duplicate_count, 1) as dup
    from public.winning_ads w
  ),
  scored as (
    select id, days_active, winner_score, tier, d,
           least(100, greatest(1, least(50, d * 50 / 60) + least(50, dup * 50 / 30))) as s
    from calc
  ),
  todo as (
    select id, d, s, case when s >= 75 then 'mega' when s >= 50 then 'rising' else 'solid' end as t
    from scored
    where days_active is distinct from d
       or winner_score is distinct from s
       or tier is distinct from (case when s >= 75 then 'mega' when s >= 50 then 'rising' else 'solid' end)
    limit p_batch
  ),
  upd as (
    update public.winning_ads w
    set days_active = t.d, winner_score = t.s, tier = t.t
    from todo t where w.id = t.id
    returning 1
  )
  select count(*) into v_updated from upd;
  return v_updated;
end $$;

-- Mismos permisos que antes: solo el cron (postgres) y master-rotate (service_role).
revoke all on function public.recompute_advertiser_scale(integer) from public, anon, authenticated;
revoke all on function public.score_unscored_ads(integer) from public, anon, authenticated;
grant execute on function public.recompute_advertiser_scale(integer) to service_role;
grant execute on function public.score_unscored_ads(integer) to service_role;

-- days_active cambia una vez al día en TODAS las filas (~114.000): con una tanda de 3.000 por
-- hora (72.000/día) nunca se ponía al día. Cada 10 min = ~430.000/día, con margen.
-- (El nombre del job se mantiene para no romper referencias.)
select cron.alter_job(jobid, schedule := '*/10 * * * *') from cron.job where jobname = 'supernova-score-ads-hourly';
