# Plan · «Video IA Perfecto» (Método AH) dentro de SUPERNOVA (02-nov-2026)

**Pedido de Jean:** que la persona escriba UNA frase («un video de una influencer saliendo de un hotel a una fiesta en
una azotea», «un anuncio de mis leggings con dos chicas charlando») y la app entregue el video terminado con la
calidad de AvatarHype, sin saber de IA ni de Claude Code. Base: el documento técnico «AVATARHYPE VIDEO ENGINE»
(15 agentes, 7 fases, puertas de calidad, modo «cambiar solo…»), el método 6C, el catálogo de modelos AH (módulo 2)
y los 3 reels analizados (`docs/plantillas/2026-11-02-modelo-ah-referencias.md`).

**Nombre:** en pantalla «Video IA Perfecto», con la etiqueta pequeña «Modelo AH». Nunca «AvatarHype».

## 1. Qué cambia respecto al documento original (y por qué)
| El documento pide | En SUPERNOVA | Por qué |
|---|---|---|
| Un repositorio Python con CLI (`avatarhype generate`) | Un botón en la app; los agentes viven en el servidor (edge functions) | La persona no usa terminal. El método queda en el servidor para que no se pueda copiar desde el navegador |
| Agentes de Claude Code | Pasos del servidor con el LLM que ya usa la app (Gemini en `ai-chat`), salida JSON validada | Mismo reparto de responsabilidades, sin depender de Claude Code |
| `production_manifest.json` en disco | Tabla `ah_proyectos` (JSONB por fase) + `video_jobs` que ya existe | Se puede retomar, ver costos y rehacer una escena |
| FFmpeg en servidor | Montaje en el navegador (Remotion `renderMediaOnWeb`, como ya hace la app) | Gratis, ya probado; sin servidor de render |
| Proveedores «auto» | Catálogo AH: imagen GPT Image 2 (realista) / Nano Banana Pro (creativo); video Omni (habla) / Grok (sin hablar) / Kling primer→último (transiciones de animados); voz ElevenLabs | Es su tabla y ya está en `src/lib/modelAdvice.ts` |
| Personaje ficticio por defecto | Ficticio por defecto; con la cara de la persona solo si sube su foto (es suya) | Regla del documento + manual |

## 2. Lo que ve la persona (3 pantallas)
1. **Tu idea** — una frase. Opcional, plegado: modo (A Influencer / B UGC / C Animado), duración (15/30/45 s), «con mi
   cara» (foto), voz (ninguna / en off / diálogo), plantilla (Monólogo que vende · Dualcast · Reto ¿real o IA? · libre).
2. **Tu storyboard** — el personaje (ficha con su cara fija) y las escenas con imagen, texto y cómo pasa a la
   siguiente. Botones: «Hacer el video», «Cambiar solo…» (ropa / sitio / pose / luz / cámara de una escena).
   **Hasta aquí solo se cobra el storyboard** (norma de Jean del 02-nov).
3. **Tu video** — se genera escena por escena (barra de progreso), se monta con la edición AH (subtítulos de dos capas,
   palabra clave grande, prueba en pantalla) y se descarga. Informe de calidad corto en lenguaje llano.

## 3. Los agentes (en el servidor, cada uno con entrada y salida JSON validadas)
| # | Agente | Salida | Fase |
|---|---|---|---|
| 00 | Orquestador | plan, estado, costos, reintentos (máx. 2 por escena), reanudar | todas |
| 01 | Estratega creativo | brief: público, plataforma, modo A/B/C, gancho de 1–3 s, final | 1 |
| 02 | Guionista | guion y línea de tiempo (gancho / curiosidad / desarrollo / remate / CTA) | 1 |
| 03 | Arquitecto de personaje | biblia del personaje + reglas de consistencia | 1 |
| 04 | Ingeniero 6C | prompts por escena (C1–C6), terminados en «No text, no watermark, no distortion.» | 2 |
| 05 | Director de storyboard | planos, duración, ángulos, transiciones, riesgos de continuidad | 2 |
| 06 | Continuidad | imagen canónica del personaje → referencias para todas las escenas | 2–3 |
| 07 | Imagen | genera y valida (GPT Image 2 / Nano Banana Pro) | 3 |
| 08 | Director de movimiento | prompt de video: sujeto / cámara / entorno / qué se preserva | 4 |
| 09 | Video | Omni si habla, Grok si no, Kling primer→último en animados; tareas asíncronas + reembolso si falla | 4 |
| 10 | Voz y audio | voz (ElevenLabs), tiempos por palabra, música y efectos con licencia | 5 |
| 11 | Editor | montaje en el navegador con la plantilla elegida | 5 |
| 12 | QA visual | revisa fotogramas reales (identidad, manos, parpadeo, texto/logos colados) | 6 |
| 13 | QA narrativa | ¿el inicio engancha?, pausas, remate, final | 6 |
| 14 | Entrega | MP4 verificado, miniatura, subtítulos .srt, texto para publicar | 7 |

## 4. Dinero (manual: cobro en servidor antes de gastar, reembolso si falla, precio ≥ costo × 5)
Costo real estimado de un video de 30 s (6 escenas) con precios APIMart del 02-nov:
- Texto de los agentes ≈ US$0,05 · imágenes (≈10 con reintentos) ≈ US$0,10–0,20 · QA visual ≈ US$0,03
- Clips: **sin hablar (Grok)** ≈ US$0,60 · **hablando (Omni)** ≈ US$2,10 · voz ≈ US$0,27
- **Total ≈ US$1,0 (sin labios) a US$2,6 (con labios)**. Con ×5 y el crédito a US$0,008: ≈ 625–1.625 créditos.
  Los precios en créditos los decide Jean (dos acciones nuevas en `credit_prices`: storyboard y video).

## 5. Fases de construcción (cada una se prueba en producción solo con Jean antes de abrirla)
1. **Storyboard desde una frase** (agentes 00–07): ficha del personaje + escenas con imagen + «Cambiar solo…».
2. **Video** (08–11): clips Omni/Grok/Kling, voz, montaje con la plantilla «Monólogo que vende».
3. **Calidad y entrega** (12–14) + plantillas Dualcast y Reto ¿real o IA? + animado (8 prompts, que ya existe como texto).

## 6. Pruebas
Tests de lógica pura (esquemas, tiempos del storyboard, final obligatorio de los prompts, «cambiar solo» no toca lo
demás, tope de gasto, reintentos) en `src/lib/*.test.ts` y `npm run build` con el Guardián. Antes de cada despliegue,
una corrida real con Jean y el gasto real (saldo antes − después).
