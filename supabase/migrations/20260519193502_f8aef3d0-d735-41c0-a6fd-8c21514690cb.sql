
CREATE TABLE public.master_keyword_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword TEXT NOT NULL UNIQUE,
  source_tier TEXT,
  is_paused BOOLEAN NOT NULL DEFAULT false,
  last_run_at TIMESTAMPTZ,
  last_found_count INTEGER NOT NULL DEFAULT 0,
  total_found INTEGER NOT NULL DEFAULT 0,
  total_winners INTEGER NOT NULL DEFAULT 0,
  total_runs INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mks_last_run ON public.master_keyword_state (is_paused, last_run_at NULLS FIRST);

ALTER TABLE public.master_keyword_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master_keyword_state_admin_select"
  ON public.master_keyword_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "master_keyword_state_admin_update"
  ON public.master_keyword_state FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "master_keyword_state_service_all"
  ON public.master_keyword_state FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_mks_updated
  BEFORE UPDATE ON public.master_keyword_state
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE public.master_keyword_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  keywords_used TEXT[] NOT NULL DEFAULT '{}',
  ads_found INTEGER NOT NULL DEFAULT 0,
  winners_found INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'cron'
);

CREATE INDEX idx_mkr_started ON public.master_keyword_runs (started_at DESC);

ALTER TABLE public.master_keyword_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master_keyword_runs_admin_select"
  ON public.master_keyword_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "master_keyword_runs_service_all"
  ON public.master_keyword_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);
