# Prueba de la probadora "Hany" — 1.ª ronda (10/11-oct-2026)

4 agentes con la cuenta de probadora `soyjeanhenriquez+hany@gmail.com` en producción (Chrome de Jean), cada
acción 2 veces. Persona: experta en direct response de infoproductos, vende con avatares IA, un producto por
semana, 5 anuncios con ángulos ganadores por semana. Compara con Higgsfield, Quantum Miner y ChatGPT.

| Área | Nota | ¿Pagaría US$29,99? |
|---|---|---|
| Encontrar (Ofertas, Radar, Mini Apps, Nichos YT) | 6/10 | Hoy no; sí cuando el Radar busque y filtre |
| Los 5 anuncios (Mándala, ganchos, copy, creativos, carrusel) | 6/10 | Hoy no; ChatGPT le da lo mismo en ángulos |
| Producto y venta (ficha, validar, precio, página, bump, WhatsApp, contenido, plan) | 6/10 | Todavía no; falta crear el producto |
| Video y avatar | 4/10 | US$20 quizá por los guiones; US$100 no hasta que el avatar hable |

## Verificado en la base (no solo dicho por los agentes)
- `radar_search` corta por el límite de 8 s (`canceling statement due to statement timeout`, 03:38–03:41 UTC
  del 11-oct, justo en las búsquedas). Rompe el buscador del Radar y "Compruébalo por mí" de Validar.
- La regla de probador funcionó: toda la IA quedó en 0 créditos ("prueba gratis"). Los 10 créditos que
  bajaron son 2 × "Seguir oferta" (`follow_offer`, cobrado por RPC: no pasa por la regla de probador).
- "Tu cuenta no tiene acceso activo" en el póster del carrusel y en la producción de YouTube = la regla de
  recarga (4.º uso) mostrando el mensaje viejo: las 18 funciones con el aviso nuevo no están desplegadas.
- Un clic gasta varios usos: Creativos = 3 imágenes = 3 usos; anuncio de video de 3 tomas = 3 usos. Con 3
  usos por herramienta, el probador se queda sin Creativos ni video tras un solo clic.

## P0 — rompe la app o el manual
1. Radar: `radar_search` > 8 s (y Validar "Compruébalo por mí").
2. Probadores: desplegar las 18 funciones con el aviso de recarga; contar usos por CLIC, no por pieza.
3. Manual (ética), en prompts del servidor:
   - inventa precio ("US$27", "[Insertar Precio]") y garantía ("7 días, sin preguntas") que nadie definió;
   - urgencia falsa ("precio especial de lanzamiento", "solo por tiempo limitado");
   - testimonios falsos: el influencer IA dice "yo probé/uso este programa"; carrusel en primera persona;
   - Radar: "CLONA ESTO HOY" (decir "modelar"), "Millones fluyendo en este ángulo" (cifra inventada), un
     anuncio +18 visible, novelas/dramas arriba;
   - español de España ("vídeo", "ordenador", "móvil"); promesa de salud en un gancho ("curan el acné");
   - sugiere segmentar por "Muscle Booster" (marca de la competencia).
4. Fallos silenciosos: Motion graphics responde 502 y la pantalla no dice nada; regenerar un creativo falla y
   borra la imagen sin aviso.
5. Crear producto: para clientes lleva al Inicio sin explicación (`ADMIN_ONLY_PAGES` en features.ts).
   Decisión de Jean: abrirlo o mostrar "pronto".

## P1 — confunde o resta confianza
- "Seguir oferta" cobra 5 sin mostrar el precio en la ficha (y a probadores también).
- Filtros del Radar solo filtran los 24 cargados ("1–24 de 36.731"); "Español" muestra otros idiomas;
  clasificación de tipo mala (novela = ECOMMERCE, suplemento = APP/SAAS).
- Oferta con 1.060 días etiquetada "EN PRUEBA".
- Mini Apps: la tarjeta abre otro producto.
- La app pregunta lo que sabe: Mándala "¿Qué vendes?" vacío; Video y YouTube no rellenan el producto;
  "Rellenar con IA" en Mi ficha ignora la oferta modelada.
- Los 5 ángulos no son distintos (anuncios 1-3 casi iguales); no salen de anuncios reales del nicho.
- Números que se contradicen entre Mándala y Campaña Meta (CTR 0,8 vs 1,5 %; US$5 vs 15/día); formato
  inglés (1.5 %, $0.10, ROAS 1.1) y sin punto de miles (US$2430,00).
- "Precio en tu moneda" no convierte (US$27 → "RD$27,00").
- Barra "Lanzando tu versión" no avanza; plan propone "construye tu mini app" para un programa de ejercicio;
  plan de 14 días vs "un producto por semana".
- Bóveda de ganchos mezcla ruso/alemán/portugués; "músculo" da 0 resultados.
- Registro: a un probador ya aprobado le muestra los planes de pago.

## P2 — lo que la haría pagar (frente a Higgsfield)
- Avatar que habla dentro de la app (hoy "PRONTO" + enlace a Higgsfield).
- Anuncio de video en un solo archivo y en menos de 3 min (hoy ~10 min y 3 archivos que caducan en 24 h).
- Escuchar las voces antes de pagar; avatares de nicho (fitness).
- Guion de "1 min" que dure 1 min (sale 1:17).

## Lo que le gustó
Ficha de Ofertas + pestaña Números (CPA máximo con datos reales, "ChatGPT no te da eso"); veredicto de la
oferta; versión mejorada del Radar; las 3 imágenes de Creativos (nivel Higgsfield en estático, cara latina,
texto sin faltas); carrusel "Mito contra verdad" en <30 s; order bump con 3 opciones; WhatsApp listo; Contenido
con búsquedas reales y tracker; ganchos de los guiones del influencer; que lo que falla no se cobra.
