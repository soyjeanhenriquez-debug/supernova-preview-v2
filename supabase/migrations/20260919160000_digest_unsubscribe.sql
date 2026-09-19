-- El correo diario lleva un enlace "Dejar de recibir estos correos" que apuntaba
-- a una ruta inexistente (/unsub). Un correo comercial sin baja que funcione es
-- un problema legal (CAN-SPAM / RGPD) y de reputación del dominio.
--
-- El token es un UUID aleatorio por usuario (notification_prefs.unsub_token):
-- imposible de adivinar, así que la baja no exige iniciar sesión —quien llega
-- desde su correo se da de baja con un clic.
CREATE OR REPLACE FUNCTION public.unsubscribe_digest(p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows INT;
BEGIN
  IF p_token IS NULL THEN RETURN false; END IF;
  UPDATE public.notification_prefs
  SET daily_winner_email = false, streak_reminder_email = false, updated_at = now()
  WHERE unsub_token = p_token;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.unsubscribe_digest(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unsubscribe_digest(uuid) TO anon, authenticated;
