-- SUPERNOVA — Motion graphics con estilo (08-oct-2026, decisión de Jean: "cóbralo ×15").
-- Edge function motion-graphics. La IA solo lee y escribe (gemini-3-flash-preview); la animación se
-- dibuja gratis en el navegador. Costo real en el peor caso, al crédito más barato (US$0,008):
--   motion_style: ≤ US$0,023 (6 cuadros → desglose, ADN del estilo y prompt listo para pegar) → 40 créditos ≈ 14×
--   motion_ad:    ≤ US$0,029 (escenas, narración y 4–8 prompts de clips de 10 s) → 50 créditos ≈ 14×
-- Plantilla: docs/prompts/motion-graphics-prompt-maestro.md (prompt maestro de Jean, en español).
-- La voz se cobra aparte con yt_voice_scene (5 por tramo de ≤ 600 caracteres), como en YouTube.
insert into public.credit_prices (action, cost, label, charged_by) values
  ('motion_style', 40, 'Modelar el estilo de un motion graphics', 'server'),
  ('motion_ad', 50, 'Motion graphics (escenas y textos con IA)', 'server')
on conflict (action) do update set cost = excluded.cost, label = excluded.label, updated_at = now();
