-- Admin → Negocio / Usuarios (12-oct-2026, pedido de Jean): ver qué videos creó o pidió cada persona.
-- Une los tres orígenes: video_jobs (Video con IA, anuncios, UGC, escenas de YouTube),
-- media_generation_jobs (presentador HeyGen) y genjutsu_jobs. Solo admin.
CREATE OR REPLACE FUNCTION public.admin_recent_videos(p_days integer DEFAULT 30, p_user uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Solo administradores' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(x ORDER BY x.created_at DESC)
    FROM (
      SELECT * FROM (
        SELECT v.id, v.user_id, u.email, coalesce(v.kind, 'clip') AS kind, v.model, v.status, v.seconds,
               v.credits_charged AS credits, left(v.prompt, 400) AS prompt, v.result_url AS url,
               left(v.error, 200) AS error, v.created_at
          FROM public.video_jobs v JOIN auth.users u ON u.id = v.user_id
         WHERE v.created_at >= v_since AND (p_user IS NULL OR v.user_id = p_user)
        UNION ALL
        SELECT m.id, m.user_id, u.email, 'presentador', coalesce(m.provider, 'heygen'), m.status, NULL,
               m.cost_media_credits, left(m.script, 400), m.video_url, left(m.error, 200), m.created_at
          FROM public.media_generation_jobs m JOIN auth.users u ON u.id = m.user_id
         WHERE m.created_at >= v_since AND (p_user IS NULL OR m.user_id = p_user)
        UNION ALL
        SELECT g.id, g.user_id, u.email, 'genjutsu', g.provider, g.status, NULL,
               NULL, left(g.prompt, 400), g.result_url, left(g.error, 200), g.created_at
          FROM public.genjutsu_jobs g JOIN auth.users u ON u.id = g.user_id
         WHERE g.created_at >= v_since AND (p_user IS NULL OR g.user_id = p_user)
      ) t ORDER BY t.created_at DESC LIMIT 200
    ) x
  ), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.admin_recent_videos(integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_recent_videos(integer, uuid) TO authenticated;
