# Super agentes · 07-oct-2026 · Reporte para Jean

**En una frase:** los arreglos de confianza y de cobros claros están listos en la rama `super-agentes-2026-10-07`. Son 26 commits locales que solo tocan pantallas (`src/` y la portada `public/fundador`). No tocan la base de datos, las funciones del servidor, los precios ni el catálogo. Lo que encontramos y no se puede arreglar sin ti está en la sección 5. Lo más urgente es **apagar `heygen-diag` en producción**.

Nadie hizo push, despliegue ni migraciones. Nadie inició sesión ni gastó créditos. Tampoco se tocó `main`.

---

## 1. Qué decidieron los super agentes

Te delegaste decisiones de producto y los agentes las tomaron con este criterio: proteger al cliente que más paga (PRO US$29,99 y Comunidad US$99; marca personal, negocio con IA y ventas con IA). **Archivar** significa ocultarlo a los clientes, no borrar el código.

| Tema | Decisión | Por qué |
|---|---|---|
| Cupón FUNDADOR vencido en la portada real (`/fundador`: precio de US$19,99, "hasta el 30 de septiembre", "cupos limitados", cuenta atrás) | **Arreglado** | Es la puerta por la que entra todo cliente que paga, y prometía un precio que ya no existe. Eso termina en reclamos y contracargos. No cambia ningún precio: la app ya lo había apagado el 01-oct. |
| El Oráculo anunciado en la landing, aunque solo lo ven los admins | **Arreglado** | Anunciar algo que no se puede usar es engañoso. En su lugar se muestra lo que sí existe: el análisis de cada oferta, el Veredicto y el Mapa del negocio. El Oráculo sigue archivado. |
| Video de ventas (VSL) falso en la landing de React (botón de play que no hace nada) | **Arreglado** (se oculta) | Se vuelve a mostrar cuando haya video. |
| Actividad "en vivo" inventada ("Escaneando", puntos que laten, "JARVIS ACTIVO", 7 ofertas escritas a mano que rotaban) | **Arreglado** | El manual lo prohíbe. Ahora dice "Ejemplos del catálogo" con datos reales de `landing_teasers`. |
| Garantía "si no terminas tu producto en 30 días, 100 %" mientras Crear producto está cerrado | **Para Jean** | Es un término comercial y no se puede confirmar desde aquí qué dice Whop. Ver sección 5. |
| "$29,99" sin decir dólares (en RD, $ son pesos) | **Arreglado** | Ahora dice "US$29,99". El precio no cambia. |
| "Anuncios activos ahora", con un número que solo sube | **Arreglado** | Ahora dice "anuncios vistos activos (acumulado)" y agrega "visto activo hace N días". No cambian los datos, el orden ni `winner_score`. |
| Cifras que no cuadran (26 o 29 generadores; España sí o no) | **Arreglado** | Se dejan 26, que son los que hay en `generators.ts`, y la misma lista de países en todas partes. |
| Cifras sin comprobar después del borrado del 04-oct (114.000 anuncios, 7.517 ofertas, 300 ganadoras, 13 países, 18 nichos) | **Para Jean** | Hace falta una lectura ligera en producción. |
| Influencer IA promete "hazlo hablar en video" y esa parte está cerrada | **Archivado** (la promesa) | Solo se promete lo que funciona: crear el influencer, darle voz y escribir sus guiones. El video que habla aparece como "llega pronto". |
| "Ver la comunidad en Skool →" lleva al pago de Whop | **Arreglado** | Ahora dice "Unirme a la Comunidad · pago seguro en Whop →". Es el plan de US$99 y no debe sentirse como una trampa. |
| Influencer IA bloquea a quien no tiene producto y dice "clona" | **Arreglado** | Ahora hace una sola pregunta ("¿De qué trata tu página o qué vendes?") y deja seguir. Dice "modelar". |
| `tiktok-search` gasta sin cobrar | **Archivado** | Está apagada en la app y así se queda. Si vuelve, primero tiene que cobrar en el servidor. |
| Tarjeta "Hoy" con el siguiente paso (la pidieron 6 de 11 personas) | **Potenciado** | Es una línea arriba del Inicio que se puede cerrar: "Tu siguiente paso: … (~N min) · X de 6". |
| Crear producto, oculto para clientes | **Para Jean** | Abrirlo activa cobros por capítulo. |
| Genjutsu | **Archivado** | Sigue de laboratorio hasta que tenga cobro en el servidor. |
| Ideas para WhatsApp, en pausa | **Para Jean** | Abrirla activa un cobro de 15 créditos. |
| Mercado de afiliados | **Archivado** | Va contra "solo digitales" y nadie del público objetivo lo pide. |
| Paso "Cobra · pronto" del Negocio Gemelo | **Arreglado** | Ahora es un paso real: pagos del país (Nequi, transferencia, OXXO, PSE) y el mensaje de WhatsApp listo para copiar. |
| La moneda se pierde (se guarda en US$) | **Para Jean** | Afecta datos ya guardados. Va como paquete aparte. |
| Mini Apps cobra 150 créditos al primer toque | **Arreglado** | Ahora pide confirmación: "Esto usa 150 de tus N créditos". El precio y el cobro en el servidor no cambian. |
| "Recarga para seguir" parece pedir otro pago | **Arreglado** | Ahora dice: "El [fecha] se recargan solos tus créditos del plan". |
| Trabajo pagado que se borra (Carrusel, foto de Influencer IA, guion de YouTube) | **Arreglado** | Pide confirmar antes de reemplazar, y se guardan las versiones anteriores. |
| "Otra versión" de YouTube vuelve a cobrar 50 | **Para Jean** | Cambiarlo es un precio nuevo. |
| "Reescribir esta lámina" del Carrusel | **Para Jean** | Es una acción paga nueva. |
| No poder escribir el producto en la prueba de 3 días | **Se deja como está** | La regla ya está decidida. Solo se aclaró en el asistente. |
| Videos que caducan a las 24 h | **Se deja como está** | El video que habla está cerrado para clientes. |
| Abrir el video que habla (UGC) | **Para Jean** | Primero hay que probar un video desde tu cuenta. |
| Jerga sin explicar ("ADN ganador", "MVP", nombres de modelos, ids técnicos en Créditos) | **Arreglado** | Cada término tiene ahora una línea que lo explica o un nombre claro. |
| Facebook en el tracker y en el Carrusel | **Arreglado** | Facebook se agrega como red dentro de `channels`, sin migración. |
| Tipo "Live" en el tracker | **Para Jean** | Necesita una migración. |
| TikTok Shop y afiliados: el buscador decía "No encontramos nada" | **Arreglado** | Se agregaron sinónimos al buscador. |
| Generador "Lanza a tu lista de WhatsApp" | **Para Jean** | Es un generador nuevo: necesita precio y despliegue. |
| Herramientas para quien escala (lote de ganchos, VSL avanzado, CPM, CSV de Meta) | **Para Jean (Fase 3)** | Hoy pesa más cerrar la confianza y el "qué hago hoy". |

> El plan del estratega llegó cortado después de este punto. Si tenía más decisiones, no entraron en este reporte.

---

## 2. Qué quedó hecho en la rama `super-agentes-2026-10-07`

Los cambios están contados como los verá el cliente.

**Paquete 1 · Landing que no engaña** (`pkg-landing-confianza`)
- La portada de fundadores ya no habla del cupón, de cupos ni de cuenta atrás. Los 12 botones llevan al pago normal de Whop, sin código de descuento.
- El precio dice "US$29,99/mes" en todas partes.
- No se menciona el Oráculo. En su lugar están el análisis de cada oferta, el Veredicto y el Mapa del negocio.
- "Ejemplos del catálogo" muestra datos reales, sin puntos que laten ni "Escaneando".
- En la landing de React se quitó el video falso, se dejaron 26 generadores y los mismos mercados, y el botón de la Comunidad dice que lleva al pago en Whop.

**Paquete 2 · Cobros y números claros** (`pkg-cobros-y-numeros-claros`)
- Mini Apps pregunta antes de gastar: "Esto usa 150 de tus N créditos. Es una sola vez: el kit queda tuyo." Si no te alcanzan, te lleva a Créditos.
- Explica la diferencia entre el kit (150) y "Hacer mi versión" (50). Los dos números salen de la tabla de precios, no están escritos a mano.
- El aviso de saldo bajo dice cuándo se recargan solos tus créditos.
- El historial de Créditos muestra nombres en palabras, no ids técnicos.
- Ofertas dice "anuncios vistos activos (acumulado)" y "visto activo hace N días".

**Paquete 3 · Influencer IA, guía y buscador** (`pkg-influencer-guia-busqueda`)
- Influencer IA ya no te frena si no tienes producto: una línea arriba y sigues. Pide confirmar antes de reemplazar una foto o un personaje, y guarda hasta 4 fotos anteriores para volver a ellas gratis.
- La tarjeta de Influencer IA ya no promete el video que habla.
- El buscador entiende "mi cara", "Facebook", "TikTok Shop", "afiliado", "live" y "9:16".
- El asistente dice lo mismo en todas partes: qué está cerrado, qué se puede hacer en la prueba de 3 días y cómo trabajar con Facebook.
- En el teléfono hay un botón **Encontrar** (Ofertas, Radar, Nichos, Mini Apps), dice "Mi negocio" en vez de "Mi ficha" y los botones son más grandes (44 px).

**Paquete 4 · "Tu siguiente paso" y Cobra** (`pkg-hoy-y-cobra`)
- El Inicio tiene una sola línea con tu siguiente paso, cuánto tarda y cuánto cuesta. Coincide con la etapa del recorrido y se puede cerrar por 24 h.
- El paso **Cobra** del Negocio Gemelo ya funciona: pagos de tu país y el mensaje de entrega por WhatsApp listo para copiar.

**Paquete 5 · No perder lo que pagaste** (`pkg-creadores-sin-perder-trabajo`)
- Carrusel: antes de reemplazar algo pagado pide confirmar, y se puede volver con Deshacer. Explica qué son "ADN ganador" y "MVP". Los modelos tienen nombres según lo que hacen. Hay un aviso para quien vio algo en Facebook y un checklist "Antes de publicar".
- YouTube: tu último guion vuelve al recargar y se guardan las 5 versiones anteriores. "Nueva idea" y "Otra versión" piden confirmar. Si la IA falla, vuelve el guion que tenías.
- Tracker: Facebook aparece como red con su check.

**Arreglos de la verificación** (en la misma rama)
- `aa7d36c` **Radar:** la tarjeta de temperatura de cada anuncio decía "CLONA ESTO HOY", "Millones fluyendo" y "Cualquiera que entre convierte". Además marcaba como "FRÍO · Ignora este anuncio" un anuncio de 300 días con una sola versión. Ahora los textos son neutros, dicen "modelar" y, desde los 30 días, hablan del tiempo pagando anuncios. El nivel, el puntaje y el orden no cambian. Este problema venía de `main`.
- `a8daff8` **Entrar:** los errores mandaban a "escríbenos por WhatsApp", pero no hay un WhatsApp de soporte publicado. Ahora dan el correo soyjeanhenriquez@gmail.com.

**También en la rama:** los 7 commits de la auditoría nocturna. Hacen el Carrusel más cómodo en el teléfono, cambian "Ganador" para que exija 3 ventas o más, filtran el Radar hasta 365+ días, explican los términos en Ofertas y Precio, y mejoran el registro para novatos.

**Comprobación en la rama final** (repetida hoy):
- Pruebas: 46 archivos y 342 pruebas, todas pasan.
- `tsc`: 126 errores, los mismos que ya tiene `main`. Ninguno es nuevo.
- `npm run build`: pasa.

---

## 3. Cobros: tabla del auditor y lo que está mal

El crédito vale US$0,008. El múltiplo es cuántas veces cobramos lo que nos cuesta la IA.

| Acción | Precio (prod) | Costo real estimado (US$) | Múltiplo | ¿Cobra en el servidor antes de gastar? | ¿Devuelve si falla? |
|---|---|---|---|---|---|
| search_ads | 5 | ~0 (API de Meta gratis) | sin costo de IA | Sí | Sí |
| analyze_url | 5 (client) | sin función activa | — | No: solo `consume_credits` del navegador, sin uso | No |
| ai_intel | 5 (client) | analyze-ad ~0,003, **gasta sin cobrar** | — | No | — |
| chat_message | 2 (client) | ~0,004 | — (ayuda gratis) | No cobra | — |
| adaptar | 5 | ~0,004 | ~10× | Sí | Sí |
| sofisticar | 15 | ~0,005 | ~24× | Sí | Sí |
| blueprint | 25 | 0,0055 | ~36× | Sí | Sí |
| pain_discovery | 15 | ~0,005 | ~24× | Sí | Sí |
| pillar_assist | 10 | ~0,005 | ~16× | Sí | Sí |
| landing_intelligence (Oráculo) | 50 | 0,10–0,15+ | **~2,7–4× (riesgo de quedar por debajo de 3×)** | Sí (solo admin) | Sí |
| gen_landing / ad_copies / avatar / funnel | 40 / 15 / 15 / 50 | 0,005–0,008 | 15–80× | Sí (solo admin) | Sí |
| gen_master_prompt | 50 | ~0,024 | ~17× | Sí, con recibo | Sí |
| gen_light | 15 | 0,006 de promedio / 0,03 en el peor caso | ~20× / ~4× | Sí | Sí |
| gen_medium | 30 | 0,0064 de promedio / 0,045 en el peor caso | ~37× / ~5× | Sí | Sí |
| gen_heavy | 75 | ~0,07 en el peor caso | ~9× | Sí | Sí |
| gen_ad_image | 6 | 0,0081 con APIMart · **0,039 con el respaldo Gemini** | 5,9× · **1,2×** | Sí | Sí |
| gen_ad_image_nb2 | 10 | 0,0143 | 5,6× | Sí | Sí |
| gen_ad_image_nbpro | 20 | 0,0285 | 5,6× | Sí | Sí |
| clone_carousel | 15 | 0,018 de promedio / 0,0203 máx. | 6,7× / 5,9× | Sí | Sí |
| model_slide | 6 | ~0,003–0,01 | ~5–16× | Sí | Sí |
| follow_offer | 5 | ~0 | sin costo de IA | Sí (RPC) | n/a |
| unlock_kit | 150 | ~0 | sin costo de IA | Sí (RPC) | n/a |
| build_piece_std | 15 | 0,0077 de promedio | ~15× (3,8× en el peor caso) | Sí | Sí |

> La tabla del auditor llegó cortada a partir de `build_piece_std`. Faltan las filas de YouTube, video e imagen fal; sus hallazgos están abajo.

**Lo que está mal o en riesgo** (ningún precio se tocó):

| Gravedad | Qué pasa | ¿Necesita a Jean? |
|---|---|---|
| **CRÍTICA** | **`heygen-diag` está desplegada en producción, no está en el repo y no tiene compuerta.** Cualquiera con la llave pública de la app puede usar nuestra cuenta de HeyGen para leer cuota, videos y avatares, sin límite. | Sí: hay que apagarla en producción. |
| ALTA | **El tope de 3.000 cuenta también los créditos comprados.** Quien compra un pack (por ejemplo, Nuclear 4.500) y llega a la renovación con 5.500 recibe 0 de sus 2.000 del mes, aunque pagó US$29,99. Además, la app dice "No caducan: se usan después de los del mes", y eso es falso porque no hay orden de gasto. | Sí: necesita una migración. |
| ALTA | **La imagen de anuncio de respaldo nos cuesta casi lo mismo que cobramos (1,2×).** Si APIMart falla, cae a Gemini con el mismo precio de 6 créditos. Pasó en el 8 % de las imágenes de los últimos 30 días. | Es un cambio de código (devolver los créditos y pedir "inténtalo de nuevo"), pero desplegarlo necesita tu OK. |
| MEDIA | **`spy-analyze`, `tiktok-search` y `analyze-ad` gastan Firecrawl o Gemini sin cobrar.** Siguen activas en producción aunque la app ya no las usa. | Sí: archivarlas en producción. |
| MEDIA | **Los reembolsos de video dependen de que la persona vuelva a mirar antes de 1 hora.** Si el video falla y vuelve más tarde, no se le devuelve nada. Hoy hay 2 trabajos de video y los dos terminaron bien. | Sí: necesita un cron o una migración. |
| MEDIA | **El Oráculo puede quedar por debajo de 3×** porque usa gemini-3-pro sin tope de salida. Hoy es solo para admin, pero la función acepta llamadas de cualquiera. | Antes de reabrirlo: tope de salida y medir. |
| MEDIA | **Los textos cobran muy por encima de 6×** (15–37× de promedio). No perdemos dinero, pero se sale de la regla de 3–6×. | Sí: lo decides tú. |
| MEDIA | **El análisis de YouTube de hasta 15 min queda cerca del piso (~3,1×)**, y sus precios están escritos a mano en la app. | Sí: decides si subir yt_reference (por ejemplo a 60) o bajar el tramo. |
| BAJA | **El navegador todavía puede cobrarse a sí mismo** (`consume_credits` y 3 filas marcadas "client"). Nadie lo usa: hubo 0 cobros en 30 días. | El cliente se puede limpiar sin riesgo. En producción, revocar el permiso necesita tu OK. |
| BAJA | **La tabla de Créditos muestra precios de cosas gratis o que no existen** ("Preguntarle algo a la IA · 2", "Análisis de un anuncio · 5", "· 0"). | No: es un arreglo solo en el cliente, queda para la próxima ronda. |
| BAJA | **Los modelos de fal (solo admin) están entre 6,3× y 6,9×.** | Ajustarlos antes de abrirlos a clientes. |
| BAJA | **Hay comentarios y etiquetas de respaldo viejos** ("Clonar un carrusel viral", nombres de marcas de modelos). | No: se corrige en la próxima migración de precios. |

Lo que sí está bien:
- No hay cobros nuevos desde el navegador.
- Todo lo que usa IA en la rama cobra en el servidor antes de gastar y devuelve si falla.
- Al cliente nunca se le muestra cuántos dólares vale un crédito.

---

## 4. Resultado de la verificación

**¿Lista para publicar? Sí. No quedan bloqueantes.**

Dos verificadores revisaron toda la diferencia con `main`:

- **Verificador 1 (seguridad y cobros): sin bloqueantes.**
  - No se quitó ninguna compuerta. Oráculo, Mercado, Media Studio y Crear producto siguen solo para admins, incluso si alguien entra por un enlace directo.
  - No hay secretos nuevos.
  - La consulta nueva a `winning_ads` en Ganchos pide columnas concretas y como máximo 24 ids.
  - No se oculta, recorta ni reordena nada del catálogo.
- **Verificador 2 (lo que ve el cliente): encontró 2 bloqueantes y los arregló** (sección 2: Radar y Entrar). La landing y `/signup` se abrieron en un servidor local, sin iniciar sesión.

**Lo que no se pudo ver en pantalla** (hace falta iniciar sesión, y eso estaba prohibido):
- La línea "Tu siguiente paso" del Inicio a 375 px.
- Influencer IA sin producto.

Las dos tienen pruebas de render, pero conviene mirarlas en tu cuenta justo después de publicar.

**Detalles menores que no bloquean** (quedan para la próxima ronda):
1. En Influencer IA, cuando ya hay más de 4 fotos anteriores, la que sobra se borra del almacenamiento antes de confirmar el guardado. Si el guardado falla, esa foto se pierde.
2. Si cambias de personaje, las fotos anteriores del personaje viejo siguen en la lista.
3. Los errores de registro que la app no reconoce se mandan a PostHog (hasta 160 caracteres). Conviene vigilar que no incluyan el correo.
4. En Contenido, borrar una pieza espera 5 s para permitir Deshacer. Si la persona cierra la pestaña antes, la pieza no se borra.

---

## 5. Lo que necesita a Jean

| # | Tema | Recomendación |
|---|---|---|
| 1 | **Apagar `heygen-diag`** (crítico) | **Hazlo hoy.** Bórrala de producción o reemplázala por una respuesta 410 ("ya no existe"). Después revisa que no quede otra función en producción que no esté en el repo. |
| 2 | **Archivar `spy-analyze`, `tiktok-search` y `analyze-ad`** | Sí: que respondan 410 y dejar el código en el repo. Si alguna vuelve, que cobre con `edge_guard_charge`. |
| 3 | **Garantía de 30 días** | Revisa en Whop si existe y con qué condición. **Si existe:** dejar "garantía de reembolso de 30 días" con esas palabras en planes, landing, Inicio y asistente, y quitar "si no terminas tu producto" mientras Crear producto siga cerrado. **Si no existe:** retirarla de todas partes y del manual. |
| 4 | **Cupón FUNDADOR en Whop** | Véncelo en Whop. La landing ya no lo menciona, pero el código podría seguir funcionando allí. |
| 5 | **Tope de 3.000 y créditos comprados** (migración) | Sí: separar el saldo comprado del mensual, aplicar el tope solo a lo del mes y gastar primero lo del mes. Mientras tanto, quitar la frase "se usan después de los del mes". |
| 6 | **Respaldo de imagen de anuncio a 1,2×** (despliegue) | Sí: devolver los créditos y pedir "inténtalo de nuevo" en vez de caer a Gemini. No cambia ningún precio. |
| 7 | **Reembolsos de video después de 1 hora** (cron o migración) | Sí, antes de abrir el video que habla: un cron cada 10 min que devuelva los trabajos fallidos. |
| 8 | **Cifras de la landing** (114.000 anuncios, 7.517 ofertas, 300 ganadoras, 13 países, 18 nichos) | Una lectura ligera con estadísticas o conteos guardados, nunca `count exact` sobre `winning_ads`. Si alguna bajó, se corrige a un "más de N" real. |
| 9 | **Precios de texto entre 15× y 37×** | Lo decides tú. Si quieres quedarte en 3–6×, empieza por bajar blueprint y los generadores medianos. Además, agregar un aviso de "más de 6×" en `admin_margin`. |
| 10 | **Análisis de YouTube cerca del piso** | Subir yt_reference a ~60 o bajar el tramo a 10–12 min. Agregar sus 4 acciones a `CREDIT_COSTS`. |
| 11 | **Crear producto** | Abrir un piloto para quien ya pagó el plan, después de revisar en `admin_margin` que siga en 5× o más. Resuelve también lo de la garantía. |
| 12 | **Ideas para WhatsApp** | Sacarla a Ofertas con su precio actual (15 créditos). Es lo que pide Cindy. |
| 13 | **Video que habla (UGC)** | Prueba 1 video de 10 s (110 créditos) desde tu cuenta, para ver si los labios quedan bien en español. Ábrelo solo después del punto 7. |
| 14 | **Moneda local** | Un paquete propio: guardar la moneda local con su código y mostrar "aprox. US$" solo como referencia. |
| 15 | **"Otra versión" de YouTube y "Reescribir esta lámina"** | Son precios nuevos. Que reescriban sobre lo ya analizado, a 5× el costo. |
| 16 | **Tipo "Live" en el tracker y generador "Lanza a tu lista de WhatsApp"** | Necesitan migración o generador nuevo con su precio. Van en la siguiente ronda. |
| 17 | **Cobro desde el navegador** (`consume_credits`) | Revocar el permiso a `authenticated` y pasar las 3 filas a "server". En el cliente se quita `consume()`. |

---

## 6. Cómo publicar con tu OK

Esta rama **no necesita migraciones ni funciones nuevas**: es solo frontend. El orden siguiente aplica a todo, incluidos los arreglos de la sección 5 cuando los apruebes.

1. **Base de datos** (solo si apruebas los puntos 5, 7 o 17): aplicar la migración, comprobar con una lectura ligera y avisar si algo no cuadra.
2. **Funciones** (si apruebas los puntos 1, 2 o 6): apagar `heygen-diag` y las 3 funciones sin cobro, y desplegar `generate-ad-creative` sin el respaldo de Gemini. Después, llamar a cada una para confirmar que responde 410 o cobra bien.
3. **Push del frontend:**
   - Desde el worktree `scratchpad/wt-final`, unir `super-agentes-2026-10-07` a `main`.
   - Correr otra vez las pruebas, `tsc` y el build, y hacer push. Vercel publica solo.
   - Ojo: el árbol principal tiene cambios ajenos sin commit. Hay que unir desde el worktree, no desde el árbol principal.
4. **Verificar en producción:**
   - Abrir `/fundador` y comprobar que no queda FUNDADOR, que dice US$29,99 y que los botones llevan a Whop.
   - Con tu cuenta, mirar el Inicio a 375 px, Influencer IA sin producto, la confirmación de Mini Apps (cancelar, no desbloquear) y el Radar.

---

## 7. Siguiente ronda recomendada

En orden de dinero y riesgo:

1. **Seguridad y cobros del servidor:** los puntos 1, 2, 5, 6 y 7 de la sección 5. Son los que pueden costar dinero o reembolsos.
2. **Garantía y Crear producto:** cerrar la promesa de la garantía y abrir el piloto de Crear producto. Es lo que más piden quienes venden infoproductos.
3. **Moneda local** en Precio, Mapa, Plan y Recuperar ventas: hoy es la queja silenciosa de RD, Colombia y México.
4. **Limpiezas pequeñas en el cliente:**
   - Filtrar de la tabla de Créditos lo gratis o inexistente.
   - Quitar `consume()`.
   - Pasar los precios de YouTube a `CREDIT_COSTS`.
   - Corregir los 4 detalles menores de la verificación.
5. **Abrir lo que ya existe y la gente pide:** Ideas para WhatsApp y el video que habla, con su prueba previa y el cron de reembolsos.
6. **Fase 3 para quien escala:** lote de ganchos, VSL avanzado, CPM y hook rate, y CSV de Meta. Son para Hany y Diego, los clientes de mayor valor.

---

**Rama:** `super-agentes-2026-10-07`. Worktree: `/private/tmp/claude-501/-Users-usuario-SUPERNOVA/5f102904-3eec-4250-8f37-7d1a11210bf2/scratchpad/wt-final`. Son 26 commits sobre `main`, todos locales.
