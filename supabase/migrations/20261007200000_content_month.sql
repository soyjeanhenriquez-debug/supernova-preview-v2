-- "Tu mes de contenido" (07-oct-2026, decisión de Jean: 50 créditos por mes armado).
-- Respuesta a Máquina IA (Nino Director, "tu contenido de 30 días en automático"): con lo que ya
-- sabemos del producto (sin preguntar de más) la edge function content-month arma hasta 30 días de
-- piezas para Instagram y TikTok y las guarda en content_items. Pensado también para marca personal.
--
-- Costo real estimado: ~8.000 tokens de entrada + ~9.000 de salida en gemini-3-flash-preview
-- ≈ US$0,03. 50 créditos × US$0,008 (crédito más barato) = US$0,40 ≈ 13× el costo.

-- Lo que trae cada día además del gancho (title) y el tema (topic):
--   brief    = qué decir, en 2 o 3 puntos (o qué va en cada lámina del carrusel)
--   cta      = llamado a la acción del final
--   plan_id  = el mes al que pertenece (para borrarlo de una vez si no le gusta)
alter table public.content_items
  add column if not exists brief text check (char_length(brief) <= 700),
  add column if not exists cta text check (char_length(cta) <= 200),
  add column if not exists plan_id uuid;

create index if not exists content_items_plan on public.content_items (plan_id) where plan_id is not null;

insert into public.credit_prices (action, cost, label, charged_by) values
  ('content_month', 50, 'Tu mes de contenido (hasta 30 días)', 'server')
on conflict (action) do update set cost = excluded.cost, label = excluded.label, updated_at = now();

-- El costo del modelo (gemini-3-flash-preview) ya está en ai_model_prices.
