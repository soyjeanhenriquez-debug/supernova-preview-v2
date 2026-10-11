-- Copia del contenido de los kits antes de reescribirlos sin promesas (11-oct-2026).
-- Solo servidor: RLS activo y sin políticas.
CREATE TABLE IF NOT EXISTS public.mini_app_kits_backup (
  kit_id      uuid NOT NULL,
  content     jsonb NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kit_id, backed_up_at)
);
ALTER TABLE public.mini_app_kits_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mini_app_kits_backup FROM anon, authenticated;
INSERT INTO public.mini_app_kits_backup (kit_id, content)
SELECT id, content FROM public.mini_app_kits;
