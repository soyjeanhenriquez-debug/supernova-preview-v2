# Misión 07 — Velocidad y fiabilidad (11-oct-2026)

Ingeniera de rendimiento. Medido con el navegador integrado (landing y login), el build local
(`npx vite build`), la base (EXPLAIN y catálogos, sin ANALYZE ni conteos) y los logs de Supabase de
las últimas 24 h (10-oct 16:00 → 11-oct 16:30 UTC).

---

## 1. Veredicto

**De 10 personas, 2 se irían por lentitud o errores.** Ninguna por la landing ni por el login
(los dos abren en menos de medio segundo). Las 2 que se van son las que tocan lo que hoy falla
o tarda sin aviso:

- Quien genera **imágenes para anuncios**: espera **47 s de promedio y hasta 101 s**
  (`generate-ad-creative`, 25 llamadas en 24 h), y a veces termina en "tiempo agotado".
  Un minuto mirando un spinner sin saber si va o no va es el momento exacto en que la gente
  cierra la pestaña.
- Quien abre el **Radar** y ve tarjetas **sin imagen durante ~10 s** (`meta-ad-proxy`: 47
  llamadas, 9,8 s de promedio, máximo 19,9 s). La tarjeta aparece, la foto no.
- Quien paga 40–50 créditos por **Motion graphics / Ideas de contenido / Mes de contenido** y
  recibe un **502/500** porque la IA devolvió un JSON roto (5 fallos en 24 h sobre ~12
  llamadas: casi la mitad). Se devuelven los créditos, pero la confianza no vuelve igual.

Las otras 8 ven una app rápida: la primera carga del Inicio con sesión guardada viaja
~205 KB comprimidos de librerías + 52 KB de pantalla, y el arranque hace 2 "pisos" de
consultas en paralelo antes de pintar (ver 3.3).

**Riesgo de fondo (no se ve, pero empuja todo lo demás):** la base está en plan Free y cada
10 minutos corre `score_unscored_ads` durante **17–69 s** (40 ejecuciones medidas en 24 h,
mediana ~31 s). Es decir, entre el 3 % y el 12 % del tiempo la instancia está ocupada en eso;
quien busque en el Radar justo ahí lo nota.

## 2. Qué hace la app, en una línea

**SUPERNOVA te muestra negocios digitales que ya llevan meses pagando anuncios y te ayuda a
hacer tu propia versión en español, paso a paso, esta semana.**

---

## 3. Top 5 fallos (con pasos y medición)

### F1 · `score_unscored_ads` falla cada hora con 500 y ocupa la base cada 10 min — ALTA
- **Pasos:** cron `master-rotate` a las :00 → llama `rpc("score_unscored_ads")` por PostgREST
  → PostgREST corre como `authenticator` (`statement_timeout = 8s`) → la función tarda 17–69 s →
  **500 "canceling statement due to statement timeout"**.
- **Medición:** 24 × `POST 500 /rest/v1/rpc/score_unscored_ads` (una por hora, 17:00 → 16:00),
  24 × `function_logs` nivel error "score_unscored_ads: canceling statement due to statement
  timeout" desde `master-rotate`. En paralelo, `pg_cron` la ejecuta cada 10 min con
  `SET statement_timeout='240s'` y dura 16,9 s … 69,2 s (40 ejecuciones en 24 h).
- **Causa probable:** la llamada horaria desde la edge function es redundante (el cron de
  `pg_cron` ya la corre) y siempre muere a los 8 s; las 40 corridas largas compiten con los
  usuarios por una instancia chica (2 CPUs compartidas).
- **No lo toqué:** es el pipeline de producción (manual, sección 2). Propuesta en 5 (P2, P3).

### F2 · Imágenes del Radar tardan ~10 s en aparecer — ALTA
- **Pasos:** abrir Radar → cada tarjeta pide `meta-ad-proxy?id=…` → si no está en
  `ad_media_cache`, hace scrape con Firecrawl.
- **Medición:** 47 llamadas, promedio **9,8 s**, máximo **19,9 s**; 2 errores
  `CONCURRENCY_QUEUE_TIMEOUT` de Firecrawl.
- **Causa probable:** el plan de Firecrawl tiene cola de concurrencia; cada anuncio nuevo paga
  un scrape completo en el momento en que la persona lo mira.
- Propuesta en 5 (P4): calentar la caché desde el cron para la primera página del Radar.

### F3 · Generadores de imagen/kit tardan 45–100 s sin aviso de tiempo — ALTA
- **Medición (24 h):** `generate-ad-creative` 25 ok, promedio **47,0 s**, máx **101,4 s**;
  `generate-kit` 9 ok, promedio **43,2 s**, máx 50,8 s; `yt-produce` 16 ok, promedio 18,6 s,
  máx 85 s + **1 × 502 a los 92,8 s**; errores "apimart: tiempo agotado" ×3.
- **Causa probable:** el proveedor (APIMart) tarda y la edge function espera en serie; no hay
  cola ni aviso de "esto tarda ~1 min".
- Propuesta: generar en segundo plano con estado en tabla (como ya hace `video_jobs`) y avisar
  el tiempo esperado antes de cobrar. Fuera de mis archivos.

### F4 · JSON roto de la IA → 502/500 en herramientas que cuestan 40–50 créditos — MEDIA
- **Medición:** `motion-graphics` 2 × 502 ("JSON inválido (2847 caracteres, fin=stop)",
  "SyntaxError"), `content-ideas` 1 × 502 ("SyntaxError"), `content-month` 3 × 500.
  Sobre ~12 llamadas en total: cerca de la mitad falló.
- **Causa probable:** el modelo devuelve texto alrededor del JSON o lo corta; el parser hace
  `JSON.parse` directo.
- Propuesta: extraer el primer bloque `{…}` balanceado, y si falla reintentar una vez pidiendo
  "solo JSON" antes de devolver 502. Fuera de mis archivos.

### F5 · Fallo de red al abrir mandaba a un cliente que paga a la vitrina con candados — MEDIA (ARREGLADO)
- **Pasos:** abrir la app con la red inestable → `has_access` devuelve error (sin dato) →
  `useAccessStatus` lo trataba como `pending` → la persona veía "Activa tu plan".
- **Medición:** no hay registro en logs (es un fallo del lado del cliente), lo detecté leyendo
  `src/hooks/useAccessStatus.ts`: `const { data: approved } = await supabase.rpc("has_access")`
  sin mirar `error`.
- **Hecho:** reintento 3 veces (1 s, 2 s, 4 s) solo cuando hay error; `false` real sigue
  siendo `pending`.

### Lo que se midió y está bien
- **Landing `/`:** TTFB 85 ms, DOMContentLoaded 215–617 ms, load 377 ms–1,2 s (dos
  mediciones), 295 KB comprimidos en un solo HTML (547 KB sin comprimir), **0 imágenes
  `<img>`** (26 SVG en línea, sin `data:image`), 3 llamadas a Supabase (`landing_track`,
  `founder_spots`, `landing_teasers`, ~80–100 ms cada una). FCP medido 1,4 s con la pestaña en
  segundo plano (el panel del navegador estaba oculto: ese número no es fiable).
- **Login `/app`:** TTFB 60 ms, DOMContentLoaded 233 ms, pantalla de login visible a ~380 ms;
  24 recursos, **309 KB** en total, de los cuales **210 KB son `/supernova-icon.png`**
  (el logo; ver P5).
- **Radar sin palabra clave (consulta más usada, LIMIT 24):**
  `Index Scan using idx_winning_ads_score_nl … Filter: delivery_start_time IS NOT NULL`,
  costo 0,29..3,73 → lee 24 filas por índice. Con filtro de mercado (7 países): mismo índice,
  costo 7,4. `count: "estimated"` → sin recorrido.
- **Radar con palabra (`radar_search('curso')`, tras la migración de hoy 04:46 UTC):**
  `Bitmap Index Scan on idx_winning_ads_search_tsv` (703 filas estimadas) + `Index Scan
  winning_ads_pkey`, costo 2.612. Antes de la migración hubo **5 × 500** (03:38–03:40 UTC);
  después, cero.
- **Ofertas (LIMIT 12 + count exact):** `Seq Scan on offers` (14.000 filas, 37 MB) + Sort,
  costo ~4.200; el conteo exacto repite el Seq Scan (costo ~4.030). Son milisegundos a este
  tamaño; vigilar si `offers` pasa de ~100.000 filas.
- `winning_ads`: 145.321 filas estimadas, 272 MB + `winning_ads_search` 144 MB. Índice
  `winning_ads_keyword_ad_url_uk` 17 MB (el más grande).
- **"Warp server error: Thread killed by timeout manager"** 755 veces: PostgREST cerrando
  conexiones ociosas; se concentra en las horas de pruebas (05–06 h y 15–16 h UTC: 212, 231,
  98, 119). No es un error para la persona.
- `stripe-portal` 17 × 503: Stripe está apagado a propósito; algo en la interfaz sigue
  llamándolo (P8).

### 3.3 Cadena de arranque con sesión guardada (lo que pasa antes de ver el Inicio)
1. `app.html` (1 KB) → `index` 84 KB gz + `react` 51 + `supabase` 59 + `query` 11,5 (preload).
2. `main.tsx` ve el token en `localStorage` → baja `Index` (29 KB gz) y `DashboardPage`
   (23 KB gz) **en paralelo** con la sesión.
3. `AuthProvider.getSession()` (local, sin red).
4. **Piso 1 (paralelo):** `has_access`, `user_roles`, `system_config`, `is_suspended`,
   `active_sessions` (upsert) + `products`, `business_profile`, `product_limit`.
5. **Piso 2 (paralelo, al tener producto activo):** Journey (`products`, `mandala_ads`,
   `product_builds`) + Inicio (`product_assets`, `mandala_ads`, `product_builds`, storage
   `creativos`, `video_jobs`) + créditos (`user_credits` + `credit_transactions` ×200) +
   `winning_ads.scraped_at` + `user_age_country`.
Antes de hoy los créditos tenían un piso extra (`grant_monthly_if_due` → luego saldo); ya va en
paralelo (ver 4).

### 3.4 Peso del build (`npx vite build`, 185 archivos, 4,0 MB en `dist/assets`)
| Chunk | KB | gz | Cuándo se baja |
|---|---:|---:|---|
| AdminOverview | 395 | 109 | solo admin (`/admin`) |
| module (posthog-js) | 332 | 109 | diferido (`import()` en analytics.ts) |
| index (entrada: sonner, radix, i18n, Auth, RequireAccess) | 252 | 84 | **primera carga** |
| supabase | 227 | 59 | **primera carga** |
| ImageStudioPage | 178 | 55 | al abrir Creativos/Carrusel |
| react (+router) | 156 | 51 | **primera carga** |
| motion (framer-motion) | 129 | 42 | landing/registro React (no en prod con sesión) |
| index (react-markdown, ayuda) | 119 | 37 | diferido (HelpAssistant) |
| WinningAdsPage | 113 | 35 | al abrir Radar |
| VideoStudioPage | 95 | 32 | al abrir Video |
| Index (cascarón: menú, barra, buscador cmdk) | 91 | 29 | con sesión |
| DashboardPage | 80 | 23 | Inicio |

Dependencias pesadas en la primera carga: `sonner` (toasts, ~30 KB raw) y los `radix`
(dialog/tooltip/toast) van en la entrada porque `Toaster`, `Sonner` y `TooltipProvider` se
montan en `App.tsx`; `i18next` con 3 idiomas en línea (5,7 KB fuente; en/pt nadie los ve).
Nada de esto es grande por sí solo; lo que sí pesa es el **PNG del logo (214 KB)** y las
**11 variantes de Google Fonts** (CSS bloqueante). Lucide va en ~100 chunks de 1 KB (uno por
icono compartido): correcto para la primera carga, aunque hace muchos requests pequeños.

---

## 4. Cambios HECHOS (solo en mis archivos; sin cambiar lo que ve la persona)

1. **`src/hooks/useCredits.ts`** — `grant_monthly_if_due` ya no va *antes* de leer el saldo:
   corre a la vez que `user_credits` + `credit_transactions`, y solo si de verdad renovó se
   vuelve a leer. Un viaje menos al servidor (≈100–200 ms desde LATAM) antes de que la ruedita
   muestre el saldo. El saldo mostrado sigue incluyendo la renovación.
2. **`src/hooks/useAccessStatus.ts`** — si `has_access` devuelve **error** (red, base
   reiniciándose), reintenta hasta 3 veces (1 s, 2 s, 4 s) antes de decidir. Antes, un corte de
   un segundo al abrir mandaba a un cliente que paga a la vitrina con candados. Un `false` real
   sigue siendo `pending` sin reintentos.
3. **`src/App.tsx`** — al tener usuario (recién hace login o entra con código), se descargan
   `Index` y `DashboardPage` **mientras** el muro de acceso hace sus 4 consultas. `main.tsx` ya
   lo hacía para quien vuelve con sesión guardada; faltaba el caso de quien acaba de entrar
   (veía spinner → hueco negro mientras bajaba el chunk → otro spinner).

4. **`src/hooks/useAdHistory.ts` y `src/hooks/useGamification.ts`** — solo tipos (17 errores
   de `tsc` preexistentes por `unknown` sin anotar; cero cambio de comportamiento). Nota:
   `useGamification` no lo importa nadie (código muerto, ver P9).

Verificación local: `npx tsc --noEmit -p tsconfig.app.json` sin errores en mis archivos,
`npx vitest run` en verde, `npx vite build` OK (ver sección 7 para el detalle).

No toqué `vite.config.ts` ni `src/pages/Index.tsx`: revisé las opciones (chunk único de
iconos, lazy del buscador, lazy de LockedToolPage) y ninguna mejora la primera carga sin
empeorar otra cosa (el chunk "LockedToolPage" es en realidad el chunk compartido de la UI que
importan 40 pantallas; el buscador registra Cmd+K al montarse).

---

## 5. Cambios PROPUESTOS (con prioridad y diff)

### P1 · ALTA — Journey no debe recargar 3 consultas en cada cambio de pantalla
`JourneyContext` recarga `products` + `mandala_ads` + `product_builds` al montar, en cada
cambio de página y en cada `JOURNEY_EVENT`. Son las consultas **más frecuentes de toda la
base**: 1.068 + 1.066 + 1.043 en 24 h, contra 460 aperturas de app (2,3 recargas por apertura).
```diff
--- a/src/contexts/JourneyContext.tsx
+++ b/src/contexts/JourneyContext.tsx
@@
-  // Cambio de pantalla o aviso de otra pantalla: recalcular, agrupando avisos seguidos.
+  // Aviso de otra pantalla: recalcular, agrupando avisos seguidos. Al cambiar de pantalla solo
+  // se recarga si la última lectura tiene más de 60 s (antes: 3 consultas en cada clic del menú).
   const timer = useRef<ReturnType<typeof setTimeout>>();
+  const loadedAt = useRef(0);
   const soon = useCallback(() => { clearTimeout(timer.current); timer.current = setTimeout(load, 400); }, [load]);
-  useEffect(() => { soon(); }, [page, soon]);
+  useEffect(() => { if (Date.now() - loadedAt.current > 60_000) soon(); }, [page, soon]);
```
y en `load`, tras `setState({ loaded: true, … })`: `loadedAt.current = Date.now();`.
Las pantallas que cambian una etapa ya avisan con `JOURNEY_EVENT`, así que la tarjeta "Tu
camino" se sigue actualizando al instante.

### P2 · ALTA (pipeline: OK de Jean) — Quitar la llamada horaria a `score_unscored_ads` desde `master-rotate`
Siempre muere a los 8 s con 500; `pg_cron` ya la corre cada 10 min con 240 s.
```diff
--- a/supabase/functions/master-rotate/index.ts
+++ b/supabase/functions/master-rotate/index.ts
@@
-    const { error: scoreErr } = await admin.rpc("score_unscored_ads");
-    if (scoreErr) console.error("score_unscored_ads:", scoreErr.message);
+    // score_unscored_ads la corre pg_cron cada 10 min con 240 s de margen. Por PostgREST
+    // (8 s) siempre moría con 500 (24 veces al día, 11-oct-2026).
```

### P3 · ALTA (pipeline: OK de Jean) — Aliviar `score_unscored_ads` en la instancia Free
40 corridas de 17–69 s al día. Opciones, de menos a más: (a) cada 20 min en vez de 10;
(b) lotes más chicos por corrida (`20260923130000_score_ads_batched.sql` ya la hizo por lotes:
bajar el tamaño del lote a la mitad); (c) plan Pro de Supabase (lo que el manual indica cuando
los ahorros no alcanzan). No es borrar nada del catálogo: solo repartir el mismo trabajo.

### P4 · MEDIA — Calentar `ad_media_cache` para la primera página del Radar
En el cron de `radar_stats_cache` (cada 10 min) o en `bulk-seed-ads`: tomar los 24 anuncios con
mejor `winner_score` (y los 24 con más días) que no estén en `ad_media_cache` y resolverlos con
el proxy, 2–3 por minuto. Así la persona que abre el Radar ve fotos al instante en la primera
página, y el scrape de 10 s lo paga el servidor, no ella. Además en `meta-ad-proxy` bajar
`waitFor` y tratar `CONCURRENCY_QUEUE_TIMEOUT` como fallo corto (TTL 1 h, no 6 h).

### P5 · MEDIA — El logo pesa 214 KB (2/3 del login)
`public/supernova-icon.png` 214 KB se baja en el login, en la barra y como favicon. Convertir a
WebP (≈10–15 KB) o SVG y dejar un `favicon` de 32×32. Afecta a `index.html`, `AuthPage`,
`Sidebar`/`TopBar` (donde se use). Cero cambio visual.

### P6 · MEDIA — Hueco negro mientras baja un chunk (App.tsx)
Hoy el `Suspense` de `App.tsx` pinta un `div` negro mientras baja `Index` o `AuthPage`. Con el
cambio 3 el hueco casi desaparece para quien entra, pero en redes lentas sigue. Mismo spinner
que ya usa el "Cargando…" de la sesión:
```diff
--- a/src/App.tsx
+++ b/src/App.tsx
@@
-const BLANK = <div className="min-h-screen bg-background" />;
+function Booting() {
+  return (
+    <div className="min-h-screen bg-background flex items-center justify-center">
+      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
+    </div>
+  );
+}
@@
-        <Suspense fallback={<div className="min-h-screen bg-background" />}>
+        <Suspense fallback={<Booting />}>
```
(en las dos apariciones). Es un cambio visible (un spinner donde había negro): lo decide Jean.

### P7 · BAJA — Fuentes e idiomas
- `index.html` carga Sora ×6 pesos + Manrope ×5 pesos con CSS bloqueante. La app usa
  400/500/600/700 de cada una: pedir solo esos (o autoalojar las 2 fuentes en `/public/fonts`
  con `font-display: swap`) ahorra 1 request bloqueante + ~40 KB de woff2.
- `src/i18n/index.ts`: cargar `en` y `pt` con `import()` solo cuando un admin cambie de idioma
  (`MULTI_LANGUAGE_FOR_CLIENTS = false`).

### P8 · BAJA — No llamar a `stripe-portal` con Stripe apagado
17 × 503 en 24 h. Donde esté el botón "Gestionar suscripción"/"Portal": ocultarlo o mandar al
portal de Whop cuando `STRIPE_ENABLED` es `false`.

### P9 · BAJA — `auth.getUser()` es un viaje de red; `getSession()` es local
`useMediaCredits.ts:18` y `useActivitySeries.ts:13` (admin/Media Studio) hacen
`supabase.auth.getUser()` (llamada a `/auth/v1/user`) para sacar el `id`; con
`getSession()` sale de memoria. `useGamification.ts` lo hace dos veces por carga, pero
**nadie lo importa** (código muerto): se puede borrar.
```diff
-    const { data: auth } = await supabase.auth.getUser();
-    if (!auth.user) { …; return; }
-    …eq("user_id", auth.user.id)
+    const { data: { session } } = await supabase.auth.getSession();
+    const uid = session?.user?.id;
+    if (!uid) { …; return; }
+    …eq("user_id", uid)
```

### P10 · MEDIA — Parser tolerante en las funciones que piden JSON a la IA
`motion-graphics`, `content-ideas`, `content-month`: antes de `JSON.parse`, recortar al primer
`{` y al último `}` balanceado; si falla, un reintento pidiendo "solo JSON, sin texto". Devolver
502 solo tras el reintento, y asegurar que `refund_charge` corre en ambos fallos.

---

## 6. Lo que NO pude comprobar

- **Pantallas con sesión** en el navegador (Inicio, Radar, Ofertas): mi navegador no tiene
  sesión y no debo crear cuentas. La cadena de arranque (3.3) sale del código y de los conteos
  de peticiones en `edge_logs`, no de un cronómetro real.
- **Latencia real desde LATAM** (RD, Colombia, México) a la región de Supabase: mis tiempos
  son desde esta máquina (TTFB 60–85 ms). Desde Santo Domingo cada viaje puede ser 100–200 ms,
  así que cada "piso" de consultas pesa el doble o el triple de lo que medí.
- **`EXPLAIN ANALYZE`**: por regla no lo corrí sobre `winning_ads`/`offers`; los costos son del
  planificador. Y lo corrí como `postgres` (sin RLS): con `authenticated`, la política de
  `winning_ads` evalúa `has_access()` por fila leída (24–100 filas: despreciable).
- **FCP/LCP de la landing** con la pestaña visible: el panel estaba oculto y el navegador
  retrasa el pintado; DOMContentLoaded y load sí son fiables.
- **Web Vitals reales**: PostHog los graba (`web-vitals-with-attribution.js` carga en landing y
  app). Jean puede ver LCP/INP reales por país en PostHog → Web Vitals; eso vale más que mi
  medición desde aquí.
- **Los 500 de `content-month`** (3 en 24 h, 0,5 s cada uno): el log de función no guardó el
  motivo; falló antes de llamar a la IA (probablemente validación o cobro). Hay que mirar el
  cuerpo de la respuesta con un caso real.

## 7. Verificación local de los cambios

- `npx tsc --noEmit -p tsconfig.app.json | grep -E "src/(main|App)\.tsx|src/pages/Index\.tsx|src/hooks/|vite\.config"` → **vacío**.
  (El proyecto completo tiene 109 errores de tipos en otros archivos que no son míos; no los
  toqué. `vite build` no hace chequeo de tipos, así que no afectan a producción.)
- `npx vitest run` → **48 archivos, 332 pruebas, todas en verde** (28 s).
- `npx vite build` → **OK en ~17 s**; entrada `index` 252,67 kB (83,79 kB gz, +0,2 kB por el
  precargado de `Index`/`DashboardPage` al entrar), `Index` 94,33 kB (30,36 gz), `DashboardPage`
  80,12 kB (23,13 gz).
- **No verificado en producción** (no se despliega sin OK de Jean): el cambio 2 (reintento) solo
  se nota con red inestable; el cambio 1 ahorra un viaje al servidor en cada apertura; el cambio
  3 se nota al hacer login nuevo. Para comprobarlos tras desplegar: abrir la app recién logueado
  y mirar en la pestaña Red que `Index-*.js` empieza a bajar a la vez que `rpc/has_access`.

Archivos tocados: `src/App.tsx`, `src/hooks/useCredits.ts`, `src/hooks/useAccessStatus.ts`,
`src/hooks/useAdHistory.ts`, `src/hooks/useGamification.ts`. Sin git, sin deploy, sin
migraciones, sin escrituras en la base.
