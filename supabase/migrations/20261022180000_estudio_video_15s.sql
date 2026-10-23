-- Estudio de video unificado (22-oct-2026, decisión de Jean tras la prueba de Cindy en "Anuncio en video").
-- Propuesta: docs/propuestas/2026-10-22-estudio-video-unificado.md
--
-- 1) Videos de 15 s donde el proveedor lo acepta (docs leídas el 22-oct-2026): Seedance 2.0 Mini (APIMart, 4–15 s),
--    Grok (6–15 s), Wan 3.0 (Higgsfield, 2–30 s), Kling 3.0 (3–15 s), Seedance 2.0 (4–15 s). Omni (4/6/8/10) y
--    Kling 2.5 (5|10) no tienen 15 s. Precio = ceil(costo × 6 / 0,008), igual que creditsFor() del módulo
--    compartido (lo revisa src/lib/avatarStudio.test.ts).
INSERT INTO public.credit_prices (action, cost, label, charged_by, real_cost_usd) VALUES
  ('av_vid_grok_15',    216,  'Estudio de video · 15 s (Grok)',          'server', 0.2868),
  ('av_vid_smini_15',   266,  'Estudio de video · 15 s (Seedance Mini)', 'server', 0.354),
  ('av_vid_wan30_15',   563,  'Estudio de video · 15 s (Wan 3.0)',       'server', 0.75),
  ('av_vid_kling30_15', 945,  'Estudio de video · 15 s (Kling 3.0)',     'server', 1.26),
  ('av_vid_seed20_15',  1587, 'Estudio de video · 15 s (Seedance 2.0)',  'server', 2.115)
ON CONFLICT (action) DO UPDATE SET cost = EXCLUDED.cost, label = EXCLUDED.label, real_cost_usd = EXCLUDED.real_cost_usd, updated_at = now();

-- 2) Clip y Serie (función video-studio, Seedance 2.0 Mini) suben a costo × 6 como todo lo demás (decisión de
--    Jean, 22-oct-2026). Costo por segundo 0,0236 (real_cost de vid_mini_5), el mismo que av_vid_smini_*:
--    5 s 75 → 89 · 10 s 150 → 177.
UPDATE public.credit_prices SET cost = 89,  real_cost_usd = 0.118, updated_at = now() WHERE action = 'vid_mini_5';
UPDATE public.credit_prices SET cost = 177, real_cost_usd = 0.236, updated_at = now() WHERE action = 'vid_mini_10';

-- Los interruptores avatar-studio:open y avatar-studio:higgsfield NO se tocan aquí: se abren a clientes
-- después de la primera prueba real de Jean con su cuenta de admin (manual: nada se da por bueno sin probarlo).
