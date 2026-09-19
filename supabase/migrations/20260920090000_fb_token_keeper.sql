-- SUPERNOVA — Token de Meta que se mantiene solo.
--
-- La Ad Library API solo acepta el token de USUARIO de una cuenta con identidad
-- verificada, y ese token dura como mucho ~60 días (el de "usuario del sistema",
-- que no caduca, no sirve para esta API). Ya se nos murió dos veces en silencio.
-- Solución: el token vive en Vault, una edge function (fb-token-keeper) lo canjea
-- por uno nuevo de 60 días antes de que venza, y el panel admin avisa si algo falla.
-- Un secreto de Edge Functions no se puede reescribir desde código; Vault sí.

CREATE TABLE IF NOT EXISTS private.fb_token_meta (
  id          BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  is_valid    BOOLEAN,
  works       BOOLEAN,          -- ¿respondió la Ad Library API con este token?
  token_type  TEXT,             -- USER | SYSTEM_USER | …
  expires_at  TIMESTAMPTZ,      -- NULL = no caduca
  source      TEXT,             -- vault | env
  renewed_at  TIMESTAMPTZ,
  checked_at  TIMESTAMPTZ,
  last_error  TEXT
);

-- El token, solo para el servidor.
CREATE OR REPLACE FUNCTION public.get_fb_token()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supernova_fb_access_token' LIMIT 1
$$;

-- Guarda el token (si viene) y el resultado de la última revisión.
CREATE OR REPLACE FUNCTION public.fb_token_save(
  p_token TEXT, p_is_valid BOOLEAN, p_works BOOLEAN, p_token_type TEXT,
  p_expires_at TIMESTAMPTZ, p_source TEXT, p_renewed BOOLEAN, p_error TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, private
AS $$
DECLARE v_id UUID;
BEGIN
  IF p_token IS NOT NULL AND length(p_token) > 20 THEN
    SELECT id INTO v_id FROM vault.secrets WHERE name = 'supernova_fb_access_token';
    IF v_id IS NULL THEN
      PERFORM vault.create_secret(p_token, 'supernova_fb_access_token', 'Token de Meta para la Ad Library API; lo renueva fb-token-keeper');
    ELSE
      PERFORM vault.update_secret(v_id, p_token);
    END IF;
  END IF;

  INSERT INTO private.fb_token_meta AS m (id, is_valid, works, token_type, expires_at, source, renewed_at, checked_at, last_error)
  VALUES (TRUE, p_is_valid, p_works, p_token_type, p_expires_at, p_source, CASE WHEN p_renewed THEN now() END, now(), left(p_error, 300))
  ON CONFLICT (id) DO UPDATE SET
    is_valid = EXCLUDED.is_valid, works = EXCLUDED.works, token_type = EXCLUDED.token_type,
    expires_at = EXCLUDED.expires_at, source = EXCLUDED.source,
    renewed_at = COALESCE(EXCLUDED.renewed_at, m.renewed_at),
    checked_at = now(), last_error = EXCLUDED.last_error;
END;
$$;

-- Estado para el panel admin (nunca el token).
CREATE OR REPLACE FUNCTION public.fb_token_status()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE m private.fb_token_meta%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;
  SELECT * INTO m FROM private.fb_token_meta WHERE id;
  IF NOT FOUND THEN RETURN jsonb_build_object('configured', false); END IF;
  RETURN jsonb_build_object(
    'configured', true, 'is_valid', m.is_valid, 'works', m.works, 'token_type', m.token_type,
    'expires_at', m.expires_at,
    'days_left', CASE WHEN m.expires_at IS NULL THEN NULL ELSE floor(extract(epoch FROM (m.expires_at - now())) / 86400) END,
    'source', m.source, 'renewed_at', m.renewed_at, 'checked_at', m.checked_at, 'last_error', m.last_error);
END;
$$;

REVOKE ALL ON FUNCTION public.get_fb_token() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fb_token_save(TEXT, BOOLEAN, BOOLEAN, TEXT, TIMESTAMPTZ, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fb_token_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fb_token() TO service_role;
GRANT EXECUTE ON FUNCTION public.fb_token_save(TEXT, BOOLEAN, BOOLEAN, TEXT, TIMESTAMPTZ, TEXT, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fb_token_status() TO authenticated, service_role;

-- Revisión diaria: comprueba el token y lo renueva cuando le quedan menos de 45 días.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'supernova-fb-token-keeper';
SELECT cron.schedule(
  'supernova-fb-token-keeper',
  '30 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://krfdoofwhtcxbyhkjoik.supabase.co/functions/v1/fb-token-keeper',
    headers := private.cron_headers(),
    body := '{"action":"auto"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
