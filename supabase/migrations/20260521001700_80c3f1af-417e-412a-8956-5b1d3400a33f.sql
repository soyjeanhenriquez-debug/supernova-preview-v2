
ALTER TABLE public.master_keyword_state
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS intent text DEFAULT 'discovery',
  ADD COLUMN IF NOT EXISTS risk_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS compliance_note text,
  ADD COLUMN IF NOT EXISTS country_target text,
  ADD COLUMN IF NOT EXISTS unique_advertisers integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unique_domains integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_ads_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opportunity_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicate_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS master_keyword_state_keyword_uk
  ON public.master_keyword_state (lower(keyword));

CREATE INDEX IF NOT EXISTS master_keyword_state_priority_idx
  ON public.master_keyword_state (priority, opportunity_score DESC);

CREATE INDEX IF NOT EXISTS master_keyword_state_category_idx
  ON public.master_keyword_state (category);
