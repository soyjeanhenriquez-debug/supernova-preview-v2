# Misión 01 · La frase y la primera impresión (11-oct-2026)

Agente 1 de 10. Objetivo: que SUPERNOVA se explique en una frase y que esa frase sea lo primero
que ve la gente (landing y Inicio). Sin git, sin despliegues, sin tocar la base.

---

## 1. Veredicto

**De 10 personas de este público (RD, Colombia, México, empiezan de cero), hoy pagarían 2.**

Por qué solo 2:

- **Nadie puede decir qué es en una frase.** La landing publicada dice cinco cosas distintas en la
  primera pantalla (ofertas de otro país, test de 30 segundos, 3 días gratis, cupón FUNDADOR,
  Whop) y después nombra 12 herramientas con nombres internos (Mándala, Oráculo, Bóveda, Mini
  Apps, Cazador, Mercado, 26 generadores, 72 anuncios). La persona que empieza de cero se pierde.
- **Hay dos landings que dicen cosas distintas.** En producción `/` sirve `public/fundador/index.html`
  ("Cada día te mostramos ofertas que ya se venden en otro país. Tú haces la tuya."). La landing de
  React (`src/pages/LandingPage.tsx` + `Hero.tsx`, "Descubre qué vender, valídalo con datos…") solo se
  ve en desarrollo (`StaticHome` en `src/App.tsx` recarga en PROD). Ninguna de las dos coincide con el
  título del navegador ni con el Inicio de la app.
- **La landing se contradice en la primera pantalla:** arriba "La oferta de fundador cerró" y, debajo
  del botón, "Luego US$19,99 el primer mes con FUNDADOR". Quien lo nota deja de confiar.
- **Las cifras están viejas.** Landing: 7.517 ofertas / 114.000 anuncios / 300 ganadoras. Base hoy
  (consulta liviana sobre `offers` y estimación de `pg_class`): 12.920 ofertas sin excluir y
  ~145.000 anuncios. El manual dice que cada número que ve el cliente es real.
- **La ventaja real no se ve.** Lo que la competencia no tiene (anuncios con más de 90 días pagando =
  prueba de venta, y tu versión en español) está enterrado en el párrafo 4. anai y Quantum Miner
  lo dicen en 3 segundos con un titular y un carrusel/feed.
- Lo que sí convence a esos 2: la muestra real de 3 ofertas con "días con anuncios", la garantía de 30
  días y los 3 días gratis.

Dato que sostiene la frase (verificado hoy en producción, consulta de 300 filas): **300 ofertas
ganadoras, 280 llevan más de 90 días pagando anuncios, mediana 93 días, mínimo 30.** El umbral de
"ganadora" es `days_active >= 30` (`20260919110000_offers_winners.sql`), no 90: por eso la frase dice
"elige un negocio que lleva más de 90 días" (lo que la persona elige) y no "todas llevan 90".

---

## 2. La frase

### Las 5 candidatas (máx. 18 palabras, sin "gana", sin plazos)

1. **"Elige un negocio digital que lleva más de 90 días pagando anuncios y haz tu versión en español."** (18)
2. "Negocios digitales que llevan más de 90 días pagando anuncios, convertidos en tu versión en español." (15)
3. "De un anuncio que ya vende a tu negocio digital en español, con datos reales y paso a paso." (18)
4. "SUPERNOVA te muestra qué ya se vende con anuncios reales y te ayuda a hacer tu versión." (17)
5. "Modela un negocio que lleva meses pagando anuncios y ten tu versión lista para vender en español." (17)

### Elegida: la 1

- **Dice qué haces tú** (elige, haz), no qué hace la app: la persona se ve haciendo algo.
- **Lleva la prueba de venta** ("más de 90 días pagando anuncios"): es el ángulo que ni anai ("video
  listo en 15 minutos") ni Quantum Miner ("la oferta ganadora ya existe") tienen con un número real.
- **Dice para quién** sin decirlo: "en español" = hispano; "negocio digital" = sin inventario.
- **Es verdad hoy**: 280 de 300 ganadoras pasan de 90 días.
- La 2 es la más corta pero no tiene verbo para la persona. La 3 es bonita pero "anuncio" confunde a
  quien no sabe que el negocio se encuentra por sus anuncios. La 4 no tiene número. La 5 usa
  "modela" (correcto por manual) pero "meses" es más blando que "90 días".

---

## 3. Titular, subtítulo y botón

### Hero de la landing (aplicado en `src/components/landing/Hero.tsx`)

- Kicker: "Anuncios reales de Meta · Más de 90 días pagando · Tu versión en español"
- Titular: **Elige un negocio digital que lleva más de 90 días pagando anuncios.**
  *Haz tu versión en español.* (en ámbar e itálica, como estaba)
- Subtítulo: "Nadie paga anuncios tres meses por algo que no vende. SUPERNOVA te muestra esos
  negocios con datos reales de la Biblioteca de Anuncios de Meta y te lleva hasta tu versión: la
  oferta, el precio en tu moneda, tus primeros anuncios y qué hacer con tus números. **Paso a paso y
  en español, aunque empieces de cero.**"
- Botón principal: "Ver qué ya se vende · 3 días gratis" · Botón secundario: "Cómo funciona"
- Línea pequeña (sin cambios): "3 días gratis con acceso a todo · Luego $29,99/mes · Si cancelas
  antes, pagas $0"

### Bienvenida del Inicio (PROPUESTA, `src/pages/DashboardPage.tsx`, no estaba en mi lista)

- Titular: se mantiene "¿Qué quieres hacer hoy?" (decisión de Jean, navegación por intención).
- Subtítulo: "Elige un negocio que lleva más de 90 días pagando anuncios, o crea la pieza que
  necesitas hoy." (hoy dice "Toca una herramienta y empieza ya.")
- Botón sin plan: "Empezar: 3 días gratis" (hoy "Empieza tus 3 días gratis"; cambio menor).
- Banner sin plan: "Estás viendo SUPERNOVA sin plan. Cada oferta de abajo lleva más de 90 días
  pagando anuncios de verdad; con PRO la vuelves tu versión en español. Los primeros 3 días son
  gratis y, si no terminas tu producto en 30 días, te devolvemos el 100 %."

---

## 4. Cambios HECHOS

| Archivo | Qué |
|---|---|
| `src/components/landing/Hero.tsx` | Kicker sin cifras fijas (las de antes estaban viejas); titular, subtítulo y botones con la frase. Mismo diseño (Playfair/Inter), misma estructura. |
| `index.html` | `<title>`, `description`, `og:title`, `og:description`, `twitter:title`, `twitter:description` con la frase. Ojo: en el build este archivo pasa a ser **`app.html`** (`vite.config.ts`), así que estos metas son los de la app (`/app`), no los de la portada. |
| `app.html` | No existe en la raíz: lo genera el build desde `index.html`. Nada que editar. |

Verificación: `npx tsc --noEmit -p tsconfig.app.json | grep -E "landing/Hero|index.html"` → vacío.
`npx vitest run` → 47 archivos, 330 pruebas, todo en verde.

**Importante:** este Hero NO se ve en producción hasta que alguien decida qué landing manda (ver
propuesta P1). Hoy la portada real es `public/fundador/index.html`.

---

## 5. Cambios PROPUESTOS (con prioridad y diff)

### P1 · ALTA · La portada real (`public/fundador/index.html`) con la frase y sin contradicción

El titular vive dentro de `<script type="__bundler/template">` (línea 418) como string escapado y
también en el HTML visible. Reemplazos de cadena (aplicar en los dos sitios):

```diff
- <title>SUPERNOVA — Descubre qué vender, valídalo con datos y crea tus anuncios</title>
+ <title>SUPERNOVA — Negocios que ya venden, tu versión en español</title>

- <meta name="description" content="El sistema completo para vender productos digitales en español: descubres qué vender, lo validas con datos reales, lo haces tuyo, creas tus anuncios y decides con tus números. 7.5…">
+ <meta name="description" content="Elige un negocio digital que lleva más de 90 días pagando anuncios reales en Meta y haz tu versión en español, paso a paso. 3 días gratis.">
  (igual en og:title / og:description)

- Cada día te mostramos ofertas que ya se venden en otro país. Tú haces la tuya.
+ Elige un negocio digital que lleva más de 90 días pagando anuncios. Haz tu versión en español.

- Llevan meses pagando anuncios: por algo será. SUPERNOVA te guía paso a paso para hacer tu versión en español y anunciarla.
+ Nadie paga anuncios tres meses por algo que no vende. SUPERNOVA te muestra esos negocios con datos reales de Meta y te lleva hasta tu versión: oferta, precio en tu moneda y tus primeros anuncios. Paso a paso, aunque empieces de cero.

- Luego US$19,99 el primer mes con FUNDADOR
+ Luego US$29,99/mes
```

Y quitar el banner "La oferta de fundador cerró…" o dejarlo solo con "Prueba 3 días gratis y
luego $29,99/mes · después de pagar, crea tu cuenta con el mismo correo". Las dos cosas a la vez no
pueden estar.

Decisión que necesita Jean: ¿la portada sigue siendo el HTML estático de fundadores o vuelve la
landing de React? Mantener dos es la causa de que digan cosas distintas.

### P2 · ALTA · Cifras reales en la portada

`7.517 ofertas / 114.000 anuncios / 300 ganadoras` están fijas en el HTML. Hoy: 12.920 ofertas y
~145.000 anuncios. Opciones: (a) leerlas del RPC `landing_teasers` (caché, ya existe) y pintarlas;
(b) si se quedan fijas, redondear y fechar: "más de 12.000 ofertas analizadas (oct-2026)". Nunca un
número exacto que caduca.

### P3 · ALTA · Inicio de la app (`src/pages/DashboardPage.tsx`)

```diff
- <p className="mt-1 text-[13px] md:text-[14px] text-muted-foreground">Toca una herramienta y empieza ya.</p>
+ <p className="mt-1 text-[13px] md:text-[14px] text-muted-foreground">Elige un negocio que lleva más de 90 días pagando anuncios, o crea la pieza que necesitas hoy.</p>

- <b>Estás viendo SUPERNOVA sin plan.</b> Mira todo lo que puedes hacer; lo que tiene candado se abre con PRO. Los primeros 3 días son gratis y, si no terminas tu producto en 30 días, te devolvemos el 100 %.
+ <b>Estás viendo SUPERNOVA sin plan.</b> Cada oferta de abajo lleva más de 90 días pagando anuncios de verdad; con PRO la vuelves tu versión en español. Los primeros 3 días son gratis y, si no terminas tu producto en 30 días, te devolvemos el 100 %.
```

### P4 · MEDIA · El asistente dice la misma frase (`src/components/HelpAssistant.tsx`)

```diff
- const SYSTEM_PROMPT = `Eres el asistente de ayuda de SUPERNOVA, una plataforma para encontrar negocios digitales que ya están vendiendo y crear tu propia versión.
+ const SYSTEM_PROMPT = `Eres el asistente de ayuda de SUPERNOVA. En una frase: la persona elige un negocio digital que lleva más de 90 días pagando anuncios reales en Meta y hace su versión en español. Si alguien pregunta "¿qué es SUPERNOVA?", responde exactamente eso.
```

### P5 · MEDIA · Ejemplos inventados en el live feed de React (`src/components/landing/LiveFeed.tsx`)

"SkinGlow Official", "EnvíoShop México", "Finanzas Sin Miedo" con puntajes y días no existen. El
manual prohíbe datos inventados aunque diga "Ejemplos". La portada estática ya usa ofertas reales
(`landing_teasers`): hacer lo mismo aquí o quitar la tarjeta.

### P6 · BAJA · Palabras

- En la portada estática las etiquetas dicen "LO COPIO". Manual: decir "modelar". Cambiar a
  "MODELAR" / "Hacer mi versión".
- Nombres internos en la portada (Mándala, Oráculo, Bóveda, Cazador) → decir qué hacen: "tus
  primeros 5 anuncios", "analiza una página de ventas", "215 ganchos reales", "sigue una oferta".
- "Ver demostración" en `VslSection.tsx` no reproduce nada (placeholder). Quitar la sección hasta
  tener el video.

---

## 6. Lo que no pude comprobar

- **No vi el nuevo Hero en producción**: en PROD `/` sirve el HTML estático, no el React. Lo que
  edité se ve solo en `npm run dev` (no levanté el servidor; tsc y vitest en verde).
- **Qué cuenta "7.517 ofertas analizadas"**: mi 12.920 son filas de `offers` sin `excluded_reason`; si
  "analizadas" incluye excluidas, el número real es aún mayor. Anuncios: estimación de `pg_class`
  (no hice `count` exacto sobre `winning_ads`, por el manual).
- **La competencia solo en su primera pantalla**: anai = "Tu próximo video listo para publicar en 15
  minutos" + carrusel de videos verticales + marquesina; Quantum Miner = "LA OFERTA GANADORA YA
  EXISTE. CONSTRUÍ LA TUYA." + live feed de mega winners ("+680 nuevas ayer", "95 mega winners
  activos"). Los dos se entienden en 5 segundos. No miré planes ni interior.
- **El Inicio de la app con sesión**: no inicié sesión; lo que digo del Inicio sale del código
  (`DashboardPage.tsx`).
- **Qué entiende alguien en 5 segundos en nuestra portada (lo que vi yo):** banner naranja con
  FUNDADOR, titular "ofertas que ya se venden en otro país", tres tarjetas con "LO COPIO" y "102 días
  con anuncios". Entiende "esto muestra ofertas de otros países" y "cuesta $29,99". No entiende que
  él va a tener su propio negocio en español ni qué significa "días con anuncios" sin leer más.
