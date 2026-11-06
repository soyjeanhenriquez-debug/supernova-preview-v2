-- «Lo que creaste» (06-nov-2026, pedido de Jean): guardar trabajo dentro de la app, sin costo de IA.
-- 1) Ofertas guardadas con estrellita: gratis y aparte de «Seguir» (que vigila y cuesta créditos).
CREATE TABLE IF NOT EXISTS public.offer_favorites (
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_id   uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, offer_id)
);
ALTER TABLE public.offer_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY offer_favorites_select_own ON public.offer_favorites FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY offer_favorites_insert_own ON public.offer_favorites FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY offer_favorites_delete_own ON public.offer_favorites FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
GRANT SELECT, INSERT, DELETE ON public.offer_favorites TO authenticated;

-- 2) Carruseles: antes el borrador vivía solo en el navegador. Se guarda el texto y las RUTAS de las imágenes
--    (las URLs firmadas vencen y se vuelven a firmar al abrir). Tope de tamaño para no llenar la base.
CREATE TABLE IF NOT EXISTS public.carousel_saves (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  title      text NOT NULL DEFAULT '',
  draft      jsonb NOT NULL CHECK (octet_length(draft::text) < 200000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS carousel_saves_user_idx ON public.carousel_saves (user_id, updated_at DESC);
ALTER TABLE public.carousel_saves ENABLE ROW LEVEL SECURITY;
CREATE POLICY carousel_saves_select_own ON public.carousel_saves FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY carousel_saves_insert_own ON public.carousel_saves FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY carousel_saves_update_own ON public.carousel_saves FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY carousel_saves_delete_own ON public.carousel_saves FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carousel_saves TO authenticated;
