-- "Crear producto": ChatGPT Astra como opción Máximo (decisión de Jean, 25-sep-2026).
--
-- Precios oficiales de OpenAI (developers.openai.com/api/docs/pricing, 25-sep-2026), por 1M tokens:
--   gpt-6-astra  entrada US$10  · salida US$50 (el razonamiento se cobra como salida)
--   gpt-6-sol    entrada US$2   · salida US$10 (ya estaba: Premium · ChatGPT, 35 créditos)
--
-- Costo real de un capítulo con Astra (esfuerzo "low"): entrada ~2 000 tokens + salida ~3 200
-- (texto ~2 400 + razonamiento) ≈ US$0,18. Peor caso con el tope de 6 000 tokens de salida ≈ US$0,33.
-- Regla de precios (costo × 5 con el crédito más barato, US$0,008; piso 3× en el peor caso):
--   0,18 × 5 = 0,90 → 113 créditos · 0,33 × 3 = 0,98 → 122 créditos  ⇒ 125 créditos por capítulo.
-- Un ebook normal (7 capítulos + 2 bonos) con Astra ≈ 1 125 créditos; con Estándar ≈ 135; con Sol ≈ 315.
--
-- Queda APAGADA (enabled = false): la cuenta de OpenAI se quedó sin saldo el 23-sep (la prueba de
-- gpt-6-sol devolvió 429 "You have no credits remaining"). Con enabled = false solo un admin puede
-- escribir con ella para probarla; se enciende cuando Jean recargue OpenAI y la prueba salga bien.
-- OJO: Gemini 3.8 Flash duplica su precio el 1-ene-2027 (0,75/3,75 → 1,50/7,50): revisar build_piece_std.

insert into public.ai_model_prices (model, input_per_m, output_per_m)
values ('gpt-6-astra', 10.00, 50.00)
on conflict (model) do update set input_per_m = excluded.input_per_m, output_per_m = excluded.output_per_m;

insert into public.credit_prices (action, cost, label, charged_by)
values ('build_piece_astra', 125, 'Capítulo o lección · ChatGPT Astra', 'server')
on conflict (action) do update set cost = excluded.cost, label = excluded.label, charged_by = excluded.charged_by;

insert into public.ai_builder_models
  (slug, provider, model_id, label, hint, benefits, tier, piece_action, enabled, allows_profanity,
   is_outline_model, effort, max_output_tokens, timeout_ms, sort_order, note)
values
  ('astra', 'openai', 'gpt-6-astra', 'Máximo · ChatGPT Astra', 'El ChatGPT más avanzado',
   array['La redacción más pulida de ChatGPT', 'Mejor para temas complejos o técnicos', 'Sin pagar ChatGPT Plus aparte'],
   'maximo', 'build_piece_astra', false, false, false, 'low', 6000, 115000, 27,
   'Requiere CHATGPT_API_KEY (u OPENAI_API_KEY) con saldo. Tope de 6000 tokens: sube el precio si se sube el tope.')
on conflict (slug) do nothing;
