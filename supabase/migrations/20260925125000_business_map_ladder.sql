-- Mapa del negocio · Fase 1: escalera propuesta con IA (bump, upsell, downsell, suscripción).
-- La genera la edge function `business-map`, cobrada en el servidor (acción business_map). Se
-- guarda por usuario y oferta: volver a abrirla no cobra; pedir otra sí.

CREATE TABLE IF NOT EXISTS public.business_maps (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_id   uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  ladder     jsonb NOT NULL,
  model      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, offer_id)
);
CREATE INDEX IF NOT EXISTS business_maps_offer ON public.business_maps (offer_id);

ALTER TABLE public.business_maps ENABLE ROW LEVEL SECURITY;
-- Cada quien lee solo las suyas (y el admin todas). Escribe solo el servidor (service role).
DROP POLICY IF EXISTS business_maps_select_own ON public.business_maps;
CREATE POLICY business_maps_select_own ON public.business_maps FOR SELECT TO authenticated
  USING ((user_id = (SELECT auth.uid()) AND (SELECT public.has_access())) OR public.has_role((SELECT auth.uid()), 'admin'::app_role));
REVOKE INSERT, UPDATE, DELETE ON public.business_maps FROM anon, authenticated;
REVOKE ALL ON public.business_maps FROM anon;

-- Precio (regla: ≥ costo real × 5 con el crédito más barato; se revisa con admin_margin).
INSERT INTO public.credit_prices (action, cost, label, charged_by)
VALUES ('business_map', 15, 'Escalera de tu negocio', 'server')
ON CONFLICT (action) DO NOTHING;

-- Panel de margen: el costo de esta función cuenta en su propia área.
CREATE OR REPLACE FUNCTION private.cost_area(p_fn text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_fn is null then null
    when p_fn like 'product-builder%' then 'Crear producto'
    when p_fn like 'ai-chat%' then 'Generadores y Mándala'
    when split_part(p_fn, ':', 1) in ('winner-blueprint', 'oraculo-generate') then 'Mi App'
    when p_fn like 'recovery-sequence%' then 'Recuperación de ventas'
    when p_fn like 'weekly-plan%' then 'Tu semana'
    when p_fn like 'content-ideas%' then 'Ideas de contenido'
    when p_fn like 'form-assist%' then 'Rellenar con IA'
    when p_fn like 'offer-intel%' then 'Veredicto de ofertas'
    when p_fn like 'generate-ad-creative%' then 'Creativo de imagen'
    when p_fn like 'business-map%' then 'Mapa del negocio'
    else split_part(p_fn, ':', 1)
  end
$function$;
