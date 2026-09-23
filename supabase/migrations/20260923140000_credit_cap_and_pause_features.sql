-- 1) Tope de saldo acumulado por la recarga mensual: 3.000 créditos (decisión de Jean, 23-sep).
--    Antes se sumaban 2.000 cada 30 días sin límite. La recarga ahora rellena hasta 3.000 como
--    máximo; nunca quita créditos (quien compró un pack y tiene más de 3.000 lo conserva, pero
--    ese mes la recarga no suma hasta que baje de 3.000).
create or replace function public.grant_monthly_if_due()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_last timestamptz; v_grant int; v_balance int; v_new int;
  c_cap constant int := 3000;
begin
  if v_uid is null then return jsonb_build_object('granted', false); end if;

  select last_grant_at, monthly_grant, balance into v_last, v_grant, v_balance
  from public.user_credits where user_id = v_uid for update;
  if not found then
    insert into public.user_credits (user_id, balance, monthly_grant, last_grant_at)
    values (v_uid, 2000, 2000, now()) on conflict (user_id) do nothing;
    return jsonb_build_object('granted', true, 'amount', 2000);
  end if;

  if v_last < now() - interval '30 days' then
    v_new := least(v_balance + v_grant, greatest(c_cap, v_balance));
    update public.user_credits
    set balance = v_new, last_grant_at = now(), updated_at = now()
    where user_id = v_uid;
    return jsonb_build_object('granted', true, 'amount', v_new - v_balance, 'cap', c_cap);
  end if;

  return jsonb_build_object('granted', false);
end $$;

-- 2) Mercado en pausa para clientes (src/lib/features.ts): su descarga diaria de feeds se detiene.
--    Para relanzarlo: active := true.
select cron.alter_job(jobid, active := false) from cron.job where jobname = 'supernova-market-feed-sync-daily';
--    Su "radar de plataformas" (solo lo lee MercadoPage vía market_radar_platforms) también se pausa.
select cron.alter_job(jobid, active := false) from cron.job where jobname = 'supernova-radar-platforms-daily';
