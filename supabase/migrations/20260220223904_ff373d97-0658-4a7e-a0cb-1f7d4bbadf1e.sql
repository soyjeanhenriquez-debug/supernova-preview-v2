
-- =============================================
-- ENUMS
-- =============================================
CREATE TYPE public.campaign_status AS ENUM ('active', 'paused', 'draft', 'completed');
CREATE TYPE public.campaign_platform AS ENUM ('Meta', 'Google', 'TikTok', 'LinkedIn', 'Twitter', 'YouTube', 'Other');
CREATE TYPE public.campaign_objective AS ENUM ('conversions', 'awareness', 'traffic', 'leads', 'engagement', 'app_installs');

-- =============================================
-- PROFILES
-- =============================================
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  company_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- =============================================
-- CAMPAIGNS
-- =============================================
CREATE TABLE public.campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  platform public.campaign_platform NOT NULL DEFAULT 'Meta',
  objective public.campaign_objective NOT NULL DEFAULT 'conversions',
  status public.campaign_status NOT NULL DEFAULT 'draft',
  budget NUMERIC(12, 2) NOT NULL DEFAULT 0,
  spent NUMERIC(12, 2) NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC(5,2) DEFAULT 0,
  roas NUMERIC(5,2) DEFAULT 0,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaigns_all_own" ON public.campaigns
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================
-- KEYWORDS (for winning ads search)
-- =============================================
CREATE TABLE public.keywords (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_searched_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "keywords_all_own" ON public.keywords
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================
-- WINNING ADS
-- =============================================
CREATE TABLE public.winning_ads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword TEXT NOT NULL,
  advertiser TEXT,
  ad_title TEXT,
  ad_description TEXT,
  ad_url TEXT,
  platform TEXT NOT NULL DEFAULT 'Unknown',
  ad_format TEXT,
  impressions_estimate TEXT,
  engagement_score NUMERIC(5,2),
  is_featured BOOLEAN NOT NULL DEFAULT false,
  raw_data JSONB,
  scraped_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.winning_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "winning_ads_select_authenticated" ON public.winning_ads
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "winning_ads_insert_service" ON public.winning_ads
  FOR INSERT WITH CHECK (true);

-- =============================================
-- TIMESTAMPS TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'display_name')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_campaigns_user_id ON public.campaigns(user_id);
CREATE INDEX idx_campaigns_status ON public.campaigns(status);
CREATE INDEX idx_keywords_user_id ON public.keywords(user_id);
CREATE INDEX idx_winning_ads_keyword ON public.winning_ads(keyword);
CREATE INDEX idx_winning_ads_scraped_at ON public.winning_ads(scraped_at DESC);
