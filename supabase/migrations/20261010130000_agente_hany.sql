-- Agente Hany (10-oct-2026, pedido de Jean): una probadora sintética que usa SUPERNOVA en producción
-- como lo haría una experta en direct response de infoproductos, prueba cada función dos veces y
-- deja aquí lo que pasó y todas sus objeciones. Solo lo lee un admin.
CREATE TABLE IF NOT EXISTS public.qa_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent text NOT NULL DEFAULT 'hany',
  step text NOT NULL,                 -- qué probó (ej. "recovery-sequence")
  attempt int NOT NULL DEFAULT 1,     -- 1 o 2: cada prueba se repite para confirmar
  ok boolean NOT NULL,
  status int,
  ms int,
  charged int,                        -- créditos cobrados (0 en prueba gratis de probador)
  summary text,                       -- qué devolvió, resumido (sin datos personales)
  objections jsonb,                   -- lo que Hany, como clienta, le reprocha a esta función
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qa_agent_runs_created ON public.qa_agent_runs (created_at DESC);
ALTER TABLE public.qa_agent_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "qa_agent_runs_admin" ON public.qa_agent_runs;
CREATE POLICY "qa_agent_runs_admin" ON public.qa_agent_runs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'));

-- La cuenta del agente es probadora: usa todo gratis hasta US$1,50 de costo real y después debe
-- recargar, igual que la Hany real. Así el agente también prueba esa regla.
INSERT INTO public.approved_emails (email, full_name, notes, is_active, tester)
VALUES ('hany.agente@supernova.jeanhenriquez.com', 'Hany (agente)', 'Agente probador automático (10-oct-2026). No es una persona.', true, true)
ON CONFLICT DO NOTHING;

-- El cashback sirve para los packs de US$100 y US$250: la etiqueta no nombra uno solo.
CREATE OR REPLACE FUNCTION public.grant_due_cashback()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN SELECT * FROM public.credit_cashback WHERE granted_at IS NULL FOR UPDATE SKIP LOCKED LOOP
    IF private.cashback_spent(r.user_id, r.starts_at) >= r.spend_target THEN
      UPDATE public.user_credits SET balance = balance + r.amount, updated_at = now() WHERE user_id = r.user_id;
      INSERT INTO public.credit_transactions (user_id, action, label, cost, meta)
      VALUES (r.user_id, 'cashback', 'Cashback de tu pack', 0, jsonb_build_object('granted', r.amount, 'cashback_id', r.id));
      UPDATE public.credit_cashback SET granted_at = now() WHERE id = r.id;
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.grant_due_cashback() FROM PUBLIC, anon, authenticated;
