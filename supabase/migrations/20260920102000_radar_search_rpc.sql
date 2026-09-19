-- SUPERNOVA — Buscador del Radar por RPC.
--
-- El índice de trigramas de ad_search_text no sirve a través de PostgREST: con RLS
-- activa, Postgres no deja usar un operador que no es "leakproof" (ILIKE) como
-- condición de índice antes de evaluar la política, así que filtraba fila a fila
-- (26 000 filas con su texto) y caducaba a los 8 s. Visto en producción: GET 500,
-- "canceling statement due to statement timeout".
--
-- Misma compuerta que la política (has_access) pero dentro de una función SECURITY
-- DEFINER de solo lectura: ahí el planificador sí usa el índice (20 ms).
-- Devuelve { total, capped, rows }. El total se cuenta hasta 2 000 (capped = true si hay más).
--
-- Dos caminos según lo común que sea la palabra:
--   · pocas coincidencias  → índice de trigramas + ordenar (lo normal)
--   · más de 2 000 ("free") → ordenarlas todas caducaría; se recorre el índice del orden
--     elegido y se filtra sobre la marcha (con tantas coincidencias, las 50 primeras salen enseguida)

CREATE OR REPLACE FUNCTION public.radar_search(
  p_keyword         TEXT,
  p_markets         TEXT[]  DEFAULT NULL,   -- NULL = todos los países
  p_exclude_markets TEXT[]  DEFAULT NULL,   -- para "inglés" = todo lo que no esté en esta lista
  p_min_score       INTEGER DEFAULT 0,
  p_min_days        INTEGER DEFAULT 0,
  p_min_dups        INTEGER DEFAULT 0,
  p_sort            TEXT    DEFAULT 'score', -- score | recent | dups | days
  p_offset          INTEGER DEFAULT 0,
  p_limit           INTEGER DEFAULT 50
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_kw    TEXT := btrim(regexp_replace(coalesce(p_keyword, ''), '[%_\\]', ' ', 'g'));
  v_pat   TEXT;
  v_order TEXT;
  v_limit INTEGER := LEAST(GREATEST(coalesce(p_limit, 50), 1), 200);
  v_off   INTEGER := LEAST(GREATEST(coalesce(p_offset, 0), 0), 20000);
  v_where TEXT;
  v_rows  JSONB;
  v_total INTEGER;
BEGIN
  IF NOT public.has_access() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;
  IF length(v_kw) < 3 OR length(v_kw) > 80 THEN
    RETURN jsonb_build_object('error', 'keyword_length');
  END IF;
  v_pat := '%' || v_kw || '%';

  v_order := CASE p_sort
    WHEN 'recent' THEN 'w.scraped_at DESC'
    WHEN 'dups'   THEN 'w.duplicate_count DESC NULLS LAST'
    WHEN 'days'   THEN 'w.days_active DESC NULLS LAST'
    ELSE 'w.winner_score DESC NULLS LAST' END;

  -- Solo anuncios reales de la Biblioteca de Meta (traen fecha de inicio).
  v_where := 'w.delivery_start_time IS NOT NULL AND public.ad_search_text(w) ILIKE $1'
    || CASE WHEN p_markets IS NOT NULL THEN ' AND w.market = ANY($2)' ELSE '' END
    || CASE WHEN p_exclude_markets IS NOT NULL THEN ' AND w.market <> ALL($3)' ELSE '' END
    || CASE WHEN coalesce(p_min_score, 0) > 0 THEN ' AND w.winner_score >= $4' ELSE '' END
    || CASE WHEN coalesce(p_min_days, 0) > 0 THEN ' AND w.days_active >= $5' ELSE '' END
    || CASE WHEN coalesce(p_min_dups, 0) > 0 THEN ' AND w.duplicate_count >= $6' ELSE '' END;

  EXECUTE format($q$
    SELECT count(*) FROM (SELECT 1 FROM public.winning_ads w WHERE %s LIMIT 2001) c $q$, v_where)
  INTO v_total
  USING v_pat, p_markets, p_exclude_markets, p_min_score, p_min_days, p_min_dups;

  IF v_total > 2000 THEN
    PERFORM set_config('enable_bitmapscan', 'off', true);
  END IF;

  EXECUTE format($q$
    SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (
      SELECT w.id, w.page_id, w.page_name, w.advertiser, w.ad_title,
             left(w.ad_body, 3000) AS ad_body, w.ad_url, w.market, w.days_active,
             w.duplicate_count, w.winner_score, w.tier, w.offer_type, w.publisher_platforms
      FROM public.winning_ads w
      WHERE %s
      ORDER BY %s
      LIMIT $7 OFFSET $8
    ) t $q$, v_where, v_order)
  INTO v_rows
  USING v_pat, p_markets, p_exclude_markets, p_min_score, p_min_days, p_min_dups, v_limit, v_off;

  IF v_total > 2000 THEN
    PERFORM set_config('enable_bitmapscan', 'on', true);
  END IF;

  RETURN jsonb_build_object('total', LEAST(v_total, 2000), 'capped', v_total > 2000, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.radar_search(TEXT, TEXT[], TEXT[], INTEGER, INTEGER, INTEGER, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.radar_search(TEXT, TEXT[], TEXT[], INTEGER, INTEGER, INTEGER, TEXT, INTEGER, INTEGER) TO authenticated, service_role;
