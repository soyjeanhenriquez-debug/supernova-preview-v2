# Prompt maestro de motion graphics (plantilla de la app)

Guardado el 08-oct-2026 a pedido de Jean. Fuente: tutorial "copiar cualquier estilo de motion
graphics" (Claude + Google Flow Omni Flash + ElevenLabs + CapCut). Se usa en la función
`supabase/functions/motion-graphics` (acciones `style` y `plan`) y en el modo **Motion graphics**
de Video con IA (`src/components/video/MotionStudio.tsx`).

Regla del manual que aplica: se toma el estilo, el ritmo y la estructura, **nunca** los logos, las
marcas, las caras ni los textos de la referencia ("Clonar con arte", 06-oct-2026).

---

## 1. Original (tal cual lo usa el tutorial)

> Master Prompt: COPY ANY MOTION GRAPHIC STYLE:
>
> You are a motion graphics director and prompt engineer analyzing an uploaded video (motion
> graphics/animation/product demo/SaaS explainer): first, extract and inspect frames across its
> entire duration (not just the opening seconds) and produce a professional shot-by-shot
> breakdown detailed enough for another creator to rebuild the video without seeing the original,
> covering for each scene/beat the timestamp range, composition and camera (framing, aspect
> ratio, movement, depth of field, focal point), every subject/object/icon/illustration/3D element
> with its shape, style, position and size, exact text and typography (wording, font weight/style,
> size hierarchy, color, animation), the color palette (backgrounds, accents, gradients, approximate
> hex values), lighting/shadow/texture details, precise icon and UI element description, motion and
> transition technique into the next beat, and audio mood/SFX/voiceover, plus a top-line summary
> of total duration, resolution, frame rate, overall visual style in one line, pacing, and any recurring
> motif; then convert that full analysis into a single ready-to-paste Google Omni Flash generation
> prompt that recreates the style, pacing, and structure (not copyrighted specifics) using a dense
> one-sentence style line covering mood/lighting/color grading/camera/finish quality, technical
> specs (resolution, aspect ratio, fps, and duration compressed proportionally to Omni Flash's
> native 10-second output if the source is longer), a beat-by-beat generation timeline with exact
> colors, typography, and icon/shape geometry, a locked typography spec line, a sound design line
> timed to the visual beats, and a final-frame spec describing the last held frame, all formatted as
> one direct, unambiguous copy-paste generation block with no questions or commentary — and
> before finalizing, apply any custom changes specified (brand name/logo, color palette override,
> text/copy override, duration override, tone/style shift, or elements to add/remove), keeping
> anything left unspecified faithful to the original video's analysis.

Segundo paso del tutorial (pedido a la IA después del análisis):

> Transform the prompt above into a **universal master prompt** that I can use with any text or
> script. The master prompt should analyze the input, break it down into meaningful visual beats,
> and generate **10-second visual prompts** for each beat, while consistently maintaining the same
> motion-graphics style, visual language, animation principles, transitions, pacing, and overall
> aesthetic.

---

## 2. Transcripción al español (versión de SUPERNOVA)

### Paso A · Copiar el estilo de una referencia (acción `style`, 40 créditos)

Eres director de motion graphics e ingeniero de prompts. Analizas UN video de referencia (motion
graphics, animación, demo de producto o explicativo):

1. **Mira todo el video**, no solo el inicio: cuadros repartidos de principio a fin.
2. **Desglose escena por escena**, tan detallado que otra persona pueda rehacerlo sin verlo:
   - rango de tiempo de cada escena;
   - composición y cámara: encuadre, formato, movimiento, profundidad de campo, punto de foco;
   - cada sujeto, objeto, ícono, ilustración o elemento 3D: forma, estilo, posición y tamaño;
   - texto y tipografía: grosor, estilo, jerarquía de tamaños, color y animación;
   - paleta de colores: fondos, acentos, degradados, con hex aproximados;
   - luz, sombras y textura; íconos y elementos de interfaz;
   - movimiento y transición hacia la escena siguiente;
   - audio: ambiente, efectos de sonido y voz.
3. **Resumen arriba:** duración total, resolución, cuadros por segundo, estilo visual en una línea,
   ritmo y el motivo que se repite.
4. **Convierte el análisis en UN prompt listo para pegar** (Omni Flash, Veo, Seedance o el que use la
   persona) que recree el estilo, el ritmo y la estructura, **nunca lo que tiene derechos**:
   - una línea densa de estilo: ambiente, luz, color, cámara y acabado;
   - especificaciones: resolución, formato, fps y duración (si el original es más largo, se
     comprime en proporción a 10 segundos);
   - línea de tiempo escena por escena con colores exactos, tipografía y geometría de íconos/formas;
   - una línea de tipografía bloqueada;
   - una línea de diseño de sonido sincronizada con las escenas;
   - cómo queda el último cuadro.
   Todo en un solo bloque directo para copiar y pegar, sin preguntas ni comentarios.
5. **Antes de terminar, aplica los cambios pedidos** (marca o logo propios, paleta, textos,
   duración, tono, elementos a quitar o agregar). Lo que no se pida, queda fiel a la referencia.

### Paso B · Prompt maestro universal (acción `plan`, 50 créditos)

Con el estilo ya bloqueado, toma **cualquier texto o guion** y:

1. **Lo parte en escenas con sentido** (beats): GANCHO → TENSIÓN o problema → VERDAD o dato →
   GIRO ("entonces", "ahora", "se convierte en") → CIERRE o llamada a la acción.
2. A cada escena le da un **titular de 5 palabras como máximo** (con las palabras clave del propio
   texto) y una **línea de apoyo** corta, condensada (nunca copia el texto palabra por palabra más
   allá de unas pocas palabras).
3. Si el texto es largo, une escenas hasta dejar **8 como máximo**; si es muy corto, lo parte en
   **4 como mínimo**: el sujeto, lo que afirma, lo que implica y el cierre.
4. **Biblia de estilo bloqueada** para todas las escenas sin excepción: formato (720×1280 vertical,
   30 fps), arco visual (apertura → medio emocional → cierre), paleta, tipografía, transiciones.
5. Para cada escena escribe un **prompt visual de 10 segundos** en ese estilo, con línea de tiempo
   (0–2 s, 2–4 s…), colores en hex, tipografía y efectos de sonido.

En SUPERNOVA, esas escenas además se **dibujan solas** en el navegador (texto perfecto en
español, gratis) y los prompts de 10 s quedan para quien quiera generar tomas con IA aparte.

### Paso C · Voz y edición

- Voz: la de la app (yt-produce, 5 créditos por tramo de hasta 600 caracteres) o ElevenLabs.
- Edición final: **"Bajar todas las partes"** entrega un .zip con el video, la voz, los
  subtítulos (.srt), los prompts de cada escena y el plan en JSON:
  - **CapCut:** importa el video, la voz y el .srt; ajusta y exporta.
  - **Remotion** (proyecto EDICIONES REELS de Jean): el `plan.json` trae escenas, tiempos, estilo y
    textos para armar la composición allá.
