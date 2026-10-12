-- Precios a ×5 del costo real medido en ai_usage (decisión de Jean, 12-oct-2026), con el crédito más
-- barato (US$0,008). Imagen GPT Image 2: US$0,0115 → 7 créditos (×4,9). Video Seedance 2.0 mini:
-- 5 s US$0,118 → 75 (×5,1); 10 s US$0,217 → 150 (×5,5). Antes 6 / 55 / 110 (×4,2 / ×3,6 / ×4,1).
UPDATE public.credit_prices SET cost = 7,   real_cost_usd = 0.0115 WHERE action = 'gen_ad_image';
UPDATE public.credit_prices SET cost = 75,  real_cost_usd = 0.118  WHERE action = 'vid_mini_5';
UPDATE public.credit_prices SET cost = 150, real_cost_usd = 0.217  WHERE action = 'vid_mini_10';
