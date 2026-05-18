CREATE TABLE public.landing_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  brand_name TEXT,
  analysis_text TEXT NOT NULL,
  ads_found JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.landing_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "landing_analyses_all_own"
ON public.landing_analyses
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_landing_analyses_user_created ON public.landing_analyses (user_id, created_at DESC);