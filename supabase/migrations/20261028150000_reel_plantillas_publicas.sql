-- Plantillas de SUPERNOVA (28-oct-2026, Jean: "recréame los formatos y guárdalos como plantilla en la app para
-- cualquier reel", para todos los clientes). Una plantilla pública es un formato analizado (estructura, planos,
-- ritmo, gancho, cierre) que cualquier cuenta usa con su tema, su cara y su voz. Las privadas siguen igual.
--
-- Seguridad: cualquier usuario con sesión LEE las públicas; nadie las crea, cambia ni borra desde la app (solo el
-- servidor / una migración). Sus miniaturas son imágenes de la app (/plantillas/<slug>/n.jpg), recreadas con Jean:
-- ningún cliente ve la cara ni la marca de quien hizo el reel original.
ALTER TABLE public.reel_plantillas
  ADD COLUMN IF NOT EXISTS publica boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS descripcion text NOT NULL DEFAULT '' CHECK (char_length(descripcion) <= 300),
  ADD COLUMN IF NOT EXISTS orden smallint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS reel_plantillas_publicas ON public.reel_plantillas (orden) WHERE publica;

DROP POLICY IF EXISTS reel_plantillas_publicas_select ON public.reel_plantillas;
CREATE POLICY reel_plantillas_publicas_select ON public.reel_plantillas FOR SELECT TO authenticated USING (publica);

-- Desde la app solo se crean, cambian y borran plantillas propias y privadas.
DROP POLICY IF EXISTS reel_plantillas_own_insert ON public.reel_plantillas;
CREATE POLICY reel_plantillas_own_insert ON public.reel_plantillas FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND NOT publica);
DROP POLICY IF EXISTS reel_plantillas_own_update ON public.reel_plantillas;
CREATE POLICY reel_plantillas_own_update ON public.reel_plantillas FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND NOT publica) WITH CHECK (user_id = (SELECT auth.uid()) AND NOT publica);
DROP POLICY IF EXISTS reel_plantillas_own_delete ON public.reel_plantillas;
CREATE POLICY reel_plantillas_own_delete ON public.reel_plantillas FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND NOT publica);
