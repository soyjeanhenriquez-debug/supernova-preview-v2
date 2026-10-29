# Cazador Swipe → SUPERNOVA: lo bueno de Cazador, x10

Fecha: 29-oct-2026 · Estado: PROPUESTA (no se tocó código, base ni producción) · Autor: estratega de producto

Jean es dueño de Cazador Swipe y quiere llevar a SUPERNOVA todo lo bueno de Cazador, mejorado x10 en
funciones, presentación y veracidad de los resultados. Este documento sale de dos lecturas hechas hoy:

- **Cazador, en vivo**, con la sesión que Jean ya tenía abierta (solo mirar: no cambié ajustes, no guardé
  nada, no elegí nichos, no toqué "Guardar búsqueda").
- **SUPERNOVA, en el código**: `OfertasPage.tsx`, `OfferCard.tsx`, `OfferDetailSheet.tsx`, `WinningAdsPage.tsx`,
  `lib/offers.ts`, `lib/offerIntel.ts`, `lib/offerWatch.ts` y las migraciones del 28 y 29 de octubre.

Respeta `supernova/CLAUDE.md`: nada de cifras inventadas, cada número dice qué cuenta, ninguna promesa de
ingresos dentro de la app, el catálogo no se recorta, y todo cobro lo hace el servidor.

---

## 0. Aviso: ya hay un rediseño estilo Cazador en curso

Mientras escribía esto (29-oct, entre las 00:09 y las 00:18) apareció trabajo nuevo en
`src/components/offers/`: `LevelBars.tsx`, `offerUi.ts` y `OfferQuickView.tsx` (ficha rápida), y `OfferCard.tsx`
ya usa niveles con barras, idioma, "Lo haces tú solo" y "Ver ficha rápida". Es decir: otra sesión ya está
haciendo la **Ola 1, puntos 1 y 2** de este plan. No lo dupliques: termínalo, verifícalo y pasa a lo
siguiente. (Mi lectura de `OfferCard.tsx` al inicio era la versión vieja.)

---

## 1. Qué hay hoy en Cazador (lo que vi, pantalla por pantalla)

Catálogo al 29-oct: **669 ofertas** ("670 resultados" en el listado, "Actualizado hoy"). Acceso vitalicio
para Jean (Miembro fundador). Menú: Inicio · Ofertas · Escaladas · Radar · Colecciones · Más.

### 1.1 Inicio
- Primera vez: "¿Qué nichos te interesan? Elige hasta 3. Cada uno tendrá su propia fila en tu Inicio, con las
  ofertas más escaladas." (pantalla de 26 nichos con foto y conteo; se puede "Saltar por ahora").
- No elegí nichos (es un ajuste de la cuenta). Por eso **no vi** cómo queda el Inicio ya personalizado.

### 1.2 Ofertas (listado)
- Título "Todas las ofertas · 669". Buscador ("Busca ofertas, nichos o dominios", atajo `/`).
- **Orden** (5): Por escala · Más anuncios · Más tiempo en el aire · Más vistas · Más recientes.
- **Guardar búsqueda** (no lo toqué: crea un dato en la cuenta).
- **Filtros** (todos con conteo por opción, varios a la vez, enlace compartible tipo
  `/ofertas?checkouts=WhatsApp&pagina=2`):
  - **Nicho** (26): Adelgazamiento 42 · Adulto 6 · Deporte 5 · Desarrollo Personal 19 · Edición 14 ·
    Educación 61 · Educación Online 1 · Espiritualidad 14 · Finanzas 3 · Fitness 26 · Hobbies 12 · Infantil 35 ·
    Ingresos Extra 69 · Inteligencia Artificial 12 · Mapas Mentales 7 · Marketing 1 · Mascotas 6 ·
    Maternidad 12 · Packs 69 · Planillas 8 · Recetas 58 · Relaciones 36 · Religión 46 · Salud 13 ·
    Templates 8 · Otras 86.
  - **Idioma**: Español 121 · Portugués BR 503 · Inglés 21 · Francés 6 · Italiano 6 · Portugués PT 12 (y alguno más).
  - **País**: Brasil 503 · Estados Unidos 21 · Argentina 9 · Francia 6 · España 2 · Colombia 1 …
  - **Checkout**: Hotmart 261 · Otra 200 · Kiwify 51 · WhatsApp 28 · Cakto 19 · Kirvano 17 · Eduzz 14 ·
    LastLink 14 · Green 12 · Cart Panda 11 · Guru 9 · Doppus 7 · Hubla 4 · Payt 3 · Checkout Propio 2 ·
    PerfectPay 2 · Wiapy 2 · Impultienda 1.
  - **Tipo de producto**: Infoproducto, Aplicativo (no capturé los conteos).
  - **Funnel**: Página de Ventas 471 · Quiz 115 · VSL 52 · WhatsApp 31 · Página de Captura 1.
  - **Tags**: libres, con conteo chico (Low Ticket, Aplicación, Fitness, dinámicas, Educación, +18…).
  - **Anuncios**: 4 botones de nivel (Testeando / Validando / Escalando / Dominando) **o** rango "Desde / Hasta".
  - **Nuevas (7 días)** (no pude confirmar cuántas devuelve: la pantalla no refrescó el conteo mientras la miré).
  - "Limpiar filtros" cuando hay alguno activo.
- **Seleccionar**: modo de selección múltiple con barra abajo: **Guardar · A colección · Copiar enlaces · Cancelar**.
- **Tarjeta**: imagen grande del creativo · insignia de nivel con 4 barritas · botón guardar (marcador) ·
  nombre · "**380 anuncios (contados el 27 oct)**" · "Recetas, 327 días en el aire" · chips: tipo de funnel,
  tipo de producto, idioma con bandera. **No muestra precio en la tarjeta.**

### 1.3 Ficha rápida (al tocar una tarjeta)
Ventana con la imagen a la izquierda y a la derecha: nivel, nombre, chips, **Anuncios** (con fecha de conteo),
**Activa desde** ("6 dic 2025 · hace 327 días"), **Ticket** ("USD 7"), un párrafo de qué es, y dos botones:
**Guardar** y **Ver oferta completa**.

### 1.4 Ver oferta completa (`/oferta/<id>`)
- Cabecera: nivel, nombre, chips, anuncios activos con fecha de conteo. Botones: Guardar · Colección ·
  Compartir · Reportar · **Seguir en Cazador ROI**. Pestañas: Visión general · Ofertas relacionadas (12).
- **Tiempo en el aire**: "327 días · Activa desde 6 dic 2025 · *Contados desde el anuncio activo más antiguo de la oferta*".
- **Interés de la comunidad**: "vistas esta semana 43 · personas la guardaron 3". Son números reales de uso;
  en una oferta nueva decía "1 vista, 0 guardaron" (no los esconde).
- **Termómetro de escala** (las reglas EXACTAS están publicadas en la ficha):
  - Testeando: hasta 19 anuncios y hasta 14 días en el aire
  - Validando: 20 a 49 anuncios **o** 15 a 29 días en el aire
  - Escalando: 50 a 299 anuncios **o** 30 días en el aire o más
  - Dominando: 300 anuncios o más
  - Lectura: un nivel lo sube cualquiera de las dos medidas (anuncios o días), y se muestra la regla al lado.
    Ejemplos reales: 780 anuncios y solo 16 días = Dominando; 59 anuncios y 29 días = Escalando; 44 anuncios y 8 días = Validando.
- **Links del funnel**: Biblioteca de Anuncios (con el `view_all_page_id`), Página de ventas, Checkout.
- **Sobre la oferta**: texto de qué es + "Público: …".
- **Clasificación**: Nicho · Tipo de producto · Funnel · Idioma · Plataforma de tráfico (Facebook, Instagram) ·
  **Ticket** · País · Plataforma de checkout · **Anuncios contados el** (fecha) · **Anuncio más antiguo** (fecha) ·
  **Entró al Swipe** (fecha) · ID interno (CS-00678) · Tags.
- **Ticket en moneda local + USD**: "EUR 17 (≈ US$19)", "BRL 37,90 (≈ US$7,1)", "USD 7". Pie de página:
  "Precios aproximados en dólares con la cotización del 28 oct, de ExchangeRate-API."
- Los números de anuncios son redondos casi siempre (380, 310, 600, 340, 780, 490, 480, 210…) y llevan fecha
  de conteo distinta por oferta (22, 23, 26, 27, 28 oct). Es la señal de que se cuentan en tandas, no al día.
  No pude ver cómo los cuentan; no lo afirmo.

### 1.5 Escaladas
- Regla escrita en pantalla: "Primero el nivel de escala. En el mismo nivel, la que lleva más tiempo en el aire;
  si empatan, la de más anuncios."
- Botones de orden: Por escala · Más tiempo en el aire · Más vistas. Chips de nicho con conteo.
- Top 3 en podio grande (1, 2, 3) y tabla desde el puesto 4: # · Oferta · Nicho · Anuncios · Escala ·
  En el aire · **Vistas (7 días)**.

### 1.6 Radar (curaduría firmada)
- "**Análisis de Romildo**": solo **10 ofertas** analizadas a fondo, filtrables por nicho, orden "Más recientes / Mejor nota".
- Cada una: **nota /10**, fecha de análisis, nivel, anuncios, **¿La modelaría? (Sí / Tal vez)**, un párrafo
  en primera persona, **países que testaría** (con banderas) y **ticket que testaría** (un número).
- Análisis completo: Por qué llamó la atención · Qué está funcionando (empieza con "No puedo confirmar qué
  elementos están generando ventas, pero sí puedo identificar…") · Cómo la adaptaría a LATAM · Qué
  modelaría · Qué cambiaría.
- Es contenido de una persona con nombre. Es lo que da autoridad al producto, no un cálculo.

### 1.7 Colecciones
- "Carpetas para organizar tus ofertas guardadas." Una carpeta automática "Todas las guardadas" (5 ofertas
  en la cuenta de Jean) + "Nueva colección". Cada carpeta muestra un mosaico de 4 portadas.

### 1.8 Menú "Más", campana y ajustes
- **Más**: Cazador ROI (producto aparte en cazadorderoi.romildo.digital: acervo propio para pegar un enlace
  de la Biblioteca de Meta, tomar "snapshots" de anuncios activos y recibir un consejo "modelar / seguir
  observando / descartar"; oferta de lanzamiento US$5,90 pago único, 94 ofertas rastreadas en su portada) ·
  Extensión Cazador de Ofertas (no la abrí) · Suscripción · Configuraciones · **Recomienda y gana** (afiliados
  por Hotmart, "hasta 40 % de comisión") · Ayuda y soporte.
- **Campana**: vacía hoy ("Notificaciones" + "Configurar notificaciones").
- **Notificaciones** (4, llegan por correo y a la campana): **Oferta acelerando en tus nichos** ("cuando una
  oferta sube de nivel de escala en uno de tus nichos") · **Resumen semanal** (todos los lunes, lo que más
  escaló) · Nuevas clases en la Academy · Novedades de Cazador Swipe.
- **Resumen diario por WhatsApp**: NO está en la app. No pude verlo ni confirmar cómo se calcula. Lo único
  que tengo es tu ejemplo ("7 ofertas nuevas hoy · 29 en la semana; lo más fuerte: Escalando · 99 anuncios ·
  Ingresos Extra; nichos de la semana"). Lo diseño abajo con datos que SÍ tiene SUPERNOVA.

### 1.9 Lo que Cazador hace regular (y SUPERNOVA puede superar)
1. **Catálogo chico y casi todo en portugués**: 503 de 669 son Brasil / portugués BR; en español hay 121 (18 %).
2. **Anuncios contados en tandas**: la fecha de conteo va de 22 a 28 oct. Honesto por poner la fecha, pero viejo.
3. **Sin medida de "¿lo puedo hacer yo solo?"** ni de dinero del negocio (ticket sí, LTV / CPA máximo no).
4. **El Radar son 10 ofertas hechas a mano**: no escala; el resto del catálogo no tiene análisis.
5. **"Seguir" es otro producto aparte** (Cazador ROI) y por pegado manual de enlaces.
6. **Termómetro con regla de 300 anuncios**: una oferta con 150 anuncios y 1 año en el aire es "Escalando",
   pero una con 780 anuncios y 16 días es "Dominando": mezcla escala con prueba.
7. El enlace al checkout se muestra con parámetros de rastreo de Meta (`fbclid`, `utm_…`) tal cual.

---

## 2. Cómo está SUPERNOVA hoy en esas mismas cosas (del código)

- **Tabla `offers`** (una fila por anunciante y mercado, enriquecida por IA): `active_ads`, `live_active_ads` +
  `live_capped` + `live_checked_at` (conteo en vivo en la Biblioteca de Meta por la API oficial, `offer-live-count`,
  cada 6 h en lotes de 150; cada anunciante se relee a los 3 días), `days_active`, `winner_score`,
  `winner_index` (0-100, mitad dinero, mitad copiabilidad; solo las ~300 ganadoras), `copy_score` (1-5),
  `niche` (19 temas), `offer_type`, `business_model`, `language`, `market` + `markets[]`, `price_hint` (texto
  libre con moneda), `mechanism`, `why_wins`, `target_audience`, `canal` (whatsapp / pagina / mensajes), `canal_url`,
  `offer_platform.platform` (dónde cobran), `first_seen`, `last_seen`.
- **Ofertas**: pestañas Ganadoras (300) / Explorar todo / Cursos y guías / Apps / Siguiendo; "¿Cómo quieres vender?"
  (WhatsApp / Página); filtros Tema, Plataforma de cobro (con conteo), Cómo cobran, Idioma del mercado, "Solo las que
  puedes hacer tú solo"; 6 órdenes (mejores primero, puntaje, más fáciles de replicar, más anuncios, más días, más
  nuevas); buscador; 12 por página + "Ver más"; enlace a la ficha `#/ofertas/<id>` y atajos `#/ofertas/whatsapp/todas`.
- **Tarjeta y ficha rápida** (rediseño de hoy): ver sección 0.
- **Ficha completa** (`OfferDetailSheet`): 3 pestañas. **Oferta** (anuncios activos con "hoy en Meta" o "los que
  vimos", días pagando, índice ganador, replicarla, páginas de ventas / pago / Meta / Radar, ticket, tipo, modelo
  de cobro, embudo, checkout, países, idioma, público, "Qué vende y cómo", "Por qué convierte", **Reportar oferta
  inactiva**). **Números** (`BusinessMap`: su checkout real, LTV, CPA máximo). **Veredicto** (IA: nota /10, "Sí,
  véndela / con cambios / hoy no", de dónde sale la nota, qué tomar, qué cambiar, tu giro, cómo probarla con
  anuncios, plan orgánico, cómo adaptarla a LATAM, países para probar, **precio para probar**, mini app).
- **Siguiendo** (Cazador de ROI propio, 5 créditos por oferta): vigilancia diaria, curva de anuncios activos,
  alertas de escala / baja / se apaga / vuelve / precio / upsell / bump (`offer_watch` + `offer_events`).
- **Radar** (`WinningAdsPage`, otra cosa que el Radar de Cazador): buscador de anuncios con "súper ganador / en
  ascenso / sólido", filtros de idioma, días, copias, mercado, puntaje, y búsquedas y presets guardados.
- **Inicio**: `TodayOffers` (3 ofertas de más de 90 días pagando, la primera = la del correo del día) y el
  correo diario `send-daily-digest` ("Tu oferta ganadora de hoy", Resend). País de la persona decide el filtro
  de idioma al abrir (`defaultOfferFilter`).
- **Lo que NO existe hoy**: guardar gratis y colecciones, selección múltiple / copiar enlaces, filtros por
  funnel / nivel / rango de anuncios / nuevas, conteos por opción de filtro (salvo plataforma), "vistas esta
  semana", ranking Escaladas, resumen de novedades por tema, alertas por tema, ticket en moneda local + dólares
  estructurado, ofertas relacionadas, nada por WhatsApp hacia la persona.

### Hallazgos que importan (veracidad y manual)
1. **El nivel de SUPERNOVA ignora los días.** `scaleLabel` exige anuncios Y días juntos
   (Dominando = 30+ anuncios y 60+ días; Creciendo = 10+ y 30+; Despegando = 5+; si no, "En prueba").
   Un anunciante con 300 días pagando y 4 anuncios activos sale como **"En prueba"**. El manual dice que 300
   días es "la mejor prueba de venta que existe". Cazador resuelve esto con "anuncios **o** días" (nivel por
   la medida más alta). Hay que arreglarlo sin tocar `winner_score` ni el orden (es solo la etiqueta).
2. **Mismo nombre, reglas distintas entre tus dos apps.** Tu "Dominando" en Cazador = 300+ anuncios; en
   SUPERNOVA = 30+ anuncios y 60+ días. Si una persona usa las dos, ve que 40 anuncios es "Dominando" en una y
   "Validando" en otra. Decide una regla y publícala igual en ambas (ver decisión D2).
3. **"Por qué convierte" (`why_wins`) está escrito como hecho** y es una hipótesis de la IA. El propio Radar
   de Romildo lo dice bien: "No puedo confirmar qué elementos están generando ventas". Cambiar el rótulo a
   "Lo que creemos que funciona (hipótesis)" es barato y sube la veracidad.
4. **El conteo en vivo ya tiene fecha** (`live_checked_at`) pero la tarjeta no la dice. Cazador sí: "(contados el 27 oct)".

---

## 3. Función de Cazador → cómo está en SUPERNOVA hoy → cómo hacerla x10

Leyenda de ola: **1** = ahora (front y lecturas, sin tocar pipeline), **2** = esta semana (tablas nuevas o
cron; migración con tu OK), **3** = después. Impacto / esfuerzo: A = alto, M = medio, B = bajo.

| # | Función de Cazador | SUPERNOVA hoy | Cómo hacerla x10 | Ola | Impacto / esfuerzo |
|---|---|---|---|---|---|
| 1 | **Nivel con 4 barritas** (Testeando / Validando / Escalando / Dominando), regla escrita en la ficha | Rediseño en curso hoy (`LevelBars`, `offerUi.NIVELES`) con 4 niveles y la regla al pasar el dedo | Dos ejes visibles: **nivel por anuncios activos** + chip aparte **"Probada: N días pagando"** (90+ y 180+ días), así una oferta de 300 días con pocos anuncios no queda como "En prueba" y una de 16 días con muchos anuncios no se confunde con una probada. Regla escrita en la tarjeta, en la ficha y en un "¿Cómo se calcula?". No toca `winner_score` | 1 | A / B |
| 2 | **"380 anuncios (contados el 27 oct)"** | La tarjeta dice "hoy en Meta" o "los que vimos", sin fecha | Mostrar **"contados en Meta el 27 oct"** con `live_checked_at`; si tiene más de 7 días, "visto hace 9 días" en gris. Para las que nunca se contaron: "aún sin contar". Es exactamente "visto activo hace N días" que pide el manual | 1 | A / B |
| 3 | **"Activa desde 6 dic 2025 (hace 327 días)"** + aclaración "contados desde el anuncio activo más antiguo" | "días pagando anuncios" sin fecha ni definición | Mostrar fecha de inicio + "hace N días" + la definición en una línea. Verificar antes qué mide `days_active` (¿anuncio activo más antiguo o primer anuncio visto?) y poner la definición real, no la de Cazador | 1 | A / B |
| 4 | **Filtros con conteo por opción** (Nicho, Idioma, País, Checkout, Funnel, Tags) y varios a la vez | Tema, idioma, plataforma (con conteo), modelo de cobro; uno por filtro; sin conteo salvo plataforma | Los mismos + **Funnel** (viene de `offer_intel.funnel_type`, solo en las ya revisadas: decirlo), **Nivel**, **rango de anuncios**, **Nuevas 7 días**, **País**; conteo por opción desde **una sola RPC de "facetas"** (nunca `ILIKE` ni `count exact` sobre `winning_ads`); chips de filtros activos + "Limpiar filtros" + filtros en la dirección para compartirlos (`#/ofertas?canal=whatsapp&nivel=escalando`) | 1 | A / M |
| 5 | **Orden**: escala / anuncios / tiempo / vistas / recientes | 6 órdenes (sin "vistas") | Añadir **"Las que más subieron esta semana"** (cuando exista el historial, ola 2) y "Más vistas" (ola 2). Mantener "Las mejores primero" como está | 1→2 | M / B |
| 6 | **Tarjeta limpia**: imagen grande + nivel + nombre + anuncios + nicho · días + chips | Rediseño en curso | Añadir lo que Cazador no tiene: **"Lo haces tú solo"**, **cómo vende** (WhatsApp / página), **precio** (ya están), y una **nota del veredicto** (ej. "7/10 · con cambios") solo si ya existe en caché; sin gastar IA al listar | 1→2 | A / M |
| 7 | **Ficha rápida** → "Ver oferta completa" | `OfferQuickView` ya en construcción | Que la ficha rápida traiga también: **nivel con su regla, días, anuncios con fecha, ticket y "Hacer mi versión"**. Estado: hecho a medias hoy; cerrar con prueba en el teléfono | 1 | A / B |
| 8 | **Ticket en moneda local + USD** ("BRL 37,90 ≈ US$7,1", pie con cotización y fecha) | `price_hint` es texto libre ("R$ 97"); sin conversión | Columnas `price_amount`, `price_currency`, `price_usd`, `price_checked_at` llenadas por `enrich-offers` (que ya extrae el precio) + tabla diaria de cambio. Mostrar **en la moneda de la persona** (RD$, COP, MXN según `user_age_country`): "R$ 37,90 ≈ RD$ 410 (cotización 28 oct)". Si el precio no se pudo leer: "precio no visible", nunca un número supuesto. Cambio de monedas: fuente pública gratuita, costo de proveedor ≈ 0 (ver D4) | 2 | A / M |
| 9 | **Interés de la comunidad** (vistas esta semana, personas que la guardaron) | No existe | Tabla `offer_views` (un registro por persona, oferta y día) y `offer_saves`; mostrar "N personas la vieron esta semana" **solo con datos reales** y, con menos de 5, "pocas vistas aún" en vez de un número vergonzoso o inflado. Nunca se muestra quién | 2 | M / M |
| 10 | **Guardar** (gratis) + **Colecciones** + **Compartir** | Solo "Seguir" (5 créditos, con vigilancia). Compartir = copiar enlace a mano | **Guardar gratis** (corazón se queda para Seguir con vigilancia; marcador para guardar), **colecciones con estado del recorrido**: Guardada → Validando → Construyendo → Vendiendo (conecta con las 6 etapas, sin obligarlas). "Compartir" = enlace + imagen para WhatsApp. Cazador no sabe qué hiciste después de guardar; SUPERNOVA sí | 2 | A / M |
| 11 | **Seleccionar → Guardar / A colección / Copiar enlaces** | No existe | Lo mismo + **"Comparar 2 o 3"**: días, anuncios, ticket, cómo vende, lo haces tú solo, lado a lado. Nada de esto cuesta IA | 2 | M / M |
| 12 | **Guardar búsqueda** | En el Radar sí (`userSearches`, presets); en Ofertas no | Llevarlo a Ofertas y añadir **"avísame cuando entre una oferta que coincida"** (usa las notificaciones de la fila 17) | 3 | M / M |
| 13 | **Escaladas**: podio top 3 + tabla (#, nicho, anuncios, escala, en el aire, vistas 7 días), regla escrita | No existe como pantalla | Pestaña **"Las que están escalando"**: podio y tabla con la regla escrita; columna **"cambio en 7 días"** (de 40 a 120 anuncios) gracias a un historial de conteos (tabla `offer_live_history`, una fila por oferta y conteo, ya salen del cron que corre cada 6 h; solo se agrega). Cazador solo muestra el nivel de hoy; SUPERNOVA muestra **quién está subiendo de verdad**, con fechas | 2 | A / M |
| 14 | **Radar firmado** (10 ofertas, nota /10, "¿La modelaría?", países y ticket que testaría) | El **veredicto IA** existe para cualquier oferta (nota /10, decisión, países, "precio para probar"), pero sin firma y solo al abrirla (20 s la primera vez) | Dos capas: (a) **veredicto visible en la tarjeta** si ya está calculado; (b) **"Radar de la semana"**: 5 ofertas con análisis **firmado y revisado por ti** (borrador de la IA, tú apruebas y lo firmas con tu cara). Si no lo revisaste, se rotula "Análisis de IA", no "de Jean". Las frases tipo "creo que funciona" van como hipótesis | 3 (a: 2) | A / M |
| 15 | **Ofertas relacionadas (12)** | Solo `markets[]` (otros países del mismo anunciante) | "**Otros que venden algo parecido**": mismo tema y tipo, y clones por dominio de venta (Fase 0 del plan de negocio completo). Dice cuántos son: "12 anunciantes venden algo parecido". Muestra saturación vs validación sin inventar | 3 | M / A |
| 16 | **Inicio por nichos** (eliges hasta 3, una fila por nicho con lo más escalado) | Inicio = 3 ofertas del día + correo diario | **Sin preguntar de entrada** (manual: no se pregunta lo que se puede deducir): deducir el tema del producto activo, la oferta que modelaste y lo que guardaste; fila "Lo más fuerte en {tema}" con sus 3-6 ofertas; "Cambiar mis temas" opcional en un lado (máx. 3). Cazador bloquea el Inicio con una pantalla de nichos; nosotros no | 2 | A / M |
| 17 | **Notificaciones**: "Oferta acelerando en tus nichos" (sube de nivel) + Resumen semanal (lunes) | Correo diario de la oferta ganadora; alertas solo en "Siguiendo" | Campana en la app + correo, con interruptores: **subió de nivel en tus temas**, **entró una oferta nueva que coincide con tu búsqueda**, **resumen del lunes**. Todo calculado con SQL (cero costo de IA) y solo con hechos con fecha. Nada se envía hacia afuera sin tu sí en ese momento | 2 | A / M |
| 18 | **Resumen diario por WhatsApp** ("7 ofertas nuevas hoy · 29 en la semana; lo más fuerte: Escalando · 99 anuncios · Ingresos Extra; nichos de la semana") | No existe; hay correo con una sola oferta | Ver sección 4: mismo formato con números reales de `offers`, primero por correo y campana (ola 2) y luego por WhatsApp con permiso de la persona y plantilla aprobada (ola 3) | 2→3 | A / M-A |
| 19 | **Links del funnel** (Biblioteca, página de ventas, checkout) | "Mírala funcionando": página de ventas, página de pago, Meta, Radar | Igual, con dos mejoras: quitar los parámetros de rastreo del enlace (`fbclid`, `utm_*`) antes de abrirlo y mostrar **"visto vivo el {fecha}"** en cada enlace | 1 | M / B |
| 20 | **Clasificación completa** (plataforma de tráfico, "Entró al Swipe", ID interno, tags) | Parte de esto está en la ficha | Añadir: **"Entró al catálogo el {fecha}"** (necesito confirmar qué columna lo tiene; no usar `first_seen`, que puede ser la fecha del primer anuncio y no la de entrada), **formato** (pack, plantilla, mapa mental, app, quiz) como filtro **aparte del tema**: Cazador mezcla temas y formatos en la misma lista de nichos, y eso se puede hacer mejor | 2 | M / M |
| 21 | **Más → Extensión de Chrome** | No existe | "Guardar en SUPERNOVA" desde la Biblioteca de Meta (una oferta en dos clics). Antes hay que abrir la extensión de Cazador y ver qué toca | 3 | M / A |
| 22 | **Recomienda y gana** (afiliados, "hasta 40 %") | No hay | Whop trae afiliados; decide tú si hay programa (D5). Dentro de la app: sin promesas de ingresos | 3 | M / M |
| 23 | **Cazador ROI** (US$5,90, seguimiento manual por enlace) | "Seguir" a 5 créditos con vigilancia diaria automática | Ya es mejor. Ajuste: hacer **gratis el "guardar"** (fila 10) y dejar el cobro solo para la vigilancia con aviso (lo que de verdad gasta) | 2 | M / B |

---

## 4. El resumen diario, con datos que SÍ tiene SUPERNOVA

Formato (ejemplo con huecos; los números salen de `offers`, no se escriben a mano):

> **SUPERNOVA · tu resumen de hoy**
> {N} ofertas nuevas hoy · {M} en la semana.
> Lo más fuerte hoy: {nivel} · {anuncios} anuncios activos en Meta (contados el {fecha}) · {tema}.
> Subieron de nivel esta semana: {K}. Tus temas: {tema1}, {tema2}.
> Toca para ver: {enlace a la oferta} · "Hacer mi versión" desde ahí.

Reglas para que sea verdad:
- **"Nuevas" = entraron al catálogo**, no "empezaron a anunciar". Confirmar la columna de fecha de entrada.
- "Lo más fuerte" = ordenado como Escaladas (nivel → días → anuncios), con la fecha de conteo al lado.
- "Subieron de nivel" solo cuando exista `offer_live_history` (ola 2). Antes, esa línea no se muestra.
- Si el conteo en vivo es de hace más de 7 días, se dice. Si no hay nada nuevo: "hoy no entró nada nuevo", no se inventa.
- **Canal**: correo y campana primero (ya hay Resend en `send-daily-digest`). WhatsApp solo cuando la
  persona deje su número y diga que sí; requiere cuenta de WhatsApp Business, plantillas aprobadas por Meta y
  costo por mensaje (**dato del proveedor que no consulté hoy; se decide antes de construir**).
- Cero IA para armarlo: es una consulta SQL. El costo de proveedor es solo el envío.

---

## 5. Lo que SUPERNOVA ya tiene y Cazador no (y hay que poner al frente)

1. **Días pagando anuncios como prueba de venta**, con su definición. (Cazador también muestra "en el aire",
   pero su nivel mezcla escala con prueba; el nuestro, bien resuelto en la fila 1, separa las dos cosas.)
2. **"Lo haces tú solo"** (`copy_score`): Cazador no mide qué tan replicable es para una persona sola.
3. **Cómo vende** (WhatsApp / página / mensajes) como entrada principal ("¿Cómo quieres vender?") y filtro en un toque.
4. **Veredicto de IA para cualquier oferta** (nota /10, sí / con cambios / no, qué copiar, qué cambiar, países,
   precio para probar, cómo adaptarla a LATAM). El Radar de Cazador cubre 10.
5. **Hacer tu versión** (50 créditos) y todo lo que viene después: **Mándala**, anuncios, **Reel Studio**,
   carruseles, estudio de avatar, mini apps, producto, precio, validar, "Usar como mi producto". Cazador termina en "Guardar" / "Seguir".
6. **Los números del negocio** (`BusinessMap`: LTV y CPA máximo) y "precio para probar".
7. **Vigilancia diaria con eventos** (escala, baja, se apaga, vuelve, cambió el precio, nuevo upsell o bump).
8. **Mercado en español** pensado para RD, Colombia y México, con idioma del anuncio (no solo país) y moneda local (fila 8).
9. **Recorrido guiado** (Tu semana, 6 etapas opcionales) en vez de solo un catálogo.
10. **Acompañar de cero a la primera venta**: la razón por la que la gente paga mes a mes (manual, sección 4).

---

## 6. Plan en 3 olas

### Ola 1 · AHORA (front y lecturas; sin migraciones ni cobros)
| Orden | Qué | Impacto / esfuerzo |
|---|---|---|
| 1 | **Cerrar el rediseño en curso** (tarjeta, ficha rápida, niveles) y probarlo en teléfono y en producción (manual: no declarar "arreglado" sin verlo) | A / B |
| 2 | **Fecha de conteo y "Activa desde"** en tarjeta, ficha rápida y ficha completa (filas 2 y 3) | A / B |
| 3 | **Chip "Probada: N días"** y regla de nivel por dos ejes; texto "¿Cómo se calcula?" (fila 1). Cambio solo de etiqueta: no toca `winner_score`, orden ni filtros | A / B |
| 4 | **"Lo que creemos que funciona (hipótesis)"** en lugar de "Por qué convierte" | M / B |
| 5 | **Filtros nuevos + chips activos + Limpiar filtros + enlace compartible** (fila 4), con una RPC de facetas | A / M |
| 6 | **Quitar parámetros de rastreo** de los enlaces de página y checkout; "visto vivo el {fecha}" (fila 19) | M / B |

### Ola 2 · ESTA SEMANA (migraciones chicas y crons; cada una con tu OK porque toca producción)
| Orden | Qué | Impacto / esfuerzo |
|---|---|---|
| 1 | **Importación diaria desde Cazador** (decisión del 29-oct del manual): ver sección 7 | A / M |
| 2 | **Historial de conteos** `offer_live_history` + pestaña **"Las que están escalando"** con podio y "cambio en 7 días" (fila 13) | A / M |
| 3 | **Guardar gratis, colecciones, compartir, selección múltiple, copiar enlaces, comparar** (filas 10 y 11) | A / M |
| 4 | **Ticket en moneda local + dólares** con cotización y fecha (fila 8) | A / M |
| 5 | **Campana + correo**: "subió de nivel en tus temas", "oferta nueva que coincide", "resumen del lunes" (filas 17 y 18, sin WhatsApp) | A / M |
| 6 | **Vistas esta semana / personas que la guardaron**, con mínimo de 5 (fila 9) | M / M |
| 7 | **Inicio por temas deducidos** + "Cambiar mis temas" opcional (fila 16) | A / M |

### Ola 3 · DESPUÉS
| Orden | Qué | Impacto / esfuerzo |
|---|---|---|
| 1 | **Resumen por WhatsApp** con permiso y plantilla aprobada (fila 18) | A / M-A |
| 2 | **Radar de la semana firmado por ti** + nota del veredicto en la tarjeta (fila 14) | A / M |
| 3 | **"Otros que venden algo parecido"** y clones por dominio (fila 15) | M / A |
| 4 | **Guardar búsqueda + aviso** en Ofertas (fila 12) | M / M |
| 5 | **Extensión de Chrome** "Guardar en SUPERNOVA" (fila 21) | M / A |
| 6 | **Afiliados con Whop** (fila 22), si lo decides | M / M |

---

## 7. Importación diaria desde Cazador Swipe (tu decisión del 29-oct, en el manual)

Qué traería: las ofertas de Cazador (sobre todo las **28 de WhatsApp** y las **121 en español**) para
sumarlas al catálogo de SUPERNOVA, sin duplicar y sin borrar nada.

Cómo (propuesta; no se construyó nada):
- Una edge function `cazador-import` con compuerta de **secreto de cron** (no JWT, como pide el manual), que
  corre una vez al día y **solo inserta o actualiza** filas; nunca borra ni oculta.
- La **llave** de solo lectura que me debes dar vive como secreto en Supabase (no en el repo, no en el chat).
  Yo no escribo contraseñas en ninguna web. Opciones de origen, de la más simple a la más fuerte:
  (a) un CSV / JSON exportado por ti cada día, (b) una vista de solo lectura en la base de Cazador, (c) una URL
  firmada. No sé hoy cuál de las tres existe; hay que preguntarlo.
- **Cómo se une con lo nuestro**: cada ficha de Cazador trae el enlace de la Biblioteca con `view_all_page_id`
  (= `page_id` de Meta) → se cruza con `offers.page_id`. Si ya existe, se completa (nivel, ticket, funnel,
  checkout, canal WhatsApp); si no, se crea con `source = 'cazador'` y pasa por `enrich-offers` como todas.
- **Mapeo de campos**: nivel → se **recalcula** con la regla de SUPERNOVA (no se copia la etiqueta);
  anuncios → `live_active_ads` con **su fecha de conteo** (hoy llegan del 22 al 28 oct; se conserva esa fecha,
  no se disfraza de "hoy"); "Activa desde" → inicio de anuncios; ticket → `price_amount` / `price_currency`;
  funnel → `funnel_type`; checkout → `offer_platform`; "Funnel = WhatsApp" o "Checkout = WhatsApp" → `canal = 'whatsapp'`;
  nichos de Cazador (26) → los 19 temas de SUPERNOVA + el nuevo filtro de "formato" (Packs, Planillas, Templates, Mapas Mentales).
- **Contenido adulto**: Cazador tiene un nicho "Adulto" (6 ofertas). El manual excluye adulto del catálogo
  (`excluded_reason`). Se importan con ese flag y no se muestran, o no se importan; decidirlo (D3).
- **Veracidad**: lo importado no se presenta como medido por SUPERNOVA. Va con su fecha ("contados el 27 oct")
  y, cuando SUPERNOVA lo relea por la API de Meta, gana el conteo propio.
- **Sin tocar el pipeline** (`bulk-seed-ads`, `refresh_offers`, `score_unscored_ads`): la importación es una
  vía aparte que escribe solo en `offers` y tablas nuevas. Requiere tu OK para desplegar.

---

## 8. Chequeo contra el manual (sección 5)

| Pregunta | Resultado |
|---|---|
| ¿Quita, oculta o degrada ofertas con muchos días? | **No.** El chip "Probada" sube a las de muchos días; no se cambia `winner_score` ni el orden. |
| ¿Encaja con las 6 etapas y "Roba como un artista"? | Sí: colecciones con estado (Guardada → Validando → Construyendo → Vendiendo) y el veredicto "qué tomar tal cual / qué cambiar". |
| ¿Toca dinero? | Guardar es gratis. "Seguir" sigue cobrando 5 créditos en el servidor (`follow_offer`). El resumen y las alertas no cuestan créditos. Nada de precios nuevos ni de dólares por crédito. |
| ¿Toca acceso o datos de otros? | Las tablas nuevas (`offer_saves`, `offer_collections`, `offer_views`, `offer_live_history`) llevan RLS. Las vistas se muestran como conteo, nunca con nombres. |
| ¿Promete o muestra números? | Cada número con fuente y fecha. Sin promesas de ingresos. "Precio para probar" y "ticket" son referencia, no resultado. |
| ¿Es irreversible o afecta producción? | Migraciones, crons y la importación requieren tu OK antes de aplicarse. Esta propuesta no tocó nada. |
| ¿Cómo se verifica sin cargar la base? | Facetas por RPC con límite de 8 s; sin `select *` ni `count exact` sobre `winning_ads`; pruebas masivas en Postgres local. |
| ¿Nos acerca a ganarle a la competencia? | Sí: días como prueba, "lo haces tú solo", números del negocio y camino de cero a la primera venta. |
| ¿La persona llega al resultado sin decisiones técnicas? | Sí: no se le piden nichos al entrar, se deducen; la app decide el resto. Revisar con `guardian-del-creador` al construir. |

---

## 9. Decisiones que necesito de ti

- **D1 · Origen de la importación**: ¿CSV diario, vista de solo lectura o URL firmada? ¿Dónde guardas la llave (secreto de Supabase)?
- **D2 · Una sola regla de niveles en las dos apps**: (a) la de Cazador (300+ anuncios = Dominando), (b) la de SUPERNOVA
  (30+ anuncios y 60+ días), o (c) mi propuesta: **nivel por anuncios activos + chip "Probada" por días**, igual en ambas, publicada igual.
  Mi recomendación: (c). No copiar la barra de 300 anuncios: en SUPERNOVA muchas ofertas tienen pocos anuncios activos
  contados y casi ninguna llegaría a "Dominando" (lo dijiste el 29-oct: "tienen pocos anuncios activos").
- **D3 · Nicho "Adulto" de Cazador**: ¿no se importa o se importa excluido?
- **D4 · Cotización de monedas**: Cazador usa ExchangeRate-API. ¿La misma fuente? (Costo de proveedor a revisar antes: principio "optimizar proveedores primero".)
- **D5 · Afiliados con Whop**: ¿sí o no, y con qué porcentaje? Es decisión de precios/negocio y es tuya.
- **D6 · WhatsApp**: ¿quieres el resumen diario por WhatsApp aunque cueste por mensaje y requiera plantilla aprobada? ¿Con el número de quién sale?
- **D7 · Radar firmado**: ¿lo escribes tú o lo reviso yo con borrador de IA y tú firmas? Sin tu revisión se rotula "Análisis de IA".

---

## 10. Lo que NO verifiqué (para no darlo por hecho)

- No vi el **Inicio personalizado** de Cazador (no elegí nichos para no cambiar la cuenta).
- No probé **"Guardar búsqueda"** ni **guardar / crear colección** (crean datos en la cuenta).
- No abrí la **Extensión Cazador de Ofertas** ni "Ayuda y soporte".
- No pude confirmar cuántas devuelve **"Nuevas (7 días)"**.
- No sé **cómo cuenta Cazador sus anuncios** ni cómo calcula "Vistas (7 días)".
- El **resumen diario por WhatsApp** no está en la app: solo tengo tu ejemplo.
- No consulté el **precio de la API de WhatsApp** ni el de cotizaciones; no verifiqué el tamaño exacto del catálogo de SUPERNOVA hoy (`get_offers_stats` lo da en vivo).
- Lo que dicen los comentarios del código sobre cifras del 12-oct (p. ej. "de 300 ganadoras, 215 están en inglés o portugués") puede haber cambiado.
