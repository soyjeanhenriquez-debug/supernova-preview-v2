-- Guardián del Creador: un proveedor sin saldo hace fallar la herramienta a TODAS las personas (25-oct-2026:
-- APIMart con US$0,027 → 3 animaciones de Reel Studio devueltas con «apimart 402»). Se detecta por los
-- reembolsos automáticos cuyo motivo es un 402 o falta de saldo, en las últimas 24 h. Recargar lo decide Jean.
DO $$ DECLARE d text; n int; BEGIN
  d := pg_get_functiondef('private.guardian_step(uuid)'::regprocedure);
  n := length(d);
  d := replace(d, $q$    SELECT count(*) INTO n FROM public.credit_transactions WHERE action = 'refund' AND created_at > now() - interval '7 days';$q$,
$q$    FOR x IN
      SELECT lower(split_part(coalesce(meta->>'reason', ''), ' ', 1)) AS prov, count(*) AS c, max(created_at) AS last
      FROM public.credit_transactions
      WHERE action = 'refund' AND created_at > now() - interval '24 hours' AND coalesce(meta->>'reason', '') ~* '(402|saldo|balance|insufficient)'
      GROUP BY 1
    LOOP
      PERFORM private.guardian_finding(p_run, 'proveedor-sin-saldo:' || x.prov, 'Proveedor de IA · ' || x.prov, 'critico', 'calidad',
        format('El proveedor «%s» se quedó sin saldo: %s generación(es) fallaron en 24 h.', x.prov, x.c),
        'Mientras no se recargue, la herramienta falla para todas las personas (se les devuelven los créditos, pero se quedan sin resultado).',
        jsonb_build_object('fallos', x.c, 'ultima', x.last, 'fuente', 'credit_transactions refund con 402 / sin saldo (24 h)'), 'observado',
        'Recargar el saldo del proveedor y poner un aviso de saldo bajo antes de que llegue a cero. Recargar lo hace Jean.', 'requiere_ok', x.c::int, x.last);
    END LOOP;
    SELECT count(*) INTO n FROM public.credit_transactions WHERE action = 'refund' AND created_at > now() - interval '7 days';$q$);
  IF length(d) = n THEN RAISE EXCEPTION 'no se encontró el paso reembolsos'; END IF;
  -- La diaria también da por resuelto un proveedor recargado.
  d := replace(d, $q$ARRAY['error:%', 'cobro-sin-resultado:%', 'reembolsos:%',$q$, $q$ARRAY['error:%', 'cobro-sin-resultado:%', 'reembolsos:%', 'proveedor-sin-saldo:%',$q$);
  EXECUTE d;
END $$;
