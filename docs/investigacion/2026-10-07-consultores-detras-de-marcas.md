# Los consultores detrás de las marcas grandes — qué aprendimos y qué aplicamos (07-oct-2026)

Fuente: video que Jean pegó en el chat (consultora de infoproductos en español). Casos: Jason Fladlien
con Iman Gadzhi, Pierre con Brez Scales, Blake Rocha con Shelby Sapp, Caleb con Alex Hormozi y un
cliente propio de la consultora. Las cifras son las que cuenta el video; no las verificamos y **no se
muestran al cliente como datos nuestros**.

## Lecciones

1. **No hicieron más cosas: cambiaron 2 o 3 cosas en el momento justo.** Fladlien, 29 días antes de
   un lanzamiento de Iman Gadzhi: presentación simple en vez de producción grande, precio más alto
   anunciado desde el día 1 y vender el día 2 en vez del 4 (se perdía gente cada día).
2. **Cada etapa del embudo se mide por separado.** Brez creía que le faltaba contenido; Pierre midió
   y vio que solo contactaban al 22 % de los que entraban. Era conversión, no contenido. Arreglar
   conversión con más contenido = llenar un balde roto.
3. **Copiar el frente no sirve si no ves lo de atrás.** De Shelby se ve el contenido; la estrategia
   (eventos, producto, equipo) la arma un socio que no sale en ninguna entrevista. Copiar sin el
   contexto es actuar a ciegas.
4. **Lo que te llevó a un nivel deja de servir en el siguiente.** Brez se estancó en 500 k/mes
   haciendo más de lo mismo.
5. **Más clientes no siempre es mejor: el cliente correcto.** Un webinar sin vender nada atrajo a
   quien compra con calma; mejor facturación y gente a la que sí se le podía dar resultado.
6. **Exprime lo que ya tienes:** audiencia que no convierte, lista sin usar, clientes a los que no
   les vuelves a vender.
7. **La mirada de afuera.** El que opera el negocio ve lo que sabe hacer; el de afuera ve el panorama.

## Lo que aplicamos (local, sin publicar)

**"¿Dónde se me escapan las ventas?"** (`#/diagnostico`, etapa 6, gratis, sin IA):
- La persona anota sus números de 30 días (le vieron → clic → le escribieron → les respondió → le
  compraron; opcional recompra, reembolsos, gasto). Puede traer leads y ventas de su tracker.
- La app calcula cada paso, lo compara con un **mínimo sano editable** (regla práctica, no promesa)
  y da **hasta 3 cambios** ordenados por cuántas ventas más darían con la misma gente (lecciones 1 y 2).
- Si el freno está abajo, lo dice claro: **"No necesitas más anuncios ni más contenido todavía"** (lección 2).
- Avisa si los reembolsos pasan del 10 % (cliente equivocado, lección 5) y si el costo por venta
  supera lo que aguanta su precio (sale de la calculadora de Precio).
- **"Lo que ya tienes y no estás usando"**: 6 preguntas de sí/no; cada "no" lleva a la herramienta
  que lo resuelve (lección 6).
- Archivos: `src/lib/funnelDoctor.ts` (+ prueba), `src/pages/DiagnosticoPage.tsx` (+ prueba);
  registrada en `tools.ts`, `pageSlugs.ts`, `Index.tsx`, `journey.ts`, `TopBar.tsx`, `ToolThumb.tsx`,
  `BusinessJourney.tsx` y la guía del asistente (`HelpAssistant.tsx`).
- Lo anotado se guarda en el navegador (por producto). Si se quiere en el servidor (para el reporte
  cada 15 días o para que Admin → Aprendizaje vea dónde se traban los usuarios), hace falta una
  columna `funnel` en `business_profile`: migración que espera el OK de Jean.

## Propuestas (no hechas, para decidir con Jean)

- **"Lo que no se ve" en cada oferta (lección 3).** En la ficha de una oferta, una sección que
  separe lo que se ve (anuncio, página, precio) de lo que hay detrás y hay que montar para que
  funcione igual: quién responde los mensajes, seguimiento, upsell, garantía, cuántos días lleva
  pagando anuncios. Encaja con "Roba como un artista": modelar la oferta **con** su contexto.
- **Diagnóstico en el reporte cada 15 días.** Si se guarda en el servidor, el reporte puede decir
  "tu paso más flojo sigue siendo responder: 35 %, subió desde 22 %".
- **Consejo según el nivel (lección 4).** Con 0 ventas el foco es validar y cerrar las primeras; con
  ventas estables, subir ganancia por cliente; con CPA sano, escalar. El diagnóstico ya cambia el
  mensaje según el freno; falta conectarlo con "Tu semana".
- **Precio anunciado temprano y vender antes (lección 1)** como regla en los generadores de VSL,
  webinar y DM: presentar la oferta en la primera conversación.
