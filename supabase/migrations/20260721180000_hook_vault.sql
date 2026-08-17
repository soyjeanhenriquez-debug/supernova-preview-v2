-- Bóveda de Hooks: hooks extraídos de anuncios ganadores reales, con la
-- prueba de dinero (days_active × duplicate_count) como métrica de validez.
-- A diferencia de librerías de hooks "virales" (views orgánicos, una vez),
-- estos son ganchos que un anunciante siguió PAGANDO por correr — señal real.

CREATE TABLE public.hook_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- md5(page_id + inicio del body): winning_ads tiene filas repetidas del
  -- mismo anuncio (confirmado en datos), este hash evita hooks duplicados.
  dedup_hash TEXT NOT NULL UNIQUE,
  hook_text TEXT NOT NULL,        -- el gancho original, tal cual corre en el anuncio
  hook_template TEXT NOT NULL,    -- versión plantilla con [placeholders] reutilizables
  category TEXT NOT NULL CHECK (category IN (
    'dolor','curiosidad','prueba_social','autoridad','urgencia',
    'contrarian','historia','caso_estudio','lista'
  )),
  language TEXT,
  market TEXT,
  days_active INT,
  duplicate_count INT,
  winner_score INT,
  source_page_name TEXT,
  source_ad_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX hook_vault_score_idx ON public.hook_vault (winner_score DESC, days_active DESC);
CREATE INDEX hook_vault_category_idx ON public.hook_vault (category);
CREATE INDEX hook_vault_created_idx ON public.hook_vault (created_at DESC);

ALTER TABLE public.hook_vault ENABLE ROW LEVEL SECURITY;

-- Contenido compartido: cualquier usuario autenticado lee toda la bóveda.
CREATE POLICY hv_select_authenticated ON public.hook_vault
  FOR SELECT TO authenticated USING (true);

-- Escritura únicamente vía service_role (extract-hooks) o admin.
CREATE POLICY hv_admin_all ON public.hook_vault
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.hook_favorites (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hook_id UUID NOT NULL REFERENCES public.hook_vault(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, hook_id)
);

ALTER TABLE public.hook_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY hf_select_own ON public.hook_favorites
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY hf_insert_own ON public.hook_favorites
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY hf_delete_own ON public.hook_favorites
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
