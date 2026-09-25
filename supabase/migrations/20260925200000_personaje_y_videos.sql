-- SUPERNOVA — "Vende sin mostrar tu cara": fotos de personajes (Storage) y base de videos (fal.ai).
--
-- Todo es ADITIVO: no toca tablas existentes ni el catálogo.
-- 1. Bucket privado "personajes": cada usuario solo lee y escribe su carpeta ({user_id}/…).
--    Storage tiene su propio espacio (no cuenta en los 500 MB de la base).
-- 2. video_jobs: cada video pedido (lo escribe SOLO la función video-generate con service_role;
--    el usuario solo lee los suyos).
-- 3. video_reservations: la preventa "Reserva tus créditos de video" (+50 % al abrir; si no abrimos
--    antes de la fecha anunciada, se devuelve el 100 %). La escribe el webhook de Whop.
-- 4. edge_limits: video-generate APAGADA (enabled = false) hasta conectar fal.ai y fijar precio.
--    Sin fila en credit_prices todavía: el precio lo aprueba Jean (regla costo × 5).

-- 1. Fotos de personajes ----------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('personajes', 'personajes', false, 3145728, ARRAY['image/jpeg', 'image/webp', 'image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY personajes_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'personajes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY personajes_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'personajes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY personajes_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'personajes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY personajes_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'personajes' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 2. Videos -------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.video_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid,
  provider text NOT NULL DEFAULT 'fal',
  model text NOT NULL,
  prompt text NOT NULL CHECK (char_length(prompt) <= 2000),
  seconds smallint NOT NULL CHECK (seconds BETWEEN 3 AND 15),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  provider_request_id text,
  credit_tx_id uuid,          -- cobro (credit_transactions.id) para reembolsar si falla
  credits_charged integer NOT NULL DEFAULT 0,
  result_url text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS video_jobs_user_idx ON public.video_jobs (user_id, created_at DESC);
ALTER TABLE public.video_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY video_jobs_select_own ON public.video_jobs
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 3. Preventa de créditos de video ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.video_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  amount_usd numeric(10, 2) NOT NULL CHECK (amount_usd > 0),
  bonus_pct smallint NOT NULL DEFAULT 50 CHECK (bonus_pct BETWEEN 0 AND 50),
  provider text NOT NULL DEFAULT 'whop',
  provider_payment_id text UNIQUE,
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'credited', 'refunded')),
  credited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.video_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY video_reservations_select_own ON public.video_reservations
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 4. Interruptor: apagada hasta conectar el proveedor ----------------------------------------
INSERT INTO public.edge_limits (fn, enabled, max_hour, max_day)
VALUES ('video-generate', false, 10, 30)
ON CONFLICT (fn) DO UPDATE SET enabled = false;
