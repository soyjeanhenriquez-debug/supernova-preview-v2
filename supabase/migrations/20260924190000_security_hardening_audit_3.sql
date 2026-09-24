-- Auditoría de seguridad del 24-sep-2026, tercera parte.

-- 1. Contactos de la landing (RPC públicas): el tope global baja de 500 a 100 al día y, en la
--    versión con visitante, máximo 2 correos por visitante. Así nadie inscribe cientos de correos
--    ajenos para que les llegue la bienvenida (hoy entra ~1 contacto real al día como mucho).
CREATE OR REPLACE FUNCTION public.landing_lead(p_email text, p_source text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_email TEXT := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF length(v_email) > 120 OR v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN RETURN FALSE; END IF;
  IF (SELECT count(*) FROM public.landing_leads WHERE created_at > now() - interval '1 day') >= 100 THEN RETURN FALSE; END IF;
  INSERT INTO public.landing_leads (email, source) VALUES (v_email, left(coalesce(p_source, 'directo'), 40))
  ON CONFLICT (email) DO NOTHING;
  PERFORM public.landing_track('lead', p_source);
  RETURN TRUE;
END $$;

CREATE OR REPLACE FUNCTION public.landing_lead(p_visitor uuid, p_variant text, p_email text, p_answers jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
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
end $$;

-- 2. Resumen diario: solo a cuentas con el correo CONFIRMADO y acceso vigente. Antes bastaba con
--    registrarse con un correo ajeno (sin confirmarlo) para que le llegara el correo cada día.
CREATE OR REPLACE FUNCTION public.digest_recipients(p_today date, p_limit int DEFAULT 500)
RETURNS SETOF public.notification_prefs
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT np.* FROM public.notification_prefs np
  JOIN auth.users u ON u.id = np.user_id
  WHERE np.daily_winner_email = true
    AND (np.last_digest_sent IS NULL OR np.last_digest_sent <> p_today)
    AND u.email_confirmed_at IS NOT NULL
    AND public.user_has_access(np.user_id)
  ORDER BY np.user_id
  LIMIT least(greatest(p_limit, 1), 500);
$$;
REVOKE ALL ON FUNCTION public.digest_recipients(date, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.digest_recipients(date, int) TO service_role;

-- 3. Esquema net (pg_net): sin efecto práctico. Los permisos vienen de PUBLIC y quitarlos a PUBLIC
--    rompería pg_cron y los webhooks de la base. No es explotable: la API solo expone public y
--    graphql_public (PGRST106 al pedir net), así que anon/authenticated no pueden llamarlo.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA net FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA net FROM anon, authenticated;
REVOKE USAGE ON SCHEMA net FROM anon, authenticated;

-- 4. Reembolsos por rechazo o respuesta corta de la IA en las últimas 24 h (product-builder los limita).
CREATE OR REPLACE FUNCTION public.content_refunds_today(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM public.credit_transactions
  WHERE user_id = p_user_id AND action = 'refund' AND created_at > now() - interval '24 hours'
    AND meta->>'reason' IN ('rechazo de la IA', 'respuesta incompleta');
$$;
REVOKE ALL ON FUNCTION public.content_refunds_today(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.content_refunds_today(uuid) TO service_role;

-- 5. La app ya usa has_access() (correo de la sesión). is_email_approved dejaba a cualquiera
--    preguntar si un correo ajeno es cliente de pago: queda solo para el servidor.
REVOKE EXECUTE ON FUNCTION public.is_email_approved(text) FROM PUBLIC, anon, authenticated;
