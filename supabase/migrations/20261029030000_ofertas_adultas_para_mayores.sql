-- 29-oct-2026, Jean: «¡Ábrelas! Todos nuestros usuarios ya ponen su edad». Las ofertas marcadas como adultas
-- (excluded_reason = 'adult') solo las ve quien el servidor confirma mayor de edad (is_adult(), de AgeCountryGate).
-- Las demás excluidas (apps de novelas/dramas) siguen fuera para todos.
DROP POLICY IF EXISTS offers_select_with_access ON public.offers;
CREATE POLICY offers_select_with_access ON public.offers FOR SELECT TO authenticated
  USING ((SELECT public.has_access()) AND (excluded_reason IS DISTINCT FROM 'adult' OR (SELECT public.is_adult())));
GRANT EXECUTE ON FUNCTION public.is_adult() TO authenticated;
