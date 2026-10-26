-- =====================================================================================================
-- Para publicar v2 (26-oct-2026, pedido de Jean): marcar con un toque en qué red ya salió cada pieza y crecer
-- de 3 a 10 piezas al día sin desorden.
--   · content_items.pub_hechas: { "<red>": { "at": ISO, "por": uid } } — quién marcó y cuándo, por red.
--   · publicar_ajustes: el plan de cada persona (3, 5 o 10 al día), sus casillas extra por día, la vista que
--     prefiere (Hoy o Semana) y las redes que usa. Cada quien ve y cambia solo lo suyo.
-- La app manda; Notion solo recibe (edge function «publicar», acción notion).
-- =====================================================================================================
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS pub_hechas jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.publicar_ajustes (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  plan smallint NOT NULL DEFAULT 3 CHECK (plan IN (3, 5, 10)),
  extras jsonb NOT NULL DEFAULT '{}'::jsonb,
  vista text NOT NULL DEFAULT 'hoy' CHECK (vista IN ('hoy', 'semana')),
  redes text[] NOT NULL DEFAULT '{instagram,tiktok,youtube,facebook}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (pg_column_size(extras) < 20000)
);
ALTER TABLE public.publicar_ajustes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "publicar_ajustes: lo propio" ON public.publicar_ajustes;
CREATE POLICY "publicar_ajustes: lo propio" ON public.publicar_ajustes FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.publicar_ajustes FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.publicar_ajustes TO authenticated;
