# Propuesta: Creador de videos para YouTube (faceless) + Radar de nichos de YouTube

**Fecha:** 03-oct-2026 · **Estado:** esperando decisiones de Jean · **No se ha tocado código.**
Referencia: HacksLabs "Creador" (capturas y transcripción de un video de Erick): Idea → Producción
(Guion y escaleta → Voz en off → Escenas: imagen y animación → Ensamblaje y subtítulos → Miniatura y
textos) → Resultado (exportar 16:9 / 9:16 / 3:4, título, descripción, hashtags, miniatura, publicar).
Configura todo en una sola pantalla: formato, duración, estilo, modelo, voz y "% del video animado".
Además "Nichos Long / Short": canales de YouTube que crecen, vistas, suscriptores, "ingreso est." y RPM.

## Cómo lo hacemos mejor: un paso por pantalla, con elección y el costo a la vista

Jean: "que vaya paso a paso, no un montón de pasos a la vez; que tenga cómo elegir, entretenido pero no
agobiante". Cada paso es UNA pregunta con tarjetas grandes; arriba, un contador de créditos que se
mueve con cada elección; siempre "Atrás" sin perder nada.

1. **¿De dónde sale la idea?** Un tema · Un video de YouTube que ya funciona (pegas el enlace) · Tu guion ·
   Un nicho del Radar de YouTube. (Gratis.)
2. **Tu guion.** La IA escribe un guion ORIGINAL (si diste un video, toma su estructura y su tema, nunca
   su texto) y lo puedes traducir. Lo lees, lo cambias o pides otra versión. (Créditos de texto, bajos.)
3. **Estilo.** Tarjetas con ejemplo: Anime, Animación 2D, Cinematográfico, Pintura, Minimalista, Documental.
4. **Voz.** 4 voces en español para escuchar con un toque.
5. **¿Cuánto se mueve?** Deslizador 0 % · 10 % · 25 % · 50 % · 100 % animado (el resto, imágenes con
   movimiento suave). El contador muestra el precio al instante.
6. **Confirmar.** Resumen: duración, escenas, voz, % animado y créditos totales. Un botón: Producir.
7. **Producción en vivo.** Se ve cómo salen las escenas (storyboard). Mientras, puedes ir a la miniatura.
8. **Resultado.** Ver, exportar (16:9 / 9:16), título, descripción y hashtags, 2 miniaturas para elegir y
   "Sacar 3 Shorts de este video".

## Radar de nichos de YouTube (lo que ya tenemos con Meta, ahora con YouTube)

Con la **API oficial de YouTube** (gratis, cuota diaria): canales y videos que crecen por nicho, vistas,
suscriptores, días desde que se publicó y "vistas por encima de su promedio". El "ingreso estimado" sale
de rangos públicos de RPM por nicho y país, siempre con la palabra **estimado** y el rango (manual: cada
número dice qué cuenta). Botón "Crear mi versión" → paso 1 con el video como referencia.

## Costo real por video (APIMart) y créditos (≥ 4× costo, por debajo de Higgsfield)

Video de ~14 min, 87 escenas:
| Pieza | Costo real |
|---|---|
| Guion (texto) | ~US$0,02 |
| Voz en off (TTS de APIMart) | por confirmar (falta la pestaña Audio de la lista de precios) |
| 87 imágenes (GPT Image 2) | US$0,70 |
| 10 % animado: 9 clips de 5 s (Seedance 2.0 Mini 720p) | US$0,98 |
| Subtítulos (Whisper, APIMart) | ~US$0,08 |
| Unir el video (render) | ~US$0,10–0,30 |
| **Total (sin voz)** | **~US$2** → ~1.000 créditos |

100 % animado: 87 clips ≈ US$9,50 → ~4.800 créditos. Por eso el deslizador.

## Lo técnico
- Todo en APIMart (texto, imagen, video, TTS, Whisper, música) con la misma llave.
- **Unir 14 minutos** no cabe en una función de Supabase ni conviene en el navegador: se usa un servicio
  de render (fal.ai tiene "ffmpeg compose" y ya tenemos su llave) o uno dedicado (Shotstack/Creatomate).
- **Peso:** un video de 14 min en 1080p pesa 150–300 MB. El plan Free de Supabase (1 GB) no lo aguanta: o se
  entrega con el enlace temporal del render para descargar, o Supabase Pro / almacenamiento aparte (R2).

## Riesgos que hay que decir en voz alta
- **YouTube (desde jul-2025) desmonetiza contenido "repetitivo o producido en masa" sin aporte propio.**
  Por eso: guion original (nunca el texto de otro canal), estructura propia, y un aviso en la app de cómo
  aportar valor. Nada de "sube 30 videos al día".
- **Ingresos:** solo estimados y con rango; jamás "gana X al mes" (manual).
- **Copiar canales:** se toma idea, tema y estructura; nunca guion, miniatura ni marca literales.

## Fases
1. Radar de nichos de YouTube (API oficial) + paso 1–2 (idea y guion).
2. Voz + escenas en imagen + render (video sin animación) + miniatura y textos.
3. % animado con clips, subtítulos, "Sacar Shorts", música.

## Decisiones de Jean
1. Pegar la pestaña **Audio** de la lista de precios de APIMart (precio de la voz).
2. Crear una llave de la **API de YouTube** (Google Cloud, gratis, 5 minutos) y guardarla en Supabase como `YOUTUBE_API_KEY`.
3. Render: ¿fal.ai (ya hay llave) o un servicio dedicado?
4. Videos largos: ¿entregar por enlace temporal para descargar, o pagar almacenamiento?
