# Reporte unificado · Auditoría nocturna · 07-oct-2026

Para Jean. Once personas probaron SUPERNOVA leyendo el código, y un verificador revisó cada hallazgo. Nada de esto está publicado.

Fuentes: `docs/investigacion/2026-10-07-auditoria-nocturna.md` (equipo principal) y los 7 informes de las personas nuevas (Diego, Patricia, Cindy, Ricardo, João, Hany y Lucía). Se dejaron fuera los 2 hallazgos que el verificador dio por no reales (dr-9 y joa-5).

---

## 1. Resumen ejecutivo

- **Qué se hizo:** 11 personas recorrieron la app: María (novata en el iPhone), Carlos (busca su primera venta), Andrea (media buyer, la que compra anuncios), Valentina (creadora), Diego (direct response), Patricia (creadora de Facebook), Cindy (vende por WhatsApp), Ricardo (ingeniero flojo), João (TikTok Shop), Hany (experta en VSL, el video de ventas) y Lucía (madre de 40 años).
- **Hallazgos reales: 123.** María 11 · Carlos 11 · Andrea 11 · Valentina 12 · Diego 11 · Patricia 12 · Cindy 11 · Ricardo 11 · João 9 · Hany 12 · Lucía 12.
- **24 arreglados** en la rama `auditoria-nocturna-2026-10-07` (6 commits, sin publicar). Esa rama también cubre 2 de los hallazgos nuevos (el "Clona" del Gemelo y la jerga del Mapa del negocio) y 2 más en parte.
- **Lo más urgente es la confianza.** La landing (la página de venta) todavía ofrece el cupón FUNDADOR, que venció el 30-sep. También anuncia el Oráculo, que el cliente no puede usar, y muestra un "VSL" que no reproduce nada.
- **La garantía tampoco cuadra.** Habla de "terminar tu producto", pero "Crear producto" está oculto para clientes.
- **Lo que más duele dentro de la app:** no hay una tarea del día a la vista, la moneda se pierde entre pantallas, Mini Apps cobra 150 créditos sin confirmar y varias herramientas borran trabajo que ya se pagó.

---

## 2. Los patrones que se repiten

### P1. No hay un "haz esto hoy" a la vista
- **La sufren:** María, Carlos, Ricardo, Lucía, Cindy y Patricia.
- **Por qué pasa:** el Inicio abre con "¿Qué quieres hacer hoy?" y 12 tarjetas (`DashboardPage.tsx:288-289`). Tu semana y "Tu camino" están plegados al final y cerrados al empezar (`DashboardPage.tsx:215-216`, `:458-465`). La semana ni siquiera se arma hasta que alguien abre ese pliegue (`BusinessJourney.tsx:217`).
- **La queja más fuerte (Ricardo):** "Necesito que me diga qué hacer hoy y cuánto tarda, si no, cierro."

### P2. Funciones clave en "pronto" u ocultas
- **Video que habla (Influencer IA):** cerrado para clientes por el interruptor `video-studio:ugc` (`video_kinds.sql:38`, `video-studio/index.ts:318-319`). La tarjeta promete "hazlo hablar en video por ti" (`tools.ts:61`). Lo sufren Diego, Ricardo, João, Patricia y Lucía.
  - Diego: "Para eso me voy directo a Higgsfield."
- **Crear producto:** solo lo ven los administradores (`features.ts:12`). Lo sufren Cindy, Lucía, Carlos y Ricardo.
  - Cindy: "La guía la tengo que escribir yo en ChatGPT. Entonces, ¿para qué pago?"
- **Genjutsu (copiar los movimientos de un video):** es un laboratorio solo para ti (`GenjutsuPage.tsx:7-11`). Lo sufre Patricia.
- **Ideas para WhatsApp y Mercado:** en pausa (`features.ts:12`). Lo sufren Cindy y João.
- **El paso "Cobra" del Gemelo:** dice "· pronto" (`GemeloFlow.tsx:143`). Lo sufren Cindy, Ricardo y Carlos.

### P3. La moneda se pierde
- **La sufren:** Carlos, Cindy y Lucía.
- **Por qué pasa:** el Gemelo guarda el precio en dólares aunque lo muestre en pesos (`GemeloFlow.tsx:110`). En la calculadora, el selector de moneda solo cambia el símbolo (`PricingPage.tsx:125`).
- **La queja más fuerte (Cindy):** "El Gemelo me dijo RD$1.020 y en la calculadora me sale US$17. Cambié a RD$ y ahora dice RD$17. ¿En qué quedamos?"
- La rama ya evita que la app invente "27". Pero la conversión de verdad sigue pendiente.

### P4. Cobros sin confirmar o poco claros
- **La sufren:** Carlos, Lucía y Ricardo.
- **Mini Apps:** cobra 150 créditos con un toque y lo muestra con "⚡" en vez de la palabra créditos (`KitsPage.tsx:302-303`, `:114-117`).
- **Kit o versión:** no se explica la diferencia entre el kit de 150 y "Hacer mi versión" de 50 (`KitsPage.tsx:139-155`).
- **"Recarga para seguir":** no dice que los créditos del plan se recargan solos (`LowCreditBanner.tsx:22-33`).
- **La queja más fuerte (Lucía):** "Toqué para ver más y se me fueron 150 créditos. Me da miedo tocar cualquier cosa."

### P5. Trabajo pagado que se borra o caduca
- **Lo sufren:** Valentina y Diego.
- **Valentina:** el Carrusel, Tu influencer IA y el guion de YouTube reemplazan lo anterior sin preguntar.
- **Diego:** los videos caducan a las 24 h y la lista muestra solo 6 (`PersonajePage.tsx:118`, `:569`).
- **La queja más fuerte (Valentina):** "Pedí otra foto de mi influencer para comparar y la primera desapareció. Y perdí los 10 guiones que ya había pagado."

### P6. Jerga sin explicar
- **La sufren:** María, Lucía, Patricia y Hany (con nombres que no aclaran nada).
- **Ofertas y Mapa del negocio:** checkout, upsell, downsell, bump, embudo. La rama ya los explica.
- **Carrusel:** "ADN ganador", "MVP · 2 pasos", "GPT Image 2" y "Nano Banana Pro" (`CarouselStudio.tsx:687`, `:972-973`).
- **Créditos:** la tabla tiene unas 35 filas con nombres técnicos (`CreditsPage.tsx:135-146`).
- **La queja más fuerte (Lucía):** "No entiendo nada de esto. Me siento perdida y lo cierro."

### P7. Facebook, TikTok y WhatsApp casi no aparecen
- **Facebook (Patricia):**
  - No existe como red en el tracker (`contentTracker.ts:9`, `:18`).
  - Modelar un carrusel solo acepta Instagram (`CarouselStudio.tsx:321`).
  - No hay pasos para publicar en una página de Facebook.
- **TikTok (João):**
  - "TikTok Shop", "afiliado" y "live" no dan resultados en el buscador (`GlobalSearch.tsx:81-87`).
  - `tiktok-search` está apagada.
  - El tracker no tiene tipo "Live".
- **WhatsApp (Cindy y Carlos):**
  - No hay mensaje de difusión para la lista de clientes.
  - "Recuperar ventas" sale sin moneda ni pago local.
- **La queja más fuerte (João):** "Busco lo que hago todos los días y la app me dice 'No encontramos nada'. Pienso que esto no es para mí y cierro."

### P8. Las herramientas son para quien empieza y no sirven para escalar
- **Lo sufren:** Hany, Diego y Andrea.
- **Textos:** los generadores escriben "para alguien que empieza" (`generators.ts:53`).
- **Veredicto de anuncios:** se carga a mano y solo mira CTR, gasto y ventas (`MandalaPage.tsx:225-249`). Además no usa el LTV que la app ya calcula, o sea cuánto deja un cliente con todo el embudo (`pricing.ts:39-45`).
- **Imágenes:** no hay lote. Siempre salen 3 imágenes en un solo formato (`imagePrompts.ts:82-84`).
- **La queja más fuerte (Hany):** "Le pido un VSL y me da la plantilla de un curso de 2019."

---

## 3. URGENTE: choca con el manual o con la confianza

Todo está comprobado en el código de `main` del 07-oct. La rama no toca ninguno de estos puntos.

1. **El cupón FUNDADOR venció y la landing lo sigue ofreciendo.**
   - `public/fundador/index.html` lleva `promoCode=FUNDADOR` en 12 enlaces.
   - El mismo archivo dice "hasta el 30 de septiembre) tu primer mes cuesta US$19,99".
   - Dentro de la app el cupón se cerró el 01-oct (`src/lib/plans.ts:57-58`).
   - No se comprobó qué cobra Whop hoy. Choca con: "nunca cambiar precios sin Jean" y "solo datos reales".
2. **El Oráculo se anuncia, pero solo lo ven los administradores.**
   - `src/components/landing/Engines.tsx:46-49` dice "El Oráculo descifra el negocio completo… En unos 25 segundos".
   - `src/lib/features.ts:12` lo deja en `ADMIN_ONLY_PAGES`.
   - Hany: "Eso es publicidad engañosa."
3. **El "VSL" de la landing es de mentira.** `src/components/landing/VslSection.tsx:5-7` dice "Placeholder hasta tener el video", y las líneas 24-34 son un botón de play que no hace nada.
4. **Actividad "en vivo" inventada en la landing.**
   - `src/components/landing/LiveFeed.tsx:3-9` tiene 5 anunciantes y puntajes escritos a mano (por ejemplo "SkinGlow Official").
   - Las líneas 20-26 los muestran con "Escaneando" y un punto que late.
   - Sí dice "Ejemplos" (línea 18), pero el manual prohíbe la actividad "en vivo" inventada.
5. **La garantía habla de "terminar tu producto" y Crear producto está oculto.**
   - `src/pages/DashboardPage.tsx:307` dice "si no terminas tu producto en 30 días, te devolvemos el 100 %".
   - `src/lib/features.ts:12` oculta "Crear producto" a los clientes.
   - Además, la garantía no está escrita en los planes (`plans.ts`, `PlanFeatures.tsx`), pero el asistente la menciona (`HelpAssistant.tsx:37`).
   - El manual dice: "Garantías solo si existen de verdad, como reembolso y con esas palabras."
6. **"$29,99" sin decir dólares.**
   - `src/components/landing/Hero.tsx:78` dice "Luego $29,99/mes" y `src/components/landing/FinalCta.tsx:15` dice "($29,99)".
   - En RD el signo $ son pesos. Los términos de la prueba sí dicen "US$29,99".
7. **"Anuncios activos ahora" es un número que nunca baja.**
   - `src/components/offers/OfferCard.tsx:67` dice "anuncios activos ahora" y `OfferDetailSheet.tsx:234` dice "corriendo a la vez".
   - Las dos usan `active_ads`, que solo sube (ejemplo del 25-sep: 44 en el catálogo contra 33 en Meta).
   - El manual pide que cada número diga qué cuenta. Hany: "Si tu dato de escala está inflado, no puedo confiar en nada más."
8. **Cifras de la landing que no cuadran.**
   - `Engines.tsx:53` dice "26 generadores" y la línea 55 muestra "29".
   - `SocialProof.tsx:3` incluye a España, pero `Engines.tsx:16` dice "Estados Unidos, Latinoamérica y Brasil".
9. **Influencer IA promete un video que el cliente no puede hacer.**
   - `tools.ts:61` dice "hazlo hablar en video por ti".
   - El paso 3 sale "PRONTO" con un enlace de afiliado a Higgsfield (`PersonajePage.tsx:575-602`).
   - El asistente se contradice: la línea 31 dice "no están abiertos" y la 64 explica "Crear video que habla" (`HelpAssistant.tsx:31` y `:64`).
10. **El botón "Ver la comunidad en Skool →" lleva a un pago de Whop.**
    - `VitrinaContext.tsx:81-89` y `PendingAccessPage.tsx:89-102` usan el enlace de pago de Whop.
    - La persona espera ver la comunidad y aterriza en el checkout.
11. **Influencer IA bloquea a quien no tiene producto.** `PersonajePage.tsx:140-148` muestra "Primero, elige qué vas a vender… Elige y clona una". Choca con el manual (§3: "Ninguna herramienta se bloquea por una ficha incompleta") y con la regla de decir "modelar".
12. **Riesgo de dinero si alguien enciende `tiktok-search`.** Usa `edge_guard` sin `edge_guard_charge` (`supabase/functions/tiktok-search/index.ts:34` y `:48`). Encendida así, gastaría en Firecrawl sin cobrar créditos. Hoy está apagada (`20260919150000_server_side_credits.sql:202`).

---

## 4. Plan por fases

### Fase 1: esta semana, sin decisiones de dinero
Son cambios de texto, de pantalla o de orden. No tocan precios, cobros ni catálogo. Igual necesitan tu OK para publicarse.

**Primero, la confianza en la landing**
1. Ocultar la sección del VSL falso hasta tener el video.
2. Quitar "Escaneando" y el punto que late, o poner 5 ofertas reales del catálogo.
3. Escribir "US$29,99" en Hero y FinalCta.
4. Igualar "26 generadores" y quitar España.
5. Quitar el Oráculo o cambiarlo por Veredicto + Mapa del negocio (las dos cosas ya existen).
6. Ocultar el selector "Português" del registro, porque no hace nada (`AuthPage.tsx:158`).

**Después, que nadie se sienta engañado dentro de la app**
7. Si el video que habla está cerrado, decirlo en la tarjeta de Influencer IA y en el paso 1, y ofrecer Anuncio en video.
8. Arreglar las líneas 31 y 64 del asistente para que no se contradigan.
9. Quitar el bloqueo de Influencer IA sin producto: preguntar "¿De qué trata tu página?" y decir "modela".
10. Cambiar "Ver la comunidad en Skool" por "Unirme a la Comunidad (pago en Whop)".
11. "Recarga para seguir" → "El [fecha] se recargan solos; si no quieres esperar, compra un paquete".
12. Mostrar en el teléfono el costo de cada herramienta (`DashboardPage.tsx:196`) y los minutos de cada tarea (`WeeklyPlan.tsx:179`).

**Rápido y sin dinero**
13. Agregar sinónimos al buscador: clonarme, mi cara, Facebook, fanpage, TikTok Shop, vertical, 9:16, live, afiliado.
14. Agregar Facebook como red en el tracker y un tipo "Live".
15. En el Carrusel:
    - Explicar los términos: "Lo que lo hizo funcionar", "Mejor letra / Más barata / Mejor foto".
    - Agregar la línea "Si lo viste en Facebook, búscalo en su Instagram".
    - Agregar pasos para publicar en una página de Facebook.
    - Agregar el checklist "Antes de publicar".
16. Poner Carrusel e Influencer IA en "Marca personal" y en el menú Crear del teléfono.
17. Gemelo:
    - Darle una entrada propia ("Modela una oferta que ya vende") que cree un producto nuevo.
    - Que los botones de un toque ofrezcan "Crear como producto nuevo" en lugar de pisar la ficha.
18. Paso "Cobra":
    - Hacer la pantalla "Cobra" con los pagos del país (Nequi, transferencia, OXXO) y el mensaje de entrega por WhatsApp, usando lo que ya existe.
    - Enlazarla con la tarea "Crea tu enlace de pago" del Plan.
19. "Hacer mi versión": si la oferta es una guía o un curso, que entregue "Tu guía o curso" y no una mini app. Mismo precio.
20. Una línea en Mini Apps que explique la diferencia entre el kit y "Hacer mi versión".
21. Creativos:
    - Un texto por concepto en la misma llamada de 15 créditos.
    - Descargar en JPG con nombres útiles.
    - Botón "Crear creativo" desde Ganchos.
    - Avisar a qué hora se libera el tope de 20 imágenes por hora.
22. Que las publicaciones orgánicas también cuenten para la etapa 5 "Vender".
23. Botón "Para tu editor": un zip gratis con los clips, el guion y los subtítulos .srt.
24. Asistente:
    - Un párrafo "Mini app: de la idea al cobro".
    - Un párrafo de Facebook.
    - La sugerencia "Quiero crear contenido con mi versión IA".

### Fase 2: necesita tu decisión
Son los puntos de la sección 5:
- FUNDADOR y garantía.
- Mini Apps con confirmación y no borrar trabajo pagado.
- La moneda.
- La tarjeta "Hoy" arriba del Inicio.
- El botón "Encontrar" en el menú del teléfono.
- La etiqueta de anuncios activos y "visto activo hace N días".
- El CPA de todo el embudo.
- La Comunidad.
- Ideas para WhatsApp.
- El generador de difusión por WhatsApp.
- Desplegar `weekly-plan` y `recovery-sequence`.
- Clones por dominio y filtros del Radar en el servidor.
- Elegir modelo de imagen en Creativos (precios ya aprobados).

### Fase 3: proyectos grandes
1. **Fase 2 del manual:** construir y publicar el embudo (principal, upsell, downsell y gracias) en un dominio aparte, con Pixel y API de conversiones. Es lo que Hany y Ricardo echan de menos frente a Quantum Miner.
2. **Video que habla para clientes:** abrir el UGC y permitir 2 o 3 tomas encadenadas de 10 s (dr-2). También guardar los MP4 para que no caduquen.
3. **Crear producto para clientes:** el ebook o la guía por capítulos, con los precios ya aprobados y vigilados en `admin_margin`.
4. **Genjutsu para clientes:**
   - Cobro en el servidor antes de generar y reembolso si falla.
   - Precio ≥ 5 × costo real (nunca menos de 3×).
   - Solo plan pagado.
   - Guía de 3 pasos y reglas visibles: el movimiento sí; la cara, la voz o la marca del original, no.
5. **"Soy yo":** Influencer IA con la foto propia y consentimiento. La voz clonada va aparte.
6. **Herramientas para quien escala:**
   - Modo "Escalar un ganador" (lote de N ganchos).
   - Imagen sin letras + titular editable gratis.
   - Modo VSL avanzado.
   - Métricas de media buyer (CPM, hook rate) y CSV de Meta.
   - LTV real.
7. **Conteo real de anuncios activos para todo el catálogo:** toca el pipeline, así que va con tu OK y sin ocultar ni bajar ninguna oferta.
8. **Reportes cada 15 días:** un resumen en el Inicio con datos reales, y por correo cuando Resend tenga el dominio verificado.

---

## 5. Decisiones que necesitas tomar

Los precios van siempre entre 3× y 6× del costo real, con 5× como meta. En créditos: **costo real en US$ × 5 ÷ 0,008**. Ningún punto promete ingresos.

**Confianza y precios publicados**
1. **Cupón FUNDADOR vencido en la landing** (12 enlaces y 2 textos). **Recomiendo:** quitarlo hoy de enlaces y textos, no extenderlo, y revisar en Whop qué precio sale de verdad en el checkout.
2. **Garantía de 30 días.** Habla de "terminar tu producto", no está escrita en los planes y el asistente la menciona. **Recomiendo:** confirmar en Whop si existe y con qué condición. Si existe, escribirla en los planes con las palabras "reembolso del 100 %". Mientras Crear producto siga oculto, que la condición hable de algo que la app sí entrega hoy. Si no existe, quitarla del Inicio, del asistente y del manual.
3. **Oráculo, VSL falso y "Escaneando" en la landing.** **Recomiendo:** quitar los tres esta semana. Cambiar el Oráculo por Veredicto + Mapa del negocio, y el feed por 5 ofertas reales.
4. **"$29,99" sin moneda.** **Recomiendo:** escribir "US$29,99". El precio es el mismo.
5. **"Anuncios activos ahora" que nunca baja.** **Recomiendo:** cambiar ya la etiqueta a "anuncios vistos activos (acumulado)". En la ficha, mostrar el conteo en vivo cuando la oferta se sigue. El conteo real para todo el catálogo va después, porque toca el pipeline.
6. **"Visto activo hace N días".** **Recomiendo:** sí. Solo informa y no oculta nada; el dato ya existe.

**Cobros y créditos**

7. **Mini Apps cobra 150 al primer toque.** **Recomiendo:** sí a la confirmación ("Esto usa 150 de tus N créditos") y a la vista previa gratis, y cambiar "⚡" por "créditos". El precio no cambia.
8. **Trabajo pagado que se borra** (Carrusel, Influencer IA, YouTube). **Recomiendo:** pedir confirmación, guardar las últimas 5 versiones y no borrar la foto anterior. Los videos se quedan en la lista con "Ver más".
9. **"Otra versión" en YouTube cobra 50 otra vez.** **Recomiendo:** que reescriba sobre el análisis que ya existe, con el generador de texto, y a un precio de 5 × costo.
10. **Escribir el producto durante la prueba de 3 días.** **Recomiendo:** no cambiar la regla. Decir desde el primer día qué se puede hacer en la prueba y dejar visible "Actívalo ya con una recarga".
11. **Mensajes de créditos iguales en toda la app.** **Recomiendo:** sí, siempre "N créditos" con "Recargar". El aviso de saldo bajo debe decir la fecha en que se recargan solos.

**Funciones cerradas**

12. **Video que habla para clientes.** **Recomiendo:** pruebas 1 video de 10 s desde tu cuenta (110 créditos) para ver si los labios quedan bien en español. Si sirve, abres el interruptor. Si no, la tarjeta dice "pronto" desde el inicio.
13. **Crear producto para clientes.** **Recomiendo:** abrir el piloto a quien ya pagó el plan, con los precios por capítulo ya aprobados, después de revisar en `admin_margin` que siguen en 5× o más. Esto también arregla la garantía.
14. **Genjutsu para clientes.** **Recomiendo:** no abrirlo hasta tener cobro en el servidor, precio de 5 × costo y solo plan pagado. Mientras tanto, que el asistente diga "llegará más adelante" y no solo mande al enlace de afiliado.
15. **Ideas para WhatsApp (en pausa dentro de Mercado).** **Recomiendo:** sacarla a Ofertas con su precio de hoy (15). Mercado sigue cerrado.
16. **Generador nuevo "Lanza a tu lista de WhatsApp"** (difusión, estados, oferta a quien ya compró). **Recomiendo:** sí, como generador ligero de 15 si el costo real lo deja en 5× o más. Hay que añadirlo a `GEN_LIGHT_IDS` y a `credit_prices`.

**Producto y navegación**

17. **En qué moneda se guarda el precio.** **Recomiendo:** guardar la moneda local del Gemelo con su código (por ejemplo COL$89.000). La calculadora convierte de verdad y muestra "aprox. US$" solo como referencia.
18. **Cobro local (etapa 4).** **Recomiendo:** guía provisional "Cobra por Nequi, transferencia u OXXO y entrega por WhatsApp", con su mensaje listo, hasta que llegue la Fase 2. Hay que fijar las comisiones de cada vía.
19. **Tarjeta "Hoy" arriba del Inicio.** Choca con tu decisión del 04-oct de dejar las recomendaciones al final. **Recomiendo:** UNA línea compacta que se pueda cerrar: "Tu siguiente paso: … (~10 min) · 2 de 5 esta semana". Sin producto, que diga "Empieza de cero: encuentra qué vender (gratis)". Las 6 etapas siguen siendo opcionales. La pidieron 6 de las 11 personas.
20. **Botón "Encontrar" en el menú del teléfono e Influencer IA en "Crear".** **Recomiendo:** sí a los dos.
21. **Un solo nombre ("Mi negocio") y que el Inicio use las respuestas del registro.** **Recomiendo:** sí a los dos.
22. **CPA máximo de todo el embudo en el veredicto.** **Recomiendo:** sí. Mostrar los dos límites, el del producto principal y el del embudo completo (LTV), y el botón "Usar este máximo como mi CPA objetivo".
23. **Desplegar `weekly-plan` y `recovery-sequence`.** Hoy Tu semana no puede mandar a video, carrusel ni creativos y empuja el ebook, y Recuperar ventas sale sin moneda. **Recomiendo:** sí, después de una prueba con tu cuenta.
24. **Comunidad de US$99.** No dice quién da las llamadas, cada cuánto ni cómo se cancela. **Recomiendo:** escribir solo lo que exista de verdad (calendario, quién la lleva, cuántos productos, cómo cancelar) y no llamarla "mentoría" hasta que haya acompañamiento real.
25. **Reportes cada 15 días** (el manual los cuenta como razón para pagar, pero no existen). **Recomiendo:** no nombrarlos hasta tenerlos y empezar con un resumen en el Inicio con datos reales.
26. **Clones por dominio y filtros del Radar en el servidor.** **Recomiendo:** sí. Son funciones de solo lectura, probadas antes en un Postgres local.
27. **TikTok y afiliados (João).** **Recomiendo:**
    - Opción A + B: una tarjeta "De comisiones a tu producto", sinónimos en el buscador y un tipo "Live" en el tracker, sin generadores nuevos.
    - No encender `tiktok-search` ni abrir Mercado por ahora.
    - Decidir aparte si SUPERNOVA atiende productos físicos.

---

## 6. Lo que ya está arreglado en la rama (sin publicar)

Rama `auditoria-nocturna-2026-10-07`: 6 commits, 29 archivos. No tiene migraciones ni cambios en funciones del servidor.

| Commit | Qué arregla |
|---|---|
| `125344c` | Novatos: salida a Ofertas en "¿Qué vendes?", el iPhone ya no hace zoom solo, registro con "Atrás" y "Crear mi cuenta", errores en español, botones de 44 px, "Ver mis créditos". |
| `4db2739` | Ofertas y precio: checkout, upsell, downsell, bump y embudo explicados (también en el Mapa del negocio). La calculadora lee la moneda del texto y ya no inventa 27. Precio "supuesto" sin números grandes. |
| `7d485d9` | Guía y nombres: Plan (y Contenido) en el menú low ticket, "Tu semana" separado en tres nombres, el Gemelo dice "Modela" y adivina el país, tour del teléfono sin ⌘K. |
| `ebe981b` | Radar y Ganchos: filtro hasta 365+ días, "Revisados hace poco", hora real de actualización, aviso de que el tipo filtra solo la página, sin "1 anuncios activos". Ganchos con anuncio original, idioma, "Hacer carrusel" y "Escribir textos". |
| `9f52d26` | Mándala y Contenido: "Ganador" solo con 3 ventas o más, cada pieza abre su herramienta, borrar tiene 5 s para "Deshacer". |
| `f0c5944` | Carrusel: guardar en Fotos o compartir en un toque en el teléfono, una sola copia por versión, Deshacer y Rehacer de 20 pasos. |

Estado: las 280 pruebas automáticas pasan y la app compila. Los errores de tipos son los mismos 126 de `main`, ninguno nuevo. **No se probó en un iPhone real ni con sesión iniciada.**

**Para revisar antes de publicar:**
- Se agregó Contenido al menú de low ticket. Dime si lo dejamos.
- Ningún punto de la sección 3 está en la rama.

**Cómo publicarlo con tu OK:**
1. Pruébalo en local: en `/private/tmp/claude-501/-Users-usuario-SUPERNOVA/5f102904-3eec-4250-8f37-7d1a11210bf2/scratchpad/wt-auditoria`, corre `npm run dev`.
2. Si me dices "publica la rama de la auditoría", la uno a `main` y hago push. Vercel la despliega solo; no hay migraciones ni funciones que desplegar.
3. Después la verifico en producción: registro en el teléfono, Ofertas → Precio, Radar, Ganchos, Mándala, Contenido y Carrusel. Te digo qué quedó probado y qué no.

---

## 7. Persona por persona

**María (novata total, iPhone) · 11 hallazgos, 8 arreglados en la rama.**
- Veredicto: no encuentra por dónde empezar, y el menú del teléfono no tiene "Encontrar".
- Su frase: "Me salieron un montón de botones de 'Creativos', 'Carrusel', 'Video con IA', todos con créditos. No vi nada que dijera 'empieza aquí'."

**Carlos (primera venta) · 11 hallazgos, 5 arreglados.**
- Veredicto: avanza hasta el precio, pero la moneda se pierde y la etapa 4 no le dice cómo cobrar con Nequi.
- Su frase: "En el Gemelo me salió COL$108.000, pero en Precio me aparece 27."
- También: "Toqué el botón de la mini app y se me fueron 150 créditos. Ni me preguntó."

**Andrea (media buyer) · 11 hallazgos, 6 arreglados (1 provisional) y 1 en parte.**
- Veredicto: le gusta la longevidad como prueba. Pero "anuncios activos ahora" está inflado, no ve "visto activo hace N días" y el CPA máximo no llega al veredicto.
- El informe no guarda una frase textual suya.

**Valentina (creadora) · 12 hallazgos, 5 arreglados.**
- Veredicto: produce rápido, pero pierde trabajo pagado.
- Su frase: "Edité a mano un guion que me costó 50 créditos, toqué 'Nueva idea' y se borró. 'Otra versión' me cobra los 50 otra vez."

**Diego (direct response) · 11 hallazgos reales (1 descartado).**
- Veredicto: los 10 estáticos y los 5 videos caben en los 2.000 créditos (766 con el UGC abierto, 681 con Anuncio en video). Lo que lo frena es otra cosa: no hay lote, sale un solo texto para 3 conceptos y el video que habla está cerrado.
- Su frase: "Elijo influencer, escribo guiones y en el paso 3 me sale «Pronto», una preventa y un enlace a Higgsfield. Para eso me voy directo a Higgsfield."
- **Su prueba sensata, tal cual:**

> UNA prueba de 33 créditos, unos 10 minutos, desde la cuenta de Jean. Mide lo que Diego sí puede usar hoy.
>
> PANTALLA: Crear → Creativos para anuncios (#/creativos). Producto activo con ficha completa, o entrar desde una oferta con "Crear con esta idea" → "Solo abrir, sin crear".
>
> ENTRADAS
> - Formato: 4:5 (el que viene por defecto).
> - "¿Qué sabe ya tu cliente?": nivel N2 · Busca una solución, sin tocar conceptos. Salen sus 3 recomendados, ninguno pide un dato real.
> - "Poner un texto en la imagen": un gancho corto de Ganchos, de 60 caracteres o menos.
> - Kit de marca: si hay una foto del producto, dejarla activada.
>
> MODELO: GPT Image 2 vía APIMart. Es el único que usa Creativos: ImageStudioPage.tsx:126 no envía `model`.
>
> CRÉDITOS
> - "Crear 3 imágenes · 18 créditos" (3 × gen_ad_image 6).
> - Después, en "Listo para publicar", "Escribir el texto del anuncio · 15 créditos" (mandala-ad).
> - Total 33. Si una imagen falla debe devolverse sola: ver el historial de créditos.
>
> QUÉ MIRAR (anotar sí o no)
> 1. ¿El texto dentro de cada imagen dice EXACTAMENTE el gancho, sin faltas ni letras raras? Si no, no se puede corregir sin pagar otra imagen (dr-6).
> 2. ¿Los 3 conceptos son de verdad 3 ángulos distintos, o la misma escena con otro fondo?
> 3. ¿El texto del anuncio trae texto principal de 125 palabras o menos, 3 titulares de 40 caracteres o menos y una descripción de 30 o menos? ¿Sirve para los 3 conceptos o solo para uno (dr-4)?
> 4. "Descargar todo" en el iPhone: ¿bajan los 3 archivos o solo 1? ¿Qué nombre y formato traen (.webp)? ¿Se pueden subir así al Administrador de anuncios (dr-8, dr-9)?
> 5. Tiempo real desde el clic hasta la tercera imagen, y saldo antes y después (debe bajar exactamente 33).
>
> OJO
> - No probar el video que habla para medir a Diego. Jean es admin y el interruptor `video-studio:ugc` solo deja pasar a admins (supabase/functions/video-studio/index.ts:11 y :318): a Jean le funcionaría y a Diego no.
> - Ese video (110 créditos) es otra decisión: sirve para ver si los labios quedan sincronizados en español antes de abrirlo a clientes, cosa que el código dice que no se pudo probar (video-studio/index.ts:9-11).

- Nota del verificador: `gen_ad_image = 6` solo aparece en comentarios de las migraciones; el único INSERT dice 25. Hay que confirmar el 6 en la base. Además, hacer 12 + 9 imágenes en la misma hora pasa el tope de 20 por hora.

**Patricia (creadora de Facebook, quiere "clonarse") · 12 hallazgos.**
- Veredicto: no llega a su primera publicación guiada. Influencer IA le pide un producto, no puede usar su cara, Genjutsu no existe para ella, el carrusel solo acepta Instagram y Facebook no está en el tracker.
- Su frase: "Yo solo quiero contenido para mi página. ¿Por qué me pide elegir qué voy a vender y que 'clone una oferta'?"

**Cindy (vende por WhatsApp) · 11 hallazgos.**
- Veredicto: en 48 h tiene la idea validada, el precio, los mensajes y las imágenes. Pero no tiene el producto, y su meta era "segundo producto creado".
- Su frase: "La guía la tengo que escribir yo en ChatGPT. Entonces, ¿para qué pago?"
- **Su plan de 48 h:**
  - **Día 1, mañana (unas 2 h, casi gratis):**
    - Crear un producto nuevo con "+ Nuevo producto". Si no, el Gemelo no aparece.
    - Negocio Gemelo: oferta, RD, español, pagos de RD y entrega por WhatsApp (0 créditos).
    - Seguir 2 o 3 candidatas (10-15 créditos).
    - Validar con 14 preguntas (gratis).
    - Precio con "Pago directo" (gratis, pero cambiando US$ por RD$ a mano).
  - **Día 1, tarde:**
    - "Hacer mi versión" (50 créditos): análisis y guion de WhatsApp en RD$.
    - **Aquí se corta:** Crear producto está oculto y además no escribe durante la prueba. Un ebook de 8 capítulos costaría 120 (Estándar) o 280 (Premium).
  - **Día 2 (unas 2-3 h):** secuencia de WhatsApp (15), descripción (30), order bump (15), Creativos (18), Carrusel (15), Recuperar ventas (15), anuncio opcional (15) y tracker con WhatsApp.
  - **Totales:** unos 160-200 créditos de 2.000 y 5-6 h de pantalla, más escribir el producto fuera de la app.
- **Su "ventaja única", lo que SUPERNOVA le da y otros no:**
  1. Días anunciando como prueba de venta, en cada tarjeta.
  2. `copy_score` y "Solo replicables".
  3. Números del negocio con "Pago directo" sin comisión y CPA máximo en su moneda.
  4. Adaptación a LATAM: RD$, pagos de RD, entrega y guion por WhatsApp.
  5. Acompañamiento: 6 etapas, Tu semana, Recuperar ventas y tracker con WhatsApp.
  6. Varios productos con ficha propia (3 en PRO).
  7. Mirar gratis.
- **Lo que la competencia le da y nosotros no:**
  - Construir y publicar el embudo (Quantum Miner).
  - Paquetes listos cada mes.
  - Precio de entrada bajo.
  - Extensión de Chrome y academia gratis.
  - "Ideas para WhatsApp", que existe pero está en pausa.

**Ricardo (ingeniero sin motivación) · 11 hallazgos.**
- Veredicto: le da confianza que todo venga de ofertas reales y que el video con IA funcione. Se desmotiva por tres cosas: no hay "haz esto hoy", la mini app termina en "pega esto en otra IA" y el influencer que habla dice "pronto".
- Su frase: "Pagué y me dieron un texto para pegar en otra IA. ¿Dónde la construyo, dónde la subo y cómo cobro? Esa es justo la parte donde siempre me quedo."

**João (TikTok Shop) · 9 hallazgos reales (1 descartado).**
- Veredicto: SUPERNOVA le sirve como fábrica de video vertical y como puerta para tener un producto digital propio. No le sirve para TikTok Shop.
- Su frase: "Busco lo que hago todos los días y la app me dice 'No encontramos nada'. Pienso que esto no es para mí y cierro."
- **Sus opciones para ti:**
  - **A:** "De comisiones a tu producto". Tarjeta a Ofertas → Gemelo con MX$ y el filtro de Brasil para transcrear. Cero créditos nuevos.
  - **B:** Estudio de video corto. Ganchos de TikTok visibles, sinónimos en el buscador y tipo Live.
  - **C:** datos de TikTok (`tiktok-search`, que cuesta y choca con "solo digitales").
  - **D:** abrir Mercado de afiliados.
  - Su recomendación: A + B, sin generadores nuevos.

**Hany (experta en VSL y Meta Ads) · 12 hallazgos.**
- Veredicto: buen radar y buena calculadora para quien empieza, pero todavía no sirve para escalar a nivel profesional.
- Su frase: "Una herramienta que me quiere enseñar a vender con VSL y su propia landing tiene un VSL falso. Le di play tres veces."
- **Sus notas por herramienta:**
  - Radar de anuncios: **7/10**.
  - Ofertas + checkout + Veredicto: **6/10**.
  - Veredicto de anuncios (Resultados): **4/10**.
  - Calculadora de precio y CPA máximo: **7/10**.
  - Mapa del negocio / LTV: **8/10**. Es lo mejor de la app para su nivel y ningún competidor lo tiene.
  - VSL, guiones, ganchos y ángulos: **4/10**. Aparte: banco de Ganchos 6/10 y Mándala 6/10.
  - Creativos y Anuncio en video: **6/10**.
  - Embudos y página de ventas: **3/10**.
  - Recuperar ventas: **5/10**.
  - Reportes cada 15 días: **1/10**, porque no existen.
- **Sobre la mentoría:** la Comunidad de US$99 cumple el manual, porque no promete ingresos. Pero no dice qué se compra: quién da las llamadas, cada cuánto, si revisan campañas, cómo se cancela. Le habla a "personas que están aprendiendo", y "Ver la comunidad en Skool" lleva a un pago. La compraría con un calendario real, quién la dirige, revisión de campañas o VSL, grabaciones, cuántos productos permite y poder ver Skool antes de pagar.

**Lucía (madre de 40 años, poco tiempo) · 12 hallazgos (1 ya cubierto en la rama).**
- Veredicto: le engancha "copiar lo que ya vende", el asistente gratis que recuerda la conversación y el costo escrito en cada botón. Cancelaría por:
  - los 150 créditos de un toque;
  - no poder crear el producto que promete la garantía;
  - los RD$ sin sentido;
  - creer que "Recarga para seguir" es pagar más.
- Su frase: "Me dicen que si no termino mi producto en 30 días me devuelven el dinero, pero no encuentro dónde crearlo."

---

## 8. Lo que no se pudo probar

- **Pantallas con sesión iniciada:** Ganchos, Contenido, Mándala, Radar, Carrusel, Ofertas por dentro, Influencer IA, Mini Apps, Precio, Creativos y Créditos. No se inició sesión ni se crearon cuentas. Todo sale de leer el código y de las pruebas automáticas. Lucía y el equipo principal solo vieron en el navegador la landing y `/signup`, a 375 px.
- **IA real y cobros:** no se gastó ningún crédito ni se llamó a ninguna IA. La prueba de 33 créditos de Diego está pendiente para tu cuenta.
- **Interruptores en producción:** no se comprobó si `video-studio:ugc` está cerrado hoy, ni el precio real de `gen_ad_image` en la base (¿6 o 25?).
- **Whop:** no se abrió el checkout para ver si FUNDADOR todavía aplica, ni si la garantía de 30 días existe en Whop.
- **iPhone real:** "Guardar en Fotos" del Carrusel (en la rama) y "Descargar todo" de Creativos no se probaron en un equipo.
- **Datos de la base:** no se verificó si "114.000 anuncios" de la landing sigue siendo cierto. Por regla, no se corrieron consultas pesadas en producción.
