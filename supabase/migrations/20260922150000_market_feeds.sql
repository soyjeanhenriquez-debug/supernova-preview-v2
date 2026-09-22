-- Feeds del Mercado: URLs de descarga de las redes de afiliados (Awin y compañía).
-- La URL lleva la clave del programa, así que esta tabla NO se expone a la API:
-- sin GRANT ni políticas, solo la toca la edge function con service_role.
CREATE TABLE IF NOT EXISTS public.market_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('clickbank','digistore24','etsy','manual')),
  label text NOT NULL DEFAULT '',
  url text NOT NULL CHECK (url ~* '^https://'),
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  last_run timestamptz,
  last_count integer,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.market_feeds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_feeds FROM PUBLIC, anon, authenticated;
