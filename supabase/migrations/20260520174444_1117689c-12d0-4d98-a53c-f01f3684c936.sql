
CREATE TABLE IF NOT EXISTS public.temperature_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_id TEXT NOT NULL,
  page_name TEXT,
  offer_type TEXT,
  market TEXT,
  duplicate_count INTEGER DEFAULT 0,
  temperature_level INTEGER DEFAULT 1,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_temp_snapshots_ad_id ON public.temperature_snapshots(ad_id);
CREATE INDEX IF NOT EXISTS idx_temp_snapshots_recorded_at ON public.temperature_snapshots(recorded_at DESC);

ALTER TABLE public.temperature_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "temperature_snapshots_select_authenticated"
  ON public.temperature_snapshots FOR SELECT TO authenticated USING (true);

CREATE POLICY "temperature_snapshots_service_insert"
  ON public.temperature_snapshots FOR INSERT TO service_role WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.get_rising_temperature_ads(
  hours_back INTEGER DEFAULT 48,
  min_jump INTEGER DEFAULT 1
)
RETURNS TABLE(
  ad_id TEXT,
  page_name TEXT,
  offer_type TEXT,
  market TEXT,
  old_level INTEGER,
  new_level INTEGER,
  level_jump INTEGER,
  new_duplicates INTEGER,
  old_duplicates INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (s.ad_id)
      s.ad_id, s.page_name, s.offer_type, s.market,
      s.duplicate_count, s.temperature_level, s.recorded_at
    FROM public.temperature_snapshots s
    WHERE s.recorded_at > NOW() - INTERVAL '4 hours'
    ORDER BY s.ad_id, s.recorded_at DESC
  ),
  previous AS (
    SELECT DISTINCT ON (s.ad_id)
      s.ad_id, s.duplicate_count, s.temperature_level
    FROM public.temperature_snapshots s
    WHERE s.recorded_at < NOW() - (hours_back || ' hours')::INTERVAL
      AND s.recorded_at > NOW() - ((hours_back + 48) || ' hours')::INTERVAL
    ORDER BY s.ad_id, s.recorded_at DESC
  )
  SELECT
    l.ad_id,
    l.page_name,
    l.offer_type,
    l.market,
    p.temperature_level as old_level,
    l.temperature_level as new_level,
    (l.temperature_level - p.temperature_level) as level_jump,
    l.duplicate_count as new_duplicates,
    p.duplicate_count as old_duplicates
  FROM latest l
  JOIN previous p ON l.ad_id = p.ad_id
  WHERE l.temperature_level > p.temperature_level
    AND (l.temperature_level - p.temperature_level) >= min_jump
  ORDER BY level_jump DESC, new_duplicates DESC
  LIMIT 6;
END;
$$;
