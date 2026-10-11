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

---

# Ronda 2 (11-oct-2026, después de los arreglos P0)

| Área | Ronda 1 | Ronda 2 | ¿Pagaría? |
|---|---|---|---|
| Encontrar | 6 | 7 | Todavía no: quiere ver el creativo del anuncio en el Radar y búsqueda confiable |
| Los 5 anuncios | 6 | 6,5 | Todavía no: marca ajena en imágenes, garantía y prueba social inventadas |
| Producto y venta | 6 | 7 | Probaría con el cupón; se queda cuando Contenido y el saldo funcionen |
| Video y avatar | 4 | 6 | Recargaría US$20 por Motion y YouTube; US$100 cuando el avatar hable |

Funcionó: Radar sin error, Motion graphics, YouTube de punta a punta, guiones sin "lo probé", textos sin
"vídeo/móvil" ni "[Insertar precio]", "Compruébalo por mí", Diagnóstico, regla de probador (1 clic = 1 uso).

## Arreglado después de la ronda 2 (en producción salvo lo marcado "pantalla")
- Contenido roto: la migración content_month nunca se había aplicado (precio + columnas brief/cta/plan_id).
- "Mejorar esta oferta" sin límite para probadores: la ventana de 3 min ahora solo agrupa herramientas de
  varias piezas; las de una pieza cuentan cada uso.
- Primer clic de los 10 guiones del Influencer IA fallaba: products.journey tenía tope de 5 KB → 50 KB.
- Marca de la competencia en imágenes: el servidor quita "(versión de X)" del pedido y prohíbe marcas.
- Reglas de honestidad reforzadas: garantía solo como sugerencia si no existe, sin "miles de personas",
  sin voseo, sin "transforma tu cuerpo", sin inventar formato del producto, precio con moneda, y las MISMAS
  reglas de medición en todas las herramientas (CTR 0,8 %, apagar a 2 veces el precio, +20 % cada 2 días).
- Veredicto de ofertas con reglas de honestidad (ya no "curan el acné").
- Mándala ya no pide garantía si la ficha no la tiene; Andrés ya no es "el que lo prueba".
- Pantalla: Radar sin resultados viejos ni "Buscando… · 5 créditos" en la búsqueda gratis; Créditos en
  formato 2.000, contador que no se queda en 0, sin "gen_media = 0" ni asistente con costo; Diagnóstico sin
  nombres de casos no verificados.

## Para mañana
- Radar: mostrar el creativo (video/imagen) en la tarjeta; etiquetas que se contradicen; novelas arriba.
- 326 veredictos guardados con palabras de salud ("cura", "elimina"): revisar cuáles regenerar.
- Avatar que habla dentro de la app (hoy "PRONTO" con afiliado de Higgsfield): la mayor objeción de Hany.
- Video del anuncio en un solo archivo y más rápido; escuchar voces antes de elegir.
- Faltas de ortografía en el texto de las imágenes ("RUTUINAS", "GANA MÚSCLO").
- "Precio en tu moneda" que convierta; plan que no proponga Mini App a un programa de ejercicio.
- Bóveda de ganchos en español por nicho; Mini Apps que abren otra ficha; enlace directo a una oferta.
- "Rellenar con IA" con window.confirm nativo; Validar pregunta 14 automática; VSL que dura lo que dice.
- Migración pendiente de otra sesión: landing_rate_limit (tope por IP de la landing), revisar con Jean.
- Tarjeta de suscripción llama a stripe-portal (503 con Stripe apagado).
- Pack 100 sin cashback sale más caro por crédito que el Nuclear: decisión de Jean.
