# Propuesta: un solo camino guiado ("siempre sé en qué etapa voy")

**Fecha:** 25-sep-2026 · **Estado:** esperando OK de Jean · **No se ha tocado código.**

## El problema real

Jean: "se hace un poco perdido". Lo que falta no son herramientas (tenemos más que nadie), es **el hilo**:

1. **La etapa solo se ve en Inicio.** El recorrido de 6 etapas (`BusinessJourney`) existe, pero en cuanto el usuario entra a una herramienta desaparece. Dentro de Validar o de Generadores nada le dice "vas en la 2 de 6" ni "lo siguiente es Precio".
2. **La oferta que eligió no viaja.** `products` no tiene `offer_id`. "Quiero vender esta" copia 4 textos a la ficha y se pierde el vínculo: en Precio no aparece el checkout real ni el LTV de SU oferta (están en `business_maps`, amarrados a la oferta, no al producto).
3. **Cada pantalla es una isla.** 17 pantallas visibles; los datos pasan por 7 llaves de `localStorage` distintas (`supernova_*_prefill`) y 6 pantallas ni siquiera reciben `onNavigate`, así que no pueden ofrecer "siguiente paso".
4. **Dos reglas de "siguiente paso".** `MyBusinessPage` tiene la suya (Validar → Precio → Plan) distinta de `journeyStages()`. Pueden decir cosas diferentes.
5. **Tres puertas de entrada para lo mismo:** Inicio, Mis productos y Mi ficha.

Lo que ya existe y se reutiliza: `journeyStages()` (una sola regla de 6 etapas), `ProductContext` (producto activo), `BusinessJourney` (stepper), `WeeklyPlan`, `useSellThis`, `business_maps` y la pestaña Números.

## Lo más pequeño que lo resuelve

Tres cosas, en este orden, cada una útil por sí sola:

### Fase A — "Siempre sé dónde estoy" (1–2 días, sin migraciones)
1. **`JourneyContext`**: calcula las etapas UNA vez (producto activo + anuncios + builds) y lo comparte. Hoy cada pantalla lo recalcula o no lo sabe.
2. **Barra de etapa fija en todas las pantallas** (debajo de la barra superior): 6 puntos, la etapa actual resaltada y "Estás en: 2 · Validar". En teléfono, una línea: "Etapa 2 de 6 · Validar" que al tocarla abre las 6.
3. **Mapa pantalla → etapa** (`PAGE_STAGE`): cada herramienta sabe a qué etapa pertenece. Si el usuario está en una etapa que no es la que le toca, la barra lo dice sin bloquear: "Tu siguiente paso es Precio".
4. **Pie "Siguiente paso"** en cada herramienta cuando su etapa se cumple: "✓ Validaste tu idea (nota 72). Siguiente: Precio →". Un clic, sin volver a Inicio.
5. **Menú como camino**: las etapas hechas con ✓, la actual abierta y resaltada, las demás plegadas (se abren con un clic; nada se esconde).
6. **Una sola regla**: `MyBusinessPage` usa `journeyStages()`.

### Fase B — "Mi oferta me acompaña" (2–3 días, 1 migración)
7. `products.offer_id` (+ nombre y mercado de la oferta como foto). "Quiero vender esta" lo guarda.
8. **Tarjeta "Tu oferta de referencia"** en Validar, Precio, Construir y Vender: nombre, días anunciando, precio real del checkout. Un clic abre su ficha.
9. **Precio usa el Mapa del negocio de esa oferta**: el precio real, la escalera y el LTV aparecen dentro de la etapa 3, no escondidos en la pestaña Números de otra pantalla.

### Fase C — "Todo cerca" (3–5 días)
10. **Inicio = Mi negocio**: una sola página con las 6 etapas en acordeón. La etapa actual abierta, con su resumen y su acción principal dentro (p. ej. en Precio, la calculadora compacta; en Vender, los 3 próximos anuncios del Mándala). "Abrir herramienta completa" para ir a fondo. Inicio + Mi ficha + Mis productos pasan a ser una sola puerta (Mis productos queda como selector).
11. Reemplazar las llaves `supernova_*_prefill` por un solo `JourneyContext.handoff(page, payload)`.

## Qué se rompe (revisado)
- `OnboardingTour` usa `data-tour="nav-<key>"` del menú → al plegar grupos hay que mantener esos atributos o actualizar el tour.
- `HelpAssistant` (SYSTEM_PROMPT) describe el menú → actualizar el texto.
- `weekly-plan` limita `page` a su lista `PAGES` → si cambia alguna clave, actualizarla.
- `Index.tsx` remonta todo con `key={productKey}` → la barra debe vivir fuera de ese `div` o se parpadea al cambiar de producto.
- Pantallas sin `onNavigate` (Radar, Generadores, Media Studio, Oráculo, Créditos, Crear) → el pie "Siguiente paso" lo pinta el shell, no cada pantalla.
- Fase B: `useSellThis` y `MiniAppModal` escriben la ficha → agregar `offer_id` sin cambiar lo que ya hacen.

## Casos límite
- Usuario nuevo sin producto → `ProductContext` ya crea "Mi primer producto"; la barra muestra Etapa 1.
- Varios productos → la barra es del producto activo y lo nombra.
- El usuario salta adelante (va a Vender sin validar) → se permite; la barra solo recuerda qué falta. **No se bloquea nada.**
- Etapa marcada a mano ("Ya lo hice") → cuenta como hecha, igual que hoy.
- Oferta elegida que luego se excluye del catálogo → la tarjeta usa la foto guardada (nombre y mercado) y no se rompe.
- Pantallas de solo admin → no aparecen en la barra ni en el mapa.
- Teléfono (375 px) → la barra ocupa una línea; el menú plegado cabe sin scroll.

## Cómo se verifica
- Pruebas (vitest) de `PAGE_STAGE` y de la etapa actual para cada combinación de `journeyStages`.
- `npm run build` + lint.
- En la app, con sesión de Jean (yo no puedo iniciar sesión): recorrer Inicio → Ofertas → "Quiero vender esta" → Validar → Precio en tamaño teléfono y confirmar que la barra, el pie y el menú dicen siempre la misma etapa.
- Fase B: la tarjeta "Tu oferta" muestra el precio real de una oferta con checkout de Hotmart.

## Qué NO vamos a hacer (y por qué)
- **Bloquear etapas.** El que ya tiene producto no debe ser obligado a "validar" para entrar a Vender. Guiar, no encerrar.
- **Juntar todas las herramientas en una página gigante.** Sería lento (Radar solo tiene 1.659 líneas) y rompería la regla de rapidez. La Fase C trae lo esencial de cada etapa; lo completo queda a un clic.
- **Quitar pantallas o herramientas.** Se reordenan y se conectan; no se pierde nada.
- **Volver a la gamificación (XP, rachas por entrar).** Jean la quitó el 23-sep; el progreso es el del negocio.
- **Cambiar precios o créditos.**
