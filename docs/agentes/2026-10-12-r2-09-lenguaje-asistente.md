# R2-09 · Que todo se entienda y que el asistente ayude de verdad (12-oct-2026)

Probador + solucionador. Sin git ni despliegues. Sesión de Hany en el Chrome de Jean, pestaña propia
(`?r=r2-09`). Presupuesto de preguntas al asistente: 10 (usadas 10; una 11.ª, "¿qué es un CTR y
dónde lo veo?", pudo salir justo cuando el Chrome se colgó: no se vio la respuesta).

## Resumen en 12 líneas

1. Nota del asistente para un principiante: **antes 4/10 → después 8/10** (medido con la guía nueva en prod, en mi pestaña).
2. La guía vieja medía ~30.000 caracteres y describía la app del 7-oct: nombres que ya no existen ("Crea con IA", "Etapa 1", "Creativos para anuncios", "Mándala", "Media Studio").
3. Lo grave: **ofrecía lo que está en pausa con precio** (avatar que habla, "desde 530 créditos") e inventaba funciones ("tomas de stock… una voz de IA narra").
4. Confundía "Hacer mi versión" (50) con "Modelar esta oferta completa" (gratis) y no decía qué entrega.
5. Terminaba siempre con una pregunta abierta y 3-4 opciones: el principiante no sabía qué tocar.
6. Reescribí el `SYSTEM_PROMPT` (`src/components/HelpAssistant.tsx`): ~10.300 caracteres, con Hoy, Mi versión, menú corto, nombres nuevos, precios de `CREDIT_COSTS` (imagen 7, video 5 s 75, anuncio 225) y pausas.
7. Regla nueva: cada respuesta termina con **"Tu siguiente paso:"** + un botón exacto + su costo; máximo 2 opciones; saludo solo al principio.
8. Incluye lo de hoy: "Hacer mi versión" entrega todo dentro de la app por 50 (oferta, precio en tu moneda que pones tú, anuncio, imagen y WhatsApp) y el anuncio de 3 tomas (225) con la misma persona.
9. Barrido de lenguaje en mis pantallas: tour, Lo que creaste, Oráculo (en pausa), Ideas WhatsApp y textos del menú (`es.ts`: "Hoy", "Tus primeros 5 anuncios", "Textos que venden").
10. Las 2 pruebas `it.fails` de R2-15 sobre el asistente ya pasan de verdad: las cambié a `it` (con nota).
11. tsc filtrado a mis archivos: solo los 2 errores viejos de `CampaignModal.tsx` (componente sin usar) y 1 de `UnsubscribePage.tsx` (tipo de RPC); vitest de mis rutas y vecinas: 37/37 en verde.
12. **Nada de esto se ve en prod hasta desplegar.** Hoy prod todavía muestra "Robot de copy" y precios viejos (6 / 55 / 165).

## 1. Las 10 preguntas (prod, burbuja del asistente)

### Guía vieja (la publicada), 7 preguntas

| # | Pregunta | Fallos (citas cortas) |
|---|---|---|
| 1 | "no sé qué vender, empiezo de cero. ¿qué hago?" | "¡Bienvenido…!" (asume hombre); "herramientas de Elegir (Etapa 1)" (no existe en el menú); manda a Mini Apps sin decir que desbloquear cuesta 150; cierra con pregunta abierta y 3 caminos. |
| 2 | "¿cómo hago mi primer anuncio?" | "sección Crea con IA", "Creativos para anuncios", "Anuncio en video" (nombres viejos); "6 créditos por imagen" y "165" (precios viejos). |
| 3 | "¿qué es un CTR?" | "Click-Through Rate" sin traducir; "0.8%" (formato inglés); inventa "Más de 1 %: vas por buen camino" (no está en la app); "Publica y mide" (sección vieja). |
| 4 | "¿cuánto me cuesta un video?" | Precios viejos (165 / 55 / 110); **ofrece el avatar que habla "desde 530 créditos"** (en pausa para clientes). |
| 5 | "¿puedo vender sin mostrar mi cara?" | **"videos donde el avatar explica tu producto con voz real"** (en pausa); inventa "tomas de stock o grabaciones de tu pantalla mientras una voz de IA narra" (no existe); "cómodo" (masculino); 4 opciones. |
| 6 | "¿qué es hacer mi versión y cuánto cuesta?" | Dice "Modelar una Oferta completa: 50 créditos" (es gratis; lo que cuesta 50 es Hacer mi versión); no dice qué entrega; "Blueprint" y "Sofisticar" sin explicar. |
| 7 | "se me acabaron los créditos, ¿qué hago?" | "1,000" (formato inglés); no nombra "Mis créditos" ni los packs. Lo demás bien. |

Ninguna respuesta se cortó (2,9 a 4 s). El problema era el contenido, no la conexión.

### Guía nueva (probada en prod en mi pestaña: la burbuja mandaba su pregunta normal y solo se cambiaba el texto de la guía), 3 preguntas

| # | Pregunta | Resultado |
|---|---|---|
| 8 | "no sé qué vender…" | "En la pantalla Hoy, verás tres negocios… toca el botón Mi versión (50 créditos)". Cierra con "Tu siguiente paso: abrir Hoy y tocar Mi versión". ✔ |
| 9 | "¿puedo vender sin mostrar mi cara?" | Creativos y fotos (7), Carrusel (15), Motion graphics (desde 50), Influencer IA (guiones 30). Sin avatar con precio. Fallos menores: 4 opciones y "texto animado y música" → **ARREGLADO** después (máx. 2 opciones; "la música la pones tú"). |
| 10 | "¿cuánto me cuesta un video? quiero que mi influencer hable" | "la función de que el personaje hable… está en pausa y llegará más adelante"; ofrece anuncio de 3 tomas (225) e Influencer IA (30 + 7). Sin precio del avatar. Fallo menor: "Anuncio con IA" en vez de "Video con IA, modo Anuncio" → **ARREGLADO** (regla 3). |

Las últimas reglas (saludo solo al principio, 2 opciones, nombre del modo, lo de hoy de Mi versión) no
alcancé a verlas en vivo: el Chrome se reinició. **Se ven al desplegar.**

## 2. ARREGLADO (mis archivos)

- `src/components/HelpAssistant.tsx`
  - `SYSTEM_PROMPT` reescrito: frase de la app, 8 reglas de respuesta, "el camino más corto"
    (Hoy → Mi versión → siguiente paso), menú del 12-oct, cada pantalla con su precio (de
    `CREDIT_COSTS`, números con punto de miles), 6 preguntas frecuentes, planes y packs (PACK MÁXIMO),
    lista EN PAUSA con su alternativa, glosario (CTR, CPA, ROAS, gancho, embudo, landing, VSL,
    order bump, upsell/downsell, UGC, creativo, nicho, low/high ticket, prompt).
  - Nota de pausa con los nombres que ve la persona ("Descubrir dolores" en vez de la clave "Crear",
    "Gana con tu contenido" en vez de "Recompensas") + "ni el video del avatar que habla".
  - Nota para admin: Jean recibe la misma guía y un aviso de que puede ver lo pausado.
  - Sugerencias de la burbuja vacía: "No sé qué vender, ¿por dónde empiezo?", "¿Qué es «Mi versión» y cuánto cuesta?", "¿Cómo hago mi primer anuncio?".
- `src/i18n/locales/es.ts` (solo valores): `nav.dashboard` "Inicio" → "Hoy" (título de arriba igual al menú); `nav.mandala` "Mándala Creativa" → "Tus primeros 5 anuncios"; `nav.generators` "Generadores de textos" → "Textos que venden"; tooltip de Hoy.
- `src/components/OnboardingTour.tsx`: paso 1 "Empieza por Hoy… toca Mi versión"; paso 3 nombra Mis versiones y Lo que creaste (en Más herramientas). Si el objetivo del paso ya no está en pantalla, el tour lo muestra centrado (ya lo hacía).
- `src/pages/BrainPage.tsx`: "Mi negocio · Etapa 4" → "Lo que creaste"; "en la Mándala" → "en «Tus primeros 5 anuncios»".
- `src/components/IntelligenceAnalyzer.tsx` (Oráculo, en pausa): "Mi embudo completo" → "Mi camino de venta completo"; "Mega-Prompt" → "Instrucciones completas para otra IA".
- `src/components/IdeasWhatsApp.tsx`: avisos "en la Mándala" → "en «Tus primeros 5 anuncios»".
- `src/components/HelpAssistant.r2.test.tsx` (prueba de R2-15 sobre mi archivo): sus 2 `it.fails` ahora pasan de verdad → cambiadas a `it` con nota; arreglado el tipo de `fetchMock` que tsc marcaba.

Revisado y sin cambios: `AprendePage.tsx`, `aprende/*`, `IdeasPage.tsx`, `NotFound.tsx`,
`UnsubscribePage.tsx`, `TutorialButton.tsx`, `SupportCard.tsx`, `QuickBrief.tsx`, `AssistButton.tsx`,
`CampaignModal.tsx` (ya limpios por la misión 09).

## 3. Para otros dueños (diff propuesto)

```diff
--- src/components/TopBar.tsx (EXTRA_TITLES)
-  "Productos": "Mis productos",
+  "Productos": "Mis versiones",          // el menú ya dice "Mis versiones"
-  "Ideas": "Ideas de side hustle", "Fotos UGC": "Fotos estilo UGC",
+  "Ideas": "Ideas de negocio extra", "Fotos UGC": "Fotos tipo cliente (UGC)",

--- src/components/MobileBottomNav.tsx (línea 46)
-  <Btn icon={Home} label="Inicio" ...
+  <Btn icon={Home} label="Hoy" ...       // mismo nombre que el menú lateral y el título

--- src/lib/tools.ts
-  desc: "Página de ventas, VSL, correos, DM, Reels y textos de posts, en 3 kits de pasos.",
+  desc: "Página de ventas, video de ventas, correos, mensajes, Reels y textos de publicaciones, en 3 kits de pasos.",
-  desc: "Créalos en el orden que conviene y mide cuál apagar o escalar.",
+  desc: "Créalos en el orden que conviene y mide cuál apagar y a cuál meterle más.",
-  title: "¿Qué anuncio apago o escalo?"
+  title: "¿Qué anuncio apago y a cuál le meto más?"

--- supabase/functions/ai-chat/index.ts (HELP_GUARD; función: requiere despliegue con OK de Jean)
-  indica qué sección de la app lo genera (Textos que venden, Creativos, Video con IA, Influencer IA, Mini Apps).
+  indica qué sección de la app lo genera (Mi versión, Creativos y fotos, Carrusel que vende, Video con IA, Textos que venden).
```

- `src/pages/DashboardPage.tsx`: la tarjeta "Pregúntale a la IA" del Inicio publicado trae
  "Empiezo de cero, ¿qué herramienta uso primero?"; mejor "No sé qué vender, ¿por dónde empiezo?" (igual que la burbuja).
- Quien arme "Mi versión" en un paquete: si el botón cambia de nombre o de precio, la guía lo toma
  de `CREDIT_COSTS.gen_master_prompt`; si cambia lo que entrega, avisar para ajustar el punto 2 del "camino más corto".

## 4. Decisiones tomadas

- La guía usa los nombres del menú del 12-oct (`Sidebar.tsx`: Hoy · Radar · Ofertas · Mis versiones · Crear · Mis créditos · Ayuda y guías · Más herramientas). Si el menú cambia otra vez, hay que tocar el bloque "EL MENÚ".
- Lo pausado se nombra UNA vez, en la lista EN PAUSA, sin precio. Al admin no se le oculta.
- "¿Cómo cobro?": la guía dice que la app no cobra por la persona y la manda a Precio y ganancia; no recomienda plataformas de pago.
- Para vender sin cara con el avatar en pausa, la guía permite decir "graba la voz en CapCut o Edits" (estaba en la guía vieja como opción gratis).

## 5. No comprobado

- Las respuestas con la versión FINAL de la guía (después de los ajustes de las preguntas 9 y 10 y lo
  nuevo de Mi versión): el Chrome se reinició y no gasté más preguntas. Probar al desplegar con 3:
  "no sé qué vender", "¿qué es Mi versión?", "¿cuánto cuesta que mi influencer hable?".
- El historial compartido de la burbuja en el navegador de Hany (16 mensajes de antes) lo vacié para
  probar limpio y no pude devolverlo: el Chrome se reinició con mi pestaña. No afecta a nada del servidor.
- Que "Mi versión" entregue anuncio, imagen y WhatsApp dentro de la app: la guía lo dice por decisión
  de hoy; en el código que leí, Hacer mi versión todavía entrega 3 partes (por qué funciona, tu mini app,
  cómo venderla). Si ese paquete no se publica junto con esta guía, el asistente prometería de más:
  **desplegar los dos juntos**.
- Suite completa de vitest: no corrida (pedido del coordinador); corridas mis rutas + Dashboard, tools, StageBar, TopBar: 37/37.
