-- Vitrina para quien tiene cuenta pero no plan (decisión de Jean, 03-oct-2026): entra a la app,
-- ve las herramientas con candado y una MUESTRA REAL del catálogo. El catálogo sigue cerrado por
-- RLS (has_access); esta función devuelve solo 12 ofertas ganadoras (las de más días anunciando:
-- la longevidad es la prueba de venta), sin id ni enlaces, para que la muestra no abra el resto.
-- Solo lectura, 12 filas de las 300 ganadoras: barata para la instancia chica.
CREATE OR REPLACE FUNCTION public.vitrina_sample()
RETURNS TABLE (name text, niche text, market text, offer_type text, days_active integer, active_ads integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(nullif(o.product_name, ''), nullif(o.sample_title, ''), o.page_name) AS name,
         o.niche, o.market, o.offer_type, o.days_active, o.active_ads
  FROM public.offers o
  WHERE o.is_winner AND o.excluded_reason IS NULL AND NOT o.enrich_failed
  ORDER BY o.days_active DESC NULLS LAST, o.winner_score DESC
  LIMIT 12;
$$;

REVOKE ALL ON FUNCTION public.vitrina_sample() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vitrina_sample() TO authenticated;
