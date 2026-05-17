
ALTER TABLE public.winning_ads
  ADD COLUMN IF NOT EXISTS page_id text,
  ADD COLUMN IF NOT EXISTS page_name text,
  ADD COLUMN IF NOT EXISTS ad_body text,
  ADD COLUMN IF NOT EXISTS delivery_start_time timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_stop_time timestamptz,
  ADD COLUMN IF NOT EXISTS impressions_lower bigint,
  ADD COLUMN IF NOT EXISTS impressions_upper bigint,
  ADD COLUMN IF NOT EXISTS publisher_platforms jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS market text,
  ADD COLUMN IF NOT EXISTS offer_type text,
  ADD COLUMN IF NOT EXISTS winner_score integer,
  ADD COLUMN IF NOT EXISTS tier text,
  ADD COLUMN IF NOT EXISTS signals jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS days_active integer,
  ADD COLUMN IF NOT EXISTS duplicate_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_confirmed_winner boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_winning_ads_score ON public.winning_ads (winner_score DESC);
CREATE INDEX IF NOT EXISTS idx_winning_ads_tier ON public.winning_ads (tier);
