-- landing_leads ya existía (popup de salida, bienvenida y baja): se le agregan las columnas del test A/B.
alter table public.landing_leads add column if not exists visitor_id uuid references public.landing_visitors(id) on delete set null;
alter table public.landing_leads add column if not exists variant text check (variant in ('A', 'B'));
alter table public.landing_leads add column if not exists answers jsonb check (answers is null or pg_column_size(answers) <= 1000);

-- Correo que deja al terminar el test (con sus respuestas). Mismo tope diario que el popup.
create or replace function public.landing_lead(p_visitor uuid, p_variant text, p_email text, p_answers jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  if p_variant not in ('A', 'B') or length(e) > 120 or e !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'correo no válido';
  end if;
  if (select count(*) from public.landing_leads where created_at > now() - interval '1 day') >= 500 then
    raise exception 'intenta más tarde';
  end if;
  if p_visitor is not null and not exists (select 1 from public.landing_visitors where id = p_visitor) then
    p_visitor := null;
  end if;
  insert into public.landing_leads (email, source, visitor_id, variant, answers)
  values (e, 'test', p_visitor, p_variant,
          case when p_answers is not null and jsonb_typeof(p_answers) = 'object' and pg_column_size(p_answers) <= 1000 then p_answers end)
  on conflict (email) do update set
    answers = coalesce(excluded.answers, landing_leads.answers),
    variant = coalesce(landing_leads.variant, excluded.variant),
    visitor_id = coalesce(landing_leads.visitor_id, excluded.visitor_id);
  if p_visitor is not null then
    update public.landing_visitors set quiz_opened = true, quiz_done = true where id = p_visitor;
  end if;
  perform public.landing_track('lead', 'test');
end $$;
revoke all on function public.landing_lead(uuid, text, text, jsonb) from public;
grant execute on function public.landing_lead(uuid, text, text, jsonb) to anon, authenticated;

revoke all on public.landing_visitors from anon, authenticated;
grant select on public.landing_visitors to authenticated;
