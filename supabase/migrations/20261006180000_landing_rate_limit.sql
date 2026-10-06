-- Tope por IP para las funciones abiertas de la landing y los embudos (06-oct-2026, pedido de Jean).
--
-- Antes solo había topes GLOBALES por día (100 registros, 1.000 errores, 300 por embudo): un bot
-- podía gastar el cupo del día y dejar fuera a la gente real, y landing_track(uuid, ...) creaba una
-- fila en landing_visitors por cada id inventado, sin límite (con la base cerca de los 500 MB).
--
-- Ahora cada función pregunta primero a private.rate_ok(alcance, máximo por hora). La IP sale de
-- cf-connecting-ip (la pone Cloudflare, el navegador no la puede falsificar) y, si no está, de
-- x-real-ip. Si no hay IP (llamadas internas, SQL Editor, cron) NO se limita, para no frenar nada
-- legítimo. Los contadores viven en private.rate_hits por hora y se limpian solos (> 2 h).
--
-- Cuerpos de las funciones: idénticos a producción, solo se añade la primera línea del tope.

CREATE TABLE IF NOT EXISTS private.rate_hits (
  ip     text        NOT NULL,
  scope  text        NOT NULL,
  bucket timestamptz NOT NULL,
  n      integer     NOT NULL DEFAULT 1,
  PRIMARY KEY (ip, scope, bucket)
);
REVOKE ALL ON private.rate_hits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.client_ip()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
DECLARE h json;
BEGIN
  BEGIN
    h := nullif(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN left(nullif(btrim(coalesce(h ->> 'cf-connecting-ip', h ->> 'x-real-ip')), ''), 64);
END $function$;

CREATE OR REPLACE FUNCTION private.rate_ok(p_scope text, p_max_hour integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_ip text := private.client_ip();
  v_n  integer;
BEGIN
  IF v_ip IS NULL THEN RETURN true; END IF;
  INSERT INTO private.rate_hits (ip, scope, bucket) VALUES (v_ip, p_scope, date_trunc('hour', now()))
  ON CONFLICT (ip, scope, bucket) DO UPDATE SET n = private.rate_hits.n + 1
  RETURNING n INTO v_n;
  IF random() < 0.01 THEN
    DELETE FROM private.rate_hits WHERE bucket < now() - interval '2 hours';
  END IF;
  RETURN v_n <= p_max_hour;
END $function$;
REVOKE ALL ON FUNCTION private.client_ip() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.rate_ok(text, integer) FROM PUBLIC, anon, authenticated;

-- Registro de la landing (formulario simple): 5 por hora por IP.
CREATE OR REPLACE FUNCTION public.landing_lead(p_email text, p_source text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_email TEXT := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF NOT private.rate_ok('landing_lead', 5) THEN RETURN FALSE; END IF;
  IF length(v_email) > 120 OR v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN RETURN FALSE; END IF;
  IF (SELECT count(*) FROM public.landing_leads WHERE created_at > now() - interval '1 day') >= 100 THEN RETURN FALSE; END IF;
  INSERT INTO public.landing_leads (email, source) VALUES (v_email, left(coalesce(p_source, 'directo'), 40))
  ON CONFLICT (email) DO NOTHING;
  PERFORM public.landing_track('lead', p_source);
  RETURN TRUE;
END $function$;

-- Registro de la landing con test: 5 por hora por IP.
CREATE OR REPLACE FUNCTION public.landing_lead(p_visitor uuid, p_variant text, p_email text, p_answers jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  if not private.rate_ok('landing_lead', 5) then
    raise exception 'intenta más tarde';
  end if;
  if p_variant not in ('A', 'B') or length(e) > 120 or e !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'correo no válido';
  end if;
  if (select count(*) from public.landing_leads where created_at > now() - interval '1 day') >= 100 then
    raise exception 'intenta más tarde';
  end if;
  if p_visitor is not null and not exists (select 1 from public.landing_visitors where id = p_visitor) then
    p_visitor := null;
  end if;
  if p_visitor is not null and (select count(*) from public.landing_leads where visitor_id = p_visitor and email <> e) >= 2 then
    raise exception 'intenta más tarde';
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
end $function$;

-- Contador de eventos de la landing: 300 por hora por IP (una visita real dispara pocos).
CREATE OR REPLACE FUNCTION public.landing_track(p_event text, p_source text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_src TEXT := left(regexp_replace(lower(coalesce(nullif(btrim(p_source), ''), 'directo')), '[^a-z0-9_.-]', '', 'g'), 40);
BEGIN
  IF NOT private.rate_ok('landing_track', 300) THEN RETURN; END IF;
  IF p_event NOT IN ('view', 'scroll50', 'cta_click', 'popup_shown', 'popup_closed', 'lead') THEN RETURN; END IF;
  IF v_src = '' THEN v_src := 'directo'; END IF;
  INSERT INTO public.landing_events (day, event, source, n) VALUES (current_date, p_event, v_src, 1)
  ON CONFLICT (day, event, source) DO UPDATE SET n = public.landing_events.n + 1;
END $function$;

-- Visitantes del test A/B: 60 por hora por IP (cada id nuevo crea una fila en landing_visitors).
CREATE OR REPLACE FUNCTION public.landing_track(p_visitor uuid, p_variant text, p_event text, p_utm jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not private.rate_ok('landing_visit', 60) then
    return;
  end if;
  if p_visitor is null or p_variant not in ('A', 'B') or p_event not in ('view', 'cta', 'quiz_open', 'quiz_done') then
    return;
  end if;
  insert into public.landing_visitors (id, variant, utm)
  values (p_visitor, p_variant,
          case when p_utm is not null and jsonb_typeof(p_utm) = 'object' and pg_column_size(p_utm) <= 1000 then p_utm end)
  on conflict (id) do update set last_seen = now();
  update public.landing_visitors set
    cta_clicks = least(cta_clicks + (case when p_event = 'cta' then 1 else 0 end), 50),
    quiz_opened = quiz_opened or p_event in ('quiz_open', 'quiz_done'),
    quiz_done = quiz_done or p_event = 'quiz_done'
  where id = p_visitor;
end $function$;

-- Registro en embudos de usuarios: 10 por hora por IP.
CREATE OR REPLACE FUNCTION public.funnel_lead(p_slug text, p_variant text, p_contact text, p_answers jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c text := lower(btrim(coalesce(p_contact, '')));
begin
  if not private.rate_ok('funnel_lead', 10) then return false; end if;
  if p_variant not in ('A', 'B') or not exists (select 1 from public.funnels where slug = p_slug) then return false; end if;
  if not (c ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' or regexp_replace(c, '[^0-9]', '', 'g') ~ '^[0-9]{8,15}$')
     or char_length(c) > 120 then return false; end if;
  if (select count(*) from public.funnel_leads where slug = p_slug and created_at > now() - interval '1 day') >= 300 then return false; end if;
  insert into public.funnel_leads (slug, contact, variant, answers)
  values (p_slug, c, p_variant, case when jsonb_typeof(p_answers) = 'object' and pg_column_size(p_answers) <= 1000 then p_answers end)
  on conflict (slug, contact) do nothing;
  perform public.funnel_track(p_slug, p_variant, 'lead');
  return true;
end $function$;

-- Contador de eventos de embudos: 300 por hora por IP.
CREATE OR REPLACE FUNCTION public.funnel_track(p_slug text, p_variant text, p_event text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not private.rate_ok('funnel_track', 300) then return; end if;
  if p_variant not in ('A', 'B') or p_event not in ('view', 'quiz_start', 'quiz_done', 'cta', 'lead')
     or not exists (select 1 from public.funnels where slug = p_slug) then return; end if;
  insert into public.funnel_events (slug, day, variant, event, n) values (p_slug, current_date, p_variant, p_event, 1)
  on conflict (slug, day, variant, event) do update set n = public.funnel_events.n + 1;
end $function$;

-- Errores del navegador: 60 por hora por IP (un bot ya no puede gastar el cupo diario de 1.000).
CREATE OR REPLACE FUNCTION public.log_client_error(p_path text, p_message text, p_stack text DEFAULT NULL::text, p_component text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT private.rate_ok('client_error', 60) THEN RETURN; END IF;
  IF (SELECT count(*) FROM public.client_errors WHERE created_at > now() - interval '1 day') >= 1000 THEN RETURN; END IF;
  INSERT INTO public.client_errors (user_id, path, message, stack, component, user_agent)
  VALUES (auth.uid(), left(p_path, 200), left(p_message, 500), left(p_stack, 3000), left(p_component, 2000), left(p_user_agent, 300));
END $function$;
