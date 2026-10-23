# Estudio de video unificado (estilo Higgsfield) — propuesta 22-oct-2026

Origen: prueba real de Cindy (cuenta `arieltarazona0829@gmail.com`) en "Anuncio en video" y pedido de Jean:
elegir motor, más segundos, foto del producto, elegir avatar, varias escenas y unirlas. Precio mínimo = costo × 6.

## 1. Qué le pasó a Cindy (datos de producción)

- 22-oct: hizo 3 tomas para "Recetas para congelar" (225 créditos). Escribió frases de ~20 palabras en tomas
  de 5 s. En 5 s caben ~12 palabras (`maxWords` = 2,4 por segundo), así que el audio sale cortado o acelerado.
  **El límite de 5 s fijo por toma es el problema real**, no un fallo de la IA.
- 20-oct: la pantalla de video se cayó al abrir (`Cannot read properties of undefined (reading 'VideoStudioPage')`,
  chunk viejo después de un despliegue). Luego hizo 3 tomas (1 gratis, 2 cobradas).
- No pudo poner su producto (la toma "Demostración" sostiene un producto genérico) ni elegir persona ni motor.

## 2. Lo que ya existe en SUPERNOVA (hoy está repartido en 6 sitios)

| Herramienta | Dónde | Motor | Quién la ve |
|---|---|---|---|
| Anuncio en video / Clip / Serie | `VideoStudioPage` + `video-studio` | Seedance 2.0 Mini, 5 s por toma | Clientes |
| Estudio de avatar | `EstudioAvatarPage` + `avatar-studio` | Omni, Grok, Seedance Mini, Wan 3.0, Kling 2.5, Kling 3.0, Seedance 2.0; 5/10 s; avatar + producto; cámaras, gestos, voces, acentos | Solo admins |
| Vende sin mostrar tu cara | `PersonajePage` + `video-generate` (fal, `media_models`) | catálogo fal | según `media_models` |
| Avatar que habla | `avatar-talk` | TTS + Kling Avatar (fal) | Solo admins |
| Media Studio | `MediaStudioPage` + `heygen-*` | HeyGen v3 | — |
| Genjutsu | `GenjutsuPage` | Seedance 2.0 ref-to-video | Solo Jean |
| Armar video final | `AdFinalVideo` | une las tomas en el navegador, gratis | Clientes |

**Conclusión:** casi todo lo que pide Jean ya está construido en el **Estudio de avatar** (multimotor, producto,
avatar, precios × 6 aprobados en `credit_prices` `av_vid_*`). Falta: escenas encadenadas, más segundos,
abrirlo a clientes y que "Anuncio en video" deje de ser una herramienta aparte.

## 3. Cómo lo hace Higgsfield

- **Marketing Studio:** subes foto o enlace del producto → eliges presentador (biblioteca o creado por ti) →
  eliges formato (habla a cámara, sin cara, sin voz…) → video con voz y labios en una pasada, hasta ~15 s.
  Dos caminos: plantilla sin escribir prompt, o prompt libre.
- **Crear video:** selector de modelo (Kling, Veo, Seedance, Wan…), duración según el modelo, formato,
  imagen inicial/final, audio sí/no.
- **Multi-escena:** varias tomas conectadas desde una idea (Veo "Multi Reference", Kling multi-shot).

## 4. Propuesta: un solo "Estudio de video" con 3 pasos

1. **Qué vendes:** producto activo + **foto del producto** (subida a `creativos`, ruta propia validada en el servidor).
2. **Quién lo presenta:** avatar de SUPERNOVA, tu personaje, tu foto, o "sin persona" (solo producto / voz en off).
3. **Escenas:** plantilla (Problema-solución, Demostración, 3 razones…) que propone N escenas; cada escena con
   su texto, **su motor y su duración**. Contador de palabras por escena (avisa antes de cobrar si no cabe).
   Botón "Unir en un video" (ya existe, gratis).

Motor por defecto según el caso (regla de `modelAdvice.ts`): habla a cámara → Omni; sin hablar → Grok;
avatar + producto en la misma toma → Seedance 2.0. Avanzado: elegir cualquiera.

Servidor: se reutiliza `avatar-studio` (ya arma el prompt, cobra con `edge_guard_charge`, devuelve si falla).
Se le añade la acción de escenas encadenadas (último cuadro → siguiente toma) que hoy tiene `video-studio`.
`video-studio` queda para Clip / Serie / escenas de YouTube.

## 5. Duraciones y precios (costo × 6, crédito a US$0,008)

Ya aprobados (`av_vid_*`): Omni 6 s 225 / 10 s 300 · Grok 6 s 87 / 10 s 144 · Seedance Mini 5 s 89 / 10 s 177 ·
Wan 3.0 188/375 · Kling 2.5 158/315 · Kling 3.0 315/630 · Seedance 2.0 529/1.058.

Nuevos a confirmar con la doc de cada proveedor antes de crear el precio:
- Grok 15 s: 0,287 US$ → **216 créditos**.
- Seedance Mini 15 s (si APIMart lo acepta): 0,354 US$ → **266 créditos**.

Ojo: "Anuncio en video" hoy cobra `vid_mini_5` = 75 créditos (costo 0,118 → 5,1×). Con la regla × 6 serían 89.

## 6. Decisiones de Jean (22-oct-2026) y lo construido

- **Estudio de video único**, motores de **APIMart + Higgsfield** para clientes, **todo a × 6**.
- Cada escena con su **"Cómo se ve"** (prompt libre, como Higgsfield), motor, segundos (5/10/15) y cámara.
- Hecho (local, sin desplegar): `src/components/video/AdStudio.tsx` (+ test), `avatar-studio` acepta 15 s,
  formato del video, avatares de SUPERNOVA como presentador y `look`; `video-studio` acepta videos de higgsfield.ai
  al unir; migración `20261022180000_estudio_video_15s.sql` (15 s y `vid_mini_5/10` → 89/177).
- Duraciones confirmadas en las docs del proveedor: Seedance Mini 4–15, Grok 6–15, Omni 4/6/8/10, Kling 2.5 5|10,
  Kling 3.0 3–15 (trae multi-escena nativa, hasta 6 tomas: siguiente paso), Wan 3.0 2–30, Seedance 2.0 4–15.
- Para clientes se abre con los interruptores `avatar-studio:open` y `avatar-studio:higgsfield` después de la
  primera prueba real de Jean. Mientras están cerrados, los clientes siguen con la versión anterior.
