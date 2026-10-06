-- Radar diario del agente de seguridad de SUPERNOVA. Solo lectura y liviano:
-- todo filtrado por las últimas 24 h, sin count exact sobre winning_ads.
-- Correr con execute_sql (MCP de Supabase) en el proyecto krfdoofwhtcxbyhkjoik.
select jsonb_build_object(
 'signups_24h', (select count(*) from auth.users where created_at > now()-interval '24 hours'),
 'signups_max_hora', (select coalesce(max(c),0) from (select count(*) c from auth.users where created_at > now()-interval '24 hours' group by date_trunc('hour',created_at)) x),
 'edge_top_usuarios_24h', (select coalesce(jsonb_agg(x),'[]') from (select user_id, fn, count(*) n from public.edge_usage where created_at > now()-interval '24 hours' group by 1,2 order by 3 desc limit 5) x),
 'edge_apagadas', (select coalesce(jsonb_agg(fn),'[]') from public.edge_limits where not enabled),
 'creditos_regalados_24h', (select coalesce(jsonb_agg(x),'[]') from (select action, count(*) n, -sum(cost) total from public.credit_transactions where created_at > now()-interval '24 hours' and cost < 0 group by 1 order by 3 desc limit 5) x),
 'gasto_top_usuarios_24h', (select coalesce(jsonb_agg(x),'[]') from (select user_id, sum(cost) total, count(*) n from public.credit_transactions where created_at > now()-interval '24 hours' and cost > 0 group by 1 order by 2 desc limit 3) x),
 'errores_cliente_24h', (select count(*) from public.client_errors where created_at > now()-interval '24 hours'),
 'landing_leads_24h', (select count(*) from public.landing_leads where created_at > now()-interval '24 hours'),
 'funnel_leads_24h', (select count(*) from public.funnel_leads where created_at > now()-interval '24 hours'),
 'admins', (select count(*) from public.user_roles where role='admin'),
 'cambios_admin_24h', (select count(*) from public.audit_log where created_at > now()-interval '24 hours' and action like 'ADMIN%'),
 'subs_cambios_24h', (select coalesce(jsonb_agg(x),'[]') from (select status, count(*) n from public.subscriptions where updated_at > now()-interval '24 hours' group by 1) x),
 'tablas_sin_rls', (select coalesce(jsonb_agg(c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),
 'definer_para_anon', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')),
 'videos_fallidos_sin_reembolso', (select count(*) from public.media_generation_jobs where status = 'failed' and refunded_at is null and coalesce(cost_media_credits,0) > 0),
 'db_mb', pg_database_size(current_database())/1048576
) as r;
