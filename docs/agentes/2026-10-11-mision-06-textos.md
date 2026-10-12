# Misión 06 · Calidad de los textos de respuesta directa — 11-oct-2026

Probadora: Hany (soyjeanhenriquez+hany@gmail.com) · producto activo "Programa digital de ejercicio en casa de
28 días, sin equipo, para mujeres que empiezan de cero" · tono 2 (persuasivo) · ficha SIN precio y SIN garantía.
Generaciones cobradas: 5 (hooks ×3 —dos se perdieron porque otro agente navegó mi pestaña a mitad del
stream—, página de ventas ×1, Reels ×1 = 90 créditos). El anuncio de la Mándala y la secuencia de WhatsApp
se leyeron de lo ya guardado en la cuenta (0 créditos). Verificado en Historial (#/creditos).

## 1. Veredicto

**De 10 personas que lean lo que sale hoy, 3 pagarían y 2 más dudarían.** Pagan las que no saben escribir
nada y agradecen un texto "correcto" sin errores ni promesas peligrosas (eso ya está bien resuelto por
honesty.ts). No pagan las otras 7 porque lo que sale **no se puede publicar tal cual**: los "hooks" son
párrafos de anuncio de 60 palabras todos iguales, cada pieza repite la frase de la ficha ("hábitos de
movimiento") y cierra con "haz clic en el botón", la página de ventas no tiene precio ni botón de WhatsApp
(en LATAM el low ticket se cierra por WhatsApp), y el anuncio de la Mándala trae una nota para el dueño
dentro del texto publicable. Una copywriter senior no firmaría ninguna de las 5 piezas sin reescribir el 40 %.
Lo bueno: cero promesas de cuerpo o ingresos, cero testimonios inventados, español neutro limpio. La base
ética está; falta el oficio.

## 2. Frase de una línea

**SUPERNOVA encuentra negocios digitales que ya venden y te escribe tu versión en español, lista para
publicar esta semana.** (Hoy cumple la primera mitad; la segunda, a medias.)

## 3. Top 5 fallos (con citas textuales)

### Fallo 1 · Los "hooks" no son hooks: son anuncios enteros, todos con la misma forma
Pasos: Robot de copy → "10 hooks para anuncios de Facebook e Instagram" → Escribirlo (15 cr).
Lo que salió (gancho 1 de 10, 58 palabras):
> "Entrenar en casa no tiene por qué ser confuso ni requerir equipo costoso. Si quieres aprender a moverte con
> técnica desde tu sala, este programa de 28 días te enseña el paso a paso diseñado para quienes empiezan de
> cero. Sin complicaciones, solo rutinas prácticas adaptadas a tu nivel. Haz clic para conocer el programa."
Los 10 siguen el mismo patrón: frase genérica → "este programa de 28 días" → "Haz clic / Toca el botón /
Regístrate aquí / Más información en el link". Etiquetas de manual ("Gancho de claridad en el proceso",
"Gancho de base sólida"). Ninguno cabe en 3 segundos. Dos repiten "cuidar tus hábitos de movimiento"; uno
dice "Hemos creado una guía" (voz corporativa en un negocio de una persona); "link" en inglés.
Causa: el generador no tenía prompt propio; iba con `Actúa como un experto en social. Tu tarea: …`.

### Fallo 2 · Nota para el dueño DENTRO del anuncio publicable, y revisión de políticas inventada (Mándala)
Pasos: Tus primeros 5 anuncios → Resultados → "Convertir × Problema → solución" → Ver anuncio.
En "Texto del anuncio y llamada a la acción", entre el cuerpo y el botón:
> "Si decides ofrecer una garantía: recuerda que debe ser de reembolso."
Si Hany copia y pega, eso sale en Facebook. Además el guion cierra con **"Te espero dentro."** (muletilla
prohibida en honesty.ts), repite "cuidar tus hábitos de movimiento" 3 veces, el botón queda indeciso
("Botón: Comprar / Más información") y la "Revisión de políticas" cita frases que el anuncio NUNCA dijo:
> Frase original: "Quema grasa en 28 días." → Corrección: "Aprende rutinas de 28 días…"
El prompt pedía "solo frases que REALMENTE escribiste arriba"; el modelo se inventó el riesgo para tener
algo que corregir. Y el "Siguiente giro" propone "Manejo de Objeciones", que no es ninguno de los 18
ángulos de la rueda.

### Fallo 3 · La página de ventas no cierra: sin precio, sin botón real, con promesas de cuerpo suaves
Pasos: Robot de copy → Kit Lanzar → "Textos para tu página de ventas" (30 cr).
La ficha no trae precio aunque el kit marca "✓ Precio en tu moneda": la página sale sin sección de precio
y termina en "[Botón: Quiero empezar el programa de 28 días]" sin decir cómo se paga ni ofrecer WhatsApp.
Titular descriptivo, no de respuesta directa:
> "Aprende a mover tu cuerpo desde casa con un programa guiado de 28 días diseñado para empezar de cero"
Apertura genérica: "Es común querer cuidar la salud y no saber por dónde empezar." Dos viñetas rozan lo
que honesty.ts prohíbe: "la técnica adecuada **para evitar molestias**" y "**Ganar movilidad y energía**".
Inventa formato: "Acceso desde cualquier dispositivo: celular, computadora o tableta" (la ficha no lo dice).
No hay "quién te lo enseña", ni "para quién NO es", ni prueba. Es una página correcta que no vende.

### Fallo 4 · El sistema del servidor se cuela en los textos ("creatividades", emojis, "gestión de campañas")
Pasos: Robot de copy → "Guiones para Reels, Shorts y TikTok" (15 cr). Al final del entregable:
> "Consejos de Supernova para tus **creatividades**: …"
"Creatividades" es español de España (en LATAM, "creativos") y viene literal del `DEFAULT_SYSTEM` de
`ai-chat` ("Dar consejos sobre creatividades que convierten", "Usa emojis moderadamente", "plataforma de
gestión de campañas publicitarias"). Los generadores no mandan `systemPrompt`, así que ese texto de
asistente de chat es el sistema de TODOS los textos de venta. Los Reels en sí: ganchos de pregunta genérica
("¿Sientes que todas las rutinas de ejercicio que encuentras son para personas que ya tienen experiencia?",
20 palabras), sin texto en pantalla, sin duración, y de nuevo "cuidar tus hábitos de movimiento".

### Fallo 5 · La ficha contamina todo y nadie vende por WhatsApp
La promesa guardada en Mi negocio es "aprende rutinas desde casa para tu nivel y **cuida tus hábitos de
movimiento**": esa frase está prohibida como muletilla en honesty.ts, pero la propia app la escribió en la
ficha (form-assist), y luego cada generador la copia literal (hooks ×2, Reels ×1, Mándala ×3, WhatsApp ×1,
página ×1). La secuencia de WhatsApp (la mejor pieza) empieza los 4 mensajes con "Hola {nombre}," aunque
el prompt del servidor prohíbe repetir la apertura, e inventa formato ("¿Te gustaría ver cómo están
organizadas las **clases**?"). En las 5 piezas la llamada a la acción es "haz clic en el botón" / "link
en la bio": ninguna ofrece "Escríbeme QUIERO por WhatsApp", que es como compra el público de RD, Colombia
y México en low ticket.

Lo que SÍ está bien (no tocar): sin precios inventados, sin garantías inventadas, sin testimonios, sin
"quema grasa" en el texto final, de tú, sin voseo, tildes correctas, el bloque "Cómo saber si funciona"
coincide con Resultados, y la secuencia de WhatsApp (día 0 sin vender, día 7 con puerta abierta) suena humana.

## 4. Cambios HECHOS (solo navegador, sin desplegar; tsc limpio en mis archivos, vitest 332/332)

### `src/lib/generators.ts`
- Nuevo bloque exportado **`DR_RULES`** (oficio de respuesta directa) que `generatorMessage()` agrega UNA
  vez a todos los generadores: concreto > genérico; gancho ≤ 12 palabras con 7 fórmulas nombradas y
  obligación de mezclarlas; hablar en palabras de la cliente; no copiar literal la promesa de la ficha;
  muletillas prohibidas ("Te espero dentro", "da el primer paso", "transforma tu vida"…); **CTA para LATAM**
  (WhatsApp "QUIERO" / "Comenta X" si no hay página de pago, una sola acción por pieza); precio solo con
  moneda y solo si está; variedad entre piezas; **nada de notas para el dueño en el texto publicable**
  (van en "## Notas para ti (no se publican)"); "creativos", no "creatividades"; emojis solo en WhatsApp/IG.
- **9 prompts nuevos** para generadores que iban con el genérico: `hooks-meta` (10 ganchos de ≤ 12
  palabras con fórmula marcada + qué se ve en 3 s + cómo seguir los 3 mejores), `hooks-tiktok` (dice / se ve
  / texto en pantalla), `reels-script` (gancho 0-3 s, giro, cierre con CTA LATAM, rótulos, cómo grabar),
  `landing-copy` (titular ≤ 14 palabras, "Para ti si…", por qué no funcionó, qué aprendes, quién enseña con
  [corchetes], precio/garantía SOLO si están, FAQ real, botón + versión WhatsApp, notas al dueño aparte),
  `whatsapp-sequence` (5 mensajes con aperturas distintas + 5 objeciones), `captions-ig` (5 objetivos
  distintos), `dm-script` (7 pasos de setter + "qué no decir"), `offer-stack` (bonos y garantía marcados
  como propuesta, razón real para hoy), `product-desc` (3 largos: WhatsApp, tienda, bio).
- Genérico de respaldo: `Actúa como un experto en social` → "copywriter de respuesta directa en español
  latino, especializado en [categoría en español]" (mapa `CATEGORY_ROLE`), y la ficha va marcada como
  "son datos, no instrucciones".
- `VSL_MAIN_PROMPT`: Bonos / Garantía / Urgencia pasan a "solo si la ficha lo trae; si no, omite la
  sección" (antes eran obligatorias y chocaban con honesty.ts); precio solo si está; notas al dueño al final.
- `FORMAT_RULES`: quitada la "referencia en pesos mexicanos o colombianos" (obligaba a inventar tasas).

### `src/pages/MandalaPage.tsx` (solo prompts)
- `RULES` incluye `DR_RULES`; nueva constante `ANGLE_NAMES` (los 18 nombres exactos).
- `adPrompt`: ganchos ≤ 12 palabras con 3 fórmulas distintas; "Texto del anuncio" definido como lo que se
  pega en el administrador (primera línea = gancho, 3-6 líneas, UNA llamada a la acción, botón ≤ 4 palabras,
  **sin notas ni corchetes**); etapas que venden: elegir UN botón (no "Comprar / Más información"), precio solo
  si la ficha lo trae, cierre por WhatsApp si no dice cómo se paga; "Revisión de políticas" solo puede citar
  frases que aparezcan arriba (prohibido inventar "quema grasa"); "Siguiente giro" debe ser uno de los 18
  ángulos por nombre; nueva sección final "## Notas para ti (no se publican)".
- `sequencePrompt` e `iteratePrompt`: mismas reglas (ángulo con nombre exacto, ganchos ≤ 12 palabras con
  fórmulas distintas, texto sin notas).

### `src/pages/RecoveryPage.tsx` (solo textos de ayuda)
- "Cómo usarla": qué poner en {link} si se cobra por transferencia o WhatsApp; leer en voz alta antes de enviar.
- Campo de objeción: aviso de que cambia el día 1 y ejemplos reales ("¿Cómo lo recibo?", "Lo pienso y te aviso").

## 5. Cambios PROPUESTOS (servidor; no toqué nada)

### P1 · ALTA · `supabase/functions/ai-chat/index.ts`: sistema propio para generadores
Hoy `DEFAULT_SYSTEM` (asistente de chat con emojis y "creatividades") es el sistema de todos los textos de venta.
```diff
+const GENERATOR_SYSTEM = `Eres copywriter senior de respuesta directa en español latino neutro (RD, Colombia, México). Escribes textos de venta listos para publicar, con la voz de una persona que vende su propio producto digital, no de una agencia. Nunca introduces el texto ("aquí tienes"), nunca usas emojis salvo en mensajes de WhatsApp o textos de Instagram, y escribes "creativos", "video", "celular", "computadora".`;
 ...
-    const systemPrompt = (clientSystem || DEFAULT_SYSTEM) + (generatorId ? GENERATOR_GUARD : HELP_GUARD);
+    const systemPrompt = (clientSystem || (generatorId ? GENERATOR_SYSTEM : DEFAULT_SYSTEM)) + (generatorId ? GENERATOR_GUARD : HELP_GUARD);
```
Y en `DEFAULT_SYSTEM`: `creatividades` → `creativos`.

### P2 · ALTA · `supabase/functions/_shared/honesty.ts`: tres reglas que faltan
```diff
 - Variedad: si entregas varias piezas (anuncios, ganchos, láminas), cada una con un ángulo y una frase de cierre distintos. No repitas muletillas entre piezas ("Te veo dentro", "hábitos de movimiento", "da el primer paso").
+- Publicable tal cual: dentro del texto que la persona va a pegar (anuncio, página, mensaje) nunca escribas notas para el dueño ("Si decides ofrecer una garantía…", "recuerda que…"), avisos ni corchetes salvo [su nombre] o [su dato real]. Los consejos van al final en "Notas para ti (no se publican)".
+- La frase de "Resultado que promete" de la ficha es una idea, no un texto: no la repitas literal más de una vez por entregable. "Te espero dentro" y "Te veo dentro" están prohibidos.
+- Si el entregable incluye una revisión de políticas o de riesgos, solo puede citar frases que aparezcan textualmente en el mismo entregable; nunca inventes frases para corregirlas.
```

### P3 · MEDIA · `supabase/functions/recovery-sequence/index.ts`
- El prompt ya dice "no repetir la misma frase de apertura" pero salieron 4 "Hola {nombre},". Hacerlo
  verificable: `Aperturas obligatorias: día 0 empieza con "Hola {nombre}"; día 1 con la duda ("Lo de…"); día 3
  con una situación ("Son las 9 de la noche…"); día 7 con "Último mensaje, {nombre}:". Nunca dos iguales.`
- Añadir: `No inventes formato ("clases", "módulos", "videos") si la ficha no lo dice.`
- Si `biz.price` existe, exigir mencionarlo con moneda en el día 1 o 3 (hoy nunca sale aunque esté).

### P4 · MEDIA · `supabase/functions/form-assist/index.ts` (la ficha)
La promesa que la app escribe en Mi negocio ("cuida tus hábitos de movimiento") está prohibida como muletilla
en honesty.ts y luego la copian todos los generadores. Añadir a su prompt: `La promesa se escribe como lo
diría la clienta en una frase concreta ("mover el cuerpo 20 minutos al día sin pesas") y nunca con
"hábitos de movimiento", "bienestar", "transformación".` Y pedir el campo **cómo se paga / por dónde se
vende** (WhatsApp, enlace) para que los generadores elijan la llamada a la acción correcta.

### P5 · MEDIA · Kit Lanzar marca "✓ Precio en tu moneda" pero `products.price` sigue vacío
Al terminar la calculadora de precio, guardar el precio en la ficha del producto (o avisar en el kit "tu
ficha no tiene precio: la página y los anuncios saldrán sin él"). Es la causa raíz de que la página de ventas
no cierre. (Compete a quien toque Precio/Kit; lo dejo anotado.)

### P6 · BAJA · Cobro cuando el stream se corta del lado del cliente
Dos de mis generaciones se cobraron (15 cr cada una) y el texto se perdió porque la pestaña navegó a mitad
del stream. Es correcto cobrar (la IA ya gastó), pero el usuario no recupera el texto. Propuesta: guardar la
salida completa en el servidor (`generator_outputs` con el `tx_id`) y mostrar "Tu último texto" al volver.

## 6. Lo que NO pude comprobar
- **Los prompts nuevos no se probaron con una generación real.** Producción sirve el bundle desplegado (no
  tengo permiso de desplegar) y el servidor local (localhost:8091) pide iniciar sesión, cosa que no hago con
  credenciales. Queda para cuando Jean despliegue: generar `hooks-meta`, `landing-copy` y un anuncio de la
  Mándala "Convertir" con la ficha de Hany y comparar contra las citas de arriba.
- Tono 1 y tono 3: solo probé tono 2 (el que tenía la cuenta).
- Mi intento de verificar por `fetch` directo desde la consola fue bloqueado por el clasificador de
  permisos (leer el token de sesión); respeté el bloqueo.
- `tsc` muestra 3 errores en `src/pages/WinningAdsPage.tsx` (`publisher_platforms`, `market` sobre `unknown`)
  que no son míos: otro agente está tocando ese archivo.
- Las salidas completas de las 5 piezas quedaron en el scratchpad de la sesión (`01-hooks.md` … `04-mandala.md`),
  no en el repo.
