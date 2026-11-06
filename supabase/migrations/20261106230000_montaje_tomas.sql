-- «Edita tus tomas como tu referencia» (06-nov-2026, decisión de Jean: 50 créditos por video).
-- Gemini mira la referencia (o lee cómo lo quiere la persona) y las tomas, y propone el montaje (≈ US$0,04).
-- Armar el video es en el navegador con Remotion: no cuesta. 50 créditos ≈ US$0,40 ≫ costo × 5.
INSERT INTO public.credit_prices (action, cost, label, charged_by, real_cost_usd, updated_at)
VALUES ('montaje_tomas', 50, 'Edita tus tomas como tu referencia', 'server', 0.04, now())
ON CONFLICT (action) DO UPDATE SET cost = EXCLUDED.cost, label = EXCLUDED.label, real_cost_usd = EXCLUDED.real_cost_usd, updated_at = now();
