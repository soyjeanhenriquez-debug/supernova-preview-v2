-- Mapa del negocio · Fase 1, paso 1: lo que el checkout real deja ver SIN pagar.
-- offer-intel lee el checkout (hoy: Hotmart) y guarda producto, precio, moneda, días de garantía,
-- si el embudo tiene upsell configurado y los order bumps con su precio. Nunca datos personales
-- del vendedor (el checkout trae su correo: no se guarda).
--
-- checkout_data = {
--   platform, product_name, price, currency, guarantee_days, has_upsell,
--   bumps: [{ name, price, currency }], source_url
-- }
ALTER TABLE public.offer_intel
  ADD COLUMN IF NOT EXISTS checkout_data jsonb,
  ADD COLUMN IF NOT EXISTS checkout_read_at timestamptz;

COMMENT ON COLUMN public.offer_intel.checkout_data IS
  'Mapa del negocio: datos públicos del checkout (producto, precio, moneda, garantía, upsell, order bumps). Sin datos personales.';
