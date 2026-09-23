-- Crear producto: ChatGPT (GPT-6 Sol) como nivel para escribir ebooks. Jean guardó la llave como
-- CHATGPT_API_KEY en Supabase (product-builder la lee; OPENAI_API_KEY queda como alias).
-- Precio oficial (developers.openai.com, 23-sep-2026): US$2 entrada / US$10 salida por millón,
-- igual que Sonnet 5 → mismo precio por la regla ×5: 35 créditos por parte (peor caso ~3,4×).
-- Nace APAGADO: solo un admin puede escribir con él para probarlo; luego enabled = true.

insert into public.ai_model_prices (model, input_per_m, output_per_m, per_image)
values ('gpt-6-sol', 2.00, 10.00, 0)
on conflict (model) do update set input_per_m = excluded.input_per_m, output_per_m = excluded.output_per_m, updated_at = now();

insert into public.credit_prices (action, cost, label, charged_by)
values ('build_piece_gpt', 35, 'Capítulo o lección · ChatGPT', 'server')
on conflict (action) do update set cost = excluded.cost, label = excluded.label, charged_by = excluded.charged_by, updated_at = now();

insert into public.ai_builder_models
  (slug, provider, model_id, label, hint, benefits, tier, piece_action, enabled, allows_profanity,
   is_outline_model, effort, max_output_tokens, timeout_ms, sort_order, note)
values
  ('chatgpt', 'openai', 'gpt-6-sol', 'Premium · ChatGPT', 'La IA de ChatGPT',
   array['Texto claro y bien ordenado', 'Otra voz para comparar con Premium'],
   'premium', 'build_piece_gpt', false, false, false, 'low', 8000, 110000, 25,
   'Requiere CHATGPT_API_KEY (u OPENAI_API_KEY). Si OpenAI retira el modelo, cambiar model_id aquí.')
on conflict (slug) do update set
  provider = excluded.provider, model_id = excluded.model_id, label = excluded.label, hint = excluded.hint,
  benefits = excluded.benefits, tier = excluded.tier, piece_action = excluded.piece_action,
  effort = excluded.effort, max_output_tokens = excluded.max_output_tokens, timeout_ms = excluded.timeout_ms,
  sort_order = excluded.sort_order, note = excluded.note;
