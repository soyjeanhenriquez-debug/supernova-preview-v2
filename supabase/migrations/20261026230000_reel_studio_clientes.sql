-- Reel Studio abierto a clientes (26-oct-2026, decisiones de Jean en la sesión):
--  · Toma con labios (Kling AI Avatar en fal, US$0,0562/s) a costo × 6: hasta 6 s = 255, hasta 12 s = 510.
--  · Voz ElevenLabs a costo × 6 con US$0,00022 por carácter (el más alto de los planes de pago; Jean tiene 300.000
--    caracteres al mes, ≈ 460 reels de 40 s entre todos):
--    hasta 600 caracteres = 99, hasta 1.200 = 198. Solo voces de la biblioteca de ElevenLabs (nunca la voz de Jean).
--  · Analizar la referencia reutiliza reel_analyze (25), el mismo precio de Analiza un Reel.
-- El cobro lo hace reel-ia con edge_guard_charge ANTES de gastar y devuelve con refund_charge si falla.
-- Crédito más barato ~US$0,008: 255 → 6,0× · 510 → 6,0× · 99 → 6,0× · 198 → 6,0×.

INSERT INTO public.credit_prices (action, cost, label, charged_by, real_cost_usd) VALUES
  ('reel_lip_6',    255, 'Reel Studio · toma hablando hasta 6 s',   'server', 0.3372),
  ('reel_lip_12',   510, 'Reel Studio · toma hablando hasta 12 s',  'server', 0.6744),
  ('reel_voz_600',  99,  'Reel Studio · voz hasta 600 caracteres',  'server', 0.132),
  ('reel_voz_1200', 198, 'Reel Studio · voz hasta 1.200 caracteres', 'server', 0.264)
ON CONFLICT (action) DO UPDATE SET cost = EXCLUDED.cost, label = EXCLUDED.label, real_cost_usd = EXCLUDED.real_cost_usd, updated_at = now();

-- De quién es cada toma con labios (request_id de fal) y con qué cobro, para que cada persona solo pueda ver
-- las suyas y para devolver los créditos UNA vez si fal la marca como fallida. Primer paso del manifiesto por
-- escenas. Solo la usa el servidor (service_role): RLS encendido y sin políticas.
CREATE TABLE IF NOT EXISTS public.reel_ia_tomas (
  request_id  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tx_id       uuid,
  seconds     numeric(5,2) NOT NULL,
  action      text NOT NULL,
  status      text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  refunded_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reel_ia_tomas_user_idx ON public.reel_ia_tomas (user_id, created_at DESC);
ALTER TABLE public.reel_ia_tomas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reel_ia_tomas FROM anon, authenticated;
