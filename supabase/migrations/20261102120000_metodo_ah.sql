-- «Video IA Perfecto» (Modelo AH), fase 1 (02-nov-2026, aprobado por Jean): de UNA frase a un storyboard con
-- personaje fijo. Función metodo-ah. Método: supabase/functions/_shared/metodoAh.ts.
-- Plan: docs/propuestas/2026-11-02-plan-metodo-ah.md.

-- 1) Precios (aprobados por Jean el 02-nov-2026; costo real × 5 con el crédito a US$0,008):
--    storyboard ≈ US$0,25 (texto de los agentes + personaje + 4–9 imágenes con reintentos) → 160 créditos.
--    cambiar solo… (1 llamada de texto + 1 imagen) ≈ US$0,015 → 10 créditos.
INSERT INTO public.credit_prices (action, cost, label, charged_by, real_cost_usd) VALUES
  ('ah_storyboard', 160, 'Video IA Perfecto · storyboard con personaje', 'server', 0.25),
  ('ah_cambio',     10,  'Video IA Perfecto · cambiar solo una cosa',    'server', 0.015)
ON CONFLICT (action) DO UPDATE SET cost = EXCLUDED.cost, label = EXCLUDED.label, real_cost_usd = EXCLUDED.real_cost_usd, updated_at = now();

-- 2) Proyectos y escenas. Solo escribe el servidor (service_role); cada persona lee los suyos.
CREATE TABLE IF NOT EXISTS public.ah_proyectos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idea TEXT NOT NULL,
  opciones JSONB NOT NULL DEFAULT '{}'::jsonb,
  plan JSONB NOT NULL,                       -- título, modo, estilo, brief y biblia del personaje
  cara_ref JSONB,                            -- { bucket, path } de la foto propia, si eligió «con mi cara»
  personaje_img TEXT,                        -- ruta en estudio-avatar de la imagen canónica
  personaje_estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (personaje_estado IN ('pendiente', 'generando', 'lista', 'error')),
  personaje_intentos INTEGER NOT NULL DEFAULT 0,
  credit_tx_id UUID,
  reembolsado BOOLEAN NOT NULL DEFAULT false,
  costo_usd NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ah_proyectos_user_idx ON public.ah_proyectos (user_id, created_at DESC);
ALTER TABLE public.ah_proyectos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ah_proyectos_select_own ON public.ah_proyectos;
CREATE POLICY ah_proyectos_select_own ON public.ah_proyectos FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE TABLE IF NOT EXISTS public.ah_escenas (
  proyecto_id UUID NOT NULL REFERENCES public.ah_proyectos(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL CHECK (idx >= 0 AND idx < 12),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  datos JSONB NOT NULL,                      -- la escena (lugar, ropa, acción, plano, luz, movimiento, voz…)
  prompt TEXT NOT NULL,                      -- prompt 6C con el que se generó la imagen actual
  imagen TEXT,                               -- ruta en estudio-avatar
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'generando', 'lista', 'error')),
  intentos INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (proyecto_id, idx)
);
ALTER TABLE public.ah_escenas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ah_escenas_select_own ON public.ah_escenas;
CREATE POLICY ah_escenas_select_own ON public.ah_escenas FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- 3) Interruptor: false = solo admins hasta que Jean lo pruebe y lo abra. Topes por persona.
INSERT INTO public.edge_limits (fn, enabled, max_hour, max_day, note) VALUES
  ('metodo-ah', true, 12, 40, 'Video IA Perfecto: storyboards y cambios (topes por persona).'),
  ('metodo-ah:open', false, NULL, NULL, 'Video IA Perfecto: false = solo admins hasta que Jean lo pruebe y lo abra.')
ON CONFLICT (fn) DO NOTHING;
