# Misión 05 · Calidad del video, del avatar y de "Armar video final" — 11-oct-2026

Probador: productor de anuncios UGC/video, con la cuenta de Hany (`?r=m5`). Presupuesto usado:
1 anuncio de 3 tomas (165 créditos) + 1 motion graphics (50). Influencer IA no se generó: está en "PRONTO" para Hany.
Prueba en producción (https://supernova-six-eta.vercel.app/app), con el Chrome del dueño.

---

## 1. Veredicto

**De 10 personas que vean lo que sale hoy: 4 pagarían PRO y 2 recargarían para hacer más.**
Con los cambios hechos abajo (misma persona en las 3 tomas, guion sin palabras cortadas, estados claros): **7 pagarían y 5 recargarían.**

Por qué:
- **Lo bueno (lo que vende):** en 3 minutos salen 3 tomas de 5 s reales, 720×1280, con sonido (voz + ambiente),
  en una casa latina con luz natural, sin texto en pantalla ni marcas. La calidad de imagen es de anuncio UGC
  de verdad (ver `capturas/2026-10-11-mision-05-tres-personas.jpg`). "Armar video final" ya funciona con el host
  `getapib.org` y deja UN archivo MP4. "Listo para publicar" da el texto con "Personaje creado con IA" y los pasos
  para Meta/TikTok. Cobro exacto: 3 × 55 en Historial (12:35:30), nada doble.
- **Lo que hoy frena el pago:** el anuncio que salió tiene **tres mujeres distintas** (cara, ropa y casa cambian en
  cada toma). Nadie publica eso. Es el fallo n.º 1 y ya está corregido en el código (toma 1 primero; 2 y 3 siguen
  de su último cuadro). Además, el guion hablado tenía una frase rota ("Así se ve Programa digital de ejercicio
  **en** por dentro"), también corregida.
- **Lo que frena la recarga:** el motion graphics no "parece" cobrar video (está bien, 50 créditos por escenas) pero
  la narración que escribe la IA dura el doble de lo que dura el video, así que con voz el video de 30 s sale de ~55 s.
  Y en Influencer IA el botón ámbar "Hazlo hablar en video" lleva a una pared "PRONTO": la persona siente que le
  vendieron algo que no existe.

## 2. Lo que hace la app, en una línea

"Eliges un negocio digital que ya vende, y SUPERNOVA te arma tu versión (anuncio en video, textos, página) para que la cobres esta semana sin mostrar tu cara."

## 3. Top 5 fallos (con pasos)

1. **Tres personas distintas en el mismo anuncio (CRÍTICO, corregido en código, falta desplegar).**
   Pasos: Video con IA → Anuncio → Crear anuncio (sin creativo ni presentador) → esperar 3 min → bajar las 3 tomas.
   Toma 1: mujer con sudadera en un cuarto; toma 2: otra mujer en camiseta en un sofá; toma 3: otra con suéter en una
   sala. Causa: desde el 11-oct las 3 tomas se crean a la vez sin imagen inicial, y el "La misma persona" del prompt
   no alcanza. Evidencia: `docs/agentes/capturas/2026-10-11-mision-05-tres-personas.jpg`.
2. **Guion hablado con palabra colgando (ALTO, corregido).** Producto largo → `shortPhrase(…, 36)` cortaba en
   "Programa digital de ejercicio en" → la voz dice "Así se ve Programa digital de ejercicio en por dentro" y el texto
   para publicar empieza "Programa digital de ejercicio en: aprende…".
3. **"Armar video final" se queda en "0 %" hasta 45 s y puede entregar un video negro (ALTO, propuesto).**
   Pasos: con las 3 tomas listas → Armar video final. Si el navegador no abre un clip (pasa en este Chrome; también
   pasa con Safari viejo o datos lentos), `montage.ts` espera 15 s por clip y luego pone un cuadro negro en vez de
   avisar. En mi prueba el MP4 final pesó 252 KB (negro con audio). Hoy el botón ya dice "Bajando las tomas…" y
   "Uniendo… 46 % · faltan 8 s" (cambio hecho); falta que el montaje avise en vez de grabar negro (diff abajo).
4. **Motion graphics: la voz no cabe en el tiempo pedido (MEDIO, propuesto).** Pedí 30 s → plan de 7 escenas · 31 s
   (bien sin voz). Pero cada narración tiene 18–22 palabras para escenas de 4 s (≈ 8 s de voz): con voz el video
   sale de ~55 s. El prompt del servidor ya dice "2,5 palabras por segundo" y la IA no lo respeta; hay que recortar en
   el servidor. Además el botón "Crear video · gratis" se veía ámbar (activo) estando deshabilitado por falta de voz
   (corregido: ahora gris y dice "Crear video · falta la voz"). Y "Armar mi motion" dio un 502 a la primera sin
   mensaje útil (corregido: reintento automático + mensaje).
5. **Influencer IA invita a algo que está en "PRONTO" (MEDIO, propuesto).** Inicio → Influencer IA: Valentina ya
   elegida; el botón principal ámbar "Hazlo hablar en video" y el paso 3 abren la tarjeta "PRONTO · Avísame cuando
   abra". El avatar que habla (`avatar-talk`) y el UGC de Seedance están cerrados para cuentas normales; la persona no
   lo sabe hasta que toca. Debe verse como "pronto" desde el paso 1, sin botón ámbar.

Menores: `#/videoanuncio` (sin guion) cae en Inicio sin aviso (la ruta real es `#/video-anuncio`); la etiqueta del
cobro en Historial es "Video anuncio 5 s · Primer plano: una persona latina…" (mejor "Video anuncio · Toma 1 de 3 ·
Gancho"); el reproductor del video final vertical ocupaba todo el ancho como un bloque negro (corregido).

Comprobado y bien: ir atrás y adelante conserva las tomas, "Armar video final" y "Listo para publicar" (arreglo de
hoy confirmado). Los MP4 llegan con 200 desde `getapib.org` (3,3 MB · 3,3 MB · 3,9 MB; h264 720×1280 + aac 5,09 s).
Cada toma tiene audio real (pico 0,40–0,72). Gancho en los primeros 3 s: sí en las plantillas (la línea 1 es la
pregunta/promesa y la toma 1 es primer plano a cámara).

## 4. Cambios HECHOS (solo en mis archivos; tsc limpio, `vitest run` en verde: 48 archivos / 332 pruebas)

- `src/pages/VideoStudioPage.tsx`
  - **Continuidad:** sin presentador ni creativo, la toma 1 se crea primero y las tomas 2 y 3 parten de su último
    cuadro (`from_job_id`), con la frase "La persona es la de la imagen inicial: misma cara, ropa y lugar". Con imagen
    inicial se mantiene el paralelo. Al rehacer, se ancla a una toma que ya salió. Tiempo estimado: 3 a 5 min (antes 3).
  - Estados de carga: cada tarjeta dice **"Toma 2 de 3"** + "Creando… 50 %"; el botón dice "Creando toma 2 de 3…";
    debajo del grid: "Primero sale la toma 1… / 2 de 3 tomas listas. Puedes seguir usando la app…".
  - Error en una toma: añade "Abajo puedes rehacer solo esta toma: las que salieron no se cobran otra vez".
  - Orden de plantillas: la recomendada por la IA va primera en la lista "cambiar".
- `src/lib/videoTemplates.ts`: `shortPhrase` ya no deja preposiciones/artículos colgando ("…ejercicio en" →
  "…ejercicio"). Arregla la toma 2 hablada y el texto para publicar. Pruebas existentes pasan.
- `src/components/video/AdFinalVideo.tsx`: fases "Bajando las tomas…" → "Uniendo… 46 % · faltan 8 s"; aviso previo
  "tarda unos 20 segundos (se graba en tiempo real: no cambies de pestaña)"; al terminar "Listo: un solo archivo de
  16 s con sus 3 tomas"; botón "Armar de nuevo"; error con qué hacer (Chrome/Safari o unir en CapCut); reproductor
  vertical a ancho de celular.
- `src/components/video/MotionStudio.tsx`: botón "Crear video" gris + "falta la voz" cuando no se puede;
  "Grabando… 40 % (parar)" y "faltan 18 s"; texto guía con el costo de la voz; con producto activo abre en "Anuncio
  de mi producto" (antes abría en "Tengo mi guion" porque el producto llega después del primer render); reintento
  automático ante 502/503/504 y mensaje "El servidor no respondió. No se te cobró…".

## 5. Cambios PROPUESTOS (no editados: fuera de mi lista)

**P1 (ALTA) · `src/lib/montage.ts` — no grabar negro cuando un clip no abre (stitchClips).**
```diff
@@ export async function stitchClips(clips: Blob[], opts: {
-    for (const clip of clips) {
+    for (const [k, clip] of clips.entries()) {
+      // Si el navegador no puede abrir la toma, se avisa en vez de grabar 5 s en negro.
+      const probe = document.createElement("video"); probe.muted = true; probe.preload = "metadata";
+      const url = URL.createObjectURL(clip); probe.src = url;
+      const ok = await new Promise<boolean>(res => { const to = setTimeout(() => res(false), 8000);
+        probe.onloadedmetadata = () => { clearTimeout(to); res(true); }; probe.onerror = () => { clearTimeout(to); res(false); }; });
+      probe.removeAttribute("src"); probe.load(); URL.revokeObjectURL(url);
+      if (!ok) throw new Error(`Tu navegador no pudo abrir la toma ${k + 1}. Descarga las tomas y únelas en CapCut, o abre esta pantalla en Chrome o Safari actualizados.`);
       let audio: AudioBuffer;
```
Y en `renderMontage`, bajar el tope de `setTimeout(() => done(false), 15000)` a 8000 (45 s muertos hoy).

**P2 (ALTA) · `supabase/functions/motion-graphics/index.ts` — que la narración quepa en los segundos de la escena.**
```diff
@@ (parseo de beats, ~línea 280)
-    return { i, layout: ..., narration: clip(b.narration, 240), seconds: secs };
+    // 2,5 palabras por segundo (+20 % de margen): si la IA se pasa, se corta en la última frase o coma que cabe.
+    const maxWords = Math.max(6, Math.round(secs * 2.5 * 1.2));
+    const fit = (t: string) => { const w = t.split(/\s+/); if (w.length <= maxWords) return t;
+      const cut = w.slice(0, maxWords).join(" "); const m = cut.match(/^[\s\S]*[.!?…,;]/); return (m ? m[0] : cut).replace(/[,;]$/, ".").trim(); };
+    return { i, layout: ..., narration: fit(clip(b.narration, 240)), seconds: secs };
```
Y en el prompt (línea 236) poner el número explícito por escena: "escena de 4 s → máximo 10 palabras".

**P3 (MEDIA) · `src/pages/PersonajePage.tsx` — no invitar a lo que está en PRONTO.**
```diff
@@ paso 1, tarjeta de la foto
-                {state.foto && (
+                {state.foto && canTalk && (
                   <button onClick={() => setStep(3)} ...> <Mic .../> Hazlo hablar en video </button>
@@ paso 1, botones de abajo
-                  {state.foto && <button onClick={() => setStep(3)} className="h-11 px-5 rounded-full btn-primary-nova ...">
+                  {state.foto && canTalk && <button onClick={() => setStep(3)} className="h-11 px-5 rounded-full btn-primary-nova ...">
+                  {state.foto && canTalk === false && <span className="inline-flex items-center h-11 px-4 rounded-full border border-border text-[13px] text-muted-foreground"><Lock className="w-4 h-4 mr-2" /> Su video hablando: pronto</span>}
@@ pasos (ol)
-        {([[1, "Tu influencer", !!pj], [2, "Sus 10 guiones", ...], [3, "Su video hablando", talkReady.length > 0]] as const)
+        {([[1, "Tu influencer", !!pj], [2, "Sus 10 guiones", ...], [3, canTalk === false ? "Su video hablando · pronto" : "Su video hablando", talkReady.length > 0]] as const)
```
Y en la tarjeta PRONTO, cambiar "Con los mejores modelos de video del mercado" por "Con modelos de video actuales"
(es una afirmación que no podemos sostener; manual § ética).

**P4 (MEDIA) · `supabase/functions/video-studio/index.ts` — etiqueta del cobro legible en Historial.**
```diff
@@ create
-    const g = await charge(uid, seconds === 10 ? "vid_mini_10" : "vid_mini_5", `${isAd ? (kind === "ugc" ? "Video UGC" : "Video anuncio") : "Video IA"} ${seconds} s · ${prompt.slice(0, 50)}`);
+    const shotLabel = typeof body.label === "string" ? body.label.replace(/[^\p{L}\p{N} ·()/-]/gu, "").slice(0, 40) : "";
+    const g = await charge(uid, seconds === 10 ? "vid_mini_10" : "vid_mini_5", `${isAd ? (kind === "ugc" ? "Video UGC" : "Video anuncio") : "Video IA"} ${seconds} s${shotLabel ? ` · ${shotLabel}` : ` · ${prompt.slice(0, 50)}`}`);
```
(El cliente mandaría `label: "Toma 1 de 3 · Gancho"`; la etiqueta solo es texto de recibo, no afecta precio ni acceso.)

**P5 (BAJA) · `src/lib/pageSlugs.ts` / enrutador** — alias `videoanuncio` → `video-anuncio` o toast "No encontramos esa
pantalla, te llevamos a Inicio" cuando el hash no existe.

**P6 (BAJA) · prompts del servidor (`AD_RULES`)** — añadir "La misma persona, ropa y lugar en todas las tomas; sin
cambios de peinado ni de vestuario" y pedir "mira a cámara y habla, labios sincronizados" también en el anuncio (hoy
el anuncio va con voz en off; una presentadora que habla a cámara rinde más en UGC).

## 6. Lo que NO pude comprobar

- **Lo que dice la voz (comprobado después con Whisper local, modelo base):** toma 1 "Te enseño cómo funciona esto.";
  toma 2 "Así se ve programa digital de ejercicio en por dentro." (confirma el fallo 2: la voz SÍ dice la frase rota);
  toma 3 "Mírale el lase y empieza hoy." (dice "Mira el enlace", con dicción algo borrosa). Español latino, sin
  testimonios, gancho en el primer segundo. Lo que no pude confirmar es si hay labios sincronizados (en el anuncio
  va como voz en off).
- **El contenido del MP4 final.** Salió UN archivo (`supernova-anuncio.mp4`, 252 KB en ~75 s: 45 s de espera +
  16 s de grabación). Por el peso, en este Chrome quedó negro con audio (los clips no abrieron); en un Chrome normal
  debería ir con imagen. Hay que probarlo en el navegador de Jean.
- **La continuidad con el cambio nuevo.** El arreglo (toma 1 → último cuadro → tomas 2 y 3) está en local, sin
  desplegar: hay que crear un anuncio en producción después del despliegue y mirar las 3 tomas juntas.
- **Influencer IA generando video** (cerrado para Hany) y el avatar con voz real `avatar-talk` (solo admin).
- **Motion con voz** (no se creó la voz para no gastar; el desfase de duración se dedujo de las narraciones: 18–22
  palabras por escena de 4 s).
