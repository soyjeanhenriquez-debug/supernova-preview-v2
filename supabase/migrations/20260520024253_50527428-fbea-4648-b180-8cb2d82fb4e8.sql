CREATE TABLE IF NOT EXISTS public.system_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_date DATE NOT NULL DEFAULT CURRENT_DATE,
  insight TEXT NOT NULL,
  source TEXT,
  category TEXT CHECK (category IN (
    'keyword_performance','user_behavior','market_trend','feature_usage','scoring_calibration'
  )),
  data_evidence JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID
);

ALTER TABLE public.system_learnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_learnings_admin_select" ON public.system_learnings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "system_learnings_admin_update" ON public.system_learnings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "system_learnings_service_all" ON public.system_learnings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_system_learnings_status ON public.system_learnings(status, created_at DESC);