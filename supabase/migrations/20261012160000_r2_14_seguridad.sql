-- R2-14 (12-oct-2026) · Auditoría de seguridad: que nadie pueda robar créditos, acceso ni datos.
-- SIN APLICAR: la aplica Jean o quien él diga. Detalle en docs/agentes/2026-10-12-r2-14-seguridad.md.
--
-- Qué hace (5 bloques independientes; si uno molesta, se quita solo ese):
--   1) Reembolso de un pack en Whop → se retiran los créditos COMPRADOS que aún queden (hasta el
--      tamaño del pack) y se anula su cashback pendiente. Hoy un pack reembolsado deja todo.
--      Lo llama whop-webhook (versión de R2-14). Solo service_role.
--   2) credit_prices.real_cost_usd y media_models.cost_usd / endpoint / input dejan de ser legibles
--      para cualquier usuario registrado (manual: al cliente nunca dólares). La app solo lee
--      action,cost y las columnas de catálogo; las funciones del servidor no cambian.
--   3) Subir archivos a Storage (creativos, personajes, misiones) exige acceso vigente: una cuenta
--      recién registrada, sin pagar, ya no puede llenar el Storage del plan gratis.
--   4) products_enforce_limit() es función de trigger: fuera EXECUTE para anon/authenticated
--      (advisor 0028; el trigger sigue funcionando: el permiso solo se mira al crear el trigger).
--   5) Rendimiento (advisor 0003): 4 políticas con auth.uid() por fila → (select auth.uid()).
--
-- Cómo verificar después de aplicar (liviano, sin tocar winning_ads):
--   select has_function_privilege('authenticated','public.revoke_pack_credits(uuid,integer,text,text)','EXECUTE'); -- false
--   select has_column_privilege('authenticated','public.credit_prices','real_cost_usd','SELECT');                -- false
--   select has_column_privilege('authenticated','public.credit_prices','cost','SELECT');                         -- true
--   y abrir Video con IA / Influencer IA: los precios se siguen viendo.

-- ── 1) Retirar créditos de un pack reembolsado ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_pack_credits(p_user_id uuid, p_amount integer, p_label text DEFAULT 'Reembolso de pack', p_cashback_source text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_purchased int; v_take int; v_balance int; v_cb int := 0;
BEGIN
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Monto inválido');
  END IF;
  SELECT purchased INTO v_purchased FROM public.user_credits WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', true, 'revoked', 0); END IF;
  -- Solo lo comprado que queda (lo ya gastado no se cobra; los créditos del mes no se tocan).
  v_take := least(p_amount, greatest(coalesce(v_purchased, 0), 0));
  UPDATE public.user_credits SET balance = balance - v_take, purchased = purchased - v_take, updated_at = now()
   WHERE user_id = p_user_id RETURNING balance INTO v_balance;
  -- Mismo estilo que la recarga (cost 0 + meta.granted): cost 0 + meta.revoked, así no cuenta como
  -- "gasto" para otros cashback ni se puede "reembolsar" con refund_charge.
  INSERT INTO public.credit_transactions (user_id, action, label, cost, meta)
  VALUES (p_user_id, 'pack_refund', left(coalesce(p_label, 'Reembolso de pack'), 120), 0,
          jsonb_build_object('revoked', v_take, 'pack_credits', p_amount));
  -- El cashback de ese pack todavía no entregado se anula (era un regalo por gastar el pack).
  IF p_cashback_source IS NOT NULL THEN
    DELETE FROM public.credit_cashback WHERE source = p_cashback_source AND granted_at IS NULL;
    GET DIAGNOSTICS v_cb = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('success', true, 'revoked', v_take, 'balance', v_balance, 'cashback_canceled', v_cb);
END $$;

CREATE OR REPLACE FUNCTION public.revoke_media_pack_credits(p_user_id uuid, p_amount integer, p_label text DEFAULT 'Reembolso de pack', p_cashback_source text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_bal int; v_take int;
BEGIN
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Monto inválido');
  END IF;
  SELECT balance INTO v_bal FROM public.user_media_credits WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', true, 'revoked', 0); END IF;
  v_take := least(p_amount, greatest(coalesce(v_bal, 0), 0));
  UPDATE public.user_media_credits SET balance = balance - v_take, updated_at = now() WHERE user_id = p_user_id;
  INSERT INTO public.credit_transactions (user_id, action, label, cost, meta)
  VALUES (p_user_id, 'media_pack_refund', left(coalesce(p_label, 'Reembolso de pack'), 120), 0,
          jsonb_build_object('revoked_media', v_take, 'pack_credits', p_amount));
  RETURN jsonb_build_object('success', true, 'revoked', v_take, 'balance', v_bal - v_take);
END $$;

REVOKE ALL ON FUNCTION public.revoke_pack_credits(uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_media_pack_credits(uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_pack_credits(uuid, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_media_pack_credits(uuid, integer, text, text) TO service_role;

-- ── 2) Costos en dólares fuera del alcance del cliente ──────────────────────────────────────
-- Privilegio por columna: el cliente conserva lo que la app pide hoy
--   src/lib/media.ts: media_models(id,kind,grp,label,description,tier,action,seconds,status,recommended,sort)
--                     credit_prices(action,cost) · src/hooks/useProductBuilds.ts: credit_prices(action,cost)
-- Ojo: un select("*") desde el navegador sobre estas dos tablas daría "permission denied".
REVOKE SELECT ON public.credit_prices FROM anon, authenticated;
GRANT SELECT (action, cost, label, charged_by, updated_at) ON public.credit_prices TO authenticated;

REVOKE SELECT ON public.media_models FROM anon, authenticated;
GRANT SELECT (id, kind, grp, label, description, image_field, tier, action, seconds, status, recommended, sort, updated_at)
  ON public.media_models TO authenticated;

-- ── 3) Storage: subir exige acceso vigente ───────────────────────────────────────────────────
DROP POLICY IF EXISTS creativos_insert_own ON storage.objects;
CREATE POLICY creativos_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'creativos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
              AND (SELECT public.has_access()));

DROP POLICY IF EXISTS personajes_insert_own ON storage.objects;
CREATE POLICY personajes_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'personajes' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
              AND (SELECT public.has_access()));

DROP POLICY IF EXISTS misiones_insert_own ON storage.objects;
CREATE POLICY misiones_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'misiones' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
              AND (SELECT public.has_access()));

-- ── 4) Función de trigger sin EXECUTE público ────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.products_enforce_limit() FROM PUBLIC, anon, authenticated;

-- ── 5) Rendimiento de RLS: auth.uid() una vez por consulta, no por fila ─────────────────────
DROP POLICY IF EXISTS video_jobs_select_own ON public.video_jobs;
CREATE POLICY video_jobs_select_own ON public.video_jobs FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS video_reservations_select_own ON public.video_reservations;
CREATE POLICY video_reservations_select_own ON public.video_reservations FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS credit_cashback_own ON public.credit_cashback;
CREATE POLICY credit_cashback_own ON public.credit_cashback FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS qa_agent_runs_admin ON public.qa_agent_runs;
CREATE POLICY qa_agent_runs_admin ON public.qa_agent_runs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = (SELECT auth.uid()) AND r.role = 'admin'::public.app_role));
