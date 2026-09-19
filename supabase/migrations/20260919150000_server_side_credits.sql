-- Créditos cobrados EN EL SERVIDOR.
--
-- Hasta hoy el navegador llamaba consume_credits(p_amount, …) con el monto que
-- él mismo decidía, y LUEGO llamaba a la función de IA. Un usuario de pago podía
-- (a) llamar a la función directo sin descontar nada, o (b) pagar 1 crédito por
-- una acción de 50. Además, si la IA fallaba, el crédito ya estaba gastado.
--
-- Ahora:
--   · credit_prices es la lista de precios (el servidor decide cuánto cuesta).
--   · Las edge functions cobran con edge_guard_charge() ANTES de gastar dinero
--     real y devuelven el crédito con refund_charge() si la IA falla.
--   · Un cobro es también un RECIBO: los pasos siguientes de un mismo flujo
--     (Mi App: blueprint → mega-prompt → guion de venta) lo presentan y no se
--     vuelven a cobrar; tampoco un "Reintentar".
--   · consume_credits() (lo único que el navegador puede llamar) ignora el
--     monto del cliente y solo sirve para acciones sin costo real para nosotros.

-- ═════════════════════════════════════════════════════════════════════
-- 1. Lista de precios
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.credit_prices (
  action TEXT PRIMARY KEY,
  cost INTEGER NOT NULL CHECK (cost >= 0),
  label TEXT NOT NULL,
  -- server: lo cobra una edge function · rpc: lo cobra un RPC SQL (seguir
  -- oferta, desbloquear kit) · client: acción sin costo real, la cobra el
  -- navegador vía consume_credits() al precio de ESTA tabla.
  charged_by TEXT NOT NULL DEFAULT 'server' CHECK (charged_by IN ('server', 'rpc', 'client')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS credit_prices_select ON public.credit_prices;
CREATE POLICY credit_prices_select ON public.credit_prices
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS credit_prices_admin_all ON public.credit_prices;
CREATE POLICY credit_prices_admin_all ON public.credit_prices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE ALL ON public.credit_prices FROM anon;

-- Mismos precios que CREDIT_COSTS en src/hooks/useCredits.ts (cambiar ambos).
INSERT INTO public.credit_prices (action, cost, label, charged_by) VALUES
  ('gen_master_prompt',    50, 'Mega-Prompt Replicador',            'server'),
  ('gen_ad_copies',        15, '10 variaciones de ad copy',         'server'),
  ('gen_landing',          40, 'Generar landing page',              'server'),
  ('gen_avatar',           15, 'Avatar del comprador',              'server'),
  ('gen_funnel',           50, 'Funnel completo VSL+emails',        'server'),
  ('sofisticar',           15, 'Sofisticar oferta',                 'server'),
  ('adaptar',               5, 'Adaptar anuncio al mercado',        'server'),
  ('blueprint',            25, 'Blueprint completo',                'server'),
  ('gen_ad_image',         25, 'Creativo de anuncio (imagen IA)',   'server'),
  ('landing_intelligence', 50, 'Oráculo completo (IA)',             'server'),
  ('pillar_assist',        10, 'Asistente IA de Pilar',             'server'),
  ('pain_discovery',       15, 'Pain Discovery',                    'server'),
  ('gen_light',            15, 'Generador',                         'server'),
  ('gen_medium',           30, 'Generador',                         'server'),
  ('gen_heavy',            75, 'Generador',                         'server'),
  ('follow_offer',          5, 'Seguir oferta (Cazador de ROI)',    'rpc'),
  ('unlock_kit',          150, 'Desbloquear Mini App Rentable',     'rpc'),
  ('search_ads',            5, 'Búsqueda de anuncios',              'client'),
  ('analyze_url',           5, 'Analizar URL básico',               'client'),
  ('chat_message',          2, 'Consulta IA (por mensaje)',         'client'),
  ('ai_intel',              5, 'Análisis IA del ad',                'client')
ON CONFLICT (action) DO UPDATE
  SET cost = EXCLUDED.cost, label = EXCLUDED.label, charged_by = EXCLUDED.charged_by, updated_at = now();

-- ═════════════════════════════════════════════════════════════════════
-- 2. El único sitio que descuenta saldo. Vive en `private` (la API REST no lo
--    expone): recibe user_id y monto, así que jamás debe ser alcanzable por un
--    cliente. Lo usan los RPC y edge_guard_charge().
-- ═════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION private.debit_credits(p_user_id uuid, p_amount integer, p_action text, p_label text, p_meta jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance INT;
  v_tx UUID;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'No autenticado'); END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Monto inválido'); END IF;
  INSERT INTO public.user_credits (user_id, balance) VALUES (p_user_id, 2000) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_balance FROM public.user_credits WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente', 'balance', v_balance, 'cost', p_amount);
  END IF;
  UPDATE public.user_credits SET balance = balance - p_amount, updated_at = now() WHERE user_id = p_user_id;
  INSERT INTO public.credit_transactions (user_id, action, cost, label, meta)
  VALUES (p_user_id, p_action, p_amount, p_label, coalesce(p_meta, '{}'::jsonb))
  RETURNING id INTO v_tx;
  RETURN jsonb_build_object('success', true, 'balance', v_balance - p_amount, 'tx_id', v_tx, 'cost', p_amount);
END;
$$;
REVOKE ALL ON FUNCTION private.debit_credits(uuid, integer, text, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════
-- 3. consume_credits(): lo que puede llamar el navegador. Se conserva la firma,
--    pero p_amount ya no decide nada: el precio sale de credit_prices, y las
--    acciones que cobra el servidor se rechazan (un cliente viejo no cobra doble).
-- ═════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.consume_credits(p_amount integer, p_action text, p_label text DEFAULT NULL::text, p_meta jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_price RECORD;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'No autenticado'); END IF;
  SELECT cost, label, charged_by INTO v_price FROM public.credit_prices WHERE action = p_action;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acción desconocida');
  END IF;
  IF v_price.charged_by <> 'client' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta acción se cobra en el servidor', 'server_side', true);
  END IF;
  RETURN private.debit_credits(v_uid, v_price.cost, p_action, coalesce(nullif(left(p_label, 120), ''), v_price.label),
                               CASE WHEN jsonb_typeof(p_meta) = 'object' AND length(p_meta::text) <= 2000 THEN p_meta ELSE '{}'::jsonb END);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_credits(integer, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_credits(integer, text, text, jsonb) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════
-- 4. Los dos RPC que ya cobraban en el servidor pasan a private.debit_credits
--    (antes llamaban a consume_credits con un monto explícito).
-- ═════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.follow_offer(p_offer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_res JSONB;
  v_name TEXT;
  v_cost INT;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'No autenticado'); END IF;
  IF NOT public.has_access() THEN RETURN jsonb_build_object('success', false, 'error', 'Sin acceso activo'); END IF;
  -- Candado por usuario antes de mirar si ya la sigue: dos clics no cobran dos veces.
  PERFORM 1 FROM public.user_credits WHERE user_id = v_uid FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.offer_follows WHERE user_id = v_uid AND offer_id = p_offer_id) THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;
  SELECT coalesce(product_name, page_name, 'Oferta') INTO v_name FROM public.offers WHERE id = p_offer_id AND excluded_reason IS NULL;
  IF v_name IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Oferta no encontrada'); END IF;
  SELECT cost INTO v_cost FROM public.credit_prices WHERE action = 'follow_offer';
  v_res := private.debit_credits(v_uid, coalesce(v_cost, 5), 'follow_offer', 'Seguir oferta · ' || left(v_name, 40), jsonb_build_object('offer_id', p_offer_id));
  IF coalesce((v_res->>'success')::boolean, false) = false THEN RETURN v_res; END IF;
  INSERT INTO public.offer_follows (user_id, offer_id) VALUES (v_uid, p_offer_id) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('success', true, 'balance', v_res->'balance', 'cost', v_res->'cost');
END;
$$;
REVOKE ALL ON FUNCTION public.follow_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.follow_offer(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unlock_kit(p_kit_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_kit RECORD;
  v_res JSONB;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'No autenticado'); END IF;
  IF NOT public.has_access() THEN RETURN jsonb_build_object('success', false, 'error', 'Sin acceso activo'); END IF;
  SELECT id, title, price_credits INTO v_kit FROM public.mini_app_kits WHERE id = p_kit_id AND status = 'published';
  IF v_kit.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Kit no encontrado'); END IF;
  PERFORM 1 FROM public.user_credits WHERE user_id = v_uid FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.kit_unlocks WHERE user_id = v_uid AND kit_id = p_kit_id) THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;
  -- El precio es el del kit (cada kit puede valer distinto), no el de la lista.
  v_res := private.debit_credits(v_uid, v_kit.price_credits, 'unlock_kit', 'Mini App · ' || left(v_kit.title, 40), jsonb_build_object('kit_id', p_kit_id));
  IF coalesce((v_res->>'success')::boolean, false) = false THEN RETURN v_res; END IF;
  INSERT INTO public.kit_unlocks (user_id, kit_id) VALUES (v_uid, p_kit_id) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('success', true, 'balance', v_res->'balance');
END;
$$;
REVOKE ALL ON FUNCTION public.unlock_kit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_kit(uuid) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════
-- 5. Topes por función ajustables desde la base (sin redesplegar) y apagado de
--    emergencia por función. Si no hay fila, mandan los topes que trae el código.
-- ═════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.edge_limits (
  fn TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  max_hour INTEGER CHECK (max_hour IS NULL OR max_hour >= 0),
  max_day INTEGER CHECK (max_day IS NULL OR max_day >= 0),
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.edge_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS edge_limits_admin_all ON public.edge_limits;
CREATE POLICY edge_limits_admin_all ON public.edge_limits
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE ALL ON public.edge_limits FROM anon;

-- Tres funciones que la app NO usa hoy pero gastan Gemini/Firecrawl por llamada:
-- apagadas hasta que una pantalla las necesite (y entonces, con su precio).
INSERT INTO public.edge_limits (fn, enabled, note) VALUES
  ('spy-analyze',   false, 'Sin pantalla que la use. Encender junto con su precio en credit_prices.'),
  ('analyze-ad',    false, 'Sin pantalla que la use. Encender junto con su precio en credit_prices.'),
  ('tiktok-search', false, 'Sin pantalla que la use. Encender junto con su precio en credit_prices.')
ON CONFLICT (fn) DO NOTHING;

CREATE OR REPLACE FUNCTION public.edge_guard(p_user_id uuid, p_fn text, p_max_hour integer, p_max_day integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hour INT;
  v_day INT;
  v_admin BOOLEAN;
  v_lim RECORD;
  v_max_hour INT := p_max_hour;
  v_max_day INT := p_max_day;
BEGIN
  IF p_user_id IS NULL OR p_fn IS NULL OR NOT public.user_has_access(p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_access');
  END IF;
  SELECT enabled, max_hour, max_day INTO v_lim FROM public.edge_limits WHERE fn = p_fn;
  IF FOUND THEN
    IF NOT v_lim.enabled THEN RETURN jsonb_build_object('ok', false, 'reason', 'disabled'); END IF;
    v_max_hour := coalesce(v_lim.max_hour, p_max_hour);
    v_max_day := coalesce(v_lim.max_day, p_max_day);
  END IF;
  v_admin := EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'admin'::app_role);
  -- Un candado por usuario+función: dos llamadas simultáneas no se cuelan juntas bajo el tope.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_fn, 0));
  SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour'), count(*)
    INTO v_hour, v_day
  FROM public.edge_usage
  WHERE user_id = p_user_id AND fn = p_fn AND created_at > now() - interval '24 hours';
  IF NOT v_admin AND (v_hour >= v_max_hour OR v_day >= v_max_day) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited', 'hour', v_hour, 'day', v_day);
  END IF;
  INSERT INTO public.edge_usage (user_id, fn) VALUES (p_user_id, left(p_fn, 60));
  RETURN jsonb_build_object('ok', true, 'hour', v_hour + 1, 'day', v_day + 1);
END;
$$;
REVOKE ALL ON FUNCTION public.edge_guard(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edge_guard(uuid, text, integer, integer) TO service_role;

-- ═════════════════════════════════════════════════════════════════════
-- 6. Compuerta + cobro en UNA llamada (la usan las edge functions).
--    p_action NULL  → función gratuita: solo acceso y tope.
--    p_receipt      → id de un cobro previo del mismo usuario. Si ese cobro
--                     cubre este paso (p_kind), no se cobra de nuevo.
--    Devuelve ok / reason / charged / balance / tx_id / receipt.
-- ═════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.edge_guard_charge(
  p_user_id uuid, p_fn text, p_max_hour integer, p_max_day integer,
  p_action text DEFAULT NULL, p_label text DEFAULT NULL, p_kind text DEFAULT NULL, p_receipt uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gate JSONB;
  v_price RECORD;
  v_tx RECORD;
  v_uses INT;
  v_res JSONB;
  v_balance INT;
  -- Pasos que cubre un cobro de "Mi App" (gen_master_prompt), hasta 3 veces
  -- cada uno durante 2 horas: alcanza para el flujo completo y para reintentos.
  c_mi_app_kinds CONSTANT TEXT[] := ARRAY['blueprint', 'master_prompt', 'whatsapp_script', 'vsl_prompt'];
BEGIN
  v_gate := public.edge_guard(p_user_id, p_fn, p_max_hour, p_max_day);
  IF coalesce((v_gate->>'ok')::boolean, false) = false THEN RETURN v_gate; END IF;

  IF p_action IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'charged', 0);
  END IF;

  -- ¿Trae un recibo que cubra este paso?
  IF p_receipt IS NOT NULL AND p_kind IS NOT NULL THEN
    SELECT id, action, meta INTO v_tx
    FROM public.credit_transactions
    WHERE id = p_receipt AND user_id = p_user_id AND cost > 0
      AND created_at > now() - interval '2 hours'
      AND coalesce((meta->>'refunded')::boolean, false) = false
    FOR UPDATE;
    IF FOUND AND v_tx.action = 'gen_master_prompt' AND p_kind = ANY (c_mi_app_kinds) THEN
      v_uses := coalesce((v_tx.meta->'uses'->>p_kind)::int, 0);
      IF v_uses < 3 THEN
        UPDATE public.credit_transactions
        SET meta = jsonb_set(coalesce(meta, '{}'::jsonb) || jsonb_build_object('uses', coalesce(meta->'uses', '{}'::jsonb)),
                             ARRAY['uses', p_kind], to_jsonb(v_uses + 1))
        WHERE id = v_tx.id;
        SELECT balance INTO v_balance FROM public.user_credits WHERE user_id = p_user_id;
        RETURN jsonb_build_object('ok', true, 'charged', 0, 'balance', v_balance, 'receipt', v_tx.id, 'covered', true);
      END IF;
    END IF;
  END IF;

  SELECT cost, label, charged_by INTO v_price FROM public.credit_prices WHERE action = p_action;
  IF NOT FOUND OR v_price.charged_by <> 'server' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_action');
  END IF;

  v_res := private.debit_credits(
    p_user_id, v_price.cost, p_action,
    coalesce(nullif(left(p_label, 120), ''), v_price.label),
    jsonb_build_object('fn', p_fn) || CASE WHEN p_kind IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('uses', jsonb_build_object(p_kind, 1)) END
  );
  IF coalesce((v_res->>'success')::boolean, false) = false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_credits', 'balance', v_res->'balance', 'cost', v_price.cost);
  END IF;
  RETURN jsonb_build_object('ok', true, 'charged', v_price.cost, 'balance', v_res->'balance',
                            'tx_id', v_res->'tx_id', 'receipt', v_res->'tx_id');
END;
$$;
REVOKE ALL ON FUNCTION public.edge_guard_charge(uuid, text, integer, integer, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edge_guard_charge(uuid, text, integer, integer, text, text, text, uuid) TO service_role;

-- ═════════════════════════════════════════════════════════════════════
-- 7. Reembolso cuando la IA falla. Idempotente; solo cobros de la última hora.
-- ═════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.refund_charge(p_tx_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tx RECORD;
  v_balance INT;
BEGIN
  SELECT id, user_id, action, cost, label, meta INTO v_tx
  FROM public.credit_transactions
  WHERE id = p_tx_id AND cost > 0 AND created_at > now() - interval '1 hour'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF coalesce((v_tx.meta->>'refunded')::boolean, false) THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  UPDATE public.user_credits SET balance = balance + v_tx.cost, updated_at = now()
  WHERE user_id = v_tx.user_id RETURNING balance INTO v_balance;
  UPDATE public.credit_transactions SET meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('refunded', true)
  WHERE id = v_tx.id;
  INSERT INTO public.credit_transactions (user_id, action, cost, label, meta)
  VALUES (v_tx.user_id, 'refund', -v_tx.cost, 'Reembolso · ' || coalesce(v_tx.label, v_tx.action),
          jsonb_build_object('refund_of', v_tx.id, 'reason', left(coalesce(p_reason, ''), 200)));
  RETURN jsonb_build_object('ok', true, 'refunded', v_tx.cost, 'balance', v_balance);
END;
$$;
REVOKE ALL ON FUNCTION public.refund_charge(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_charge(uuid, text) TO service_role;
