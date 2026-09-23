-- Regla de precios de SUPERNOVA (decisión de Jean, 23-sep-2026):
--   precio en créditos = costo real × 5, calculado con el crédito MÁS BARATO que se vende
--   (pack Nuclear: US$39 / 4.500 ≈ US$0,008 neto tras Whop). Piso: 3× incluso en el peor caso.
-- Este panel vigila la regla: por área, créditos cobrados (sin reembolsos) frente al costo real de
-- ai_usage; y por nivel de Crear producto, costo medio, máximo y peor caso teórico de un capítulo.
-- Solo lectura, solo admin. El cliente nunca ve dólares: solo créditos.

-- 1) "Qué obtienes" por nivel (se muestra en Crear producto, estilo HeyGen). Agregar IA = fila.
alter table public.ai_builder_models
  add column if not exists benefits text[] not null default '{}'
  check (cardinality(benefits) <= 3);

update public.ai_builder_models set benefits = case slug
  when 'estandar' then array['Borrador sólido para empezar', 'Ideal para probar tu idea']
  when 'sonnet'   then array['Texto más natural y persuasivo', 'Menos correcciones a mano']
  when 'opus'     then array['Explicaciones y ejemplos más profundos', 'Listo para vender con pocos retoques']
  when 'fable'    then array['La mayor calidad disponible', 'Para tu producto estrella']
  else benefits end;

-- 2) Área de producto de una función (ai_usage.fn o credit_transactions.meta.fn).
--    Función nueva que cobra o gasta IA → añadir aquí su área.
create or replace function private.cost_area(p_fn text)
returns text language sql immutable as $$
  select case
    when p_fn is null then null
    when p_fn like 'product-builder%' then 'Crear producto'
    when p_fn like 'ai-chat%' then 'Generadores y Mándala'
    when split_part(p_fn, ':', 1) in ('winner-blueprint', 'oraculo-generate') then 'Mi App'
    when p_fn like 'recovery-sequence%' then 'Recuperación de ventas'
    when p_fn like 'weekly-plan%' then 'Tu semana'
    when p_fn like 'content-ideas%' then 'Ideas de contenido'
    when p_fn like 'form-assist%' then 'Rellenar con IA'
    when p_fn like 'offer-intel%' then 'Veredicto de ofertas'
    when p_fn like 'generate-ad-creative%' then 'Creativo de imagen'
    else split_part(p_fn, ':', 1)
  end
$$;

-- 3) Panel de margen.
create or replace function public.admin_margin(p_days integer default 30, p_credit_usd numeric default 0.008)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare r jsonb; v_since timestamptz;
begin
  if not (coalesce(auth.role(), '') = 'service_role'
          or public.has_role(auth.uid(), 'admin'::public.app_role)) then
    raise exception 'solo admin';
  end if;
  -- Misma ventana para cobros y costos: ai_usage existe desde el 23-sep; comparar cobros más viejos
  -- contra un costo que no se registró inflaría el margen.
  v_since := greatest(now() - make_interval(days => p_days),
                      coalesce((select min(created_at) from public.ai_usage), now()));

  with charged as (
    -- Cobros reales: sin reembolsados; los sin función (RPC) van por su etiqueta de precio.
    select coalesce(private.cost_area(t.meta->>'fn'), cp.label, t.action) as area,
           t.cost, t.user_id
    from public.credit_transactions t
    left join public.credit_prices cp on cp.action = t.action
    where t.cost > 0
      and t.created_at >= v_since
      and not coalesce((t.meta->>'refunded')::boolean, false)
  ), spent as (
    select coalesce(private.cost_area(a.fn), 'Sin función') as area,
           a.cost_usd, a.user_id
    from public.ai_usage a
    where a.created_at >= v_since
  ), areas as (
    select area,
           coalesce(sum(credits), 0) as credits, coalesce(sum(uses), 0) as uses,
           coalesce(sum(cost_usd), 0) as cost_usd, coalesce(sum(calls), 0) as calls,
           coalesce(sum(bg_usd), 0) as background_usd
    from (
      select area, sum(cost) as credits, count(*) as uses, 0::numeric as cost_usd, 0 as calls, 0::numeric as bg_usd
      from charged group by area
      union all
      select area, 0, 0, sum(cost_usd), count(*), coalesce(sum(cost_usd) filter (where user_id is null), 0)
      from spent group by area
    ) x group by area
  ), levels as (
    -- Por nivel de Crear producto: solo capítulos (":piece"; antes de la etiqueta, salidas ≥ 1.000
    -- tokens, que excluye el índice). Peor caso teórico = 2.000 de entrada + el máximo de salida.
    select m.slug, m.label, m.enabled, m.tier, m.model_id, m.max_output_tokens,
           coalesce(cp.cost, 0) as credits,
           round((2000 * coalesce(p.input_per_m, 0) + m.max_output_tokens * coalesce(p.output_per_m, 0)) / 1e6, 5) as worst_usd,
           u.calls, u.avg_usd, u.max_usd
    from public.ai_builder_models m
    left join public.credit_prices cp on cp.action = m.piece_action
    left join public.ai_model_prices p on p.model = m.model_id
    left join lateral (
      select count(*) as calls, round(avg(a.cost_usd), 5) as avg_usd, round(max(a.cost_usd), 5) as max_usd
      from public.ai_usage a
      where a.model = m.model_id
        and a.created_at >= v_since
        and (a.fn = 'product-builder:piece' or (a.fn = 'product-builder' and a.output_tokens >= 1000))
    ) u on true
  )
  select jsonb_build_object(
    'days', p_days,
    'since', v_since,
    'credit_usd', p_credit_usd,
    'target', 5, 'floor', 3,
    'areas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'area', area, 'credits', credits, 'uses', uses, 'calls', calls,
        'revenue_usd', round(credits * p_credit_usd, 4),
        'cost_usd', round(cost_usd, 4),
        'background_usd', round(background_usd, 4),
        -- Sin créditos cobrados = función gratis (la paga SUPERNOVA): margen nulo, no 0.
        'margin', case when cost_usd > 0 and credits > 0 then round(credits * p_credit_usd / cost_usd, 1) end
      ) order by cost_usd desc, credits desc)
      from areas), '[]'::jsonb),
    'levels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', slug, 'label', label, 'enabled', enabled, 'model', model_id, 'credits', credits,
        'calls', calls, 'avg_usd', avg_usd, 'max_usd', max_usd, 'worst_usd', worst_usd,
        'margin_avg', case when avg_usd > 0 then round(credits * p_credit_usd / avg_usd, 1) end,
        'margin_worst', case when worst_usd > 0 then round(credits * p_credit_usd / worst_usd, 1) end
      ) order by credits)
      from levels), '[]'::jsonb)
  ) into r;
  return r;
end $$;

revoke all on function public.admin_margin(integer, numeric) from public, anon;
grant execute on function public.admin_margin(integer, numeric) to authenticated;
