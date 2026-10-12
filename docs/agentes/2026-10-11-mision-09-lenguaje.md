# Misión 09 · Lenguaje claro en toda la app (11-oct-2026)

Editora de lenguaje claro. Barrido con grep sobre todos los textos visibles de `src/pages` y
`src/components` (JSX, toasts, placeholders, títulos, hints, errores) y sobre los archivos de
`src/lib` que guardan etiquetas que la persona ve (temperatura del Radar, etiquetas de ofertas).
Sin navegador: todo sobre el código. Sin git, sin despliegues, sin tocar precios ni cifras.

---

## 1. Veredicto: de 10 principiantes, ¿cuántos entienden cada pantalla sin ayuda?

| Pantalla | Antes | Después | Qué frenaba |
|---|---|---|---|
| Inicio (Dashboard) | 7 | 7 | Reservada. "UGC con IA" y "su embudo" sin explicar (propuesto abajo). |
| Radar de anuncios | 8 | 9 | Ya estaba bien traducido. Quedaban "Facebook Ad", "dups/día", "HOT / ON FIRE / NUCLEAR / TESTING" y lecturas tipo "escala masiva, el ángulo convierte". |
| Ofertas (lista) | 8 | 9 | "Replicarla" como etiqueta suelta; el resto ya era claro. |
| Oferta · detalle y Mapa del negocio | 5 | 8 | "checkout", "upsell", "downsell", "bump", "tipo de embudo", "Cazador de ROI", "¿La copiarías?". |
| Mini Apps (kits) | 6 | 9 | Pestañas "Guion VSL", "Landing", "Hooks"; "el prompt"; "Dashboard"; "escalando". |
| Mi App (modal 3 partes) | 7 | 9 | "Copia el Prompt 2", "Guion de VSL", "Media Studio", "creativo". |
| Creativos / Carrusel / Miniaturas | 7 | 8 | "Fotos UGC", "Plantilla CTA". Nombres de modelos (Nano Banana Pro) se quedan: son marcas. |
| Video con IA | 7 | 7 | Reservada. "Video UGC", "desde tu creativo", "prompts" (propuesto). |
| Ganchos | 9 | 9 | "Gancho enviado a Media Studio" → nombre del menú real. |
| Contenido (calendario) | 7 | 9 | "tracker", "leads", "check". |
| Validar | 9 | 9 | Ya claro. |
| Precio y ganancia | 8 | 9 | "ROAS mínimo" sin explicar; porcentajes sin espacio; "2.5" en vez de "2,5". |
| Order bump | 8 | 8 | El título es la herramienta (clave de navegación, no se toca) y la pantalla lo explica en la primera línea. |
| Diagnóstico | 8 | 9 | "tu embudo", "Usar mi tracker". |
| Mis créditos / vitrina | 7 | 7 | Reservada. "PACK NUCLEAR", "Mega-Prompt" (propuesto). PlanFeatures ya explica Whop. |
| Errores (ErrorBoundary, 404, suspensión) | 8 | 10 | El 404 estaba en inglés. |
| Registro | 9 | 10 | "Email" / "Email inválido". |
| Ideas | 7 | 9 | "side hustle". |
| Influencer IA | 8 | 9 | "clona una" (prohibido en lo visible). |
| Aprende / Productos / Proyectos / Mi ficha | 9 | 9 | Proyectos: "Guion de VSL", "Mega-Prompt… embudo", "(blueprint)". |

Promedio estimado: antes 7,5 → después 8,7 de 10. Lo que falta está en archivos reservados.

## 2. La app en una línea

**SUPERNOVA te muestra anuncios que llevan meses vendiendo y te ayuda a hacer tu propia versión,
cobrada en tu moneda, esta semana.**

## 3. Términos problemáticos → dónde → reemplazo

| Término | Dónde (archivo:línea, antes del cambio) | Reemplazo |
|---|---|---|
| Facebook Ad | WinningAdsPage.tsx:436, 549, 707 | Anuncio de Facebook |
| dups/día | TemperatureBlock.tsx:55 | copias por día (y número con coma) |
| TESTING / HOT / ON FIRE / ☢️ NUCLEAR | lib/temperature-system.ts:55, 71, 79, 87, 139-143 | EN PRUEBA / CALIENTE / EN LLAMAS / ☢️ AL ROJO VIVO |
| "Escala masiva. El ángulo está siendo validado por el mercado." | temperature-system.ts:82 | "Le meten mucho dinero: el mercado ya confirmó que esta idea vende." |
| "Entra con diferenciación. El ángulo funciona." | temperature-system.ts:83 | "La idea funciona: haz tu versión con algo propio." |
| "Ponlo en watchlist" | temperature-system.ts:58 | "Guárdalo con la estrella" |
| "⚡ MÁXIMA OPORTUNIDAD — Cualquiera que entre con este ángulo convierte." (promesa) | temperature-system.ts:122 | "⚡ Oportunidad alta: muchos ya venden con esta idea. Haz tu versión." |
| MULTI-CUENTA / MULTI-VENDEDOR / "winner personal" / "Evergreen" / "El peak ya pasó" | temperature-system.ts:98-133 | VARIAS PÁGINAS / VARIOS VENDEDORES / "anuncio ganador" / "Sigue vigente" / "Lo mejor ya pasó" |
| HOT / MUY HOT / NUCLEAR; "escalaron" | RisingTemperatureWidget.tsx:17, 55 | CALIENTE / MUY CALIENTE / AL ROJO VIVO; "más crecieron" |
| Buscar Winner Ahora | FloatingWinnerButton.tsx:16-17, 33 | Buscar anuncios ganadores |
| su checkout | LockedToolPage.tsx:109; BusinessMap.tsx:118, 121, 157, 178-181; OfferDetailSheet.tsx:285, 304 | su página de pago; "Página de pago (checkout)" la primera vez en la ficha |
| Upsell / Downsell / Bump / Order bump (etiquetas sueltas) | BusinessMap.tsx:157, 269-273, 302-303, 329 | "Oferta extra después de pagar (upsell)", "Opción más barata si dice no (downsell)", "Casilla extra (order bump)" |
| Tipo de embudo | OfferDetailSheet.tsx:303 | Camino de venta (embudo) |
| Nicho | OfferDetailSheet.tsx:299 | Tema (nicho) |
| Seguir en el Cazador de ROI | OfferDetailSheet.tsx:207 | Seguir esta oferta: te avisamos si crece o se apaga |
| ¿La copiarías? / Qué copiar | OfferDetailSheet.tsx:322-323, 441 | ¿La modelarías? / Qué tomar tal cual |
| Replicarla | OfferCard.tsx:86 | Hacer tu versión |
| Guion VSL / Landing / Hooks (pestañas) | KitsPage.tsx:66-67 | Guion de video de ventas / Página de ventas / Ganchos |
| "el prompt para construir la app… landing" | KitsPage.tsx:165 | "las instrucciones para construir la app con IA (el prompt)… página de ventas" |
| Dashboard | KitsPage.tsx:193 | Inicio |
| "Apps que están escalando ahora" | KitsPage.tsx:23, 208 | "Apps que están creciendo ahora" |
| Copia el Prompt 2 | MiniAppModal.tsx:299 | Copia las instrucciones (el prompt) |
| Guion de VSL | MiniAppModal.tsx:205; BrainPage.tsx:172 | Guion de video de ventas |
| Media Studio (en texto) | MiniAppModal.tsx:238, 456; HooksPage.tsx:114 | Video con presentador (nombre real del menú) |
| Creativo · / Creativo de anuncio | MiniAppModal.tsx:261, 482; BrainPage.tsx:203 | Imagen de anuncio |
| Mega-Prompt… y su embudo / (blueprint) | BrainPage.tsx:176-177; IntelligenceAnalyzer.tsx:405, 409 | Instrucciones completas (prompt)… y su camino de venta |
| Embudo de ventas (categoría) | GeneradoresPage.tsx:22 | Camino de venta (embudo) |
| Cada paso de tu embudo / Usar mi tracker | DiagnosticoPage.tsx:224, 137 | Cada paso de tu camino de venta (tu embudo) / Usar mis números de Contenido |
| Los leads… el check | ContentPage.tsx:544 | Las personas que te escriben… está marcada |
| tracker (botón, toasts) | AddToTracker.tsx:23, 34; ResultsCheckIn.tsx:77, 80; PublishBonus.tsx:44 | calendario (de Contenido) |
| post | PublishBonus.tsx:123, 127, 138; RecompensasPage.tsx:46 | publicación |
| Link de YouTube | YouTubeCreatorPage.tsx:383 | Enlace de YouTube |
| "qué apagar o escalar" | LaunchPlanPage.tsx:129 | "qué apagar y a cuál meterle más" |
| Ideas de side hustle | IdeasPage.tsx:100 | Ideas de negocio extra |
| "Elige y clona una" | PersonajePage.tsx:161 | "Elige y modela una" |
| "tu influencer IA o el copy" | OnboardingTour.tsx:23 | "tu presentador hecho con IA o los textos de venta" |
| CTA / Plantilla CTA | CarouselStudio.tsx:940, 959 | Cierre (CTA, la lámina que pide actuar) |
| Fotos UGC | ImageStudioPage.tsx:49 | Fotos tipo cliente (UGC) |
| ROAS mínimo; "3% y 10%"; "{n}%"; toFixed(1) | PricingPage.tsx:222, 181, 195 | "(eso se llama ROAS: retorno de lo que inviertes en anuncios)"; "3 % y 10 %"; "{n} %"; coma decimal |
| Oops! Page not found / Return to Home | NotFound.tsx:15, 17 | Esta página no existe / Volver al inicio |
| Email / Email inválido | SignupPage.tsx:220, 114 | Correo / "Ese correo no parece válido. Revísalo." |
| Awareness / Leads / Engagement / App Installs | CampaignModal.tsx:128-132 (componente sin usar) | Que te conozcan / Contactos (leads) / Interacción / Instalaciones de app |

Revisado y dejado tal cual (con motivo): "Order bump" como nombre de pantalla (clave de navegación; la
pantalla lo explica en su primera frase); "Mini App", "Mándala", "Oráculo" (nombres de producto);
"Nano Banana Pro", "Whop", "Hotmart", "Kiwify" (marcas); "Ticket (precio del producto)" y
"Puntaje de 0 a 100" (ya llevan explicación); "ACTUALIZADO HACE N MIN" (etiqueta pequeña de estado,
no grito); "Presets" y "Probar Edge Function" (solo panel de admin de Jean).

## 4. Cambios HECHOS (34 archivos, solo texto visible; ids, keys y claves intactos)

- `src/pages/WinningAdsPage.tsx`, `src/components/TemperatureBlock.tsx`,
  `src/lib/temperature-system.ts`, `src/components/RisingTemperatureWidget.tsx`,
  `src/components/FloatingWinnerButton.tsx` (Radar).
- `src/components/offers/OfferDetailSheet.tsx`, `OfferCard.tsx`, `BusinessMap.tsx`,
  `src/components/LockedToolPage.tsx` (Ofertas y vitrina con candado).
- `src/pages/KitsPage.tsx`, `src/components/MiniAppModal.tsx`, `src/pages/BrainPage.tsx` (Mini Apps / Proyectos).
- `src/components/image/CarouselStudio.tsx`, `src/pages/ImageStudioPage.tsx`, `src/components/OnboardingTour.tsx`.
- `src/pages/PricingPage.tsx`, `src/pages/DiagnosticoPage.tsx` (+ su prueba `DiagnosticoPage.test.tsx`,
  ajustada al texto nuevo), `src/pages/LaunchPlanPage.tsx`, `src/pages/GeneradoresPage.tsx`,
  `src/components/IntelligenceAnalyzer.tsx`.
- `src/pages/ContentPage.tsx`, `src/pages/HooksPage.tsx`, `src/components/AddToTracker.tsx`,
  `src/components/dashboard/ResultsCheckIn.tsx`, `src/components/PublishBonus.tsx`,
  `src/pages/RecompensasPage.tsx`, `src/pages/YouTubeCreatorPage.tsx`.
- `src/pages/IdeasPage.tsx`, `src/pages/PersonajePage.tsx`, `src/pages/NotFound.tsx`,
  `src/pages/SignupPage.tsx`, `src/components/CampaignModal.tsx`.

Verificación: `npx vitest run` → 48 archivos, 332 pruebas en verde. `npx tsc --noEmit` filtrado por
estos archivos solo muestra errores **previos** (en `WinningAdsPage.tsx:425-449` por un
`(r: unknown)` explícito y en `CampaignModal.tsx:36,72`); ninguno nace de un cambio de texto.

## 5. Cambios PROPUESTOS en archivos de otros agentes (diff)

```diff
--- src/lib/tools.ts
-  T({ id: "ideas", ... title: "Ideas de side hustle", nav: "Ideas de side hustle",
+  T({ id: "ideas", ... title: "Ideas de negocio extra", nav: "Ideas de negocio extra",
-  T({ id: "fotosugc", key: "Fotos UGC", ... title: "Fotos estilo UGC", nav: "Fotos estilo UGC",
+  T({ id: "fotosugc", key: "Fotos UGC", ... title: "Fotos tipo cliente (UGC)", nav: "Fotos tipo cliente",
-  T({ id: "copy", key: "Generadores", ... title: "Robot de copy", nav: "Robot de copy",
+  T({ id: "copy", key: "Generadores", ... title: "Robot de textos de venta", nav: "Robot de textos",
-    desc: "Página de ventas, VSL, correos, DM, Reels y textos de posts, en 3 kits de pasos.",
+    desc: "Página de ventas, video de ventas, correos, mensajes, Reels y textos de publicaciones, en 3 kits de pasos.",
-    desc: "Negocios digitales que ya venden, con su precio y su embudo.",
+    desc: "Negocios digitales que ya venden, con su precio y su camino de venta.",
-    desc: "Créalos en el orden que conviene y mide cuál apagar o escalar.",
+    desc: "Créalos en el orden que conviene y mide cuál apagar y a cuál meterle más.",

--- src/components/TopBar.tsx (línea 23)
-  "Ideas": "Ideas de side hustle", "Fotos UGC": "Fotos estilo UGC",
+  "Ideas": "Ideas de negocio extra", "Fotos UGC": "Fotos tipo cliente (UGC)",

--- src/pages/DashboardPage.tsx (línea 434)
-  Negocios digitales que llevan semanas pagando anuncios, con su precio y su embudo. Mirar es gratis.
+  Negocios digitales que llevan semanas pagando anuncios, con su precio y su camino de venta. Mirar es gratis.

--- src/components/journey/GemeloFlow.tsx
-  Buena elección. Ahora la clonamos, gratis.          (línea 258; "clonar" está prohibido en lo visible)
+  Buena elección. Ahora la modelamos, gratis.
-  El mismo embudo                                      (línea 322)
+  El mismo camino de venta

--- src/components/journey/BusinessJourney.tsx
-  Anota tus números y te decimos qué apagar y qué escalar.      (135)
+  Anota tus números y te decimos qué apagar y a cuál meterle más.
-  Completaste las 6 etapas. Ahora escala el anuncio que gana y repite con variaciones.   (213)
+  Completaste las 6 etapas. Ahora invierte más en el anuncio que gana y repite con variaciones.

--- src/components/journey/StageBar.tsx (26)
-  Completaste las 6 etapas. Escala lo que gana.
+  Completaste las 6 etapas. Invierte más en lo que gana.

--- src/pages/CreditsPage.tsx
-  name: "PACK NUCLEAR"                                  (línea 15; decisión de nombre: Jean)
+  name: "PACK MÁXIMO"
-  Para crear todas las semanas: videos, creativos y tu producto     (21)
+  Para crear todas las semanas: videos, imágenes de anuncio y tu producto
-  Mega-Prompt para replicar un negocio                  (51)
+  Instrucciones completas para modelar un negocio

--- src/pages/VideoStudioPage.tsx
-  Video UGC / Crear video UGC                           (262, 451)
+  Video tipo cliente (UGC) / Crear video tipo cliente
-  El anuncio arranca desde tu creativo.                 (409)
+  El anuncio arranca desde tu imagen de anuncio.

--- src/components/video/MotionStudio.tsx (374, 506, 599)
-  Copiar prompt / Prompts de 10 segundos (opcional) / Video, voz, subtítulos, prompts y plan
+  Copiar instrucciones (prompt) / Instrucciones de 10 segundos para otra IA (opcional) / Video, voz, subtítulos, instrucciones y plan

--- src/pages/MandalaPage.tsx
-  Visitaron la página, iniciaron el pago o vieron la VSL y no compraron (7-30 días).   (84)
+  Visitaron la página, iniciaron el pago o vieron el video de ventas y no compraron (7 a 30 días).
-  Escala el que gana                                    (728)
+  Invierte más en el que gana
   (la línea 722 ya explica CTR bien: dejar)

--- src/pages/IdeasPage.tsx ya dice "Ideas de negocio extra": el título del menú (tools.ts) y TopBar
    deben decir lo mismo para que no haya dos nombres.
```

Contradicción detectada entre pantallas (para quien tenga `journey.ts`/`tools.ts`): la etiqueta
superior mezcla dos sistemas: "Mi negocio · Etapa 1 · Elegir" (Radar, Ofertas, Mini Apps),
"Mi negocio · Etapa 2/3/5/6" (Validar, Precio, Contenido, Diagnóstico), "Mi negocio · Sube lo que
deja cada venta" (Order bump) y "Encontrar" (Ideas). Propuesta: una sola forma, "Encontrar · Etapa 1"
/ "Vender · Etapa 5", alineada con la navegación por intención del 03-oct.

## 6. Lo que no pude comprobar

- Nada se abrió en el navegador ni en producción: los cambios están solo en local (sin commit).
- Los textos que genera la IA en el servidor (veredictos, kits, guiones, informes del Oráculo) no
  pasaron por este barrido: viven en las edge functions y en sus prompts.
- `HelpAssistant.tsx` (reservado) sigue diciendo "Media Studio", "UGC con IA" y "clonar" en varias
  líneas internas del SYSTEM_PROMPT; conviene revisarlo con el mismo glosario.
- Los paneles de admin (`src/pages/admin/*`) quedaron fuera a propósito: solo los ve Jean.
- `CampaignModal.tsx` no se usa en ninguna pantalla; se corrigió igual por si vuelve.

## 7. Palabras que la app ya no usa (glosario para mantener)

| No se usa | Se usa |
|---|---|
| clonar, clon | modelar, hacer tu versión |
| checkout | página de pago (checkout) la primera vez |
| funnel, embudo solo | camino de venta (embudo) |
| upsell / downsell / bump sueltos | oferta extra después de pagar (upsell) / opción más barata si dice no (downsell) / casilla extra (order bump) |
| leads | personas que te escribieron, contactos |
| tracker | calendario de Contenido |
| post | publicación |
| link | enlace |
| email | correo |
| prompt solo | instrucciones (prompt) |
| Mega-Prompt | instrucciones completas |
| copy, creativo | textos de venta, imagen de anuncio |
| VSL solo | video de ventas (VSL) |
| CTA solo | cierre / llamada a la acción (CTA) |
| UGC solo | tipo cliente (UGC) |
| hook | gancho |
| landing | página de ventas |
| dashboard | Inicio |
| Media Studio (en texto) | Video con presentador |
| Winner, HOT, ON FIRE, NUCLEAR, TESTING | ganador, CALIENTE, EN LLAMAS, AL ROJO VIVO, EN PRUEBA |
| dups | copias (del anuncio) |
| escalar, escalando | crecer, meterle más dinero, invertir más |
| ángulo | idea, enfoque, cómo lo vende |
| side hustle | negocio extra |
| ROAS, CTR, CPA solos | siempre con su explicación en la misma frase |
| vídeo, móvil, ordenador, vosotros | video, celular, computadora, ustedes |
| 3% / 2.5 | 3 % / 2,5 |
| "cualquiera que entre convierte", "gana X en N días" | nunca: ninguna promesa de resultados |
