-- Búsqueda por palabra del Radar: de ILIKE + trigramas a full-text.
-- Antes: idx_winning_ads_search_trgm (GIN trigramas, 171 MB, 17 usos) y 2–3 s por búsqueda
-- ("curso" 3.071 ms). La base llegó a 450 MB de 500 del plan Free.
-- Ahora: índice full-text de 35 MB y 27–75 ms por búsqueda. Base: 314 MB.
-- Aplicado en producción el 24-sep-2026 (los índices con CONCURRENTLY, fuera de migración).

DROP INDEX IF EXISTS public.idx_winning_ads_search_trgm;

-- Mismo texto que ad_search_text (título + anunciante + 1000 caracteres del cuerpo), como vector
-- de palabras. Config 'simple': sin raíces de idioma porque hay anuncios en es/pt/en/ru.
CREATE OR REPLACE FUNCTION public.ad_search_tsv(w public.winning_ads)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$ SELECT to_tsvector('simple'::regconfig, coalesce(w.ad_title, '') || ' ' || coalesce(w.page_name, '') || ' ' || left(coalesce(w.ad_body, ''), 1000)) $$;

CREATE INDEX IF NOT EXISTS idx_winning_ads_search_fts ON public.winning_ads USING gin (public.ad_search_tsv(winning_ads.*));

CREATE OR REPLACE FUNCTION public.radar_search(p_keyword text, p_markets text[] DEFAULT NULL::text[], p_exclude_markets text[] DEFAULT NULL::text[], p_min_score integer DEFAULT 0, p_min_days integer DEFAULT 0, p_min_dups integer DEFAULT 0, p_sort text DEFAULT 'score'::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_kw    TEXT := btrim(coalesce(p_keyword, ''));
  v_query TSQUERY;
  v_order TEXT;
  v_limit INTEGER := LEAST(GREATEST(coalesce(p_limit, 50), 1), 200);
  v_off   INTEGER := LEAST(GREATEST(coalesce(p_offset, 0), 0), 20000);
  v_where TEXT;
  v_rows  JSONB;
  v_total INTEGER;
  v_terms TEXT;
  c_cols  CONSTANT TEXT := 'w.id, w.page_id, w.page_name, w.advertiser, w.ad_title, left(w.ad_body, 3000) AS ad_body, w.ad_url, w.market, w.days_active, w.duplicate_count, w.winner_score, w.tier, w.offer_type, w.publisher_platforms';
BEGIN
  IF NOT public.has_access() THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;
  IF length(v_kw) < 3 OR length(v_kw) > 80 THEN
    RETURN jsonb_build_object('error', 'keyword_length');
  END IF;

  -- Búsqueda por palabras (índice full-text idx_winning_ads_search_fts) en vez de ILIKE con
  -- trigramas (2–3 s y 171 MB de índice). Cada palabra busca también sus variantes ("curso"
  -- encuentra "cursos"). Solo letras y números llegan a la consulta: no se pueden inyectar
  -- operadores de tsquery.
  SELECT string_agg(t || ':*', ' & ')
  INTO v_terms
  FROM regexp_split_to_table(lower(v_kw), '[^[:alnum:]]+') AS t
  WHERE length(t) >= 2;
  IF v_terms IS NULL THEN
    RETURN jsonb_build_object('error', 'keyword_length');
  END IF;
  v_query := to_tsquery('simple', v_terms);

  v_order := CASE p_sort
    WHEN 'recent' THEN 'w.scraped_at DESC'
    WHEN 'dups'   THEN 'w.duplicate_count DESC NULLS LAST'
    WHEN 'days'   THEN 'w.days_active DESC NULLS LAST'
    ELSE 'w.winner_score DESC NULLS LAST' END;

  -- Solo anuncios reales de la Biblioteca de Meta (traen fecha de inicio).
  v_where := 'w.delivery_start_time IS NOT NULL AND public.ad_search_tsv(w) @@ $1'
    || CASE WHEN p_markets IS NOT NULL THEN ' AND w.market = ANY($2)' ELSE '' END
    || CASE WHEN p_exclude_markets IS NOT NULL THEN ' AND w.market <> ALL($3)' ELSE '' END
    || CASE WHEN coalesce(p_min_score, 0) > 0 THEN ' AND w.winner_score >= $4' ELSE '' END
    || CASE WHEN coalesce(p_min_days, 0) > 0 THEN ' AND w.days_active >= $5' ELSE '' END
    || CASE WHEN coalesce(p_min_dups, 0) > 0 THEN ' AND w.duplicate_count >= $6' ELSE '' END;

  -- 1) Coincidencias por el índice (hasta 2001), materializadas: así Postgres no recorre la
  --    tabla por puntaje recalculando el texto de cada anuncio (eso tardaba 7 s con "curso").
  EXECUTE format($q$
    CREATE TEMP TABLE IF NOT EXISTS _radar_hits (id uuid PRIMARY KEY) ON COMMIT DROP;
    $q$);
  TRUNCATE _radar_hits;
  EXECUTE format($q$
    INSERT INTO _radar_hits
    SELECT w.id FROM public.winning_ads w WHERE %s LIMIT 2001 $q$, v_where)
  USING v_query, p_markets, p_exclude_markets, p_min_score, p_min_days, p_min_dups;
  GET DIAGNOSTICS v_total = ROW_COUNT;

  IF v_total <= 2000 THEN
    -- 2a) Pocas coincidencias: se ordenan solo esas.
    EXECUTE format($q$
      SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (
        SELECT %s FROM _radar_hits h JOIN public.winning_ads w ON w.id = h.id
        ORDER BY %s LIMIT $1 OFFSET $2
      ) t $q$, c_cols, v_order)
    INTO v_rows
    USING v_limit, v_off;
  ELSE
    -- 2b) Palabra muy común: recorrer por el orden pedido y filtrar llena la página enseguida.
    EXECUTE format($q$
      SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (
        SELECT %s FROM public.winning_ads w WHERE %s ORDER BY %s LIMIT $7 OFFSET $8
      ) t $q$, c_cols, v_where, v_order)
    INTO v_rows
    USING v_query, p_markets, p_exclude_markets, p_min_score, p_min_days, p_min_dups, v_limit, v_off;
  END IF;

  RETURN jsonb_build_object('total', LEAST(v_total, 2000), 'capped', v_total > 2000, 'rows', v_rows);
END;
$function$;
