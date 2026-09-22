-- El catálogo lo carga el admin desde los feeds oficiales de cada red (ClickBank, Awin…).
-- Escribir es solo para admin; el resto de miembros solo lee.
CREATE POLICY market_offers_admin_insert ON public.market_offers FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY market_offers_admin_update ON public.market_offers FOR UPDATE TO authenticated
  USING ((SELECT public.has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY market_offers_admin_delete ON public.market_offers FOR DELETE TO authenticated
  USING ((SELECT public.has_role(auth.uid(), 'admin'::app_role)));
GRANT INSERT, UPDATE, DELETE ON public.market_offers TO authenticated;
