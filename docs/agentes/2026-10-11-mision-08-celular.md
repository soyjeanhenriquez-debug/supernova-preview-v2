# Misión 08 · La app en el celular (390 px) — 11-oct-2026

Agente 8 de 10. Recorrido completo de la app en producción (https://supernova-six-eta.vercel.app/app) a
390 × 844 px con la sesión de la probadora Hany. Capturas en `docs/agentes/capturas/mision-08-celular/`.

Cómo se probó: la ventana de Chrome está compartida con los otros 9 agentes y `resize_window` no la
achicaba (sigue en 1512 × 949), así que en mi pestaña monté la app dentro de un `iframe` de 390 × 844 del
mismo origen (misma sesión, misma base). El ancho de vista medido dentro fue 390 px exactos, con las
reglas `@media` reales del teléfono. Además de mirar, medí con JavaScript en cada pantalla el ancho
real de `main` (si pasa de 390 hay scroll lateral) y los campos con letra menor de 16 px.

---

## 1. Veredicto

**De 10 personas que entran desde el celular, hoy siguen 6 y pagan 3 o 4.** Con los 5 arreglos de
arriba de la lista (barra plegable, Mis productos, Calendario, Radar y los selectores de Ofertas)
subiría a **8 que siguen y 5 o 6 que pagan**.

Por qué hoy pierde gente en el teléfono:

- **Lo primero que se ve no es la app, es una barra.** La barra de lanzamiento ("Lanzando tu versión
  de Muscle Booster…") ocupaba 245 px de 844 (29 % de la pantalla) en TODAS las pantallas. "¿Qué
  quieres hacer hoy?" empezaba a 390 px del borde. Para alguien que entra por primera vez parece un
  aviso que no se quita. **Arreglado en esta misión (plegada en una línea en el teléfono).**
- **Dos pantallas con scroll lateral.** Mis productos se iba a 879 px (botón "Crear y empezar" cortado,
  nombre del producto fuera de pantalla) y Calendario de contenido a 407 px (botón "Agregar a mano"
  fuera). Una página que se mueve de lado en el teléfono grita "esto no está hecho para mí".
  **Arreglado por CSS en esta misión (comprobado en producción con la regla inyectada: 879 → 383 y
  407 → 383).**
- **El Radar, nuestra prueba de venta, se ve roto abajo:** la paginación "Página 1 / 1525" se parte
  en tres líneas y el botón "Siguiente" queda cortado a la derecha; el selector de 2-3-4-5-6
  columnas no tiene sentido en un teléfono y el toggle "Cuadrícula / Lista" se sale por la derecha.
- **Lo demás está bien:** Ofertas (tarjeta, "Hacer mi versión", detalle), Mini Apps, Nichos de
  YouTube, Validar, Precio, Order bump, Recuperar, Diagnóstico, Resultados, Ganchos, Aprende, Mi
  ficha, Mis créditos y el chat caben y se leen bien. El menú inferior (Inicio · Buscar · Crear ·
  Cuenta) se entiende. El recorrido Ofertas → detalle → "Hacer mi versión" funciona con un pulgar.

Lo que hace que paguen: las ofertas con sus "días pagando anuncios" se ven claras en la tarjeta y
en el detalle; "Hacer mi versión · 50 créditos" está siempre a la vista en el pie del detalle. Lo que
frena el pago: la sensación de descuido (scroll lateral, cosas cortadas) en las pantallas donde
guardan lo suyo (Mis productos, Calendario).

## 2. La app en una línea

**"Mira qué negocios digitales llevan meses pagando anuncios (o sea, venden) y haz tu versión esta
semana, desde el celular, cobrando en tu moneda."**

## 3. Top 10 fallos (con pantalla, pasos y captura)

| # | Gravedad | Pantalla | Qué pasa | Pasos | Captura |
|---|---|---|---|---|---|
| 1 | ALTA | Todas (barra de lanzamiento) | `LaunchChainBar` ocupa 245 px (29 % de la pantalla) en cada pantalla; el título de la pantalla queda a 390 px del borde | Entrar con un lanzamiento abierto (Hany lo tiene) y abrir cualquier pantalla | `01-inicio-barra-lanzamiento.jpg` |
| 2 | ALTA | Mis productos | `main` mide 879 px: scroll lateral, "Crear y empezar" y el nombre del producto cortados | Cuenta → Mis productos | `05-productos-desborda.jpg` (y `05b-…` con el arreglo) |
| 3 | ALTA | Calendario de contenido | `main` mide 407 px: el botón "Agregar a mano" queda fuera de la pantalla | Calendario de contenido → bajar hasta "Esta semana / Lista" | `06-contenido-boton-fuera.jpg` |
| 4 | ALTA | Radar de anuncios | Paginación: "Página 1 / 1525" en 3 líneas, "Siguiente" cortado (fila llega a 459 px); el toggle "Cuadrícula / Lista" se sale (403 px); selector 2-3-4-5-6 columnas inútil en un teléfono | Radar → bajar hasta "Mostrando 1–24 de 36.594" | `03-radar-paginacion-desborda.jpg`, `04-radar-filtros-cortados.jpg` |
| 5 | MEDIA | Menú lateral (hamburguesa) | Con el menú abierto, el menú inferior y el botón del chat seguían flotando encima del velo (mismo z-40) | Tocar ☰ arriba a la izquierda | `07-menu-lateral-nav-encima.jpg` |
| 6 | MEDIA | Ofertas ganadoras | Los 4 selectores de filtro muestran "Cualquier…", "Las mejores…", "Cualquier forma …": no se sabe qué filtran | Ofertas → bajar al bloque de filtros | `08-ofertas-selectores-cortados.jpg` |
| 7 | MEDIA | Carrusel | La tarjeta "Modelar uno que ya funciona" parte el título palabra por palabra al lado de "El más rápido" | Carrusel → "¿Qué carrusel quieres hacer?" | `09-carrusel-titulo-roto.jpg` |
| 8 | MEDIA | Tus primeros 5 anuncios (Mándala) | Las pestañas "Paso a paso · vas en el 4 de 5 / Rueda libre / Resultados" se salen (478 px) y la tercera no se ve; el scroll lateral no se nota | Abrir Tus primeros 5 anuncios | `10-mandala-pestanas-cortadas.jpg` |
| 9 | MEDIA | Inicio | La burbuja "¿No sabes qué hacer? Te recomendamos algo" (fija) se queda encima de la tarjeta "¿No sabes por dónde empezar?" (dice lo mismo) y de "Ver todas las herramientas (34)" | Inicio → bajar hasta el final | `02-inicio-burbuja-tapa-tarjeta.jpg` |
| 10 | MEDIA | Detalle de oferta | El pie fijo (Modelar + chips + 2 botones + Hacer mi versión) mide ~270 de 793 px: queda un tercio de pantalla para leer la oferta | Ofertas → "Detalles" en cualquier tarjeta | `11-oferta-detalle-pie-alto.jpg` |

Otros, menores (sin número):

- Precio y ganancia, Diagnóstico, Recuperar, Mi ficha: 5 a 13 campos con letra de 12–14 px → en
  iPhone, al tocar el campo, Safari hace zoom a toda la página. **Arreglado por CSS (solo táctil).**
  `18-precio-inputs.jpg`.
- Diagnóstico: el botón "Mensajes para los que dejaste sin respuesta" queda bajo el botón del chat
  (la flecha no se ve). `13-diagnostico-boton-tapado.jpg`. Mitigado: el botón del chat ahora mide
  48 px y va más a la esquina.
- Mi ficha: el título es el nombre completo del producto (4 líneas) con el icono flotando a media
  altura. `12-mi-ficha-titulo-largo.jpg`. **Arreglado en `PageHeader` (icono arriba, 22 px).**
- Generadores: nombres de los kits truncados ("Order bump: el extra que se agre…"). `14-generadores-truncado.jpg`.
- Creativos: la fila N0 / N1 / N2 ("¿Qué sabe ya tu cliente?") se corta en "N1 Conoc" sin pista de
  que se desliza. `19-creativos-chips-cortados.jpg`.
- Menú inferior → Crear: solo lista 5 herramientas (faltan Influencer IA y Robot de copy, que sí
  están en Inicio). `15-hoja-crear.jpg`.
- Menú lateral: la tecla Escape no lo cierra (en el teléfono no importa; el velo y la ✕ sí cierran).
- Radar: al abrir desde otra pantalla sin pasar por el menú (cambio de `#hash`), la página no vuelve
  arriba.

Lo que está bien y conviene no tocar: tarjetas del Radar (video 9:16 completo dentro de la tarjeta,
veredicto legible), tarjetas de Ofertas con "Hacer mi versión · 50", hojas Crear y Cuenta
(`15`, `16`), el buscador (⌘K) y el chat (`17-chat-abierto.jpg`), Mis créditos, Aprende, Nichos de
YouTube, Validar.

## 4. Cambios HECHOS (solo en mis archivos; sin git, sin deploy)

`npx tsc --noEmit -p tsconfig.app.json` sin errores en estos archivos · `npx vitest run`: 48 archivos,
332 pruebas en verde.

1. **`src/components/LaunchChainBar.tsx` — barra plegable en el teléfono.** Debajo de `lg` se ve una
   sola línea: cohete + "Lanzando tu versión de X" + "Paso 5 de 5 · WhatsApp para quien casi compra ⌄"
   + botón ámbar "Siguiente →" (o "terminar" en el último paso). Tocar el texto abre la lista de
   pasos (con "N días pagando anuncios" y un "✕ Terminar" pequeño). En escritorio no cambia nada
   (mismo encabezado, mismos chips, mismo "Siguiente: …"). De ~245 px pasa a ~62 px.
2. **`src/index.css` — reglas móviles nuevas al final, bajo `@media`:**
   - `main .grid` sin `grid-cols-*` sin prefijo → `grid-template-columns: minmax(0, 1fr)` en
     < 640 px. Quita el scroll lateral de Mis productos (879 → 383 px, comprobado en producción
     inyectando la regla; ver `05b-productos-con-arreglo-css.jpg`).
   - `main .flex > input` → `min-width: 0` en < 640 px. Quita el scroll lateral de Calendario de
     contenido (407 → 383 px, comprobado igual).
   - En pantallas táctiles < 768 px, `input`/`select`/`textarea` dentro de `main` con
     `font-size: max(1em, 16px)`: evita el zoom automático de iOS al enfocar un campo. No afecta
     al escritorio (`pointer: coarse`).
3. **`src/components/MobileBottomNav.tsx`** — el menú inferior pasa de `z-40` a `z-30`: queda debajo
   del menú lateral (z-40) y de las hojas, así el velo lo tapa en vez de flotar encima.
4. **`src/components/HelpAssistant.tsx`** — botón flotante en el teléfono: 48 px (antes 56), 12 px del
   borde, 72 px sobre el menú inferior y `z-30` (debajo del menú lateral). Panel abierto: 100vw − 24
   px de ancho y 100dvh − 100 px de alto. En escritorio no cambia.
5. **`src/components/PageHeader.tsx`** — título de 22 px en el teléfono (24 en `sm+`), `items-start`
   e icono fijo arriba (`[&>svg]:shrink-0 [&>svg]:mt-1`): los títulos de 2–4 líneas (Mi ficha,
   Recuperar, Diagnóstico) ya no dejan el icono flotando.

No toqué `TopBar.tsx`: la barra superior cabe bien (título truncado con "…", lupa, ruedita de
créditos).

**No pude comprobar estos cambios en producción** (no se despliega sin Jean). Lo que sí comprobé en
producción: las dos reglas CSS de desborde (inyectadas en vivo, medidas antes/después).

## 5. Cambios PROPUESTOS (fuera de mis archivos), con prioridad y diff

### P1 · Radar: paginación que quepa y sin selector de columnas en el teléfono
`src/pages/WinningAdsPage.tsx` (≈ líneas 1067 y 1344)

```diff
-          <div className="flex items-center gap-2">
-            {viewMode === "grid" && (
+          <div className="flex flex-wrap items-center gap-2">
+            {viewMode === "grid" && (
-              <div className="inline-flex items-center gap-1 bg-secondary/60 rounded-full p-1 border border-border/60" title="Anuncios por fila">
+              <div className="hidden md:inline-flex items-center gap-1 bg-secondary/60 rounded-full p-1 border border-border/60" title="Anuncios por fila">
```
```diff
-      <div className="flex items-center gap-2">
-        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Anuncios por página</span>
+      <div className="flex flex-wrap items-center gap-2">
+        <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-muted-foreground">Anuncios por página</span>
 ...
-        <div className="flex items-center gap-1 ml-2">
+        <div className="flex items-center gap-1 sm:ml-2">
 ...
-          <span className="px-3 text-xs text-foreground/80">
+          <span className="px-2 sm:px-3 text-xs text-foreground/80 whitespace-nowrap">
```
En el teléfono la cuadrícula siempre es de 1 columna; el selector 2–6 solo confunde.

### P1 · Mis productos y Calendario: el arreglo en el código (además del CSS)
`src/pages/ProductsPage.tsx` (líneas 126 y 145):
```diff
-      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
+      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
```
`src/pages/ContentPage.tsx` (≈ línea 712):
```diff
-          <div className="flex gap-2 w-full sm:w-auto">
+          <div className="flex flex-wrap sm:flex-nowrap gap-2 w-full sm:w-auto">
 ...
-              placeholder="Una idea tuya…" className="flex-1 sm:w-64 rounded-lg …" />
+              placeholder="Una idea tuya…" className="flex-1 min-w-0 sm:w-64 rounded-lg …" />
```

### P2 · Ofertas: filtros legibles en el teléfono
`src/pages/OfertasPage.tsx` (bloque de 4 `Select`, ≈ línea 270–300): poner los selectores en una
columna en el teléfono (`grid grid-cols-1 sm:grid-cols-2`) o acortar las etiquetas por defecto:
"Cualquier precio", "Todas las formas de cobro", "Mejor puntaje". Hoy se ven "Cualquier…",
"Cualquier forma …", "Las mejores…".

### P2 · Carrusel: título de la tarjeta "Modelar uno que ya funciona"
`src/components/image/CarouselStudio.tsx` (línea 513–516):
```diff
-              <span className="flex items-center justify-between gap-2 text-[13px] text-foreground font-medium">
+              <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[13px] text-foreground font-medium">
                 {FORMATS[id].label}
-                {id === "clonar" && <span className="text-primary text-[10px] font-normal shrink-0">El más rápido</span>}
+                {id === "clonar" && <span className="text-primary text-[10px] font-normal shrink-0 basis-full sm:basis-auto">El más rápido</span>}
```

### P2 · Mándala: pestañas que no se cortan
`src/pages/MandalaPage.tsx` (línea 612): acortar la etiqueta en el teléfono
(`Paso a paso · 4/5` en vez de `Paso a paso · vas en el 4 de 5`) y quitar `flex-1` de los botones
en < sm para que el contenedor con `overflow-x-auto` deslice de verdad:
```diff
-          ["ruta", Route, `Paso a paso · vas en el ${autoStep} de 5`],
+          ["ruta", Route, window.innerWidth < 640 ? `Paso a paso · ${autoStep}/5` : `Paso a paso · vas en el ${autoStep} de 5`],
```
(o con una clase `hidden sm:inline` para la parte larga).

### P2 · Inicio: una sola recomendación
`src/pages/DashboardPage.tsx` (≈ línea 279): la burbuja fija "¿No sabes qué hacer? Te recomendamos
algo" y la tarjeta "¿No sabes por dónde empezar?" dicen lo mismo. Propuesta: ocultar la burbuja
cuando la tarjeta ya está en pantalla (un `IntersectionObserver` sobre `#home-recomendaciones`) o
quitarla en el teléfono (`hidden lg:inline-flex`) donde ya tapa contenido.

### P3 · Detalle de oferta: pie más bajo en el teléfono
`src/components/offers/OfferDetailSheet.tsx` (línea 176–200): en < sm dejar fijos solo "Modelar
esta oferta completa" y "Hacer mi versión", y mover los chips "Hazlo por mí", "Crea tus anuncios" y
"Vender esto" dentro del cuerpo con scroll (o detrás de un "Más opciones ⌄"). Libera ~150 px.

### P3 · Hoja "Crear" del menú inferior: las 7 herramientas de crear
`src/lib/tools.ts` (línea 150):
```diff
-export const STUDIO_TOOLS = pick(["creativos", "videoanuncio", "creadoryt", "carrusel", "miniaturas"]);
+export const STUDIO_TOOLS = pick(["creativos", "videoanuncio", "creadoryt", "carrusel", "miniaturas", "personaje", "copy"]);
```
(Revisar primero dónde más se usa `STUDIO_TOOLS`: si alimenta pestañas de Creativos, sacar una
lista aparte `CREATE_SHEET_TOOLS` para la hoja.)

### P3 · Volver arriba al cambiar de pantalla por el hash
`src/pages/Index.tsx` (≈ línea 113, `sync`): añadir `window.scrollTo({ top: 0 })` cuando la página
cambia por `hashchange`/`popstate`, igual que hace `setActivePage`.

## 6. Lo que no pude comprobar

- **La landing pública** (`https://supernova-six-eta.vercel.app/`): con la sesión de Hany abierta
  redirige a `/app`, y no podía cerrar sesión. Queda pendiente verla a 390 px sin sesión.
- **Mis cambios en producción**: no se despliega sin Jean. Verificados con `tsc` + `vitest` y, en el
  caso del CSS, inyectando las mismas reglas en la app de producción dentro del iframe.
- **Teclado del teléfono**: en el iframe no hay teclado virtual; no vi cómo se comporta el menú
  inferior con el teclado abierto (en iOS suele subir con él).
- **Zona segura (notch / barra de inicio)**: `env(safe-area-inset-bottom)` no se simula en un
  iframe de escritorio; las clases están, pero no se vio en un iPhone real.
- **Ventana de Chrome**: `resize_window` devolvió "ok" pero la ventana compartida siguió en
  1512 × 949 (la zoom 67 % hace 2268 px CSS); por eso usé el iframe de 390 px. Al terminar la dejé
  en 1512 × 949 y cerré mi pestaña.
- No generé nada con IA ni compré nada; las capturas de Creativos/Miniaturas muestran imágenes que
  ya existían en la cuenta de Hany.
