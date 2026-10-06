-- SUPERNOVA — Termómetro del Radar en el servidor.
--
-- Antes la fórmula de temperatura (src/lib/temperature-system.ts) viajaba en el bundle y
-- cualquiera podía leerla desde el navegador. Ahora vive en el esquema private (PostgREST
-- no lo expone) y el navegador recibe solo [nivel 1-6, señal 0-3, velocidad 0-4]; los
-- textos y colores se pintan por índice en src/lib/heat.ts.
--
-- La aritmética va en float8 y en el mismo orden que el código JS anterior, para que los
-- umbrales den exactamente lo mismo (comparado contra el JS viejo antes de aplicar).
--
-- Orden de despliegue: esta migración primero (todo es aditivo: la app vieja ignora la
-- columna nueva "h" de radar_search) y después el frontend.

CREATE OR REPLACE FUNCTION private.heat_core(p_dups integer, p_pages integer, p_days integer)
RETURNS smallint[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT ARRAY[
    CASE WHEN h < 5 THEN 1 WHEN h < 20 THEN 2 WHEN h < 60 THEN 3
         WHEN h < 150 THEN 4 WHEN h < 400 THEN 5 ELSE 6 END,
    CASE WHEN p <= 1 THEN 0 WHEN p <= 3 THEN 1 WHEN p <= 6 THEN 2 ELSE 3 END,
    CASE WHEN v >= 5 THEN 0 WHEN v >= 2 THEN 1 WHEN v >= 0.5 THEN 2
         WHEN v >= 0.1 THEN 3 ELSE 4 END
  ]::smallint[]
  FROM (
    SELECT p, v,
           d * (CASE WHEN p >= 10 THEN 4.0 WHEN p >= 7 THEN 3.5 WHEN p >= 5 THEN 3.0
                     WHEN p >= 3 THEN 2.0 WHEN p >= 2 THEN 1.5 ELSE 1.0 END)::float8
           + v * 10 AS h
    FROM (
      SELECT d, p, d / greatest(1, dd) AS v
      FROM (SELECT coalesce(p_dups, 1)::float8 AS d,
                   coalesce(p_pages, 1)        AS p,
                   coalesce(p_days, 1)::float8 AS dd) a
    ) b
  ) c
$$;
REVOKE ALL ON FUNCTION private.heat_core(integer, integer, integer) FROM PUBLIC, anon, authenticated;

-- Campo calculado para la lista del Radar: select("…, h:ad_heat").
-- Solo da el nivel de filas que el usuario ya puede leer (RLS de winning_ads).
CREATE OR REPLACE FUNCTION public.ad_heat(w public.winning_ads)
RETURNS smallint[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$ SELECT private.heat_core(w.duplicate_count, 1, w.days_active) $$;
REVOKE ALL ON FUNCTION public.ad_heat(public.winning_ads) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ad_heat(public.winning_ads) TO authenticated, service_role;

-- Búsqueda en vivo: el agrupado por anunciante ocurre en el navegador, así que manda
-- tríos planos [dups, páginas, días, …] y recibe [nivel, señal, velocidad, …].
-- Máximo 200 anuncios por llamada.
CREATE OR REPLACE FUNCTION public.ad_heat_batch(p_items integer[])
RETURNS smallint[]
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n   integer := coalesce(array_length(p_items, 1), 0);
  res smallint[] := '{}';
BEGIN
  IF NOT public.has_access() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF n % 3 <> 0 OR n > 600 THEN
    RAISE EXCEPTION 'bad_items' USING ERRCODE = '22023';
  END IF;
  FOR i IN 0 .. n / 3 - 1 LOOP
    res := res || private.heat_core(p_items[i*3 + 1], p_items[i*3 + 2], p_items[i*3 + 3]);
  END LOOP;
  RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.ad_heat_batch(integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ad_heat_batch(integer[]) TO authenticated, service_role;

-- "Nichos en llamas": antes bajaba hasta 5 000 filas de winning_ads (sin orden: con
-- 50 000 anuncios en 7 días era una muestra al azar) para contarlas en el navegador.
-- Ahora cuenta todo y devuelve el top 8: [[oferta, mercado, n, nivel], …].
CREATE OR REPLACE FUNCTION public.niche_heat()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_access() THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((
    WITH r AS (
      SELECT (regexp_split_to_array(lower(offer_type), '[\s-]'))[1] AS offer,
             coalesce(market, 'GLOBAL') AS market
      FROM public.winning_ads
      WHERE scraped_at >= now() - interval '7 days' AND offer_type IS NOT NULL
    ), c AS (
      SELECT offer, market, count(*) AS n
      FROM r WHERE offer <> ''
      GROUP BY offer, market
      ORDER BY n DESC, offer, market
      LIMIT 8
    ), m AS (SELECT greatest(1, max(n))::float8 AS mx FROM c)
    SELECT jsonb_agg(jsonb_build_array(c.offer, c.market, c.n,
             CASE WHEN c.n / m.mx >= 0.9 THEN 6 WHEN c.n / m.mx >= 0.7 THEN 5
                  WHEN c.n / m.mx >= 0.5 THEN 4 WHEN c.n / m.mx >= 0.3 THEN 3
                  WHEN c.n / m.mx >= 0.15 THEN 2 ELSE 1 END)
           ORDER BY c.n DESC, c.offer, c.market)
    FROM c, m
  ), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.niche_heat() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.niche_heat() TO authenticated, service_role;

-- radar_search: la versión en producción (búsqueda full-text) nunca quedó en una
-- migración; se copia aquí tal cual y solo se agrega la columna "h" a c_cols.
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
  c_cols  CONSTANT TEXT := 'w.id, w.page_id, w.page_name, w.advertiser, w.ad_title, left(w.ad_body, 3000) AS ad_body, w.ad_url, w.market, w.days_active, w.duplicate_count, w.winner_score, w.tier, w.offer_type, w.publisher_platforms, private.heat_core(w.duplicate_count, 1, w.days_active) AS h';
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
