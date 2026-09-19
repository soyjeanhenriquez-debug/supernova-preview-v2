-- Chequeo de seguridad 2026-09-19 · parte 1: el muro de pago y los créditos
-- vivían SOLO en el cliente (RequireAccess.tsx). Hallazgos que cierra:
--
--  A. approved_emails_self_touch dejaba a cada usuario ACTUALIZAR su propia fila
--     completa, incluido is_active. Un suscriptor cancelado (el webhook de
--     Stripe/Whop pone is_active=false) se reactivaba solo con un PATCH a
--     /rest/v1/approved_emails. → se elimina; queda touch_last_access().
--  B. Las tablas de producto (offers, winning_ads, hook_vault…) tenían
--     USING (true) para authenticated: cualquiera que se registre —aprobado o
--     no, pagando o no— leía el catálogo entero por la API REST. → has_access().
--  C. user_gamification se podía escribir directo: poner streak_days=99 y
--     last_login_date=ayer, llamar register_daily_login() y cobrar 1.000
--     créditos (luego 59→600, 29→300…). → escrituras solo por RPC.
--  D. user_credits / credit_transactions aceptaban INSERT del propio usuario
--     (saldo arbitrario si la fila aún no existía; historial falsificable).
--  E. award_mission_bonus confiaba en el monto del cliente (hasta 100/día).
--  F. notification_prefs: el usuario podía cambiar `email` → el digest diario
--     sale desde nuestro dominio hacia la dirección de un tercero.
--  G. access_requests: un anónimo insertaba filas con status/reviewed_by
--     arbitrarios y sin tope de tamaño ni de volumen.
--  H. profiles legible completa por cualquier usuario (lista de clientes).
--
-- Reversible: cada política eliminada está descrita aquí con su definición.

-- ═════════════════════════════════════════════════════════════════════
-- 1. Una sola definición de "tiene acceso", en el servidor
--    (misma regla que RequireAccess.tsx: admin, o email aprobado y activo;
--    nunca si está suspendido).
-- ═════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.has_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.user_roles r
                     WHERE r.user_id = auth.uid() AND r.role = 'suspended'::app_role)
     AND (
       EXISTS (SELECT 1 FROM public.user_roles r
               WHERE r.user_id = auth.uid() AND r.role = 'admin'::app_role)
       OR EXISTS (SELECT 1 FROM public.approved_emails a
                  WHERE lower(a.email) = lower(auth.jwt() ->> 'email') AND a.is_active = TRUE)
     );
$$;
REVOKE ALL ON FUNCTION public.has_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_access() TO authenticated, service_role;

-- Variante para las edge functions (service_role, sin auth.uid()).
CREATE OR REPLACE FUNCTION public.user_has_access(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.user_roles r
                     WHERE r.user_id = p_user_id AND r.role = 'suspended'::app_role)
     AND (
       EXISTS (SELECT 1 FROM public.user_roles r
               WHERE r.user_id = p_user_id AND r.role = 'admin'::app_role)
       OR EXISTS (SELECT 1 FROM public.approved_emails a
                  JOIN auth.users u ON lower(u.email) = lower(a.email)
                  WHERE u.id = p_user_id AND a.is_active = TRUE)
     );
$$;
REVOKE ALL ON FUNCTION public.user_has_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_access(uuid) TO service_role;

-- ═════════════════════════════════════════════════════════════════════
-- 2. (B) Tablas de producto: leer exige acceso. El (SELECT …) hace que
--    Postgres lo evalúe UNA vez por consulta, no por fila.
-- ═════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS offers_select_authenticated ON public.offers;
CREATE POLICY offers_select_with_access ON public.offers
  FOR SELECT TO authenticated USING ((SELECT public.has_access()));

DROP POLICY IF EXISTS offer_snapshots_select_authenticated ON public.offer_snapshots;
CREATE POLICY offer_snapshots_select_with_access ON public.offer_snapshots
  FOR SELECT TO authenticated USING ((SELECT public.has_access()));

DROP POLICY IF EXISTS winning_ads_select_authenticated ON public.winning_ads;
CREATE POLICY winning_ads_select_with_access ON public.winning_ads
  FOR SELECT TO authenticated USING ((SELECT public.has_access()));

DROP POLICY IF EXISTS hv_select_authenticated ON public.hook_vault;
CREATE POLICY hv_select_with_access ON public.hook_vault
  FOR SELECT TO authenticated USING ((SELECT public.has_access()));

DROP POLICY IF EXISTS temperature_snapshots_select_authenticated ON public.temperature_snapshots;
CREATE POLICY temperature_snapshots_select_with_access ON public.temperature_snapshots
  FOR SELECT TO authenticated USING ((SELECT public.has_access()));

DROP POLICY IF EXISTS ad_media_cache_select_authenticated ON public.ad_media_cache;
CREATE POLICY ad_media_cache_select_with_access ON public.ad_media_cache
  FOR SELECT TO authenticated USING ((SELECT public.has_access()));

-- (H) profiles: cada quien el suyo; el admin, todos.
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_own_or_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- ═════════════════════════════════════════════════════════════════════
-- 3. (A) approved_emails: fuera el UPDATE propio. Era:
--      approved_emails_self_touch FOR UPDATE TO authenticated
--        USING (email = auth.jwt()->>'email') WITH CHECK (igual)
-- ═════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS approved_emails_self_touch ON public.approved_emails;

CREATE OR REPLACE FUNCTION public.touch_last_access()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.approved_emails SET last_access = now()
  WHERE lower(email) = lower(auth.jwt() ->> 'email') AND is_active = TRUE;
$$;
REVOKE ALL ON FUNCTION public.touch_last_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_last_access() TO authenticated;

-- ═════════════════════════════════════════════════════════════════════
-- 4. (C)(D) Créditos y gamificación: el cliente solo LEE. Todas las
--    escrituras ya pasan por RPCs SECURITY DEFINER (consume_credits, add_xp,
--    unlock_badge, register_daily_login, grant_monthly_if_due) y por el
--    trigger handle_new_user. Eran:
--      ug_insert_own  FOR INSERT WITH CHECK (auth.uid() = user_id)
--      ug_update_own  FOR UPDATE USING/CHECK (auth.uid() = user_id)
--      uc_insert_self FOR INSERT WITH CHECK (auth.uid() = user_id)
--      credit_tx_insert_own FOR INSERT WITH CHECK (auth.uid() = user_id)
-- ═════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS ug_insert_own ON public.user_gamification;
DROP POLICY IF EXISTS ug_update_own ON public.user_gamification;
DROP POLICY IF EXISTS uc_insert_self ON public.user_credits;
DROP POLICY IF EXISTS credit_tx_insert_own ON public.credit_transactions;

-- (E) Bono de misión: monto fijo en el servidor. Se conserva la firma para
-- no romper al cliente, pero p_amount ya no decide nada.
CREATE OR REPLACE FUNCTION public.award_mission_bonus(p_mission_date date, p_amount integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_already BOOLEAN;
  v_bonus CONSTANT INT := 50;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error','no auth'); END IF;
  IF p_mission_date <> CURRENT_DATE THEN RETURN jsonb_build_object('success', false, 'error','only today'); END IF;
  -- Serializa por usuario: dos reclamos simultáneos no pasan ambos el EXISTS.
  PERFORM 1 FROM public.user_credits WHERE user_id = v_uid FOR UPDATE;
  SELECT EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE user_id = v_uid
      AND action = 'mission_bonus'
      AND created_at::date = p_mission_date
  ) INTO v_already;
  IF v_already THEN
    RETURN jsonb_build_object('success', false, 'error','already_claimed');
  END IF;
  INSERT INTO public.user_credits (user_id, balance) VALUES (v_uid, v_bonus)
  ON CONFLICT (user_id) DO UPDATE SET balance = public.user_credits.balance + v_bonus, updated_at = now();
  INSERT INTO public.credit_transactions (user_id, action, cost, label, meta)
  VALUES (v_uid, 'mission_bonus', -v_bonus, 'Misión diaria completada', jsonb_build_object('date', p_mission_date));
  RETURN jsonb_build_object('success', true, 'amount', v_bonus);
END;
$$;
REVOKE ALL ON FUNCTION public.award_mission_bonus(date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_mission_bonus(date, integer) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════
-- 5. (F) notification_prefs: el usuario solo cambia sus preferencias, no el
--    destinatario ni el token de baja ni la marca de envío.
-- ═════════════════════════════════════════════════════════════════════
REVOKE UPDATE ON public.notification_prefs FROM authenticated, anon;
GRANT UPDATE (daily_winner_email, streak_reminder_email, whatsapp_opt_in, whatsapp_phone)
  ON public.notification_prefs TO authenticated;

-- ═════════════════════════════════════════════════════════════════════
-- 6. (G) access_requests: solo solicitudes "pending" limpias, con tope de
--    tamaño, y freno de inundación (la tabla es escribible por anónimos).
--    Por email ya hay UNIQUE(email): una fila por dirección; el freno es global.
-- ═════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS access_requests_anyone_insert ON public.access_requests;
CREATE POLICY access_requests_anyone_insert ON public.access_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL
    AND char_length(email) BETWEEN 5 AND 254
    AND char_length(coalesce(full_name, '')) <= 120
    AND char_length(coalesce(message, '')) <= 2000
    AND char_length(coalesce(source, '')) <= 40
  );

CREATE OR REPLACE FUNCTION public.access_requests_flood_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.access_requests WHERE created_at > now() - interval '1 hour') >= 120 THEN
    RAISE EXCEPTION 'Demasiadas solicitudes en este momento. Intenta más tarde.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.access_requests_flood_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS access_requests_flood_guard ON public.access_requests;
CREATE TRIGGER access_requests_flood_guard BEFORE INSERT ON public.access_requests
  FOR EACH ROW EXECUTE FUNCTION public.access_requests_flood_guard();

-- ═════════════════════════════════════════════════════════════════════
-- 7. (B) RPCs SECURITY DEFINER que devuelven producto: saltan RLS, así que
--    llevan la misma compuerta. Cuerpos copiados del texto VIVO
--    (pg_get_functiondef) con una sola condición añadida en cada una.
-- ═════════════════════════════════════════════════════════════════════

-- Kits: un usuario registrado pero sin acceso tiene 2.000 créditos de
-- bienvenida; sin esta compuerta podía desbloquear ~13 kits por la API.
CREATE OR REPLACE FUNCTION public.get_kits()
RETURNS TABLE(id uuid, slug text, title text, tagline text, niche text, market_group text, offer_id uuid, cover_emoji text, summary text, whats_inside jsonb, proof jsonb, price_credits integer, published_at timestamp with time zone, unlocked boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT k.id, k.slug, k.title, k.tagline, k.niche, k.market_group, k.offer_id,
         k.cover_emoji, k.summary, k.whats_inside, k.proof, k.price_credits, k.published_at,
         EXISTS (SELECT 1 FROM public.kit_unlocks u WHERE u.kit_id = k.id AND u.user_id = auth.uid()) AS unlocked
  FROM public.mini_app_kits k
  WHERE k.status = 'published' AND auth.uid() IS NOT NULL AND (SELECT public.has_access())
  ORDER BY k.published_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_kits() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kits() TO authenticated;

-- unlock_kit: compuerta de acceso + candado por usuario ANTES de mirar si ya
-- está desbloqueado (dos clics simultáneos cobraban dos veces un mismo kit).
CREATE OR REPLACE FUNCTION public.unlock_kit(p_kit_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_kit RECORD;
  v_res JSONB;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'No autenticado'); END IF;
  IF NOT public.has_access() THEN RETURN jsonb_build_object('success', false, 'error', 'Sin acceso activo'); END IF;
  SELECT id, title, price_credits INTO v_kit FROM public.mini_app_kits WHERE id = p_kit_id AND status = 'published';
  IF v_kit.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Kit no encontrado'); END IF;
  PERFORM 1 FROM public.user_credits WHERE user_id = v_uid FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.kit_unlocks WHERE user_id = v_uid AND kit_id = p_kit_id) THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;
  v_res := public.consume_credits(v_kit.price_credits, 'unlock_kit', 'Mini App · ' || left(v_kit.title, 40), jsonb_build_object('kit_id', p_kit_id));
  IF coalesce((v_res->>'success')::boolean, false) = false THEN RETURN v_res; END IF;
  INSERT INTO public.kit_unlocks (user_id, kit_id) VALUES (v_uid, p_kit_id) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('success', true, 'balance', v_res->'balance');
END;
$$;
REVOKE ALL ON FUNCTION public.unlock_kit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_kit(uuid) TO authenticated;

-- Ganador del día: también lo llama send-daily-digest con service_role
-- (sin auth.uid()), por eso la excepción explícita.
CREATE OR REPLACE FUNCTION public.get_daily_winner()
RETURNS SETOF winning_ads LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH top_pool AS (
    SELECT * FROM public.winning_ads
    WHERE tier = 'mega'
      AND length(coalesce(ad_body,'')) > 120
      AND delivery_stop_time IS NULL
    ORDER BY winner_score DESC, days_active DESC
    LIMIT 60
  )
  SELECT * FROM top_pool
  WHERE (coalesce(auth.role(), '') = 'service_role' OR (SELECT public.has_access()))
  OFFSET (EXTRACT(EPOCH FROM CURRENT_DATE)::bigint / 86400) % GREATEST((SELECT count(*) FROM top_pool), 1)
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_daily_winner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_winner() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_market_trends()
RETURNS TABLE(keyword text, ads_7d bigint, ads_prev7d bigint, growth_pct integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cur AS (
    SELECT w.keyword AS kw, count(*) AS c FROM public.winning_ads w
    WHERE w.scraped_at > now() - interval '7 days' GROUP BY w.keyword
  ), prev AS (
    SELECT w.keyword AS kw, count(*) AS c FROM public.winning_ads w
    WHERE w.scraped_at BETWEEN now() - interval '14 days' AND now() - interval '7 days'
    GROUP BY w.keyword
  )
  SELECT cur.kw, cur.c, COALESCE(prev.c, 0),
         CASE WHEN COALESCE(prev.c, 0) = 0 THEN 100
              ELSE (((cur.c - prev.c)::numeric / prev.c) * 100)::int END
  FROM cur LEFT JOIN prev ON prev.kw = cur.kw
  WHERE cur.c >= 5 AND (SELECT public.has_access())
  ORDER BY cur.c DESC
  LIMIT 5;
$$;
REVOKE ALL ON FUNCTION public.get_market_trends() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_market_trends() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_rising_temperature_ads(hours_back integer DEFAULT 48, min_jump integer DEFAULT 1)
RETURNS TABLE(ad_id text, page_name text, offer_type text, market text, old_level integer, new_level integer, level_jump integer, new_duplicates integer, old_duplicates integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_access() THEN RETURN; END IF;
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (s.ad_id)
      s.ad_id, s.page_name, s.offer_type, s.market,
      s.duplicate_count, s.temperature_level, s.recorded_at
    FROM public.temperature_snapshots s
    WHERE s.recorded_at > NOW() - INTERVAL '4 hours'
    ORDER BY s.ad_id, s.recorded_at DESC
  ),
  previous AS (
    SELECT DISTINCT ON (s.ad_id)
      s.ad_id, s.duplicate_count, s.temperature_level
    FROM public.temperature_snapshots s
    WHERE s.recorded_at < NOW() - (hours_back || ' hours')::INTERVAL
      AND s.recorded_at > NOW() - ((hours_back + 48) || ' hours')::INTERVAL
    ORDER BY s.ad_id, s.recorded_at DESC
  )
  SELECT
    l.ad_id,
    l.page_name,
    l.offer_type,
    l.market,
    p.temperature_level as old_level,
    l.temperature_level as new_level,
    (l.temperature_level - p.temperature_level) as level_jump,
    l.duplicate_count as new_duplicates,
    p.duplicate_count as old_duplicates
  FROM latest l
  JOIN previous p ON l.ad_id = p.ad_id
  WHERE l.temperature_level > p.temperature_level
    AND (l.temperature_level - p.temperature_level) >= min_jump
  ORDER BY level_jump DESC, new_duplicates DESC
  LIMIT 6;
END;
$$;
REVOKE ALL ON FUNCTION public.get_rising_temperature_ads(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_rising_temperature_ads(integer, integer) TO authenticated;

-- Picks del día: mismo cuerpo que 20260919120000, más la compuerta de acceso.
CREATE OR REPLACE FUNCTION public.get_daily_picks()
RETURNS TABLE (slot SMALLINT, market_group TEXT, offer JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_groups TEXT[] := ARRAY['ES','BR','US','RU'];
  v_start INT;
  v_slot INT;
  v_group TEXT;
  v_markets TEXT[];
  v_lang TEXT;
  v_offer_id UUID;
BEGIN
  IF v_uid IS NULL OR NOT public.has_access() THEN RETURN; END IF;

  -- Ya generados hoy → idempotente
  IF NOT EXISTS (SELECT 1 FROM public.daily_picks dp WHERE dp.user_id = v_uid AND dp.pick_date = CURRENT_DATE) THEN
    v_start := (CURRENT_DATE - DATE '2026-01-01') % 4;

    FOR v_slot IN 0..2 LOOP
      v_group := v_groups[((v_start + v_slot) % 4) + 1];
      v_markets := CASE v_group
        WHEN 'ES' THEN ARRAY['ES','MX','AR','CO']
        WHEN 'BR' THEN ARRAY['BR','PT']
        WHEN 'US' THEN ARRAY['US','GB']
        ELSE ARRAY['RU','KZ'] END;
      v_lang := CASE v_group WHEN 'ES' THEN 'es' WHEN 'BR' THEN 'pt' WHEN 'US' THEN 'en' ELSE 'ru' END;

      -- Mejor oferta COPIABLE del grupo que este usuario no haya visto
      -- (ni la oferta ni el mismo anunciante en otro mercado). Idioma coherente
      -- con el grupo: el `market` es donde llegó el anuncio, no su idioma.
      SELECT o.id INTO v_offer_id
      FROM public.offers o
      WHERE o.market = ANY(v_markets)
        AND o.enrich_failed = false
        AND o.excluded_reason IS NULL
        AND o.enriched_at IS NOT NULL
        AND o.language = v_lang
        AND COALESCE(o.copy_score, 0) >= 3
        AND o.sample_body IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.daily_picks dp JOIN public.offers o2 ON o2.id = dp.offer_id
                        WHERE dp.user_id = v_uid AND o2.page_id = o.page_id)
      ORDER BY o.copy_score DESC, o.winner_score DESC, o.active_ads DESC, o.days_active DESC
      LIMIT 1;

      -- Fallback 1: mismo grupo sin exigir enriquecimiento (IA en cuota / mercado chico)
      IF v_offer_id IS NULL THEN
        SELECT o.id INTO v_offer_id
        FROM public.offers o
        WHERE o.market = ANY(v_markets)
          AND o.enrich_failed = false
          AND o.excluded_reason IS NULL
          AND (o.language IS NULL OR o.language = v_lang)
          AND COALESCE(o.copy_score, 3) >= 3
          AND o.sample_body IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.daily_picks dp JOIN public.offers o2 ON o2.id = dp.offer_id
                          WHERE dp.user_id = v_uid AND o2.page_id = o.page_id)
        ORDER BY (o.enriched_at IS NOT NULL) DESC, o.winner_score DESC, o.active_ads DESC
        LIMIT 1;
      END IF;

      -- Fallback 2: cualquier mercado (el grupo se agotó para este usuario)
      IF v_offer_id IS NULL THEN
        SELECT o.id INTO v_offer_id
        FROM public.offers o
        WHERE o.enrich_failed = false
          AND o.excluded_reason IS NULL
          AND COALESCE(o.copy_score, 3) >= 3
          AND o.sample_body IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.daily_picks dp JOIN public.offers o2 ON o2.id = dp.offer_id
                          WHERE dp.user_id = v_uid AND o2.page_id = o.page_id)
        ORDER BY (o.enriched_at IS NOT NULL) DESC, o.copy_score DESC NULLS LAST, o.winner_score DESC
        LIMIT 1;
      END IF;

      IF v_offer_id IS NOT NULL THEN
        INSERT INTO public.daily_picks (user_id, offer_id, pick_date, slot, market_group)
        VALUES (v_uid, v_offer_id, CURRENT_DATE, v_slot, v_group)
        ON CONFLICT DO NOTHING;
        v_offer_id := NULL;
      END IF;
    END LOOP;
  END IF;

  -- Los picks YA entregados hoy se devuelven tal cual (sin filtro): un pick
  -- mostrado no debe desaparecer a mitad del día.
  RETURN QUERY
    SELECT dp.slot, dp.market_group, to_jsonb(o.*)
    FROM public.daily_picks dp JOIN public.offers o ON o.id = dp.offer_id
    WHERE dp.user_id = v_uid AND dp.pick_date = CURRENT_DATE
    ORDER BY dp.slot;
END;
$$;
REVOKE ALL ON FUNCTION public.get_daily_picks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_picks() TO authenticated, service_role;
