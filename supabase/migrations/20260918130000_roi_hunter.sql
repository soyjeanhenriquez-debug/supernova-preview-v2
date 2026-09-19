-- FASE 4 — Cazador de ROI: seguimiento privado de ofertas con insights
-- automáticos a partir de offer_snapshots (historial diario que escribe
-- refresh_offers). Seguir cobra 5 créditos (atómico con consume_credits);
-- dejar de seguir es gratis; los insights son gratis para lo que sigues.

CREATE TABLE IF NOT EXISTS public.offer_follows (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, offer_id)
);
ALTER TABLE public.offer_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY offer_follows_select_own ON public.offer_follows
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY offer_follows_delete_own ON public.offer_follows
  FOR DELETE TO authenticated USING (user_id = auth.uid());
-- INSERT solo vía follow_offer() (cobra créditos): sin política de INSERT.

CREATE OR REPLACE FUNCTION public.follow_offer(p_offer_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_res JSONB;
  v_name TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'No autenticado'); END IF;
  IF EXISTS (SELECT 1 FROM public.offer_follows WHERE user_id = v_uid AND offer_id = p_offer_id) THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;
  SELECT coalesce(product_name, page_name, 'Oferta') INTO v_name FROM public.offers WHERE id = p_offer_id;
  IF v_name IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Oferta no encontrada'); END IF;

  -- Cobro atómico con la misma RPC de siempre (usa auth.uid() internamente)
  v_res := public.consume_credits(5, 'follow_offer', 'Seguir oferta · ' || left(v_name, 40), jsonb_build_object('offer_id', p_offer_id));
  IF coalesce((v_res->>'success')::boolean, false) = false THEN RETURN v_res; END IF;

  INSERT INTO public.offer_follows (user_id, offer_id) VALUES (v_uid, p_offer_id) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('success', true, 'balance', v_res->'balance');
END;
$$;
REVOKE ALL ON FUNCTION public.follow_offer(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.follow_offer(UUID) TO authenticated;

-- Ofertas seguidas + insights: delta de anuncios activos y score vs. el
-- snapshot más antiguo de los últimos 7 días (o el primero disponible).
CREATE OR REPLACE FUNCTION public.get_followed_offers()
RETURNS TABLE (
  offer JSONB, followed_at TIMESTAMPTZ,
  ads_delta INT, score_delta INT, days_tracked INT, first_active_ads INT
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT to_jsonb(o.*) AS offer, f.created_at AS followed_at,
         (o.active_ads - coalesce(s.active_ads, o.active_ads))::int AS ads_delta,
         (o.winner_score - coalesce(s.winner_score, o.winner_score))::int AS score_delta,
         coalesce((CURRENT_DATE - s.snap_date)::int, 0) AS days_tracked,
         coalesce(s.active_ads, o.active_ads)::int AS first_active_ads
  FROM public.offer_follows f
  JOIN public.offers o ON o.id = f.offer_id
  LEFT JOIN LATERAL (
    SELECT snap_date, active_ads, winner_score FROM public.offer_snapshots os
    WHERE os.offer_id = o.id AND os.snap_date >= GREATEST(f.created_at::date, CURRENT_DATE - 7)
    ORDER BY os.snap_date ASC LIMIT 1
  ) s ON true
  WHERE f.user_id = auth.uid()
  ORDER BY ads_delta DESC, f.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_followed_offers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_followed_offers() TO authenticated;
