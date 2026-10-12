-- R2-20 (12-oct-2026) · PROPUESTAS DE PRECIO PARA QUE JEAN DECIDA. NO CAMBIA NADA TAL COMO ESTÁ:
-- todas las líneas van comentadas. Jean elige cuáles; se descomentan solo esas y se aplica.
-- Si se aplica una, cambiar el mismo número en CREDIT_COSTS (src/hooks/useCredits.ts) y en los
-- textos que muestren el precio, en el mismo despliegue.
--
-- Regla del manual: precio ≥ costo real × 5 con el crédito más barato (US$0,008) y nunca bajo ×3
-- en el peor caso (la IA escribe hasta su tope de tokens). Gemini 3 Flash: US$0,50 por millón de
-- tokens de entrada y US$3 por millón de salida (ai_model_prices). Detalle en
-- docs/agentes/2026-10-12-r2-20-margenes.md.

-- 1) Modelar una lámina de carrusel (model_slide): 6 → 10 créditos.
--    Gemini 3 Flash mira la lámina y escribe hasta 8.000 tokens. Sin usos medidos todavía.
--    Típico estimado (~3.000 de salida) US$0,011 → hoy ×4,4. Peor caso US$0,026 → hoy ×1,8 (bajo el piso).
--    Con 10: típico ×7, peor caso ×3,1.
-- UPDATE public.credit_prices SET cost = 10, updated_at = now() WHERE action = 'model_slide';

-- 2) Modelar un carrusel completo (clone_carousel): 15 → 25 créditos.
--    Medido: mediana US$0,0171, p90 US$0,0193 → hoy ×7,0 / ×6,2 (sano en el uso real).
--    Pero carousel-clone deja escribir hasta 16.000 tokens: peor caso ~US$0,053 → hoy ×2,3 (bajo el piso).
--    Con 25: peor caso ×3,8.
--    ALTERNATIVA SIN TOCAR EL PRECIO (recomendada): bajar max_tokens de carousel-clone a 8.000
--    (lo más largo visto fue 4.097): peor caso ~US$0,029 → ×4,1 con 15 créditos.
-- UPDATE public.credit_prices SET cost = 25, updated_at = now() WHERE action = 'clone_carousel';

-- 3) Generador corto (gen_light: ganchos, mensajes, carrusel, order bump…): 15 → 20 créditos.
--    Medido: mediana US$0,0060, p90 US$0,0083 → hoy ×20 / ×14 (muy sano).
--    Con el tope nuevo de 8.000 tokens de salida: peor caso normal (4.000 de entrada) US$0,026 → ×4,6;
--    peor caso con el cuerpo máximo que acepta ai-chat (150.000 caracteres ≈ 37.000 tokens) US$0,043 → ×2,8.
--    Con 20: ×6,2 y ×3,8.
--    ALTERNATIVA SIN TOCAR EL PRECIO (recomendada): en ai-chat, que los generadores acepten como
--    máximo 40.000 caracteres de conversación (hoy 150.000): peor caso ~US$0,030 → ×4,0 con 15.
-- UPDATE public.credit_prices SET cost = 20, updated_at = now() WHERE action = 'gen_light';

-- 4) Imagen de anuncio (gen_ad_image, 7 créditos, aprobado hoy): NO se propone subir el precio.
--    GPT Image 2 cuesta US$0,0081 → ×6,9. Pero cuando APIMart falla, generate-ad-creative usa de
--    respaldo gemini-2.5-flash-image a US$0,039 → ×1,4 en ese uso (pasó 8 de 95 veces en 30 días).
--    Propuesta de código (no de precio): quitar ese respaldo y devolver el crédito ("inténtalo de
--    nuevo"), como ya se hace cuando la imagen lleva foto de referencia.

-- Nada más queda bajo ×5 en el uso medido. gen_heavy (75) está en ×83 sobre lo medido: si Jean
-- quiere, se puede BAJAR (no es obligatorio; la regla solo pone piso).
