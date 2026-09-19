-- FASE 2 — Picks del día: 3 ofertas por usuario, nunca repetidas, rotando
-- los 4 grupos de mercado (ES = ES/MX/AR/CO, BR = BR/PT, US = US/GB,
-- RU = RU/KZ) — cada día cubre 3 de los 4 grupos y va rotando cuál descansa.
-- Idempotente por día: la segunda llamada devuelve exactamente lo mismo.

CREATE TABLE IF NOT EXISTS public.daily_picks (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  pick_date DATE NOT NULL DEFAULT CURRENT_DATE,
  slot SMALLINT NOT NULL,
  market_group TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, offer_id)          -- nunca repetir una oferta al mismo usuario
);
CREATE INDEX IF NOT EXISTS idx_daily_picks_user_date ON public.daily_picks (user_id, pick_date);

ALTER TABLE public.daily_picks ENABLE ROW LEVEL SECURITY;
CREATE POLICY daily_picks_select_own ON public.daily_picks
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Inserta solo la RPC (SECURITY DEFINER); sin política de INSERT para authenticated.

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
  IF v_uid IS NULL THEN RETURN; END IF;

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

  RETURN QUERY
    SELECT dp.slot, dp.market_group, to_jsonb(o.*)
    FROM public.daily_picks dp JOIN public.offers o ON o.id = dp.offer_id
    WHERE dp.user_id = v_uid AND dp.pick_date = CURRENT_DATE
    ORDER BY dp.slot;
END;
$$;
REVOKE ALL ON FUNCTION public.get_daily_picks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_picks() TO authenticated, service_role;
