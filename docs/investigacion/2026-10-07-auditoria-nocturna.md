# Auditoría nocturna · 07-oct-2026

Reporte para Jean. Nada de esto está publicado: los arreglos viven en una rama aparte y publicarlos necesita tu OK.

---

## 1. Resumen en 5 líneas

1. Cuatro agentes recorrieron la app como cuatro tipos de usuario: un **novato total en el iPhone**, un **novato que busca su primera venta**, un **experto en anuncios** (media buyer, el que compra anuncios) y una **experta en contenido**. Un verificador revisó cada hallazgo en el código.
2. Salieron **45 problemas reales**. El verificador no descartó ninguno, pero bajó la gravedad de varios ("exagera", "real a medias").
3. **24 quedaron arreglados** en la rama `auditoria-nocturna-2026-10-07` (6 commits, sin publicar). Uno está a medias y otro es un arreglo provisional. Las 280 pruebas automáticas pasan y la app compila.
4. **21 necesitan una decisión tuya**, porque tocan dinero, créditos, el catálogo, la base o decisiones de producto que ya tomaste.
5. Lo más grave: **la moneda se pierde** en el camino (el Gemelo muestra COL$108.000 y la calculadora dice 27), **la etapa 4 no dice dónde publicar la página ni cómo cobrar con Nequi**, y **varias herramientas borran sin avisar trabajo que ya se pagó con créditos**.

---

## 2. Los 5 problemas que más le duelen a un usuario hoy

### 1) "¿Entonces cuánto cobro?" (la moneda se pierde)
> "En el Gemelo me salió COL$108.000, pero en Precio me aparece 27. Cambio la moneda a COL$ y me dice COL$27. Si escribo mi precio, 89.000, me calcula con 89."

- **Por qué pasa:** el Gemelo guarda el precio en dólares aunque lo muestre en pesos (`GemeloFlow.tsx:110`). La calculadora siempre arranca en US$ (`PricingPage.tsx:49`), el selector de moneda solo cambia el símbolo y "89.000" se lee como 89.
- **Qué haría:** decidir en qué moneda se guarda el precio del producto (lo leen Recuperar ventas, el Mapa y el Plan) y convertir de verdad al cambiar de moneda. En la rama ya quedó arreglado que la calculadora lea bien "US$ 97" o "R$ 47,90" y que no invente 27. Lo de fondo es **decisión tuya** (ver sección 4).

### 2) "¿Publicar mi página dónde? ¿Y cómo cobro en pesos?"
> "El Gemelo me dijo 'Cobro: Nequi, PSE y tarjeta' y 'Entrega por WhatsApp'. Pero en el plan solo me dicen que cree el enlace en Whop o Hotmart y que 'publique mi página'."

- **Por qué pasa:** las mejoras que promete el Gemelo (pago local, WhatsApp) no las lee ninguna otra pantalla. El Plan de lanzamiento (`LaunchPlanPage.tsx:102`) solo habla de Whop, Hotmart o Stripe.
- **Qué haría:** mientras llega la Fase 2 (publicar en dominio aparte), una tarea "Cobra por Nequi o transferencia y entrega por WhatsApp" con un mensaje de cobro listo, y "vende sin página: tu catálogo de WhatsApp". **Decisión tuya**, porque hay que definir las comisiones de cada vía de cobro.

### 3) "Yo ni sé qué voy a vender. ¿Por dónde empiezo?"
> "Entré y me salieron un montón de botones de 'Creativos', 'Carrusel', 'Video con IA', todos con créditos. No vi nada que dijera 'empieza aquí'."

- **Por qué pasa:** la única herramienta con la insignia "Empieza aquí" ("ideas") está oculta (`tools.ts:81`), así que la insignia ya no sale en ninguna. El camino Elige → Modela → Cobra está plegado al final del Inicio, en "Tu camino (opcional)". En el teléfono, el menú de abajo no tiene "Encontrar".
- **Qué haría:** si la persona no tiene producto, una sola tarjeta arriba: "Empiezo de cero: encuentra qué vender (gratis)". Esto choca con tu decisión del 04 y 05-oct (recomendaciones al final, plegadas), así que es **decisión tuya**. Lo que sí quedó arreglado: en "¿Qué vendes?" ahora hay salida a Ofertas, y el recorrido de bienvenida señala "Ofertas que están vendiendo hoy".

### 4) "Pagué y se me borró todo"
> "Pagué 26 créditos por una portada, toqué 'Escribir otro' para ver otra opción y se me fue todo."
> "Pedí otra foto de mi influencer para comparar y la primera desapareció. Y perdí los 10 guiones que ya había pagado."
> "Edité a mano un guion que me costó 50 créditos, toqué 'Nueva idea' y se borró. 'Otra versión' me cobra los 50 otra vez."

- **Por qué pasa:** Carrusel ("Escribir otro", "Modelar"), Tu influencer IA ("Otra foto", elegir otro personaje) y el guion de YouTube reemplazan lo anterior sin preguntar y sin guardar copia. "Otra versión" en YouTube vuelve a analizar el video y cobra el precio completo.
- **Qué haría:** pedir confirmación ("Vas a perder 10 guiones que ya pagaste"), guardar las últimas versiones y no borrar la foto anterior. En la rama ya quedó Deshacer/Rehacer de 20 pasos en el Carrusel. Lo demás toca trabajo pagado y precios, así que es **decisión tuya**.

### 5) "Se me fueron 150 créditos de una"
> "Toqué el botón de la mini app y se me fueron 150 créditos. Ni me preguntó. Y decía '150 ⚡': yo no sabía que el rayito eran créditos."

- **Por qué pasa:** en Mini Apps, el botón de la tarjeta bloqueada cobra directo (`KitsPage.tsx`, `unlock_kit`), sin abrir la vista previa ni confirmar. El verificador aclara que el botón sí dice "Desbloquear" con candado y precio, pero falta la confirmación y el "⚡" no dice "créditos".
- **Qué haría:** que la tarjeta abra la vista previa gratis y que el cobro sea solo con "Desbloquear mi kit · 150 créditos" (ese botón ya existe). **Decisión tuya** porque es un cobro.

---

## 3. Tabla por persona

Estados: **Arreglado** = está en la rama, sin publicar · **Decisión de Jean** = no se tocó · **Descartado** = el verificador dijo que no era real (esta noche: ninguno).

### Novato total en el iPhone (11)

| Hallazgo | Gravedad | Estado |
|---|---|---|
| El Inicio no tiene un "empieza aquí" para quien no sabe qué vender | Bloquea (el verificador dice que exagera: sí hay una tarjeta de Ofertas más abajo) | Decisión de Jean |
| "¿Qué vendes?" no tiene salida para quien no lo sabe | Alta | Arreglado |
| El iPhone hace zoom solo al tocar los campos de texto | Alta | Arreglado |
| El menú de abajo del teléfono no tiene "Encontrar qué vender" | Alta | Decisión de Jean |
| El registro promete adaptar la app con las preguntas, pero el Inicio no las usa (la IA de ayuda sí) | Media | Decisión de Jean |
| Las preguntas del registro no tienen "Atrás" y la última crea la cuenta sin confirmar | Media | Arreglado |
| Palabras sin explicar en Ofertas: checkout, upsell, downsell, bump, embudo | Media | Arreglado |
| Los errores de registro y entrada que no se reconocen salen en inglés | Media | Arreglado |
| Botones de menos de 44 px (muy chicos para el dedo) | Media | Arreglado |
| "Ver cómo funciona" habla de ⌘K y de cosas que no se ven en el iPhone | Baja | Arreglado |
| El aviso "Te faltan créditos" no trae botón para recargar (en Creativos) | Baja | Arreglado |

### Novato que quiere su primera venta (11)

| Hallazgo | Gravedad | Estado |
|---|---|---|
| La moneda se pierde: el Gemelo muestra COL$ y la calculadora vuelve a dólares sin convertir | Bloquea | Decisión de Jean (en parte arreglado: ver fila del precio de la oferta) |
| La etapa 4 no dice dónde publicar la página ni cómo cobrar con Nequi o PSE | Bloquea | Decisión de Jean |
| Los mensajes de WhatsApp de Recuperar ventas salen con "Precio: 27", sin moneda ni pago local | Alta | Decisión de Jean (hay que cambiar y desplegar una función del servidor que cobra créditos) |
| El camino Elige → Modela → Cobra está plegado al final del Inicio; el menú dice "Mi ficha" y las pantallas "Mi negocio" | Alta | Decisión de Jean |
| Mini Apps cobra 150 créditos al primer toque, sin vista previa ni confirmación | Alta | Decisión de Jean |
| El precio de una oferta no llega a la calculadora: aparece 27 | Media | Arreglado |
| En el menú de low ticket (el de por defecto) no está el Plan de lanzamiento | Media | Arreglado |
| El Mapa del negocio pone "US$" a precios en reales y usa 27 si no encuentra el precio | Media | Arreglado (con el arreglo del experto en anuncios, ver abajo); falta decidir si se convierte la moneda a dólares |
| En la prueba de 3 días no se puede escribir el producto sin pagar una recarga | Media | Decisión de Jean (es una regla ya decidida) |
| Dos cosas distintas se llaman "Tu semana" | Baja | Arreglado |
| El Gemelo dice "clonar" en pantalla y arranca en República Dominicana | Baja | Arreglado |

### Experto en anuncios (media buyer) (11)

| Hallazgo | Gravedad | Estado |
|---|---|---|
| "Anuncios activos ahora" es un número que solo sube: la escala se ve inflada | Alta | Decisión de Jean |
| No aparece "visto activo hace N días" en ningún lado, aunque el dato existe | Alta | Decisión de Jean |
| Los chips de tipo del Radar filtran solo la página que estás viendo | Alta | Arreglado (provisional: avisa "filtra solo esta página"; el arreglo de fondo necesita la base) |
| La Mándala dice "Ganador, sube presupuesto" con 1 sola venta | Alta | Arreglado en parte (pide 3 ventas; faltan CPM, CPC y pagos iniciados) |
| El CPA máximo del Mapa del negocio no se guarda ni lo usa el veredicto | Alta | Decisión de Jean |
| La calculadora pone US$ a precios en reales e inventa US$27 sin avisar | Media | Arreglado |
| No se ve cuántos anunciantes venden lo mismo (clones por dominio) | Media | Decisión de Jean |
| Todas las tarjetas del Radar dicen "1 anuncios activos" | Media | Arreglado |
| "Cargando el radar…" se queda para siempre para el cliente | Media | Arreglado |
| Ganchos: no se ve el anuncio de origen ni se filtra por idioma | Media | Arreglado |
| El filtro de días llega solo a 60+ y "Los más nuevos" ordena por la última revisión | Baja | Arreglado |

### Experta en contenido y creativos (12)

| Hallazgo | Gravedad | Estado |
|---|---|---|
| Carrusel: "Escribir otro", "Modelar" y "Volver a la lámina diseñada" borran sin avisar | Alta | Decisión de Jean (Deshacer ya ayuda en parte) |
| Tu influencer IA: "Otra foto" y elegir otro personaje borran foto y guiones pagados | Alta | Decisión de Jean |
| YouTube: el guion pagado no se guarda y "Otra versión" vuelve a cobrar 50 | Alta | Decisión de Jean |
| "Descargar las 10 láminas" no sirve en el iPhone | Alta | Arreglado (no probado en un iPhone real) |
| No se puede rehacer una sola lámina ni añadir una en blanco | Media | Decisión de Jean |
| Deshacer solo existía para "Quitar lámina" | Media | Arreglado |
| "Tus imágenes" descarga al tocar, no deja ver en grande ni borrar | Media | Decisión de Jean |
| La búsqueda de ganchos solo mira los primeros 500 | Media | Decisión de Jean (el chip de idioma sí quedó) |
| Desde un gancho no se puede hacer un carrusel; "Escribir textos" obliga a copiar y pegar | Media | Arreglado |
| "Escribir guion" siempre abre el guion de Reels, aunque la pieza sea un carrusel | Media | Arreglado |
| La papelera borra una pieza del tracker al instante, con sus leads y ventas | Media | Arreglado |
| Los mensajes de créditos no son iguales en todas las pantallas (⚡ o "créditos") y no llevan a recargar | Baja | Decisión de Jean |

**Total:** 45 hallazgos · 24 arreglados · 21 esperan tu decisión · 0 descartados.

---

## 4. Lo que necesita tu decisión

Cada punto con lo que recomiendo.

### Precios, créditos y cobros

1. **Mini Apps cobra al primer toque.** Recomiendo **sí**: que la tarjeta abra la vista previa gratis y que el cobro sea solo con el botón "Desbloquear mi kit · 150 créditos". Es un cambio de pantalla; el precio y el cobro en el servidor no cambian.
2. **Pedir confirmación antes de borrar trabajo pagado** (Carrusel, Tu influencer IA, guion de YouTube). Recomiendo **sí**: confirmación, guardar las últimas 5 versiones en el navegador y no borrar la foto anterior (guardar hasta 4). Cambiar de precio no hace falta.
3. **"Otra versión" en YouTube cobra el análisis completo (50).** Recomiendo que reescriba sobre el análisis que ya existe con el generador de texto, que es más barato. Tú decides el precio, respetando costo × 5.
4. **"Reescribir esta lámina" del Carrusel (acción paga nueva).** Recomiendo **sí**, cobrada en el servidor, con un precio que tú fijes (≥ 5 × costo). "Añadir lámina en blanco" es gratis y se puede hacer ya.
5. **Mensajes de créditos iguales en toda la app** ("N créditos", nunca ⚡, con botón "Recargar"). Recomiendo **sí**: no cambia precios ni cobros.
6. **Prueba de 3 días sin poder escribir el producto.** Recomiendo **no cambiar el cobro** y decir claro, desde el primer día, qué se puede hacer en la prueba (índice gratis, Gemelo, precio, anuncios) y que la escritura empieza al activarse el plan.
7. **Recuperar ventas sin moneda ni pago local.** Recomiendo **sí**: pasarle a la IA la moneda y la forma de pago del Gemelo. Hay que desplegar la función `recovery-sequence`, así que necesita tu OK.

### Producto

8. **En qué moneda se guarda el precio del producto.** Recomiendo guardar **la moneda local del Gemelo** (por ejemplo COL$89.000) junto con su código, y convertir a dólares solo para mostrar "aprox. en US$". Afecta a Precio, Mapa, Plan y Recuperar ventas.
9. **Cobro local y dónde publicar (etapa 4).** Recomiendo una guía provisional ya: "Cobra por Nequi o transferencia y entrega por WhatsApp" con su mensaje listo, hasta que llegue la Fase 2 (publicar en dominio aparte). Hay que definir las comisiones de cada vía en `pricing.ts`.
10. **Tarjeta "Empieza aquí" arriba del Inicio para quien no tiene producto.** Choca con tu decisión de dejar las recomendaciones al final. Recomiendo **una sola tarjeta**, solo mientras la persona no tenga producto, que lleve a Ofertas o al Gemelo, y que se vaya sola cuando elija algo.
11. **Botón "Encontrar" en el menú de abajo del teléfono.** Recomiendo **sí**, como 5.º botón (Radar, Ofertas, Nichos, Mini Apps, todo gratis). Es lo que prometemos en la página de venta.
12. **Que el Inicio use las respuestas del registro.** Recomiendo **sí**: si dijo "empiezo de cero", abrir en "Ideas que venden". Si no se hace, quitar la frase "adaptamos la app".
13. **Un solo nombre: "Mi ficha" o "Mi negocio".** Recomiendo **"Mi negocio"** en todos lados.
14. **El CPA máximo del Mapa no se guarda.** Recomiendo **sí**: botón "Usar este máximo como mi CPA objetivo", y que la Mándala diga de dónde sale el límite.
15. **"Tus imágenes": borrar archivos.** Recomiendo **sí** a la vista grande y los filtros, y a borrar con confirmación (son archivos del propio usuario, no el catálogo).

### Catálogo y datos (anuncios y ofertas)

16. **"Anuncios activos ahora" que solo sube.** Recomiendo **sí** al cambio de texto ya: "anuncios vistos activos (acumulado)". El manual pide que cada número diga qué cuenta. Contar los anuncios que se apagan toca el pipeline (el robot que trae los anuncios): eso va después y con tu OK.
17. **Mostrar "visto activo hace N días".** Recomiendo **sí**: lo pide el manual, no oculta ni baja ningún anuncio, solo informa. El dato ya existe (`last_seen`, `scraped_at`).
18. **Contar clones por dominio** ("N anunciantes venden en este dominio"). Recomiendo **sí**: es la Fase 0 aprobada y nuestra respuesta a "Mega Winner" de Quantum Miner. Necesita una función nueva de solo lectura en la base (migración).
19. **Filtros del Radar y búsqueda de Ganchos en el servidor** (hoy filtran solo lo que ya cargó). Recomiendo **sí**, con una función en la base. Hay que probar el rendimiento en un Postgres local, no en producción.

---

## 5. Arreglos listos en la rama `auditoria-nocturna-2026-10-07`

**No está publicado.** Son 6 commits locales: nada en main, ni push, ni despliegue, ni migraciones, ni escrituras en la base de producción. **Publicarlo requiere tu OK.**

### Qué cambió

**Novatos y registro** (commit `125344c`)
- "¿Qué vendes?" ahora tiene "¿Todavía no sabes qué vender? Mira negocios que ya venden (gratis)", que lleva a Ofertas.
- En el teléfono, los campos usan letra de 16 px y el iPhone ya no hace zoom solo. El zoom con los dedos sigue funcionando.
- Registro: botón "Atrás" en las preguntas 1 a 4. La cuenta se crea con el botón "Crear mi cuenta", no al tocar una opción.
- Errores en español (sin conexión, contraseña débil, correo mal escrito, correo ya registrado). Lo desconocido dice "Algo falló. Inténtalo de nuevo o escríbenos por WhatsApp" y el texto original va a PostHog.
- Botones chicos llevados a 44 px (menú, buscar, cerrar el asistente, enlaces del registro y de la landing).
- El aviso de créditos en Creativos dice cuántos tienes y trae "Ver mis créditos". Solo lleva a la pantalla.

**Ofertas y precio** (`4db2739`)
- Términos explicados: "página de pago (checkout)", "embudo (el camino del anuncio a la compra)", y una línea de ayuda para bump, upsell y downsell.
- La calculadora lee "US$ 97", "$37" o "R$ 47,90" con su moneda. Si no puede leer el precio, deja el campo vacío ("Pon el precio de tu versión"). **Ya no inventa 27.**
- Mapa del negocio: la moneda sale del precio real. Si el precio es de ejemplo, dice "supuesto" y no muestra los números grandes hasta que la persona lo confirme.

**Guía y nombres** (`7d485d9`)
- Plan de lanzamiento en el menú de low ticket y de high ticket. **Ojo:** también se agregó Contenido al menú de low ticket, y el verificador había dicho que la guía ponía Contenido en marca personal. Revísalo y dime si lo dejamos.
- "Tu semana" separado: "Tus tareas de la semana · socio IA", "Tu meta de publicaciones" y "Resumen de tu semana" (este último no aparece hoy en ninguna pantalla).
- El Gemelo dice "Modela" y adivina el país por la zona horaria o el idioma del navegador (si no lo reconoce, sigue en RD).
- El recorrido de bienvenida en el teléfono no menciona ⌘K, señala "Cuenta → Lo que creaste" y tiene un paso nuevo para "Ofertas que están vendiendo hoy".

**Radar y Ganchos** (`ebe981b`)
- Días activo: 90+, 180+ y 365+ (destaca más los anuncios de muchos días; no oculta ninguno).
- "Los más nuevos" pasa a llamarse "Revisados hace poco". El orden no se cambió, porque también lo usa la función `radar_search` de la base.
- El cliente ve "Radar actualizado hace N h" con la hora real, en vez de "Cargando el radar…" para siempre.
- Con un tipo elegido, aviso "El tipo filtra solo esta página".
- Ya no sale "1 anuncios activos" inventado.
- Ganchos: "Ver anuncio original" en la Biblioteca de Meta, selector de idioma, "N copias del anuncio", "Hacer carrusel", "Escribir textos" con el gancho ya puesto, y "Copiado" solo si de verdad se copió.

**Mándala y Contenido** (`9f52d26`)
- "Ganador" solo con 3 ventas o más; antes de eso dice "Prometedor… déjalo correr hasta 3 ventas".
- Cada pieza del calendario abre su herramienta: carrusel, guion de YouTube, post o guion de Reels.
- Borrar una pieza da 5 segundos para "Deshacer" (y avisa si tenía leads o ventas). El botón está separado y mide 44 px.

**Carrusel** (`f0c5944`)
- En el teléfono: un toque prepara las láminas y otro las guarda en Fotos o las comparte. Ya no son 10 descargas seguidas.
- La copia en "Tus imágenes" se sube una vez por versión (antes se duplicaba en cada descarga).
- Deshacer y Rehacer de 20 pasos, con Ctrl/Cmd+Z. No recupera las fotos hechas con IA.

### Cómo revisarlo

- Ver los commits: en `/Users/usuario/SUPERNOVA/supernova`, `git log main..auditoria-nocturna-2026-10-07`.
- Ver los cambios: `git diff main...auditoria-nocturna-2026-10-07`.
- Probarlo en local: la rama está abierta en `/private/tmp/claude-501/-Users-usuario-SUPERNOVA/5f102904-3eec-4250-8f37-7d1a11210bf2/scratchpad/wt-auditoria` (una copia de trabajo aparte); ahí se puede correr `npm run dev`.
- Pruebas: 280 pruebas automáticas en verde (incluye nuevas de moneda y país). La revisión de tipos da los mismos 126 errores que ya tiene main, ninguno nuevo. La app compila.

---

## 6. Lo que no se pudo probar

- **Pantallas que piden sesión:** Ganchos, Contenido, Mándala, Radar, Carrusel, Ofertas por dentro, Tu influencer IA y Mini Apps. No se inició sesión ni se crearon cuentas (prohibido esta noche). Esos hallazgos y arreglos salen de leer el código y de las pruebas automáticas.
- **El Carrusel en un iPhone real:** guardar en Fotos y compartir se programó con la función estándar del navegador, pero no se probó en un equipo.
- **Lo que sí se vio en el navegador** (a 375 px, en `/signup` de la rama): letra de 16 px en los campos, "← Volver" de 67×44 e "Inicia sesión" de 77×44. "Atrás" y "Crear mi cuenta" se probaron con una prueba temporal que simuló la verificación de seguridad.
- **Nada contra producción:** no se llamó a la IA, ni a funciones que cobran créditos, ni se leyó o escribió la base. Ninguno de estos arreglos está verificado en producción, porque no está publicado.
