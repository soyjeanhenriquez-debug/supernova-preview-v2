-- Prefiltro de exclusiones: ofertas que NO deben gastar tokens de IA ni
-- aparecer en el catálogo de Ofertas. Se detectó que los filtros de seguridad
-- del modelo omitían estas fichas dentro del lote, y las omitidas arrastraban
-- a ofertas normales hacia el descarte (enrich_attempts).
--
-- Reglas verificadas leyendo el contexto de cada coincidencia (2026-09-19):
--   adult      → copy explícito (🔞, "nudes", "uncensored"...). Casi siempre
--                apps de novelas/dramas con gancho sexual. Oculto en todas partes.
--   drama_apps → apps de lectura de novelas y dramas cortos (DramaBox, ReelShort
--                y clones): gigantes no replicables por un emprendedor.
-- NO hay regla de "pastillas ED" a propósito: la versión por palabras clave
-- mezclaba vendedores de pastillas con infoproductos legítimos de salud
-- masculina (copy_score 5). Pendiente de decisión de producto.
--
-- Reversible: UPDATE public.offers SET excluded_reason = NULL;

ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS excluded_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_offers_excluded ON public.offers (excluded_reason) WHERE excluded_reason IS NOT NULL;

CREATE OR REPLACE FUNCTION public.flag_excluded_offers()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows INTEGER;
BEGIN
  WITH src AS (
    SELECT id, coalesce(page_name, '') AS pn, lang_guess,
           coalesce(sample_title, '') || ' ' || coalesce(sample_body, '') AS txt
    FROM public.offers
    WHERE excluded_reason IS NULL
  ), flagged AS (
    SELECT id, CASE
      WHEN txt ~* '(🔞|\m(nsfw|onlyfans|porn\w*|xxx|nudes?|erotic\w*|er[oó]tic[oa]s?|hookups?|sexting|sex\s?chat|(ai|virtual)\s?girlfriend|novia\s+virtual|namorada\s+virtual|uncensored|sin\s+censura|adults?\s+only|solo\s+adultos|spicy\s+chat|lonely\s+(women|wives|moms)|thick\s+penis|pile\s+driver)\M)'
        THEN 'adult'
      WHEN txt ~* '\m(dramabox|reelshort|shortmax|goodshort|flextv|dramawave|netshort|moboreels|short\s?dramas?|webnovel|goodnovel|read\s+the\s+full\s+(version|story|novel)|continue\s+(watch|watching|reading)|full\s+chapters?|werewolf|alpha\s+(king|mate)|contract\s+marriage|pregnant\s+with\s+(twins|his|the)|mafia\s+(boss|king|don))\M'
        OR pn ~* '\m(novels?|webnovel|bookish|short\s?dramas?|dramabox|reelshort|minidramas?)\M'
        OR (lang_guess = 'en' AND pn ~* '\mdramas?\M')
        THEN 'drama_apps'
    END AS reason
    FROM src
  )
  UPDATE public.offers o
  SET excluded_reason = f.reason
  FROM flagged f
  WHERE o.id = f.id AND f.reason IS NOT NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;
REVOKE ALL ON FUNCTION public.flag_excluded_offers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flag_excluded_offers() TO service_role;
