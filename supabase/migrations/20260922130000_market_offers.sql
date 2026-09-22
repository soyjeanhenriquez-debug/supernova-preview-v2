-- Mercado: productos de redes de afiliados y tiendas (ClickBank, Digistore24, Etsy…).
-- Una sola tabla para todas las fuentes: la ficha que ve el usuario es siempre igual
-- y añadir una fuente nueva no toca la interfaz.
CREATE TABLE IF NOT EXISTS public.market_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('clickbank','digistore24','etsy','manual')),
  external_id text NOT NULL,
  title text NOT NULL,
  description text,
  category text,
  niche text,
  vendor text,
  price numeric CHECK (price IS NULL OR price >= 0),
  currency text DEFAULT 'USD',
  commission_pct numeric CHECK (commission_pct IS NULL OR (commission_pct >= 0 AND commission_pct <= 100)),
  commission_amount numeric CHECK (commission_amount IS NULL OR commission_amount >= 0),
  -- Señal de qué tan vendido es en su red (gravity en ClickBank, ventas en Etsy…).
  popularity numeric,
  epc numeric,
  rating numeric,
  reviews integer,
  image_url text,
  product_url text,
  affiliate_url text,
  language text,
  country text,
  tags text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  raw jsonb,
  UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS market_offers_browse ON public.market_offers (source, is_active, popularity DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS market_offers_niche ON public.market_offers (niche) WHERE is_active;
CREATE INDEX IF NOT EXISTS market_offers_tags ON public.market_offers USING gin (tags);

ALTER TABLE public.market_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_offers FROM anon, authenticated;
GRANT SELECT ON public.market_offers TO authenticated;
-- Solo miembros con acceso lo ven; escribir es cosa del ingestor (service_role, que salta RLS).
CREATE POLICY market_offers_select ON public.market_offers FOR SELECT TO authenticated
  USING (is_active AND (SELECT public.has_access()));
