-- R2-20 (12-oct-2026) · PROPUESTA: tope diario del asistente de ayuda gratis. SIN APLICAR: espera
-- el OK de Jean (cambia lo que ve un usuario que pregunta mucho: después del tope el asistente le
-- dice que siga mañana).
--
-- Hoy: ai-chat llama a edge_guard(…, 'ai-chat-help', 40, 150) con el tope escrito en el código y
-- sin fila en edge_limits. Es decir, una persona puede mandar 150 preguntas gratis al día.
-- Costo medido (ai_usage, 30 días): mediana US$0,0066 por mensaje, máximo US$0,0074 (la guía del
-- asistente ocupa ~9.300 tokens de entrada en cada pregunta). Peor caso con 20.000 caracteres de
-- conversación y 2.500 de salida: ~US$0,015.
--   · Con el tope actual (150/día): hasta US$1,1 al día por persona (US$33 al mes): más que su PRO.
--   · Con este tope (25/día):        hasta US$0,19 al día (US$5,6 al mes si lo agota TODOS los días).
-- Uso real hasta hoy: la persona que más lo usó mandó 8 en un día.
--
-- edge_guard lee edge_limits y, si la fila existe, manda sobre los números del código. Los admins
-- no tienen tope. enabled = true: con false el asistente quedaría APAGADO para todos.
-- Para volver atrás: DELETE FROM public.edge_limits WHERE fn = 'ai-chat-help';

INSERT INTO public.edge_limits (fn, enabled, max_hour, max_day, note, updated_at)
VALUES ('ai-chat-help', true, 12, 25,
        'Asistente de ayuda gratis: tope por persona (R2-20, 12-oct-2026). ~US$0,007 por mensaje; 25 al día = máx. US$0,19/día.',
        now())
ON CONFLICT (fn) DO UPDATE
  SET enabled = true, max_hour = EXCLUDED.max_hour, max_day = EXCLUDED.max_day,
      note = EXCLUDED.note, updated_at = now();
