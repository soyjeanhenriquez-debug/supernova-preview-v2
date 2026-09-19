-- SUPERNOVA — Ficha completa de una oferta ("Ver detalles").
--
-- La tabla offers dice QUÉ se vende y cuánto se anuncia. Para que el usuario
-- pueda copiar el negocio le falta: a dónde lleva el anuncio (página de ventas),
-- dónde se cobra (checkout y plataforma), qué tipo de embudo es, a cuánto se
-- vende, y un veredicto accionable. Eso se calcula UNA vez por oferta (edge
-- function offer-intel) y se comparte entre todos los usuarios: leerlo es gratis.

-- El mismo scrape del anuncio que ya paga la vista previa trae el enlace de destino.
ALTER TABLE public.ad_media_cache
  ADD COLUMN IF NOT EXISTS link_url TEXT,
  ADD COLUMN IF NOT EXISTS link_caption TEXT,
  ADD COLUMN IF NOT EXISTS cta_text TEXT;

CREATE TABLE IF NOT EXISTS public.offer_intel (
  offer_id           UUID PRIMARY KEY REFERENCES public.offers(id) ON DELETE CASCADE,
  ad_library_id      TEXT,
  landing_url        TEXT,
  landing_domain     TEXT,
  landing_title      TEXT,
  checkout_url       TEXT,
  checkout_platform  TEXT,
  funnel_type        TEXT,
  price_text         TEXT,
  verdict            JSONB,
  verdict_model      TEXT,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'partial', 'failed')),
  error              TEXT,
  attempts           SMALLINT NOT NULL DEFAULT 0,
  landing_checked_at TIMESTAMPTZ,
  verdict_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offer_intel_verdict_at_idx ON public.offer_intel (verdict_at DESC);

ALTER TABLE public.offer_intel ENABLE ROW LEVEL SECURITY;

-- Mismo muro de pago que el resto del producto; solo escribe la service role.
DROP POLICY IF EXISTS offer_intel_select_access ON public.offer_intel;
CREATE POLICY offer_intel_select_access ON public.offer_intel
  FOR SELECT TO authenticated USING ((SELECT public.has_access()));

REVOKE ALL ON public.offer_intel FROM anon;
GRANT SELECT ON public.offer_intel TO authenticated;

-- "Reportar oferta": el usuario avisa de una oferta apagada o con datos malos.
CREATE TABLE IF NOT EXISTS public.offer_reports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id   UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reason     TEXT NOT NULL DEFAULT 'inactive' CHECK (reason IN ('inactive', 'broken_link', 'wrong_info', 'other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (offer_id, user_id)
);

ALTER TABLE public.offer_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offer_reports_insert_own ON public.offer_reports;
CREATE POLICY offer_reports_insert_own ON public.offer_reports
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.has_access()));

DROP POLICY IF EXISTS offer_reports_select_own_or_admin ON public.offer_reports;
CREATE POLICY offer_reports_select_own_or_admin ON public.offer_reports
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

REVOKE ALL ON public.offer_reports FROM anon;
GRANT SELECT, INSERT ON public.offer_reports TO authenticated;

-- Interruptor y topes de la función (edge_limits): se puede apagar sin redesplegar.
INSERT INTO public.edge_limits (fn, enabled, max_hour, max_day, note)
VALUES ('offer-intel', true, 40, 160, 'Ficha completa de una oferta: 1 scrape + 1 llamada de IA por oferta NUEVA (lo ya calculado se lee gratis de offer_intel)')
ON CONFLICT (fn) DO NOTHING;
