
-- Fix winning_ads INSERT policy to restrict to service role only
DROP POLICY IF EXISTS "winning_ads_insert_service" ON public.winning_ads;

-- Only service role (edge functions) can insert winning ads
-- This is enforced via SUPABASE_SERVICE_ROLE_KEY in edge functions
CREATE POLICY "winning_ads_insert_service" ON public.winning_ads
  FOR INSERT TO service_role WITH CHECK (true);
