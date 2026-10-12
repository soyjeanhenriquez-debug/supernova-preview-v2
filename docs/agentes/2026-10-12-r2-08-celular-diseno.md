# R2-08 · Celular impecable y diseño consistente — 12-oct-2026

Agente R2-08. Recorrido a 390 px en producción (sesión de Hany, app dentro de un `iframe` de 390 × 844
del mismo origen, `?r=r2-08`) + revisión del código de los componentes comunes. Capturas en
`docs/agentes/capturas/r2-08/`. Sin git, sin despliegues, 0 generaciones con IA.

## Resumen (12 líneas)

1. Nota en el celular: **antes 6,5/10 → después 8/10** (con mis cambios locales + los de la misión 08 y de los dueños).
2. Había **3 botones "principales" distintos**: ámbar (`btn-primary-nova`, 79), ámbar `bg-primary` (35) y blanco→gris (`gradient-brand`, ~40). Ahora todos son **el mismo ámbar plano**.
3. Botones principales a **44 px de alto** en el teléfono (CSS acotado a < 640 px); barra superior con toques de 44 px.
4. Campos a **16 px en pantallas táctiles en toda la app** (antes solo dentro de `<main>`: el buscador ⌘K, el chat, el menú y las ventanas seguían con zoom de iOS).
5. Filas que se deslizan de lado (Creativos, N0/N1/N2, Mándala, Nichos, Generadores) ahora **se desvanecen en el borde derecho mientras queda contenido**: se nota que hay más. Comprobado en producción con la regla inyectada.
6. Red de seguridad: `overflow-x: clip` en `html/body` < 768 px → la página entera ya no se mueve de lado aunque algo se pase.
7. **Dialog, Sheet, Select y Tabs** arreglados para negro y celular: alto máximo, scroll interno, zona segura, cerrar de 44 px en español, sin hover ámbar.
8. Quité el **ámbar de los estados hover/foco** de menús, buscador, select, toggle y botones secundarios (en este tema `accent` = ámbar: todo el buscador se pintaba naranja).
9. Componentes nuevos para todos: **`EmptyState`, `SkeletonCard`/`SkeletonGrid`, `Pill`** y la clase **`.scroll-row`** (uso abajo).
10. LaunchChainBar, TopBar y ProductSwitcher con toques de 44 px; el botón "Crear producto" ahora es ámbar.
11. `tsc` filtrado a mis archivos: 0 errores · 5 archivos de prueba relacionados (22 pruebas) en verde · `npx vite build` OK (3 m 44 s).
12. No comprobado en un iPhone real (zona segura, teclado) ni los componentes de React en producción (prod no tiene los cambios locales).

## 1. Recorrido a 390 px (producción, 12-oct)

Medí en cada pantalla el ancho real de la página y de `main`, los elementos que se salen, las filas con
scroll lateral oculto, los controles de menos de 32 px y los campos con letra de menos de 16 px.

| Pantalla | Se sale de lado | Fila oculta de lado | Campos < 16 px | Nota |
|---|---|---|---|---|
| Inicio | no | — | 1 (buscador 14) | ok |
| Ofertas | no | — | 1 (buscador 14) | ok |
| Mini Apps | no | — | 0 | ok |
| **Radar** | **sí: `main` 459/383** (paginación "Anuncios por página" y selector 2-6) | — | 0 | el dueño ya lo tiene arreglado en local (`hidden sm:inline`, `hidden md:inline-flex`, líneas 1084 y 1362); falta desplegar |
| Ganchos | no | — | 1 | ~180 chips de 30 px (filtros): aceptable, son chips |
| Mándala | no | pestañas 351/466 | 0 | ahora con desvanecido |
| Creativos | no | pestañas 351/728 y N0/N1/N2 309/978 | 2 (14) | ahora con desvanecido (captura `01`) |
| Carrusel | no | 351/728 y 351/2096 | **16** (12–14) | arreglado por CSS táctil global |
| Miniaturas | no | 351/728 | 1 | ok |
| Anuncio en video | no | — | 3 (textareas 14) | arreglado por CSS |
| Motion | no | — | 2 (13–14) | arreglado por CSS |
| Video IA, Creador YouTube | no | — | 0 | al abrir: **spinner suelto** (ver diff `Index.tsx`) |
| Nichos YouTube | no | 351/1103 | 1 | ahora con desvanecido |
| Generadores | no | lista 359/1694 | 0 | ahora con desvanecido |
| Precio y ganancia | no | — | **10** (select/input 14) | arreglado por CSS |

No pude terminar Mi ficha → Proyectos (Mi negocio, Validar, Plan, Contenido, Recuperar, Diagnóstico,
Order bump, Productos, Crear producto, Créditos, Aprende, Recompensas): el Chrome compartido se trabó
y descartó mi pestaña 4 veces (ver "No comprobado"). La misión 08 de ayer ya las midió; sus fallos
(Productos 879 px, Contenido 407 px) los quitan las reglas CSS de ayer, que siguen en `index.css`.

En producción la barra de lanzamiento sigue **desplegada** en el teléfono (capturas `02`, `03`): la
versión plegada de la misión 08 está en local, sin desplegar.

## 2. ARREGLADO (solo mis archivos)

### `src/index.css`
- **`.gradient-brand` = ámbar plano** (antes degradado blanco→gris) + hover. Afecta ~40 botones
  (Auth, Contenido, Mándala, Productos, Recuperar, Generadores, Media Studio, Mercado, Kits…), el
  paso activo de los recorridos, 3 barras de progreso y el logo de carga. Un solo botón principal.
- **< 640 px:** `button.btn-primary-nova`, `button.gradient-brand`, enlaces flex con esas clases y
  `main button.bg-primary.text-primary-foreground` → `min-height: 44px`. Comprobado: "Listo, terminar"
  36 → 44 px.
- **< 768 px y táctil:** campos a `max(1em, 16px)` en TODA la app (también buscador, chat, menú
  lateral, ventanas y hojas, que viven en `<body>`, fuera de `<main>`).
- **< 768 px:** `html, body { overflow-x: clip }` (red de seguridad, no rompe `sticky`) y sin destello
  gris al tocar.
- **Desvanecido de filas laterales** con `animation-timeline: scroll(self inline)`: solo cuando la fila
  se pasa del ancho y solo mientras queda contenido a la derecha (32 px → 0 al llegar al final).
  Comprobado en producción con la regla inyectada (`--row-fade` 32 px al inicio, 0 px al final).
  Safari < 26 lo ignora y queda como antes.
- **`.scroll-row`** nueva: fila deslizable lista para usar (sin barra, con imán, con desvanecido).

### `src/components/ui/`
- **`dialog.tsx`**: ancho `100vw − 24 px` en el teléfono, alto máximo `100dvh − 24 px` con scroll
  interno, `rounded-2xl` siempre, fondo de tarjeta (#1c1c1e; el negro puro no se distinguía del velo),
  velo con 2 px de desenfoque, cerrar de 44 px (36 en escritorio) gris y con "Cerrar" en español,
  título en Sora, pie con `gap-2` (antes `space-x` dejaba los botones pegados al apilarse).
- **`sheet.tsx`**: fondo de tarjeta, scroll interno, abajo `max-h 90dvh` + `rounded-t-2xl` + zona
  segura inferior; laterales `85vw` (máx. 384 px) + zona segura arriba y abajo; cerrar 44 px en español.
- **`select.tsx`**: disparador 44 px y 16 px en < 640 px (escritorio igual), lista con alto máximo =
  espacio libre en pantalla (`--radix-select-content-available-height`) y ancho máximo de la pantalla,
  opciones de 44 px en el teléfono, foco gris (no ámbar) y ✓ ámbar.
- **`tabs.tsx`**: la barra se desliza de lado si no cabe (sin empujar la página), pestaña activa en
  gris tarjeta, 44 px en el teléfono.
- **`button.tsx`**: el `default` es el mismo ámbar de `.btn-primary-nova` (semibold, hover más claro);
  `outline`/`ghost` con hover gris; 44 px en el teléfono para `default` e `icon`.
- **`command.tsx`, `dropdown-menu.tsx`, `context-menu.tsx`, `menubar.tsx`, `navigation-menu.tsx`,
  `toggle.tsx`**: hover/foco/abierto en gris (`secondary`), no en ámbar. El buscador ⌘K pintaba de
  naranja la fila elegida.
- **`textarea.tsx`**: 16 px en el teléfono (como `input.tsx`).
- **NUEVOS**: `pill.tsx`, `empty-state.tsx`, `skeleton-card.tsx` (uso en la sección 4).

### Componentes comunes
- **`TopBar.tsx`**: menú y lupa con 44 px de toque (el círculo visible sigue de 36 px); barra más baja
  en el teléfono (`py-1.5`) para no crecer.
- **`LaunchChainBar.tsx`**: "Siguiente"/"terminar" 44 px en el teléfono, zona de toque del texto
  44 px, pasos y "Terminar" 44 px al desplegar; ✕ de escritorio con más área.
- **`ProductSwitcher.tsx`**: "Crear producto" pasa del degradado blanco al ámbar `btn-primary-nova`;
  campo a 16 px en el teléfono; filas de 44 px; menú con alto máximo y scroll.
- `PageHeader.tsx`, `ModalPortal.tsx`, `NavLink.tsx`, `tailwind.config.ts`: sin cambios (están bien).

## 3. Para otros dueños (con diff)

### P1 · `src/pages/Index.tsx` (línea 62) — carga con el formato real, no un spinner suelto
```diff
+import { SkeletonCard } from "@/components/ui/skeleton-card";
 function PageLoader() {
   return (
-    <div className="flex items-center justify-center py-24">
-      <Loader2 className="w-6 h-6 text-primary animate-spin" />
-    </div>
+    <div className="max-w-[1280px] mx-auto space-y-4" aria-busy="true">
+      <div className="h-7 w-56 rounded-md bg-secondary/80 animate-pulse" />
+      <div className="h-4 w-80 max-w-full rounded-md bg-secondary/60 animate-pulse" />
+      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
+        {[0, 1, 2].map(i => <SkeletonCard key={i} aspect="4/5" />)}
+      </div>
+    </div>
   );
 }
```
Se ve en Video IA, Creador YouTube y Nichos al abrirlos (capturas de hoy).

### P1 · `src/components/CreditRing.tsx` (línea 59) — la ruedita de créditos mide 32 px
```diff
-          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary/70 transition-colors">
+          className="w-11 h-11 md:w-8 md:h-8 rounded-full flex items-center justify-center hover:bg-secondary/70 transition-colors">
```

### P2 · Estados vacíos y cargas → componentes comunes
`OfertasPage.tsx` 306–319, `KitsPage.tsx` 180–196, `HooksPage.tsx` 238, `WinningAdsPage.tsx` 1173,
`BrainPage.tsx` 86:
```diff
-        <div className="card-surface rounded-2xl py-20 text-center">
-          <div className="empty-icon mb-5"><Gem className="w-7 h-7" strokeWidth={1.4} /></div>
-          <div className="font-display font-semibold text-base mb-1">No hay ofertas con esos filtros</div>
-          <div className="text-sm text-muted-foreground">…</div>
-        </div>
+        <EmptyState icon={<Gem />} title="No hay ofertas con esos filtros" text="…"
+          action={{ label: "Quitar filtros", onClick: resetFilters }} />
```
```diff
-        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
-          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="card-surface rounded-2xl h-[420px] animate-pulse" />)}
-        </div>
+        <SkeletonGrid count={6} aspect="4/5" />
```
Mismo cambio en `KitsPage.tsx` 181, `DailyPicksHero.tsx` 75, `YouTubeRadarPage.tsx` 90 (`aspect="16/9"`),
`PersonajePage.tsx` 450 (`aspect="9/16"` + `step="Escribiendo el guion…"`).

### P2 · Etiquetas de formato → `<Pill>`
`MercadoPage.tsx` 422/427 (etiqueta abajo a la izquierda con texto ámbar/verde): `<Pill overlay>`.
`OfferCard.tsx` 37 y `KitsPage.tsx` 295 (píldora ámbar rellena "Nuevo"): `<Pill tone="primary">`.

### P2 · Filas laterales → `.scroll-row`
`MandalaPage.tsx` 612 (pestañas) y la fila N0/N1/N2 de Creativos: cambiar
`flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]` por `scroll-row gap-2 pb-1`
(el desvanecido ya funciona con `overflow-x-auto`, pero `.scroll-row` añade imán y no encoge hijos).

### Recordatorio (ya propuestos por la misión 08, siguen en prod)
Carrusel título "Modelar uno que ya funciona" partido, burbuja del Inicio y pie alto del detalle de
oferta: diffs en `docs/agentes/2026-10-11-mision-08-celular.md` §5.

## 4. Cómo usar los componentes comunes (para todos los dueños)

```tsx
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard, SkeletonGrid } from "@/components/ui/skeleton-card";
import { Pill } from "@/components/ui/pill";

// Vacío o error: icono gris, título Sora, una línea, UN botón ámbar con el siguiente paso.
<EmptyState icon={<Gem />} title="No hay ofertas con esos filtros" text="Quita algún filtro."
  action={{ label: "Quitar filtros", onClick: reset }} secondary={{ label: "Ver todas", onClick: all }} />
<EmptyState compact icon={<Quote />} title="Aún no guardas ganchos" />   // dentro de otra tarjeta

// Carga: la misma cuadrícula y el mismo formato que lo que llega.
<SkeletonGrid count={6} aspect="4/5" className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4" />
<SkeletonCard aspect="9/16" step="Armando la toma 2 de 3" />            // generación con IA
<SkeletonCard aspect={null} lines={3} />                                 // solo texto

// Etiqueta: píldora gris con texto blanco; sobre imagen, abajo a la izquierda.
<div className="relative"><img … /><Pill overlay>Carrusel</Pill></div>
<Pill>91 días pagando anuncios</Pill>   <Pill tone="primary">Nuevo</Pill>

// Botón principal: <Button> (ui/button) o className="btn-primary-nova". No usar gradient-brand
// ni bg-primary sueltos en pantallas nuevas (los viejos ya se ven igual).
// Fila deslizable: <div className="scroll-row gap-2">…</div>
// Tarjeta: className="card-surface rounded-2xl" (o <Card>).
```

## 5. Decisiones

- **Un solo botón principal ámbar**: cambié la clase `.gradient-brand` en vez de tocar ~40 botones en
  20 pantallas ajenas. Reversible en 3 líneas de `index.css`. El registro (AuthPage) también queda ámbar.
- **Escritorio sin cambios de tamaño**: todo lo de 44 px va con `max-sm:` o `@media (max-width: 639px)`;
  en escritorio solo cambian colores (ámbar único, hover gris) y el fondo de las ventanas (tarjeta).
- **`overflow-x: clip`** en `html/body` del teléfono: prefiero recortar 8 px a que la página entera
  baile de lado; los desbordes reales se siguen reportando a sus dueños.
- Chips de filtro de 30–32 px (Ganchos, Ofertas) no los subí a 44: son muchos y en fila; con 8 px de
  separación se tocan bien. Si Jean quiere 44 en todo, es una regla más.

## 6. No comprobado

- **Chrome compartido inestable**: descartó/reinició mi pestaña 4 veces y se reinició entero; no pude
  medir 12 pantallas (Mi ficha → Proyectos) hoy. Quedan las medidas de la misión 08 de ayer.
- Los componentes de React (Dialog, Sheet, Select, Tabs, TopBar, LaunchChainBar, ProductSwitcher,
  EmptyState, SkeletonCard, Pill) **no están en producción**: verificados con `tsc`, 22 pruebas que los
  montan (RechargePopup, CreditRing, AgeCountryGate, CreateFromIdeaSheet, StageBar) y `vite build`,
  más la revisión del CSS generado (`max-h-[calc(100dvh-24px)]`, `max-sm:h-11`, zona segura OK).
- Las reglas de `index.css` sí se probaron en producción inyectándolas (botón 36 → 44 px, desvanecido
  32 → 0 px al deslizar). La regla de 16 px es solo táctil: en el iframe de escritorio no aplica.
- Zona segura (notch, barra de inicio) y teclado virtual: no se simulan en el iframe.
- La suite completa de `vitest` no se corrió (tarda mucho, pedido del coordinador); sí los 5 archivos
  relacionados. Los errores de `tsc` que quedan (AdminUsers, AdminKeywords, winner-detection…) son
  previos y no tocan mis archivos.
