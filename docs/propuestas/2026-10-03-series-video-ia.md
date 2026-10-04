# Propuesta: Series de video con IA ("Estudio de video")

**Fecha:** 03-oct-2026 · **Estado:** esperando OK de Jean · **No se ha tocado código.**
Referencia: HacksLabs "Hacks Flow" (capturas de Jean): series = cadena de clips donde el último cuadro
de un clip entra como imagen del siguiente, plantillas de estructura, ensamblar y exportar con
transiciones (corte, disolvencia, barrido), formato 16:9 / 9:16 / 1:1, 720p / 1080p, subtítulos sí o no.

## Qué haríamos (mejor que Hacks Flow)

Hacks Flow te da clips encadenados. Nosotros partimos de TU negocio y del guion:

1. **Elige qué haces:** Serie tipo novela · Dibujos animados · Video largo para YouTube · Anuncio en video.
2. **Personajes y escenarios ("Elementos"):** se crean una vez con imagen (6 créditos c/u) y se reutilizan
   en todos los clips para que la cara y el estilo no cambien.
3. **Guion por escenas:** la IA escribe la historia en escenas (gancho, desarrollo, giro, cierre) con lo
   que dice y hace cada personaje. Se edita antes de gastar en video.
4. **Clips encadenados:** cada escena es un clip de 5 a 10 s; el último cuadro del clip anterior entra como
   imagen del siguiente (continuidad). Se puede rehacer un solo clip.
5. **Voz y subtítulos:** narración o diálogos con voz IA y subtítulos en español.
6. **Ensamblar y exportar:** orden, transiciones, formato, resolución, subtítulos; descarga en MP4.

## Dos motores, según el tipo de video

| Modo | Cómo se hace | Por qué |
|---|---|---|
| Serie novela / dibujos / anuncio (30 s a 2 min) | Clips de video IA encadenados | Movimiento real, se ve "de película" |
| Video largo de YouTube (5 a 15 min) | Voz IA + escenas en imagen con movimiento (zoom, paneo) + algunos clips de video en los momentos clave | Un video largo solo con clips cuesta demasiado; así lo hacen los canales "sin cara" |

## Costos reales (APIMart) y precio propuesto (≥ 4× costo, por debajo de Higgsfield)

| Pieza | Costo real | Créditos |
|---|---|---|
| Clip 5 s, Seedance 2.0 Mini 720p | US$0,109 | 55 |
| Clip 10 s, Seedance 2.0 Mini 720p | US$0,217 | 110 |
| Imagen de escena o personaje (GPT Image 2) | US$0,0081 | 6 |
| Voz IA por minuto | por cotizar (lista de Audio de APIMart) | — |
| Ensamblar y exportar | en el navegador del usuario (gratis para nosotros) | 0 |

Ejemplos:
- **Serie de 50 s (5 clips de 10 s):** 550 créditos (~4 series al mes con PRO).
- **Video de YouTube de 10 min** (60 escenas en imagen + 6 clips de 10 s + voz): 360 + 660 + voz ≈ 1.100 créditos.
- Solo con clips, 10 min serían ~6.600 créditos: por eso el modo largo mezcla imágenes y clips.

## Lo técnico (y sus límites)

- **Video:** APIMart es asíncrono (tarea → consulta). Mismo patrón que video-generate con fal: cobro antes,
  reembolso si falla, tabla video_jobs.
- **Último cuadro:** se saca en el navegador (video → canvas → imagen) desde el video guardado en nuestro
  Storage (las URLs de APIMart caducan en 24 h).
- **Exportar:** ffmpeg.wasm en el navegador (une clips, transiciones, subtítulos). No gasta servidor.
- **Espacio:** cada clip pesa 3–10 MB. El plan Free de Supabase trae 1 GB de Storage: alcanza para pruebas,
  no para clientes. Opciones: borrar los clips sueltos a los 30 días y guardar solo el video final, o pasar
  Supabase a Pro (100 GB). Esto lo decide Jean.

## Fases

1. **Fase A — Serie corta (1 a 2 semanas):** elementos, guion por escenas, clips encadenados, ensamblar y
   exportar sin voz. Plantillas: Gancho-desarrollo-cierre, Short vertical, Demo de producto, Novela, Dibujos.
2. **Fase B — Voz y subtítulos.**
3. **Fase C — Video largo de YouTube** (escenas en imagen con movimiento + clips clave + voz).

## Reglas que se mantienen
Sin promesas de ingresos ni testimonios inventados en los guiones; personajes IA marcados como IA;
sin copiar personajes, marcas ni estilos con derechos (nada de "estilo Disney" con sus personajes).
