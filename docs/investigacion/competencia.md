# Investigación de competencia — documento vivo

**Propósito:** un solo lugar para saber qué hace cada competidor, qué tomamos de cada uno y qué no. Se actualiza cada vez que se revisa a alguien; cada ficha lleva fecha de la última revisión.
**Regla:** todo lo que se tome pasa por el manual (`supernova/CLAUDE.md`): nunca promesas de ingresos, urgencia falsa ni testimonios inventados; nunca publicar embudos en el dominio de la app; nunca esconder anuncios viejos.

## Mapa rápido

| Competidor | Qué es | Precio | Dueño | Lo que tomamos | Revisado |
|---|---|---|---|---|---|
| Quantum Miner v4.0 | Buscador de ofertas + construye y publica embudos | US$29 / 49 / 59 al mes | Sergio Montaño (Skool 222 miembros) | Tiers, filtro "solo digital", dominio + pixel + CAPI, A/B por sección, afiliados 40 % | 24-sep-2026 |
| PulpoIA | Extensión Chrome + biblioteca de anuncios clasificada por IA | US$29,99 / 69,99 al mes (1.º mes a mitad) · anual US$240 / 297 | Londono Society LLC (Miami) | Extensión sobre Meta Ad Library, "Vigía" (seguimiento), transcripción de videos, garantía "3 ganadores o devolución" | 24-sep-2026 |
| Escala Ads | Base de 340–420 ofertas brasileñas curadas a mano | US$14,90 pago único | Romildo Jr (RMD) | Tesis "Brasil prueba primero, LATAM escala después"; pago único como gancho | 24-sep-2026 |
| Cazador de ROI | Acervo privado: guardas URLs de Ad Library y sigues cuántos creativos activos tiene | US$5,90 pago único | Romildo Jr | Snapshots históricos + gráfico + veredicto "modelar / observar / descartar" | 24-sep-2026 |
| SwipeSaaS | Swipe file de SaaS rentables: mecanismo, precio y anuncios activos | US$19 pago único (Hotmart, creado 29-jun-2026) | Romildo Jr | Ficha "mecanismo + modelo de precio + anuncios" para Mini Apps | 24-sep-2026 |
| LanzaYa | Estudio de IA: creativos, carruseles, videos, miniaturas, páginas, copy | US$5 / 9 / 18 al mes | Romildo Jr | Inicio por intención y vitrina con candado + planes por herramienta | 03-oct-2026 |
| Mini Apps Rentables | 2 mini SaaS al mes con código, Supabase, landing, creativos y licencia | US$14 al mes / US$140 al año | Romildo Jr | Entrega mensual "lista para vender"; nicho + landing + creativos en un paquete | 24-sep-2026 |
| Prime IA (primeia.app) | Suite de generación de imagen/video con IA + Academia en Skool (avatares, ComfyUI) | App US$9,99 / 19,99 · Academia US$14,99 / 29,99 / 39,99 al mes | "Barbu Dev" (Skool 830 miembros; dominio con privacidad, PA, EE. UU.) | Academia gratis en Skool como puerta a la app; "ilimitado" en un modelo barato como gancho | 25-sep-2026 |

Cuatro de los seis son del mismo creador (Romildo Jr, gestor de tráfico brasileño; `romildo.online`, Instagram `sigaromildo`, YouTube `@JrRomildo`, empresa RMD Edição e Produtos Digitais LTDA). Su jugada es una **escalera de productos baratos de pago único** (5,90 → 14,90 → 19 → 14/mes) que se venden juntos en el checkout de Hotmart ("Buy together"). No compite con nosotros en producto; compite en **precio de entrada y volumen**.

---

## 1. Quantum Miner v4.0 (quantumminer.site)

Ficha completa en [2026-09-24-inteligencia-quantum-miner.md](../propuestas/2026-09-24-inteligencia-quantum-miner.md). Resumen:

- **Qué hace:** minero de Meta Ads (EE. UU., LATAM, Brasil) con clasificador Claude que deja solo productos digitales, ordenados en 4 tiers; software que clona la página ganadora, arma landing + upsell + downsell + gracias, y publica en dominio propio o subdominio con SSL, Meta Pixel y API de conversiones. 30 embudos publicados desde mayo 2026.
- **Modelo:** Minerador US$29 · Software US$49 (800 QC ≈ 4 embudos) · Comunidad US$59. Afiliados 40 % recurrente. Sin plan gratis. Se empieza a llamar "Quantum OS".
- **Debilidad:** mide clics por sección (UTM + `sck`), pero la venta ocurre en Hotmart: **no ve ventas, LTV ni recurrencia**. Publica en su propio dominio. Sus páginas usan contadores falsos y "resultados científicos".

**Tomamos:** tiers sobre el `winner_score` existente (sin tocar la fórmula) · filtro "solo digital" por oferta · publicación con pixel obligatorio en dominio aparte (Fase 2) · A/B por sección con eventos en `funnel_events` · programa de afiliados (decisión de Jean).
**No tomamos:** publicar en el dominio de la app, urgencia falsa, promesas de ingresos a afiliados.

---

## 2. PulpoIA (pulpoia.com)

- **Qué hace:** extensión de Chrome (709 usuarios, v1.2.4, abril 2026) que "turbina" la Biblioteca de Anuncios de Meta: filtra por cantidad de anuncios duplicados, carga automática sin scroll, guarda por categorías, descarga videos e imágenes, transcribe el copy. Biblioteca propia: "+50.000 anuncios nuevos al mes" de Brasil y EE. UU. clasificados por IA; gráfico de escalabilidad por oferta.
- **Módulos con nombre:** PulpoAgente (búsqueda), PulpoSonar (listado ilimitado), PulpoVigía (100 seguimientos). Nombrar módulos ayuda a vender "un sistema".
- **Precio:** Básico US$14,99 el 1.º mes → US$29,99/mes (20 búsquedas/mes); Pro US$34,99 → US$69,99/mes; anual US$240 y "VIP 2026" US$297. Pack Kraken: 3 meses Pro por US$99,99 con onboarding. Garantía 7 días; en el Pro anual, **"30 días: si no encuentras 3 ganadores, te devolvemos"**.
- **Dueño:** Londono Society LLC, North Miami (soportefunnelhackers@gmail.com). Vive de lanzamientos en YouTube ("copia y pega estos productos para vender en Hotmart").
- **Debilidad:** depende de que el usuario scrollee Ad Library con la extensión; no construye nada; solo 20 búsquedas/mes en el básico.

**Tomamos:**
1. **Vigilancia con cupo** ("100 seguimientos"): ya aprobada la vigilancia de ofertas; darle un número visible por plan.
2. **Transcripción del video del anuncio** como paso de "Validar": el copy hablado es el mecanismo de venta. Cobrar en créditos (regla ×5).
3. **Garantía medible** tipo "3 ganadores en 30 días" solo si Jean la respalda de verdad y con esas palabras (manual: garantías solo si existen).
4. **Extensión de Chrome** sobre Ad Library como canal de captación: gratis, lleva a la app. Evaluar costo; no es prioridad frente a datos frescos.

**No tomamos:** precio "1.º mes a mitad y luego se renueva al doble" (genera cancelaciones y reclamos).

---

## 3. Escala Ads (escalaads.romildo.digital)

- **Qué hace:** panel con 340–420 ofertas brasileñas "verificadas a mano", métricas (CTR, presupuesto estimado, creativos), filtros por país y nicho, actualización diaria, soporte por WhatsApp. Tesis: **"Brasil prueba primero, LATAM escala después"**: lo que ya escaló en Brasil se traduce y se lanza en español antes de que se sature.
- **Precio:** US$14,90 pago único, acceso de por vida, garantía 7 días. Contador de "precio termina en 23:59:59" que se reinicia. Sus contadores de "usuarios activos" y "facturado por miembros" muestran **0** (animación rota): descuido que delata volumen bajo.
- **Debilidad:** curación manual, sin construcción, sin seguimiento en el tiempo, cifras infladas ("ROAS promedio 4,7x").

**Tomamos:**
1. **Brasil como fuente de ofertas adelantadas.** Nuestro `bulk-seed-ads` ya rota por país; añadir un filtro/etiqueta "Escaló en Brasil, aún no en español" en Ofertas. Es una señal de oportunidad que Quantum no vende.
2. La idea de "modelar y lanzar en español" ya es nuestro método (Roba como un artista); Escala Ads lo confirma como mensaje que la gente entiende.

**No tomamos:** pago único de por vida (mata la recurrencia), contadores falsos.

---

## 4. Cazador de ROI (cazadorderoi.romildo.digital)

- **Qué hace:** app mínima. Pegas la URL de una página en la Biblioteca de Anuncios de Meta, guardas nombre, nicho y notas; tomas **snapshots periódicos de cuántos creativos activos tiene**; ves el gráfico de evolución; el sistema dice "vale la pena modelarla / seguir observando / descartar". Colecciones, miniaturas automáticas, búsqueda y filtros.
- **Precio:** US$5,90 pago único (Hotmart). 100 % en español.
- **Debilidad:** los snapshots los toma el usuario a mano; sin datos propios; es un cuaderno bonito.

**Tomamos:** es exactamente la **vigilancia de ofertas** que Jean aprobó, pero automática. Definir el veredicto con datos que ya tenemos: nº de anuncios activos de la página, días corriendo, cambio semana a semana. Mostrar el gráfico de "creativos activos en el tiempo" en la ficha de la oferta y disparar la alerta cuando suba, cambie precio o se apague. Nosotros tomamos los snapshots por el usuario (cron), no él.

---

## 5. SwipeSaaS (Hotmart S106537389G)

- **Qué hace:** "el primer swipe file de SaaS para emprendedores LATAM": catálogo curado de SaaS rentables del mundo con su **mecanismo, modelo de precio y anuncios activos**, para modelarlos y lanzarlos en LATAM. Creado el 29-jun-2026; se vende con Escala Ads y "Del Cero a la App" (US$27, crear apps con IA sin código) en el mismo checkout.
- **Precio:** US$19 pago único. Sin página de ventas propia visible (solo Hotmart).
- **Debilidad:** es un PDF/Notion; no se actualiza solo, no mide nada.

**Tomamos:** el formato de ficha para nuestras **Mini Apps**: mecanismo (qué problema resuelve en una frase), modelo de precio (mensual / único / por uso, con cifras reales), y **anuncios activos de ese SaaS** como prueba de que vende. Nuestra ventaja: la prueba viene del catálogo real de Meta, no de una lista estática.

---

## 6. Mini Apps Rentables (miniappsrentables.romildo.digital)

- **Qué hace:** suscripción que entrega **2 mini SaaS al mes** listos para personalizar y vender: código, Supabase configurado, landing, copy, creativos para anuncios, tutorial y licencia comercial. Stack: Lovable + Supabase + Vercel + Stripe + OpenAI. Ejemplos: calculadora nutricional, agenda de barbería, CRM para psicólogos, reservas con QR para restaurantes, membresías de gimnasio, control de vacunas veterinario, CRM inmobiliario, finanzas personales. Grupo de networking incluido.
- **Precio:** US$14/mes o US$140/año (Hotmart). FAQ cubre precios sugeridos de reventa y uso en agencias.
- **Debilidad:** los nichos son genéricos (todo el mundo recibe el mismo CRM de barbería); no hay prueba de que alguien pague por ellos; el usuario tiene que saber desplegar en Lovable/Vercel.

**Tomamos:**
1. **"Mini App del mes"** dentro de Mini Apps: una app por mes elegida por demanda real (anuncios activos de SaaS parecidos en el catálogo), con landing y ganchos generados por nuestros generadores. Da un motivo mensual para seguir suscrito, igual que "Tu semana" y el reporte cada 15 días.
2. El paquete completo como unidad de entrega: app + landing + creativos + guía de precio. Encaja en Construir (etapa 4) y Vender (etapa 5).

**No tomamos:** licencia de reventa masiva del mismo código a todos (produce clones idénticos compitiendo entre sí).

---

## 7. Prime IA (primeia.app + skool.com/primeia)

No compite con el Radar ni con Ofertas: compite con nuestra parte de **Vender** (Media Studio, "Vende sin mostrar tu cara", personajes con IA).

- **Qué hace:** suite de generación con IA dividida en módulos con nombre: PrimeLabs (imagen/video), PrimeFlow y PrimeFlow V2 (encadenar modelos en un lienzo), PrimeCinema, PrimeChat, PrimeCut, PrimeMontage, PrimeDesign, PrimeSocial, PrimeTrends, PrimeKids, PrimePost, Kampus y "PrimeAgent" (Qwen 3.8). Modelos de terceros: MiniMax H3, Nano Banana, Kling.
- **Stack:** React + Vite + Tailwind/shadcn en **Netlify**, backend **Supabase**, Meta Pixel. Mismo stack que el nuestro. Dominio registrado en IONOS el 5-sep-2025, titular oculto (dirección en Pensilvania, EE. UU.); WhatsApp de soporte con número de EE. UU.
- **Academia Prime IA (Skool):** grupo privado **gratis**, **830 miembros**, 1 administrador ("Barbu Dev"), 5 reseñas 5,0 de miembros de pago con 1 a 11 meses. Promesa: avatares con IA que hablan y se mueven, clases de ComfyUI desde cero "sin instalar nada", influencer IA con voz propia, workflows para copiar, clases nuevas cada semana, soporte diario en español. La puerta es gratis; se paga activando un plan en la app.
- **Precios (código público de la app, 25-sep-2026):**
  - App con créditos: Básico US$9,99 (1.050 créditos) · Pro US$19,99 (2.200 créditos).
  - Academia sin créditos: US$14,99 (clases + workflows + MiniMax H3 ilimitado) · US$29,99 (todo + "generación ilimitada").
  - Academia PrimeIA Pro: US$39,99 (todo + 2.500 créditos).
  - Se compra con créditos: "slots" para vincular redes y la entrada a comunidades.
- **Anuncios en Meta:** página "Barbuprimeia" (Facebook 2,1 mil, Instagram @barbuprimeia 47,2 mil). **2 anuncios activos desde el 5 y el 7-sep-2026**, ambos en video de 15 s con personajes hechos con IA: uno lleva a la Academia en Skool ("entra gratis, mira las clases abiertas") y el otro a Instagram ("comenta 'IA' y te mando el link"). Es una prueba de apenas 3 semanas: todavía no hay prueba de que vendan.
- **Debilidad:** es una caja de herramientas de generación, sin camino de negocio: no dice qué vender, a quién ni a qué precio, y no mide ventas. Lo "ilimitado" en modelos con costo por uso es un riesgo de margen para ellos.

**Tomamos:**
1. **Academia gratis como puerta de entrada** (mismo patrón que el grupo de WhatsApp de Romildo/Deivis): clases abiertas que llevan a la app. Encaja con la Comunidad Creativos 10X, pero con una parte gratis. Decisión de Jean.
2. **El video del personaje IA como anuncio**: su creativo *es* la demostración del producto. Nuestro "Vende sin mostrar tu cara" puede anunciarse igual, con un personaje hecho en la app (sin copiar sus videos ni sus personajes).
3. **Módulos con nombre propio** (como PulpoIA): ayuda a vender "un sistema". Ya lo hacemos con Mándala y Radar.

**No tomamos:** "ilimitado" en funciones que cuestan por uso (rompe la regla de costo × 5); planes que se pisan entre sí (ellos mismos avisan en la pantalla de pago "no pagues dos veces").

---

## Qué priorizamos (consolidado, en orden)

1. ~~**Datos frescos en el Radar**~~ **Verificado el 25-sep-2026 en producción:** 125.300 anuncios (eran 71.000 en julio), rotación `master-rotate` cada hora con éxito, último raspado 04:00 UTC, 6.429 anuncios revisados en 24 h en los 6 mercados (ES, US, AR, MX, BR, CO), anuncios con inicio en Meta hasta el 24-sep, y `link_domain` ya se llena (2.322 filas: la Fase 0 está desplegada y funcionando). Base en 333 MB (bajó de 704; dentro del límite Free) y sin jobs `oneoff` pendientes. Frente a Quantum ("600/día") estamos entrando ~6.000 revisiones diarias.
2. **Mapa del negocio con LTV y CPA máximo** (Fase 1 aprobada). Nadie de esta lista lo tiene.
3. **Vigilancia automática de ofertas** con gráfico de creativos activos y veredicto (Cazador de ROI automatizado + PulpoVigía con cupo por plan). Ya aprobada; aquí se define cómo se ve.
4. **Filtro "solo digital" + etiqueta "escaló en Brasil, no en español"** en Ofertas (Quantum + Escala Ads). Los **tiers ya existen** en base y pantalla (Súper Ganador / En Ascenso / Sólido en el Radar; 39.147 / 51.304 / 34.849 según `radar_stats_cache`), así que esa parte de la brecha no existe. Lo que falta: `offer_type` sigue NULL en `winning_ads` (solo `offers` lo tiene para apps), y no hay señal de mercado de origen.
5. **Transcripción del video del anuncio** en Validar (PulpoIA), cobrada en créditos.
6. **Construir y publicar** en dominio aparte con pixel obligatorio (Quantum, Fase 2).
7. **Mini App del mes** con ficha mecanismo + precio + anuncios (SwipeSaaS + Mini Apps Rentables).
8. **Afiliados** (Quantum 40 %, Romildo vende todo por Hotmart con afiliados). Decisión comercial de Jean.

## Lo que ninguno hace (nuestro espacio)
- Ver **ventas reales y LTV** del embudo del usuario (Fase 3).
- Recorrido completo de 6 etapas en una sola app; todos venden una pieza.
- Prueba de venta = **días anunciando**; ninguno explica por qué un anuncio viejo es la mejor señal.
- Pagos y entrega locales (moneda del país, WhatsApp).

## Sus anuncios en Meta (Biblioteca de Anuncios, 24-sep-2026)

Raspado con Apify (`curious_coder/facebook-ads-library-scraper`), todos los países, activos e inactivos, 17 búsquedas por palabra clave y 3 por página. Datos crudos en [anuncios-competencia-2026-09-24.csv](anuncios-competencia-2026-09-24.csv). Falsos positivos descartados: la página "Escala Ads" de Meta es una agencia inmobiliaria y "Pulpo" es una tarjeta de combustible.

| Quién | Página | Anuncios | Periodo | Activos hoy | A dónde llevan |
|---|---|---|---|---|---|
| Quantum Miner | ninguna ("Quantum Miner", "Quantum OS", "Quantum Shadows", "Sergio Montaño", quantumminer.site) | **0** | — | 0 | Crece por orgánico, afiliados (40 %) y Skool |
| PulpoIA | "Juan Londono MDR" (1.365 likes) | 8 (todos video) | nov-2025 | 0 | Un "Manual Prompt Engineer", no PulpoIA. PulpoIA como tal no aparece anunciando |
| Romildo Jr (Escala Ads, Mini Apps, Cazador de ROI, SwipeSaaS) | "Romildo Jr" (133 likes) | 25 (17 video, 8 imagen) | dic-2025 → 21-sep-2026 | 0 | 14 a `wpp.romildo.digital` (grupo gratis de WhatsApp), 7 a un quiz en Cakto, 4 a Mini Apps |
| **Club de Ofertas Escaladas** (Deivis Rodríguez, vecino nuevo) | "Deivis Rodríguez Mkt" (1.112 likes) | **37** (todos imagen) | oct-2025 → jul-2026 | 0 | `elclubdeofertas.online`: "3 ofertas digitales validadas al día en tu WhatsApp" |
| Ads Finder Pro | "Ads Finder Pro" | 2 | oct-2025 | 0 | Comunidad gratis por WhatsApp con "ofertas + creativos + embudos" |
| Prime IA (revisado 25-sep, a mano en la Biblioteca) | "Barbuprimeia" (IG 47,2 mil) | 2 (video 15 s) | 5-sep-2026 → hoy | **2** | Academia gratis en Skool y DM por Instagram ("comenta IA") |

**Lo que dicen sus anuncios (patrones):**
1. **Todos venden lo mismo con las mismas palabras:** "ofertas escaladas / validadas", "modelar y vender en tu país", "deja de perder horas en la Biblioteca de Anuncios". El dolor que atacan es *elegir qué promocionar*, no construir ni medir.
2. **La puerta de entrada es un grupo gratuito de WhatsApp**, no la app. Romildo: 21 de 25 anuncios llevan al grupo o a un quiz. Deivis: "2–3 ofertas al día en tu WhatsApp". Venden después, dentro del grupo. Es un embudo de bajo costo que SUPERNOVA no tiene.
3. **Brasil como fuente** es el gancho de Romildo ("descubre ofertas ganadoras antes del mercado LATAM; analizamos campañas escaladas en Brasil").
4. **El argumento Mini App contra PDF** (Romildo, ago-2026): "PDF → el cliente lo descarga, no lo lee y pide reembolso. Mini App → lo usa todos los días y paga con gusto". Es el mejor copy del lote y encaja con nuestras Mini Apps.
5. **Nadie está anunciando hoy.** Todo lo encontrado está apagado; Romildo apagó el último el 21-sep. Son campañas cortas de 1–10 días. Ninguno tiene un anuncio con muchos días corriendo, es decir, ninguno ha encontrado su propio "ganador" para venderse.
6. Sus creativos son de bajo presupuesto: imagen estática o video hablado a cámara, con "4,9/5" sin fuente y "por tiempo limitado".

**Tomamos:**
- **Grupo gratuito de WhatsApp como puerta de entrada** (el patrón que comparten los tres que sí anuncian): 1 oferta validada al día, con días anunciando y precio real, y el enlace a su ficha en SUPERNOVA. Decisión de Jean (implica operar el grupo).
- El copy "PDF vs. Mini App" como ángulo para la etapa Elegir → Mini Apps (reescrito, no copiado).
- Vigilar a **Club de Ofertas Escaladas** (Deivis Rodríguez): es el que más invierte en anuncios del grupo y ataca a nuestro mismo público de habla hispana.

**Lo que confirma:** Quantum Miner no compra tráfico; su crecimiento viene de Skool + afiliados. Si queremos competir en captación, el rival en anuncios es Romildo/Deivis (barato y por WhatsApp), no Quantum.

## 8. LanzaYa (Romildo Jr, versión en español de su estudio de IA)

Capturas que pasó Jean el 03-oct-2026 (cuenta sin plan). Compite con nuestra parte de **Crear y Vender**, no con el Radar ni con Ofertas.

- **Qué es:** estudio de creación con IA. Inicio "¿Qué quieres crear hoy?" con 8 tarjetas: Creativos (imágenes de anuncio), Carruseles, Videos con IA, Miniaturas, Influencer IA, Robot de Copy, Páginas y Slides. Más Fotos Pro, Biblioteca de plantillas (107 en 9 categorías), buscador ⌘K, botón "Nuevo proyecto", proyectos recientes, tarjeta "Tu desempeño (30 días)" y asistente con sugerencias de un toque ("Crear un creativo para tráfico", "Generar 5 ideas de titulares", "Transformar texto en carrusel").
- **Sin plan no te echa: vitrina con candado.** Entras a toda la app; cada herramienta y plantilla sale con candado ("BLOQUEADO", "Plan necesario", "Liberar") y la imagen borrosa. Al tocar un candado se abre una ventana de planes **ligada a esa herramienta** ("Para usar Creativos elige un plan que la libere"), con la etiqueta "Libera esta herramienta" en cada plan que la incluye.
- **Precios (ventana de planes, mensual; hay anual con descuento):**
  - **Creativos con IA US$5/mes:** hasta 40 creativos en imagen. Plan de una sola herramienta.
  - **Básico US$9/mes:** 25 imágenes, 5 videos, 30 miniaturas; copy, carruseles, slides y páginas ilimitados.
  - **Pro US$18/mes:** 60 imágenes, 10 videos, 5 lipsync (labios sincronizados), miniaturas ilimitadas; lo demás ilimitado.
- **Capacitaciones abiertas** (también sin plan): "Aprende a dominar cada herramienta con tutoriales paso a paso", con filtros por herramienta. Hoy son 5 cursos (Landing Page, Fotos PRO, Generador de copy y Miniaturas con 1 clase cada uno; Creativos con 4), grabados por Romildo y subidos a YouTube. Todas las portadas son el mismo banner genérico, que promete "7 días de garantía" y "+800 creadores".
- **Descuidos:** textos en portugués dentro de la versión en español ("Desbloqueie todo o potencial", "Pagamento processado pela plataforma de checkout configurada"); secciones "Próximamente" en el menú (Proyectos, Marca).
- **Debilidad:** igual que Prime IA: crea contenido, pero no dice qué vender, no valida, no pone precio ni mide ventas.

**Tomamos:**
1. **Inicio por intención** ("¿Qué quieres hacer hoy?", tarjetas, buscador ⌘K, proyectos recientes). Hecho en local el 03-oct-2026.
2. **Vitrina con candado para quien no pagó**, con muestras reales y una ventana de planes ligada a la herramienta. Propuesto; espera OK de Jean.
3. **Creativos, Miniaturas y Carruseles en imagen** con la IA de imágenes que ya tenemos. Propuesto; precio en créditos lo decide Jean (regla costo × 5).
4. **Sugerencias de un toque en el asistente.**
5. **Aprende: un video corto por herramienta**, abierto también para quien no pagó (es marketing). Lo graba Jean con su pipeline de EDICIONES REELS. Propuesto.

**No tomamos:** candados en cosas que no existen ("Próximamente"); "ilimitado" en lo que cuesta por uso; bajar precios para igualar sus US$5–18 sin que Jean lo decida; portadas iguales para todos los cursos.

## Pendientes de verificación
- Cifras de volumen de Quantum y PulpoIA (no comprobables desde fuera).
- Canales de YouTube (@Quantumminers, @JrRomildo): no se pudieron leer; revisar a mano si hace falta.
- Repetir el raspado de anuncios cada mes (cuesta centavos) y anotar aquí quién sigue activo.

## Historial
- 24-sep-2026: primera versión. Quantum Miner (v3 → v4), PulpoIA, Escala Ads, Cazador de ROI, SwipeSaaS, Mini Apps Rentables.
- 24-sep-2026: anuncios en Meta de todos + hallazgo de Club de Ofertas Escaladas y Ads Finder Pro.
- 25-sep-2026: Prime IA (primeia.app / PrimeLabs): stack, precios, Academia en Skool y sus 2 anuncios activos.
- 03-oct-2026: LanzaYa (estudio de IA de Romildo Jr): inicio, vitrina con candado y precios US$5 / 9 / 18.
