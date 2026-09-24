-- Rendimiento de RLS (aviso auth_rls_initplan del asesor de Supabase): en 60 políticas,
-- auth.uid() / auth.jwt() / auth.role() se evaluaban UNA VEZ POR FILA. Envueltas en
-- (SELECT auth.uid()) Postgres las calcula una vez por consulta. No cambia quién ve qué:
-- misma expresión, solo evaluada antes. Idempotente: lo ya envuelto no se toca.
DO $$
DECLARE
  p RECORD;
  v_using TEXT;
  v_check TEXT;
  v_sql   TEXT;
  n       INT := 0;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
                         '\(\s*SELECT\s+auth\.(uid|jwt|role)\(\)[^)]*\)', '', 'gi') ~ 'auth\.(uid|jwt|role)\(\)'
  LOOP
    v_using := p.qual;
    v_check := p.with_check;
    IF v_using IS NOT NULL THEN
      -- 1) proteger lo ya envuelto, 2) envolver el resto, 3) restaurar
      v_using := regexp_replace(v_using, '\(\s*SELECT\s+auth\.(uid|jwt|role)\(\)\s+AS\s+(\w+)\)', '@@WRAP_\1_\2@@', 'gi');
      v_using := regexp_replace(v_using, 'auth\.(uid|jwt|role)\(\)', '(SELECT auth.\1())', 'g');
      v_using := regexp_replace(v_using, '@@WRAP_(uid|jwt|role)_(\w+)@@', '(SELECT auth.\1() AS \2)', 'g');
    END IF;
    IF v_check IS NOT NULL THEN
      v_check := regexp_replace(v_check, '\(\s*SELECT\s+auth\.(uid|jwt|role)\(\)\s+AS\s+(\w+)\)', '@@WRAP_\1_\2@@', 'gi');
      v_check := regexp_replace(v_check, 'auth\.(uid|jwt|role)\(\)', '(SELECT auth.\1())', 'g');
      v_check := regexp_replace(v_check, '@@WRAP_(uid|jwt|role)_(\w+)@@', '(SELECT auth.\1() AS \2)', 'g');
    END IF;

    v_sql := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF v_using IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', v_using); END IF;
    IF v_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', v_check); END IF;
    EXECUTE v_sql;
    n := n + 1;
  END LOOP;

  RAISE NOTICE 'Políticas actualizadas: %', n;

  -- Comprobación: no debe quedar ninguna sin envolver.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
                         '\(\s*SELECT\s+auth\.(uid|jwt|role)\(\)[^)]*\)', '', 'gi') ~ 'auth\.(uid|jwt|role)\(\)'
  ) THEN
    RAISE EXCEPTION 'Quedaron políticas con auth.*() sin envolver';
  END IF;
END $$;

-- Índice duplicado (aviso duplicate_index): system_config_key_key (restricción UNIQUE) ya cubre la clave.
DROP INDEX IF EXISTS public.system_config_key_uidx;
