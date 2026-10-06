-- Bono "Publica lo que hiciste con SUPERNOVA" (06-oct-2026, decisión de Jean).
--
-- La persona crea algo con una herramienta (carrusel, video, anuncio), lo publica en sus redes y
-- reclama el bono con el ENLACE del post y una CAPTURA. Gana 50 créditos, máximo 1 al día y
-- 1.000 al mes. Todo se decide aquí, en el servidor; el navegador solo manda la pieza, el enlace
-- y la ruta de la captura. Un admin revisa las capturas en Admin → Misiones y puede anular un
-- bono (se descuentan los 50).
--
-- Reemplaza a award_mission_bonus (50 créditos al día con solo llamarla, sin comprobar nada:
-- chequeo de seguridad 06-oct-2026). Esa función queda apagada.
--
-- Todo es aditivo salvo award_mission_bonus. No toca el catálogo.

-- 1. Capturas: bucket privado "misiones", cada usuario solo escribe y lee su carpeta ({uid}/…).
--    Storage no cuenta en los 500 MB de la base.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('misiones', 'misiones', false, 2097152, ARRAY['image/jpeg', 'image/webp', 'image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY misiones_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'misiones' AND ((storage.foldername(name))[1] = (select auth.uid())::text
         OR public.has_role((select auth.uid()), 'admin'::public.app_role)));
CREATE POLICY misiones_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'misiones' AND (storage.foldername(name))[1] = (select auth.uid())::text);
CREATE POLICY misiones_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'misiones' AND (storage.foldername(name))[1] = (select auth.uid())::text);

-- 2. Reclamos: los escribe SOLO claim_publish_bonus (SECURITY DEFINER). El usuario lee los suyos;
--    un admin lee todos.
CREATE TABLE IF NOT EXISTS public.mission_claims (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_item_id uuid REFERENCES public.content_items(id) ON DELETE SET NULL,
  network         text NOT NULL CHECK (network IN ('instagram', 'tiktok', 'youtube', 'facebook', 'threads', 'x', 'linkedin')),
  post_url        text NOT NULL CHECK (char_length(post_url) BETWEEN 12 AND 500),
  url_key         text NOT NULL UNIQUE,                 -- enlace normalizado: un post, un bono, para siempre
  screenshot_path text NOT NULL CHECK (char_length(screenshot_path) <= 300),
  credits         integer NOT NULL CHECK (credits > 0 AND credits <= 100),
  status          text NOT NULL DEFAULT 'granted' CHECK (status IN ('granted', 'revoked')),
  claim_day       date NOT NULL,                        -- día en hora de RD (America/Santo_Domingo)
  revoke_reason   text CHECK (char_length(revoke_reason) <= 200),
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mission_claims_user_day ON public.mission_claims (user_id, claim_day DESC);
ALTER TABLE public.mission_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mission_claims: leer lo propio o admin" ON public.mission_claims
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'::public.app_role));
REVOKE ALL ON public.mission_claims FROM anon, authenticated;
GRANT SELECT ON public.mission_claims TO authenticated;

-- 3. Reglas del bono (una sola fuente de verdad).
CREATE OR REPLACE FUNCTION private.publish_bonus_rules()
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO '' AS
$$ SELECT jsonb_build_object('per_claim', 50, 'month_cap', 1000) $$;

-- Red social a partir del enlace (solo https y dominios reales; null = no vale).
CREATE OR REPLACE FUNCTION private.social_network(p_url text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $$
DECLARE h text;
BEGIN
  IF p_url IS NULL OR p_url !~* '^https://[^/\s]+/\S+$' OR char_length(p_url) > 500 THEN RETURN NULL; END IF;
  h := lower(split_part(split_part(substr(p_url, 9), '/', 1), ':', 1));
  h := regexp_replace(h, '^(www|m|mobile|vm|vt)\.', '');
  RETURN CASE
    WHEN h IN ('instagram.com', 'instagr.am') THEN 'instagram'
    WHEN h = 'tiktok.com' THEN 'tiktok'
    WHEN h IN ('youtube.com', 'youtu.be') THEN 'youtube'
    WHEN h IN ('facebook.com', 'fb.watch', 'fb.com') THEN 'facebook'
    WHEN h IN ('threads.net', 'threads.com') THEN 'threads'
    WHEN h IN ('x.com', 'twitter.com') THEN 'x'
    WHEN h = 'linkedin.com' THEN 'linkedin'
    ELSE NULL END;
END $$;

-- Enlace normalizado para que el mismo post no cobre dos veces: dominio en minúsculas y sin
-- www/m., sin # ni barra final. La RUTA conserva mayúsculas (en Instagram /p/ABC y /p/abc son posts
-- distintos). De la query solo se guardan los parámetros que identifican el post (YouTube
-- watch?v=…, Facebook watch/?v=… y permalink.php?story_fbid=…&id=…); el resto (igsh, utm…) se quita.
CREATE OR REPLACE FUNCTION private.social_url_key(p_url text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $$
DECLARE
  body  text := split_part(substr(p_url, 9), '#', 1);
  rest  text := split_part(body, '?', 1);
  query text := split_part(body, '?', 2);
  host  text := split_part(rest, '/', 1);
  keep  text;
BEGIN
  SELECT string_agg(kv, '&' ORDER BY kv) INTO keep
    FROM unnest(string_to_array(query, '&')) AS kv
   WHERE split_part(kv, '=', 1) IN ('v', 'story_fbid', 'id', 'fbid') AND split_part(kv, '=', 2) <> '';
  RETURN regexp_replace(
           regexp_replace(lower(host), '^(www|m|mobile)\.', '') || substr(rest, char_length(host) + 1),
           '/+$', '')
         || coalesce('?' || keep, '');
END $$;

-- 4. Reclamar el bono.
CREATE OR REPLACE FUNCTION public.claim_publish_bonus(p_item uuid, p_url text, p_shot text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_rules  jsonb := private.publish_bonus_rules();
  v_amount int := (v_rules ->> 'per_claim')::int;
  v_cap    int := (v_rules ->> 'month_cap')::int;
  v_day    date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_month  date := date_trunc('month', (now() AT TIME ZONE 'America/Santo_Domingo'))::date;
  v_url    text := btrim(coalesce(p_url, ''));
  v_net    text;
  v_key    text;
  v_shot   text := btrim(coalesce(p_shot, ''));
  v_month_total int;
  v_balance int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_auth'); END IF;
  IF NOT public.has_access() THEN RETURN jsonb_build_object('ok', false, 'error', 'no_access'); END IF;

  -- La pieza es suya y salió de una herramienta (no escrita a mano).
  IF NOT EXISTS (SELECT 1 FROM public.content_items
                 WHERE id = p_item AND user_id = v_uid AND coalesce(source, 'manual') <> 'manual') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'item');
  END IF;

  v_net := private.social_network(v_url);
  IF v_net IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'url'); END IF;
  v_key := private.social_url_key(v_url);

  -- Captura: en su carpeta, nombre seguro, y que exista de verdad en Storage.
  IF v_shot !~ ('^' || v_uid::text || '/[A-Za-z0-9._-]+\.(webp|png|jpe?g)$')
     OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'misiones' AND name = v_shot) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'shot');
  END IF;

  -- Un reclamo a la vez por persona (evita dos clics al mismo tiempo).
  PERFORM pg_advisory_xact_lock(hashtextextended('publish_bonus:' || v_uid::text, 0));

  IF EXISTS (SELECT 1 FROM public.mission_claims WHERE url_key = v_key) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'used');
  END IF;
  IF EXISTS (SELECT 1 FROM public.mission_claims WHERE user_id = v_uid AND claim_day = v_day) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'today');
  END IF;
  SELECT coalesce(sum(credits), 0) INTO v_month_total FROM public.mission_claims
   WHERE user_id = v_uid AND claim_day >= v_month AND status = 'granted';
  IF v_month_total + v_amount > v_cap THEN
    RETURN jsonb_build_object('ok', false, 'error', 'month_cap', 'month_total', v_month_total, 'month_cap', v_cap);
  END IF;

  INSERT INTO public.mission_claims (user_id, content_item_id, network, post_url, url_key, screenshot_path, credits, claim_day)
  VALUES (v_uid, p_item, v_net, v_url, v_key, v_shot, v_amount, v_day);

  INSERT INTO public.user_credits (user_id, balance) VALUES (v_uid, v_amount)
  ON CONFLICT (user_id) DO UPDATE SET balance = public.user_credits.balance + v_amount, updated_at = now()
  RETURNING balance INTO v_balance;
  INSERT INTO public.credit_transactions (user_id, action, cost, label, meta)
  VALUES (v_uid, 'publish_bonus', -v_amount, 'Bono por publicar en ' || v_net,
          jsonb_build_object('item', p_item, 'network', v_net));

  RETURN jsonb_build_object('ok', true, 'amount', v_amount, 'balance', v_balance,
                            'month_total', v_month_total + v_amount, 'month_cap', v_cap);
END $function$;

-- 5. Estado para la pantalla: si ya reclamó hoy y cuánto lleva este mes.
CREATE OR REPLACE FUNCTION public.publish_bonus_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH r AS (SELECT private.publish_bonus_rules() AS j),
       d AS (SELECT (now() AT TIME ZONE 'America/Santo_Domingo')::date AS day)
  SELECT jsonb_build_object(
    'per_claim', (r.j ->> 'per_claim')::int,
    'month_cap', (r.j ->> 'month_cap')::int,
    'claimed_today', EXISTS (SELECT 1 FROM public.mission_claims c, d WHERE c.user_id = auth.uid() AND c.claim_day = d.day),
    'month_total', (SELECT coalesce(sum(credits), 0) FROM public.mission_claims c, d
                     WHERE c.user_id = auth.uid() AND c.status = 'granted' AND c.claim_day >= date_trunc('month', d.day)::date),
    'claimed_items', (SELECT coalesce(jsonb_agg(content_item_id), '[]'::jsonb) FROM public.mission_claims c
                       WHERE c.user_id = auth.uid() AND c.content_item_id IS NOT NULL)
  ) FROM r;
$function$;

-- 6. Admin: anular un bono (se descuentan los créditos, sin bajar de 0).
CREATE OR REPLACE FUNCTION public.admin_revoke_mission_claim(p_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_c public.mission_claims%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'solo admin'; END IF;
  SELECT * INTO v_c FROM public.mission_claims WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_c.status = 'revoked' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  UPDATE public.mission_claims
     SET status = 'revoked', revoke_reason = left(coalesce(p_reason, ''), 200), revoked_at = now()
   WHERE id = p_id;
  UPDATE public.user_credits SET balance = greatest(0, balance - v_c.credits), updated_at = now()
   WHERE user_id = v_c.user_id;
  INSERT INTO public.credit_transactions (user_id, action, cost, label, meta)
  VALUES (v_c.user_id, 'publish_bonus_revoked', v_c.credits, 'Bono anulado: ' || left(coalesce(p_reason, 'captura no válida'), 80),
          jsonb_build_object('claim', p_id));
  INSERT INTO public.audit_log (user_id, action, resource_type, resource_id, new_data)
  VALUES (auth.uid(), 'ADMIN_REVOKE_MISSION', 'mission_claim', p_id::text, jsonb_build_object('reason', left(coalesce(p_reason, ''), 200)));
  RETURN jsonb_build_object('ok', true);
END $function$;

-- 7. La misión vieja queda apagada (daba 50 créditos al día sin comprobar nada).
CREATE OR REPLACE FUNCTION public.award_mission_bonus(p_mission_date date, p_amount integer DEFAULT 50)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$ SELECT jsonb_build_object('success', false, 'error', 'replaced_by_publish_bonus') $function$;

-- Permisos: solo usuarios con sesión; nada para anon. Las auxiliares de private no se exponen.
REVOKE ALL ON FUNCTION public.claim_publish_bonus(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publish_bonus_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_revoke_mission_claim(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_publish_bonus(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_bonus_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_mission_claim(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION private.publish_bonus_rules() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.social_network(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.social_url_key(text) FROM PUBLIC, anon, authenticated;
