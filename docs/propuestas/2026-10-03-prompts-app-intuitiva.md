# Prompts: app intuitiva (estilo LanzaYa) + lo que dijo Cindy

**Fecha:** 3-oct-2026. Pegar en orden. Cada prompt espera el OK de Jean antes de desplegar o subir.

## Qué dijo Cindy (WhatsApp, 3-oct)
1. "Lo que no vi fue la creación del producto": existía, pero estaba escondido (solo admin).
2. En Brasil ordenaba por "más anuncios" y al abrir la oferta casi no tenía anuncios.
3. "Ahí da el prompt, pero uno tendría que tener una app aparte para hacer el video".
4. "Sería chévere espiar el flujo de las ofertas que son con WhatsApp".

## Qué tomamos de LanzaYa (Romildo Jr): solo la estructura, nunca textos, imágenes ni marca
- Inicio = "¿Qué quieres crear hoy?" con 12 tarjetas: ícono, nombre y una línea de lo que hace.
  Etiquetas "Más usado" y "Beta". Cambio entre cuadrícula y lista.
- "Proyectos recientes" debajo de las tarjetas.
- Columna derecha: "Tu desempeño (30 días)", una tarjeta para mejorar de plan y el asistente con
  3 sugerencias de un toque más un campo "Escribe tu solicitud".
- Arriba: buscador global (⌘K) y un botón principal "+ Nuevo proyecto".
- Biblioteca: plantillas por categoría, con pestañas que muestran cuántas hay en cada una.
- Menú: Panel, Biblioteca y una lista plana de herramientas.

Idea central: el usuario dice qué quiere hacer y la herramienta se abre ya lista. La ficha y las 6
etapas se usan si existen; nunca se exigen antes.

---

## Prompt 1 — Cindy: "más anuncios" que al abrir casi no tiene anuncios

```
Proyecto SUPERNOVA (Supabase krfdoofwhtcxbyhkjoik). Lee supernova/CLAUDE.md antes.

Problema real reportado por una usuaria (Cindy): en Brasil ordenó las ofertas por "Más anuncios
activos" y, al abrirlas, casi no tenían anuncios. offers.active_ads es la suma del catálogo y SOLO
SUBE: bulk-seed-ads pide solo ACTIVE y nunca marca los apagados, y refresh_offers lo recalcula cada
día. La ficha, en cambio, consulta Meta en vivo con countLiveAds (offer-intel/index.ts:886).

NO sobrescribas offers.active_ads: refresh_offers lo pisaría al día siguiente y la vigilancia
(offer_watch) depende de él. En su lugar:
1. Migración: offers.live_ads int y offers.live_ads_checked_at timestamptz, nulos al inicio. RLS
   igual que offers; solo service_role escribe.
2. offer-intel: cuando la ficha ya calcula countLiveAds, guardar n en live_ads y la fecha en
   live_ads_checked_at. Si Meta devuelve null (error o tope), no tocar nada. Si capped, guardar 300
   y mostrarlo como "300+".
3. Listas y tarjetas de Ofertas:
   - Si hay live_ads, mostrarlo con "visto en Meta hace X días".
   - Si no hay, mostrar active_ads con "según el catálogo".
   - Si la fecha tiene más de 7 días, mostrarla en gris.
4. El orden "Más anuncios activos" usa coalesce(live_ads, active_ads). No cambies los otros
   órdenes, ni winner_score, ni ningún filtro (manual §2: nada que haga bajar a los de muchos días).
5. Cron diario que recalcule live_ads de las 200 ofertas con mayor coalesce(live_ads, active_ads),
   POR MERCADO (empieza por BR), con estas reglas:
   - secreto de cron en Vault, como supernova-offer-watch-daily;
   - lotes pequeños con pausa entre uno y otro;
   - respetar los topes de Meta y cortarse si Meta devuelve límite de uso.
No toques nada más. Verifica en producción con 3 ofertas reales de BR (sin consultas pesadas) y
muéstrame el antes y el después. Espera mi OK antes de desplegar.
```

---

## Prompt 2 — Cindy: "no vi la creación del producto"

```
Proyecto SUPERNOVA. Lee supernova/CLAUDE.md.

"Crear producto" (#/crear-producto, product-builder) existe, pero está en ADMIN_ONLY_PAGES
(src/lib/features.ts:11), así que una clienta lo buscó y no lo encontró. Ábrelo para clientes:
1. Quita "Crear producto" de ADMIN_ONLY_PAGES. Debe aparecer en el menú (etapa 4 Construir), en
   Inicio y en la ficha de cada oferta como "Crear mi producto con esta oferta" (con la oferta
   ya cargada).
2. Mantén la regla vigente:
   - el índice es gratis, con tope;
   - los capítulos se cobran en el servidor (Gemini 15, ChatGPT Sol 35 y Astra 125 créditos por
     capítulo);
   - se desbloquea al cobrarse el plan, no durante la prueba.
   Quien está en prueba ve la pantalla y el índice, con un aviso claro de cuándo se desbloquean
   los capítulos.
3. Si OpenAI sigue sin saldo, oculta ese modelo, o márcalo "no disponible", en vez de fallar.
4. Sin ficha obligatoria: usa la ficha u oferta si existe; si no, pide en línea solo "¿Qué
   producto quieres crear?".
Revisa con chequeo-seguridad que un cliente en prueba no pueda pedir capítulos llamando directo
a la función. Actualiza el SYSTEM_PROMPT de HelpAssistant. Verifica en producción con una cuenta
de cliente (no admin) y dime qué no pudiste probar. Espera mi OK antes del push.
```

---

## Prompt 3 — Cindy: "da el prompt pero necesito otra app para hacer el video"

```
Proyecto SUPERNOVA. Lee supernova/CLAUDE.md. Primero la tabla; NO cambies código hasta mi OK.

Hoy Mándala y Generadores entregan el guion o el prompt del anuncio, y la persona tiene que irse a
otra app para hacer la imagen o el video. Queremos que lo haga aquí mismo.
Ya existen en el servidor: generate-ad-creative (imagen de anuncio, 25 créditos), image-generate
(fal.ai, 20 a 95), video-generate (fal.ai, 85 a 625, modelos aún en "admin") y la pantalla
Personaje.
1. Tabla: costo real de cada modelo de imagen y de video, precio actual en créditos y margen.
   Debe ser ≥ 5× con el crédito a US$0,008; propón el precio de los que no tengan. Los precios
   los decido yo.
2. Después de mi OK:
   - debajo de cada anuncio generado (Mándala, Generadores, Personaje), dos botones: "Hacer la
     imagen aquí" y "Hacer el video aquí". Abren un panel con el texto ya cargado, el formato
     (vertical 9:16 por defecto) y el costo en créditos antes de gastar;
   - el cobro va en el servidor antes de la IA, con refund_charge si falla;
   - el resultado se guarda en Proyectos recientes y se puede descargar.
No prometas resultados. Verifica una imagen y un video reales en producción.
```

---

## Prompt 4 — Cindy: "espiar el flujo de las ofertas que van por WhatsApp"

```
Proyecto SUPERNOVA. Lee supernova/CLAUDE.md. Primero la propuesta; NO cambies código hasta mi OK.

Muchas ofertas de LATAM no tienen página de ventas: el anuncio lleva directo a WhatsApp. Queremos
mostrar ese flujo con datos públicos.
1. Mide sin cargar la base (muestra pequeña o RPC con límite) cuántos anuncios de winning_ads
   tienen link_url o landing_url hacia wa.me, api.whatsapp.com o whatsapp.com, o CTA de mensaje.
2. Propón:
   a. Etiqueta y filtro "Se vende por WhatsApp" en Radar y Ofertas (sin cambiar el orden ni
      ocultar nada).
   b. En la ficha, el flujo visible: anuncio → mensaje que trae prellenado el enlace (?text=) →
      país del número (solo el prefijo, nunca el número completo en pantalla) → cuántos días
      lleva anunciando.
   c. "Tu guion de WhatsApp para esta oferta": la conversación (saludo, preguntas, precio, cobro,
      seguimiento día 1, 3 y 7) generada por nosotros a partir del anuncio, marcada como
      "propuesto", nunca "copiado". Reusa recovery-sequence o ai-chat con su precio en créditos.
3. NUNCA escribirle al número del anunciante, ni automatizar mensajes, ni entrar a grupos ajenos:
   eso es espiar de verdad y rompe el manual. Solo datos públicos de la Biblioteca de Meta.
Dame la medición, la propuesta y el costo en créditos. Espera mi OK.
```

---

## Prompt 5 — Inicio "¿Qué quieres crear hoy?" (estructura de LanzaYa, diseño nuestro)

```
Proyecto SUPERNOVA. Lee supernova/CLAUDE.md (sección 3, diseño Apple Space Black).

Referencia de ESTRUCTURA: LanzaYa Studio (Romildo Jr). No copies sus textos, imágenes, colores ni
marca: todo va en negro y neutros, ámbar solo en la acción principal, Sora en títulos y Manrope
en texto.
Nuevo Inicio (#/):
1. Barra superior: buscador global "Busca una herramienta, una oferta o tu proyecto" (⌘K / Ctrl+K)
   que encuentra herramientas, ofertas por nombre (vía RPC, nunca ILIKE con RLS) y proyectos
   propios. Botón ámbar "+ Nuevo producto".
2. Centro: "¿Qué quieres hacer hoy?" con una línea: "Elige y empieza; no hace falta llenar nada
   antes". Tarjetas con ícono lineal, nombre y una línea de lo que hace, y el costo ("Gratis" o
   "desde N créditos", nunca dólares). Etiquetas "Más usado" (calculado con datos reales de uso,
   no inventado) y "Nuevo". Cambio entre cuadrícula y lista. Tarjetas, en este orden:
   - Encontrar algo que ya vende → Ofertas
   - Anuncios que llevan meses → Radar
   - Ofertas por WhatsApp → Radar filtrado (cuando exista el prompt 4)
   - Crear mi producto → Crear producto
   - Negocio listo para copiar → Mini Apps
   - Ponerle precio → Precio
   - Mis primeros anuncios → Mándala
   - Imagen o video del anuncio → panel del prompt 3
   - Vender sin mostrar mi cara → Personaje
   - Textos de venta → Generadores
   - Ganchos que funcionan → Ganchos
   - Ideas de contenido → Contenido
   - Recuperar ventas por WhatsApp → Recuperar
   - ¿Apago o escalo? → Resultados
   Las pantallas de ADMIN_ONLY_PAGES no aparecen para clientes.
3. Debajo: "Seguir donde lo dejaste", con los últimos proyectos, anuncios y productos que creó
   el usuario, y "Ver todos".
4. Columna derecha (en teléfono va debajo):
   a. "Tu avance (30 días)", solo con números reales: productos, anuncios creados y ventas
      anotadas. Si es 0, dice qué hacer.
   b. El asistente (HelpAssistant) embebido, con 3 sugerencias de un toque que ABREN la
      herramienta ya llena ("Buscar ofertas que venden en Brasil", "Hacer 5 anuncios de mi
      oferta", "Crear mi ebook") y el campo "Escribe lo que quieres hacer".
   c. Tarjeta de plan solo si está en prueba o sin créditos. Sin urgencia falsa.
5. El recorrido de 6 etapas, Tu semana y Negocio Gemelo quedan debajo, plegados, con una línea de
   resumen. No se borra nada.
6. Teléfono (375 px): 2 tarjetas por fila, sin scroll horizontal. Las tarjetas no cargan datos al
   abrir.
Muéstrame capturas de escritorio y teléfono antes de seguir. Espera mi OK antes del push.
```

---

## Prompt 6 — Registro sin interrogatorio

```
Proyecto SUPERNOVA. Lee supernova/CLAUDE.md.

Hoy SignupPage.tsx obliga a 4 preguntas (experiencia, ¿pagas anuncios?, ¿qué vendes?, objetivo).
La cuenta se crea solo al responder la 4.ª y no hay "saltar" ni "atrás".
Cambio:
1. La cuenta se crea con el paso 0 (datos + captcha). Nada más es obligatorio.
2. Las 4 preguntas pasan a UNA tarjeta opcional dentro de la app ("¿Nos cuentas un poco para
   recomendarte mejor? 20 segundos"), con "Ahora no", que la cierra para siempre. Las respuestas
   se guardan igual en user_onboarding.
3. Quien no responda ve la app completa; las recomendaciones usan valores por defecto.
No cambies el muro de pago (RequireAccess / has_access): registrarse sigue sin dar acceso; solo
Whop lo da. Verifica el registro de punta a punta en local y dime qué no pudiste probar.
Espera mi OK antes de desplegar.
```

---

## Prompt 7 — Quitar el muro de la "ficha"

```
Proyecto SUPERNOVA. Lee supernova/CLAUDE.md.

La ficha del producto activo (profileReady: qué vendes, para quién, qué promete) bloquea la
pantalla entera de Validar y de Vende sin mostrar tu cara, y el botón de generar en Mándala y en
Recuperar. recovery-sequence también la exige en el servidor.
Regla nueva: "usar la ficha si existe, nunca exigirla antes".
1. Ninguna pantalla se bloquea por la ficha. Si falta, la herramienta muestra arriba UN campo en
   línea, solo lo que esa herramienta necesita de verdad (casi siempre "¿Qué vendes?"), con dos
   atajos: "Usar una oferta del catálogo" y "Completar después".
2. Lo que el usuario escribe ahí se guarda en su ficha (products), para no volver a preguntarlo.
3. recovery-sequence acepta esos datos en el cuerpo de la petición si la ficha está vacía. El
   cobro sigue igual: edge_guard_charge antes de la IA y refund_charge si falla. Nunca confíes en
   el cliente para precio, plan ni user_id.
4. Mándala: quita la redirección a Mi ficha.
Pasa chequeo-seguridad. Actualiza el SYSTEM_PROMPT de HelpAssistant donde diga que hay que llenar
la ficha primero. Espera mi OK antes de desplegar.
```

---

## Prompt 8 — Que la app deje de empujar + un toque para empezar

```
Proyecto SUPERNOVA. Lee supernova/CLAUDE.md.

La app guía tanto que la gente se pierde. Cambios, sin quitar herramientas:
1. Tour de bienvenida (OnboardingTour, 9 pasos que tapan la app): ya no arranca solo. Queda un
   botón pequeño "¿Te muestro la app? (1 min)". Mantén los data-tour="nav-<key>".
2. Menú lateral: deja de plegarse solo según la etapa. Todo queda visible y solo se pliega si el
   usuario lo pliega (guardar en localStorage con try/catch). Mismo orden de 6 etapas: el manual
   dice que el menú ES el recorrido.
3. Barra de etapa y "Aún te falta…": una línea discreta que se puede cerrar, sin avisos repetidos.
4. El pie "Siguiente paso" solo aparece DESPUÉS de terminar algo, como sugerencia y con
   "No, gracias". Nunca redirige solo.
5. Nada de ventanas emergentes al entrar, salvo avisos críticos (pago o créditos en cero).
6. En cada herramienta (Generadores, Contenido, Mándala, Plan, Personaje, Recuperar, Validar):
   - un solo campo visible, o ninguno si ya hay ficha u oferta;
   - el botón principal y el costo en créditos;
   - todo lo demás en "Más opciones", plegado, con valores por defecto (español LATAM, país del
     usuario si se conoce);
   - si llega desde una oferta o un anuncio, los campos ya vienen llenos;
   - Validar se responde en cualquier orden, con resultado parcial;
   - Plan se muestra con la fecha de hoy al abrir.
No cambies precios ni credit_prices. Dame una tabla antes/después por pantalla (campos
obligatorios antes y ahora). Actualiza el SYSTEM_PROMPT de HelpAssistant y la lista PAGES de
weekly-plan si cambia alguna clave. Capturas en teléfono y escritorio. Espera mi OK antes del push.
```

---

## Prompt 9 — Biblioteca (lo que el usuario ya creó, ordenado)

```
Proyecto SUPERNOVA. Lee supernova/CLAUDE.md.

Estructura de la Biblioteca de LanzaYa, con nuestro contenido: la pantalla Proyectos (#/proyectos)
pasa a llamarse "Biblioteca":
1. Buscador arriba y pestañas con cuántas hay de cada tipo: Todo · Productos · Anuncios ·
   Imágenes · Videos · Guiones de WhatsApp · Ofertas que sigo. Solo cuentan lo real del usuario.
2. Cada tarjeta lleva miniatura, nombre, fecha y "Abrir" (vuelve a la herramienta con eso
   cargado), "Duplicar" y "Descargar".
3. Listas cortas con "Ver más" (12 por tipo). Nada pesado en la primera carga.
No toques Ganchos ni Ofertas: siguen siendo sus propias pantallas. Capturas y OK antes del push.
```

---

## Prompt 10 — Limpieza de seguridad (de paso)

```
Proyecto SUPERNOVA. Lee supernova/CLAUDE.md.

1. useCredits.consume() llama a consume_credits desde el navegador. Ninguna pantalla lo usa y el
   manual prohíbe cobrar desde el cliente: quítalo y revoca EXECUTE de consume_credits para
   authenticated si nada más lo usa (compruébalo antes).
2. Código muerto: WeeklySummary, DailyMissionWidget, LevelUpModal, RisingTemperatureWidget y la
   gamificación. Bórralos solo si nada los importa.
npm run build + lint y chequeo-seguridad. Espera mi OK antes de aplicar la migración y el push.
```

---

## Prompt 11 — Medir si funcionó

```
Proyecto SUPERNOVA. Con PostHog (ya en producción):
1. Embudo: entra a Inicio → toca una tarjeta → usa la herramienta (genera o guarda algo).
2. Tiempo hasta la primera acción útil, antes y después de los cambios.
3. Cuántos usan Crear producto, "Hacer el video aquí" y el filtro de WhatsApp.
4. Cuántos cierran la tarjeta de preguntas opcionales y cuántos la responden.
Dame el tablero y los números de los últimos 7 días. Solo datos reales.
```
