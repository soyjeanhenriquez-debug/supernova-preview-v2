-- Guardián del Creador: el paso «indicadores» usaba el alias r, que choca con la variable r de la función,
-- y los fallos de tareas del pipeline de datos quedan siempre como «necesita el OK de Jean».
-- (En un repo nuevo no hace nada: la migración anterior ya trae el arreglo.)
DO $$ DECLARE d text; BEGIN
  d := pg_get_functiondef('private.guardian_step(uuid)'::regprocedure);
  d := replace(d, 'public.credit_transactions r WHERE r.action = ''refund'' AND r.created_at', 'public.credit_transactions rf WHERE rf.action = ''refund'' AND rf.created_at');
  d := replace(d, 'AND r.meta->>''refund_of'' IN', 'AND rf.meta->>''refund_of'' IN');
  d := replace(d, '        ''Leer el mensaje, corregir la función y volver a correrla.'', ''autonoma'', x.fails::int, x.last);', '        CASE WHEN x.jobname ~ ''(offer|seed|rotate|enrich|score|radar|curate|hooks|kit|market)'' THEN ''Leer el mensaje y revisar la función en un Postgres local. Es el pipeline de datos: necesita el OK de Jean.''
             ELSE ''Leer el mensaje, corregir la función y volver a correrla.'' END,
        CASE WHEN x.jobname ~ ''(offer|seed|rotate|enrich|score|radar|curate|hooks|kit|market)'' THEN ''requiere_ok'' ELSE ''autonoma'' END, x.fails::int, x.last);');
  EXECUTE d;
END $$;
