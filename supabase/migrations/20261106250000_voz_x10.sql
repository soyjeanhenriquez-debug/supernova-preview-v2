-- 06-nov-2026, decisión de Jean: «de lo que nos cuesta a nosotros, ponle mínimo un ×10 a la voz».
-- Costo real ElevenLabs: US$0,132 (≤600 caracteres) y US$0,264 (≤1.200). Con el crédito más barato (US$0,008):
-- 0,132 × 10 / 0,008 = 165 · 0,264 × 10 / 0,008 = 330 (antes 99 y 198, ≈ ×6).
update public.credit_prices set cost = 165, updated_at = now() where action = 'reel_voz_600';
update public.credit_prices set cost = 330, updated_at = now() where action = 'reel_voz_1200';
