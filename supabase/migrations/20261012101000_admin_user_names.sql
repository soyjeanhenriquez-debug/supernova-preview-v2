-- Admin (12-oct-2026, pedido de Jean): nombres y correos en vez de ids en el panel. Solo admin.
CREATE OR REPLACE FUNCTION public.admin_user_names(p_ids uuid[])
RETURNS TABLE (user_id uuid, email text, name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Solo administradores' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email::text,
           coalesce(nullif(trim(p.display_name), ''), nullif(trim(u.raw_user_meta_data->>'display_name'), ''), split_part(u.email, '@', 1))::text
      FROM auth.users u LEFT JOIN public.profiles p ON p.user_id = u.id
     WHERE u.id = ANY (p_ids[1:500]);
END $$;
REVOKE ALL ON FUNCTION public.admin_user_names(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_names(uuid[]) TO authenticated;
