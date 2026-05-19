CREATE TABLE public.ad_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ad_key text NOT NULL,
  ad_id text,
  page_id text,
  page_name text,
  title text,
  body text,
  href text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ad_key)
);

ALTER TABLE public.ad_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad_favorites_all_own" ON public.ad_favorites
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_ad_favorites_user ON public.ad_favorites(user_id, created_at DESC);

CREATE TABLE public.ad_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ad_key text NOT NULL,
  ad_id text,
  page_id text,
  page_name text,
  title text,
  body text,
  href text NOT NULL,
  visited_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ad_key)
);

ALTER TABLE public.ad_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad_history_all_own" ON public.ad_history
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_ad_history_user ON public.ad_history(user_id, visited_at DESC);