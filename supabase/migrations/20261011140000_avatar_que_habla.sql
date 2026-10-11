-- Avatar que habla (11-oct-2026, pedido de Jean tras la prueba de Hany: "PRONTO" y enlace a Higgsfield era la
-- mayor objeción). Influencer IA: el guion se vuelve voz (APIMart gpt-4o-mini-tts) y la foto del personaje +
-- esa voz se vuelven video con la boca sincronizada (fal.ai Kling AI Avatar v2 Standard, US$0,0562/s).
--
-- Precio = costo real × 5 con el crédito a US$0,008 (regla del manual), por tramo de duración:
--   hasta 15 s ≈ US$0,85 → 530 · hasta 30 s ≈ US$1,69 → 1.060 · hasta 45 s ≈ US$2,53 → 1.590.
-- Queda SOLO PARA ADMIN (edge_limits 'avatar-talk:open' = false) hasta que Jean apruebe estos precios.

-- Audios del avatar: bucket privado; los escribe y firma SOLO la función (service_role). Sin políticas de usuario.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatar-audio', 'avatar-audio', false, 5242880, ARRAY['audio/mpeg', 'audio/wav', 'audio/x-wav'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.credit_prices (action, cost, label, charged_by, real_cost_usd) VALUES
  ('avatar_talk_15', 530,  'Avatar que habla · hasta 15 s', 'server', 0.85),
  ('avatar_talk_30', 1060, 'Avatar que habla · hasta 30 s', 'server', 1.69),
  ('avatar_talk_45', 1590, 'Avatar que habla · hasta 45 s', 'server', 2.53)
ON CONFLICT (action) DO UPDATE SET cost = excluded.cost, label = excluded.label, real_cost_usd = excluded.real_cost_usd, updated_at = now();

-- Interruptor: false = solo admin (para probarlo). Para abrirlo a todos: UPDATE edge_limits SET enabled = true WHERE fn = 'avatar-talk:open';
INSERT INTO public.edge_limits (fn, enabled, note)
VALUES ('avatar-talk:open', false, 'Avatar que habla: false = solo admin hasta que Jean apruebe precios')
ON CONFLICT (fn) DO NOTHING;
