# Diseño: cómo verse mejor que anai (11-oct-2026)

Pedido de Jean: que SUPERNOVA se vea superior a anaiapp.ai y que crear imágenes y videos de respuesta
directa sea muy visual e intuitivo. **Solo diseño, sin funciones nuevas.** Todo dentro del sistema de
la app ("Apple Space Black": negro, neutros, ámbar solo para lo principal, Sora + Manrope).

## Qué hace bien anai (lo que vimos en su landing)

1. **El producto se ve antes de leerlo.** El hero es un carrusel de videos verticales que se mueven
   solos, cada uno con una etiqueta (UGC, Personajes animados, Clon realista, B-roll, Objetos).
   El de en medio está más grande y con borde de color.
2. **Una promesa con número:** "Tu próximo video listo para publicar en 15 minutos". (Nosotros no
   prometemos plazos de resultados, pero sí podemos decir cuánto tarda la herramienta.)
3. **Marquesina** de funciones en mayúsculas que corre de lado a lado (CLONA TU PRODUCTO ✦ GUIONES…).
4. **Tarjetas de función con video arriba y texto con palabras en negrita** abajo.
5. **El camino en 5 pasos numerados** (01 Explora virales → 05 Descarga y publica).
6. **Ancla de precio:** "6 apps sueltas = $177/mes → desde $39 en anai", con el costo de cada app.
7. **Planes traducidos a algo tangible:** "240 segundos ≈ 8 videos de 30 s al mes".
8. Muro de "cuentas que usan anai" y preguntas frecuentes al final.

## Lo que ya tenemos y ellos no (y hoy no se ve)

- Anuncios **reales** con días pagando (36.594 en el Radar), el puntaje y "Hacer mi versión".
- Los números del negocio (precio, CPA máximo, diagnóstico del embudo).
- 32 formatos de imagen de respuesta directa con su ejemplo (`public/ejemplos-creativos/`), 4 avatares
  (`public/avatares/`), carrusel con fuentes reales, motion graphics, anuncio en 3 tomas.

Nuestra ventaja es **"de un anuncio que ya vende → a tu versión en español"**. anai empieza en "virales";
nosotros empezamos en **anuncios que llevan 90+ días pagando**. Eso tiene que verse en 3 segundos.

## Landing (orden propuesto)

1. **Hero dividido.** Izquierda: titular en Sora, una línea, botón ámbar. Derecha: carrusel vertical
   que se mueve solo con **piezas reales hechas en SUPERNOVA** (anuncio de 3 tomas, carrusel, imagen
   de un formato, avatar). Cada una con su etiqueta abajo (`Anuncio en video`, `Carrusel`, `Imagen
   "Pregunta"`, `Avatar`). La del centro un poco más grande con borde ámbar fino (sin brillo).
   - Titular sugerido: "Modela un anuncio que ya vende y ten tu versión lista hoy."
   - Debajo: "Imagen, carrusel y video en español, a partir de anuncios con más de 90 días pagando."
2. **Marquesina** gris con ✦ ámbar: RADAR DE ANUNCIOS ✦ HAZ MI VERSIÓN ✦ ANUNCIO EN 3 TOMAS ✦
   CARRUSEL QUE VENDE ✦ AVATAR SIN TU CARA ✦ MOTION GRAPHICS ✦ PRECIO Y CPA ✦ DIAGNÓSTICO.
3. **"De anuncio ganador a tu versión"** — la pieza que anai no tiene: a la izquierda una tarjeta del
   Radar (anuncio real, "91 días activo · 323 copias"), flecha, a la derecha la versión hecha en
   SUPERNOVA. Es el antes/después del *anuncio*, no del cliente.
4. **Tarjetas de herramientas** (6) con un video corto o imagen arriba y 2 líneas abajo con 2–3
   palabras en negrita. Mismo tamaño, bordes finos, fondo #111.
5. **El camino en 4 pasos** numerados grandes en Sora: 01 Elige un anuncio que ya vende → 02 Haz tu
   versión → 03 Crea imagen, carrusel y video → 04 Mide y decide con tus números.
6. **Ancla de precio honesta:** cuánto costaría por separado (espía de anuncios + IA de imágenes +
   video IA + editor + guiones) contra PRO US$29,99. Solo precios públicos verificados, con fecha.
7. **Planes en cosas tangibles:** "2.000 créditos ≈ X imágenes o Y anuncios de 3 tomas" (calcularlo
   con `credit_prices`, sin mostrar dólares por crédito).
8. **Galería "Hecho en SUPERNOVA"** (solo piezas reales generadas por nosotros; nada de cuentas o
   marcas que no nos usan).
9. Preguntas frecuentes + garantía real de 30 días + botón final.

## Dentro de la app (crear imágenes y videos)

- **Elegir con los ojos, no con palabras.** Cada formato de imagen, plantilla de video y avatar se
  elige en una cuadrícula de miniaturas grandes (ya tenemos las 32 de `ejemplos-creativos`). Hoy en
  varios lugares se elige por texto.
- **Una sola columna de acción:** a la izquierda la vista previa grande (9:16), a la derecha 3 pasos
  fijos: 1 Qué vendes (ya lo sabemos) · 2 Elige formato (miniaturas) · 3 Crear (botón ámbar con su
  costo). Todo lo demás en "Personalizar", plegado.
- **Resultado como tarjeta vertical con acciones encima**: Descargar · Rehacer · Variar · Agregar a mi
  tracker · Publicar. Igual en imagen, carrusel y video.
- **Mientras genera:** la tarjeta muestra un esqueleto con el formato real (9:16) y el paso en curso
  ("Escribiendo el guion · Toma 2 de 3"), no un spinner suelto.
- **Galería "Tus creaciones" en Inicio** como fila horizontal de verticales (como el hero de anai),
  para que la persona vea lo que ya hizo al entrar.
- **Etiquetas de formato** consistentes (píldora gris con texto blanco, abajo a la izquierda), igual
  que en la landing.

## Qué NO copiar

- Verde neón, brillos y degradados fuertes: nuestro sistema es negro + ámbar contenido.
- "En 15 minutos" como promesa de resultado; sí "la herramienta tarda ~2 min".
- Muro de logos o cuentas que no nos usan; cifras sin fuente.
- Sus textos, videos o capturas: se aprende la estructura, el contenido es nuestro.

## Orden sugerido para hacerlo

1. Hero con carrusel de piezas reales + marquesina (mayor impacto en la primera impresión).
2. Sección "De anuncio ganador a tu versión".
3. Selector visual de formatos y resultado como tarjeta vertical en Creativos y Video con IA.
4. Fila "Tus creaciones" en Inicio.
5. Ancla de precio y planes en cosas tangibles (con los números de `credit_prices`).
