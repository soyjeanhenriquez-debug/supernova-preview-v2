-- Informe de alertas para el admin (Admin → Salud y correo diario de health-alert).
-- Junta en un solo JSON lo que hoy obligaba a revisar a mano: pantallazos de clientes
-- (client_errors), tareas automáticas que fallaron (pg_cron), videos fallidos, frescura
-- del radar y clientes en prueba que todavía no usan la app (lo que decide si pagan).
-- Solo lo puede leer un admin o el service_role (la función de correo).
create or replace function public.admin_health_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  if not (coalesce(auth.role(), '') = 'service_role'
          or public.has_role(auth.uid(), 'admin'::public.app_role)) then
    raise exception 'solo admin';
  end if;

  select jsonb_build_object(
    'generated_at', now(),

    -- Pantallazos que vieron los clientes (ErrorBoundary → log_client_error).
    'client_errors', (
      select jsonb_build_object(
        'count', count(*),
        'users', count(distinct coalesce(e.user_id::text, e.user_agent)),
        'top', coalesce((
          select jsonb_agg(t) from (
            select left(e2.message, 120) as message, count(*) as n,
                   string_agg(distinct coalesce(u.email, 'sin sesión'), ', ') as who,
                   max(e2.created_at) as last
            from public.client_errors e2 left join auth.users u on u.id = e2.user_id
            where e2.created_at > now() - interval '24 hours'
            group by 1 order by 2 desc limit 5
          ) t), '[]'::jsonb)
      )
      from public.client_errors e where e.created_at > now() - interval '24 hours'
    ),

    -- Tareas automáticas (pg_cron) que fallaron en 24 h, agrupadas por tarea.
    'cron_failures', coalesce((
      select jsonb_agg(t) from (
        select j.jobname as job, count(*) as fails,
               (select count(*) from cron.job_run_details d2 where d2.jobid = j.jobid and d2.start_time > now() - interval '24 hours') as runs,
               left(max(d.return_message), 140) as sample
        from cron.job_run_details d join cron.job j on j.jobid = d.jobid
        where d.status <> 'succeeded' and d.start_time > now() - interval '24 hours'
        group by j.jobid, j.jobname order by 2 desc
      ) t), '[]'::jsonb),

    -- Videos de Media Studio que fallaron (se devuelven los créditos, pero el cliente no recibe nada).
    'media_failures', (
      select jsonb_build_object('count', count(*), 'sample', left(max(error), 140))
      from public.media_generation_jobs where status = 'failed' and created_at > now() - interval '24 hours'
    ),

    -- Frescura de datos: si el radar deja de traer anuncios, la app se queda vieja sin avisar.
    'radar', (
      select jsonb_build_object(
        'last_scraped', max(scraped_at),
        'new_24h', count(*) filter (where scraped_at > now() - interval '24 hours'))
      from public.winning_ads where scraped_at > now() - interval '3 days'
    ),

    -- Clientes en prueba o activos y cuánto han usado: quien no usa la app en la prueba no paga.
    'customers', coalesce((
      select jsonb_agg(t order by t.ends) from (
        select u.email, s.status, s.current_period_end as ends,
               greatest(0, extract(epoch from (s.current_period_end - now())) / 3600)::int as hours_left,
               (select count(*) from public.credit_transactions c where c.user_id = s.user_id and c.cost > 0) as ai_actions,
               (select count(*) from public.mandala_ads m where m.user_id = s.user_id) as mandala_ads,
               exists (select 1 from public.business_profile b where b.user_id = s.user_id) as has_business,
               u.last_sign_in_at as last_login
        from public.subscriptions s join auth.users u on u.id = s.user_id
        where s.status in ('trialing', 'active')
      ) t), '[]'::jsonb),

    'signups_24h', (select count(*) from auth.users where created_at > now() - interval '24 hours')
  ) into r;

  return r;
end $$;

revoke all on function public.admin_health_report() from public, anon;
grant execute on function public.admin_health_report() to authenticated, service_role;

-- Correo diario de alertas: 12:00 UTC = 8:00 hora RD. Solo envía si hay alertas.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'supernova-health-alert-daily';
SELECT cron.schedule(
  'supernova-health-alert-daily',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/health-alert',
    headers := private.cron_headers(),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
