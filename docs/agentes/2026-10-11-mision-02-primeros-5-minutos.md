# Misión 02 · Los primeros 5 minutos (11-oct-2026)

Probado en producción (https://supernova-six-eta.vercel.app/app?r=m2#/) con la cuenta de la probadora
Hany, en el Chrome del dueño, como alguien que no sabe nada de la app. Los cambios de código están
solo en local (sin commit, sin deploy).

---

## 1. Veredicto

**De 10 personas nuevas, hoy pagarían 4 tras los primeros 5 minutos. Con los cambios hechos aquí y
las 3 propuestas de prioridad ALTA, 6 o 7.**

Por qué 4 y no más:

- Lo bueno: el camino más corto existe y funciona. Inicio → «Ofertas que venden» → «Hacer mi
  versión» → confirmar = **3 clics, 2 pantallas y 2 min 13 s** hasta tener una pieza real guardada
  (entré a las 12:34:45; cobro de 50 créditos a las 12:36:17 verificado en Mis créditos → Historial
  como «Mi App · Military Calisthenics HQ −50»; resultado completo en pantalla a las 12:36:58).
- Lo que frena: (a) nadie le dice a la persona que ese es el camino: ninguna tarjeta decía
  «Empieza aquí» y la cabecera solo decía «Toca una herramienta y empieza ya»; (b) la pieza que
  recibe son **tres prompts para pegar en ChatGPT, Claude, Lovable, Bolt o v0**: a un principiante de
  RD o Colombia esos nombres no le dicen nada y la app lo manda fuera justo cuando debería
  retenerlo (y le dice que haga sus anuncios en ChatGPT cuando SUPERNOVA tiene «Tus primeros 5
  anuncios»); (c) el buscador no entendía frases de principiante («quiero vender un curso» → «Nada»);
  (d) las tres primeras ofertas que ve están en inglés y para Estados Unidos/Brasil.
- La emoción llega a medias: «Tu versión de este negocio» con «Tu ángulo mejorado» sí emociona
  (está bien escrito, en español, sin promesas), pero viene envuelta en un muro de texto técnico.

## 2. La app en una línea

**SUPERNOVA te muestra qué negocios digitales ya están vendiendo (llevan meses pagando anuncios) y
te arma tu propia versión, con precio en tu moneda, página, anuncios y WhatsApp, en minutos.**

## 3. Top 5 fallos (con pasos exactos)

### F1 · El buscador no entiende frases de principiante — ARREGLADO en el Inicio, PROPUESTO en el global
Pasos: Inicio → campo «Busca: carrusel, video, página de ventas…» → escribir cualquiera de estas:
«quiero vender un curso», «anuncio para mi ebook», «no sé qué vender», «imagen para instagram»,
«pagina web», e incluso «vender» o «curso» a secas. Resultado en las 7: «Nada con "…". Prueba con
otra palabra o pregúntale al asistente». Causa: buscaba la frase entera como texto seguido.
El buscador de la cabecera (⌘K, `GlobalSearch.tsx`) falla igual con «quiero vender un curso»
(«No encontramos nada»): exige que TODAS las palabras, incluidas «quiero» y «un», estén en la ficha.

### F2 · «Hacer mi versión» saca a la persona de la app y compite con nuestras herramientas — PROPUESTO
Pasos: Ofertas ganadoras → primera tarjeta → «Hacer mi versión · 50 créditos» → confirmar → esperar
~1 min. Se recibe: «PROMPT 1 · Tus anuncios (pégalo en Claude, ChatGPT u otra IA)», «PROMPT 2 · Tu
mini app (pégalo en la herramienta de IA que uses para crear apps)», «PROMPT 3 · Revisa tu negocio…
(pégalo en Claude, ChatGPT…)» y «Cómo usar estos prompts: Copia el PROMPT 2 y pégalo en Lovable,
Bolt, v0 u otra». Para quien empieza de cero no hay siguiente clic dentro de SUPERNOVA en esa
pantalla salvo el país y «Vender por WhatsApp / Video de ventas» al final. El PROMPT 1 manda a hacer
en ChatGPT lo que hace «Tus primeros 5 anuncios». Además: «Tienes 21118 créditos · te quedan 21068»
sin formato español (21.118) y el botón de confirmar no es ámbar (el único botón de pago del flujo).

### F3 · Nadie dice por dónde empezar — ARREGLADO
Pasos: Inicio, pestaña «Lo esencial». Ninguna tarjeta llevaba la etiqueta «Empieza aquí» (el
`featured` solo lo tenía «Ideas de side hustle», que está oculta desde el 05-oct). La cabecera decía
«Toca una herramienta y empieza ya» sin decir cuál. «Ver todas las herramientas (34)» contradecía
la pestaña «Todo 20». «Tus proyectos recientes» vacío decía «Aquí aparecerá lo que crees» sin botón.

### F4 · El asistente manda a pantallas que el usuario no tiene — PROPUESTO
Pasos: burbuja → «Empiezo de cero y no sé qué vender, ¿qué hago primero?». Respuesta: «… 2.
**Mercado (Ideas para WhatsApp)**: la IA te propondrá 5 productos…». «Mercado» está en
`ADMIN_ONLY_PAGES` (`src/lib/features.ts`): Hany no lo ve ni en el menú ni en el buscador.
Segunda pregunta «¿Cómo hago una imagen para mi anuncio de Facebook?» → «ve directo a **Creativos
para anuncios** dentro del menú **Crea con IA**»: en el menú se llama «Creativos y fotos» bajo
«2 · Crear». Las otras dos respuestas (imagen: pasos N1/estilo/crear, 6 créditos por imagen;
carrusel: 15 créditos, ruedita ámbar arriba a la derecha) fueron completas y correctas.

### F5 · Las primeras ofertas que ve un latino están en inglés y la app ya sabe su país — PROPUESTO
Pasos: Ofertas ganadoras (filtro por defecto «Todos los mercados»). Tarjetas 1-3: «Military
Calisthenics HQ» (Colombia, pero en inglés), «Keto 10-day Challenge» (Brasil), «Build 3 AI Agents
That Run Your Business» (Estados Unidos). La app pregunta edad y país al entrar
(`AgeCountryGate`): con eso podría preseleccionar mercado/idioma. Regla del manual: «la app no
pregunta lo que puede deducir»… y aquí deduce y no lo usa.

Otros puntos de duda anotados (menores):
- Dos buscadores en la misma pantalla (cabecera «Buscar herramientas, ofertas o lo tuyo» y el del
  panel) que responden distinto a la misma frase.
- Dos botones flotantes ámbar abajo a la derecha (rayo y burbuja) sin texto: el rayo no se entiende.
- «Vender esto: usarlo como mi producto» abre un `window.confirm` nativo cuando la ficha ya tiene
  producto (`src/lib/sellThis.ts` y `GemeloFlow.tsx`): un diálogo gris del sistema en medio de una
  app negra; en la prueba automatizada congeló la pestaña y hubo que recargar.
- «Tu camino» → paso 1 decía «Elige · Clona · Cobra», «Clonar esta oferta», «Ahora la clonamos»:
  choca con la regla de decir «modelar». ARREGLADO.
- «Lo que creaste» mostró «Guardados (2)» con dos «Mi App · Military Calisthenics HQ» idénticas
  (el historial solo registra un cobro de 50; puede ser el auto-guardado + «Guardar» de otro agente).
- Vi «Tu socio está armando tu semana…» más de 20 s sin resultado (puede ser arranque en frío).

## 4. Cambios HECHOS (solo local; `tsc` limpio en mis archivos, `vitest run` 49 archivos / 335 pruebas en verde, eslint sin errores)

### `src/pages/DashboardPage.tsx`
- **Buscador por palabras**: `searchWords()` quita relleno («quiero», «para», «mi», «un», «no», «sé»,
  «qué»…) y busca cada palabra por su raíz («anuncios» → «anunc», «vender» → «vende», «imágenes» →
  «image», «fotos» → «foto»). `searchTools()` devuelve primero las herramientas que tienen todas las
  palabras; si ninguna, las que tienen alguna. Título y nombre de menú pesan 3, descripción y palabras
  clave 1. Empates: gana el orden de «Lo esencial». Probado (prueba temporal, borrada):
  «quiero vender un curso» → Ofertas, Carrusel, 5 anuncios, Robot de copy · «anuncio para mi ebook» →
  5 anuncios, Radar, Creativos, Video · «no sé qué vender» → Ofertas… · «imagen para instagram» →
  Creativos, Carrusel · «pagina web» → Página de ventas, Robot de copy · «cuánto cobrar» → Precio ·
  «video para tiktok» → Video con IA… · «xyzxyz» → nada.
- **Sin resultados**: ya no es una línea muerta: caja con «Prueba con una palabra más corta…», botón
  **Preguntarle a la IA** (abre el asistente con la frase escrita, gratis) y «Ver todas las
  herramientas».
- **«Empieza aquí»** en la primera tarjeta de «Lo esencial» (cuadrícula y lista), sin tocar el
  `featured` de `tools.ts`.
- **Cabecera**: «Toca una herramienta y empieza. ¿Primera vez? Abre «Ofertas que venden», elige una
  y toca «Hacer mi versión»: en 2 minutos tienes tu negocio armado.»
- **Proyectos recientes vacío**: «Todavía no has creado nada…» + botón «Crear lo primero» → Ofertas.
- «Ver todas las herramientas (N)» ahora cuenta las mismas 20 que la pestaña «Todo».
- `visibleAll` ordena «Lo esencial» primero (solo afecta el orden del buscador).

### `src/lib/tools.ts` (solo textos y orden)
- **Orden de «Lo esencial»**: ofertas, creativos, carrusel, anuncios, copy, radar, videoanuncio,
  miniaturas, personaje, producto, precio, contenido (primero lo que deja una pieza en minutos).
- **Palabras clave de principiante** en ofertas («que vender», «curso», «ebook», «empezar cero»,
  «hacer mi version»…), radar, creativos («imagen», «post», «publicacion», «primer anuncio»…),
  videoanuncio, carrusel, copy («pagina web», «sitio», «ebook», «curso», «vender», «whatsapp»),
  anuncios («facebook», «instagram», «primer anuncio»…), ganchos, miniapps, dolores, producto, precio
  («cuanto vale», «dolares», «pesos»), recuperar («mensaje», «cliente»), contenido («publicar»,
  «gratis», «sin anuncios»).

### `src/components/journey/GemeloFlow.tsx`
- «Elige · Clona · Cobra» → «Elige · Modela · Cobra»; «Clonar esta oferta» → «Modelar esta oferta»;
  «Ahora la clonamos, gratis» → «Ahora la modelamos, gratis»; «Copiamos lo que ya funciona de «X» y
  lo adaptamos a tu país» → «Tomamos lo que ya funciona de «X» y lo adaptamos a tu país: mismo
  producto, mismo precio, en tu idioma y con tus pagos»; «Revisa lo que se copia» → «Revisa lo que
  se toma de la original». Subtítulo del paso 1: «…Toca una y en 2 toques tienes tu versión, gratis.»
  (Los nombres internos `gemelo_clonar`, `CloneTable` no se tocaron.)

### `src/components/journey/BusinessJourney.tsx`
- Etapa 1: «Escoge una oferta que ya se vende y haz tu versión: queda en tu ficha, gratis.»

## 5. Cambios PROPUESTOS (con prioridad y diff)

### P1 · ALTA · «Hacer mi versión» debe cerrar dentro de la app (`supabase/functions/oraculo-generate/index.ts`, `src/components/MiniAppModal.tsx`)
Función del servidor: necesita OK de Jean para desplegar.
```diff
-## 🎯 PROMPT 1 · Tus anuncios (pégalo en Claude, ChatGPT u otra IA)
+## 🎯 PROMPT 1 · Tus anuncios (o créalos aquí mismo en «Tus primeros 5 anuncios», sin salir de SUPERNOVA)
```
Y en el pie del modal, un botón principal ámbar que use la tarjeta «Crear anuncios» que ya existe
en la oferta:
```diff
 {phase === "done" && (
+  <button onClick={() => { onClose(); onNavigate?.("Mándala"); }}
+    className="btn-primary-nova px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2">
+    <Orbit className="w-4 h-4" /> Crear mis 5 anuncios aquí
+  </button>
   <button onClick={() => void sell(brief ?? { product: ad.title })} …>
```
En «Cómo usar estos prompts», cambiar «pégalo en Lovable, Bolt, v0 u otra» por «pégalo en una
herramienta que crea apps con IA (por ejemplo Lovable); si no tienes una, usa «Vender por WhatsApp»
abajo: no necesitas app para empezar».

### P2 · ALTA · El buscador global con la misma lógica (`src/components/GlobalSearch.tsx`, líneas 79-86)
Mover `searchWords`/`searchTools` de `DashboardPage.tsx` a `src/lib/toolSearch.ts` (así tampoco salta
el aviso de eslint `react-refresh/only-export-components`) y usarlo en los dos buscadores:
```diff
-  const term = norm(q.trim());
   const tools = useMemo(() => {
     const all = [...TOOLS, ...ADMIN_EXTRA_TOOLS].filter(t => canSee(t.key));
     if (!term) return all.filter(…).slice(0, 5);
-    const words = term.split(/\s+/);
-    return all.filter(t => {
-      const hay = norm(`${t.title} ${t.nav} ${t.desc} ${t.keywords}`);
-      return words.every(w => hay.includes(w));
-    }).slice(0, 8);
+    return searchTools(q, all).slice(0, 8);
```
Prueba sugerida `src/lib/toolSearch.test.ts` (la que usé, pasa en verde):
```ts
expect(searchWords("quiero vender un curso")).toEqual(["vende", "curso"]);
expect(ids("quiero vender un curso")[0]).toBe("ofertas");
expect(ids("no sé qué vender")[0]).toBe("ofertas");
expect(ids("imagen para instagram")[0]).toBe("creativos");
expect(ids("cuánto cobrar")[0]).toBe("precio");
expect(ids("xyzxyz")).toEqual([]);
```

### P3 · ALTA · El asistente no debe recomendar pantallas solo-admin ni nombres que no existen (`src/components/HelpAssistant.tsx`, SYSTEM_PROMPT)
```diff
-5b. **Mercado**: para quien aún no tiene producto. Dos pestañas: …
+5b. **Mercado** (EN PAUSA, solo lo ven los administradores: NUNCA lo recomiendes a un usuario; si
+   alguien no tiene producto, mándalo a **Ofertas ganadoras** → «Hacer mi versión» o a **Mini Apps**). …
```
```diff
-… y **Crea con IA** (Creativos para anuncios, Anuncio en video, …)
+… y **2 · Crear** (Creativos y fotos, Video con IA, Creador de YouTube, Carrusel que vende,
+  Miniaturas, Influencer IA, Robot de copy; usa SIEMPRE estos nombres, son los del menú)
```
Regla extra para el prompt: «Cada respuesta termina con UNA acción concreta dentro de la app
(pantalla + botón), nunca con una pregunta abierta».

### P4 · MEDIA · Números en formato español en el modal de la mini app (`src/components/MiniAppModal.tsx`, línea 391)
```diff
-  ? `Tienes ${balance} créditos · te quedan ${balance - price} · listo en 1 o 2 minutos`
-  : `Tienes ${balance} créditos · te faltan ${price - balance}`}
+  ? `Tienes ${balance.toLocaleString("es")} créditos · te quedan ${(balance - price).toLocaleString("es")} · listo en 1 o 2 minutos`
+  : `Tienes ${balance.toLocaleString("es")} créditos · te faltan ${(price - balance).toLocaleString("es")}`}
```
Y el botón «Hacer mi versión · 50 créditos» de ese modal con `btn-primary-nova` (es la acción
principal y la única que cobra).

### P5 · MEDIA · Mercado por defecto según el país de la persona (`src/pages/OffersPage.tsx` o donde viva el filtro «Todos los mercados»)
Leer `user_age_country` (ya existe) y preseleccionar: país del usuario si hay ≥ 12 ofertas
ganadoras ahí; si no, «Español» (RD, CO, MX, AR, ES, PE, CL). Mostrar el chip «Tu país · cambiar»
para que se note que se puede quitar. Sin tocar `winner_score` ni el orden por días.

### P6 · MEDIA · `featured: true` en `ofertas` en `tools.ts` (la bandera hoy solo la tiene «ideas», oculta)
```diff
-  T({ id: "ofertas", key: "Ofertas", icon: Gem, title: "Ofertas que venden", …
+  T({ id: "ofertas", key: "Ofertas", icon: Gem, featured: true, title: "Ofertas que venden", …
```
Con esto «Empieza aquí» también sale en el buscador global (que filtra por `featured`) y en «Todo».
No lo hice porque la misión me limitaba a textos y orden en `tools.ts`.

### P7 · MEDIA · Reemplazar `window.confirm` por una confirmación propia (`src/lib/sellThis.ts`, `GemeloFlow.tsx` línea ~100, `MiniAppModal.tsx`)
Un diálogo del sistema rompe el diseño y bloquea la página. Propuesta: `sell()` devuelve
`{ needsConfirm: true, current }` y el botón muestra en línea «Tu ficha ya tiene «X». ¿Reemplazarlo?
[Sí, usar este] [Cancelar]».

### P8 · BAJA · Un solo buscador visible en el Inicio
Ocultar el campo de la cabecera cuando la pantalla es el Inicio (o al revés), para que la persona no
tenga dos cajas que responden distinto.

### P9 · BAJA · Texto en el botón flotante del rayo
Añadir `aria-label` y tooltip («Tus créditos» o lo que sea) al botón ámbar del rayo; hoy no se
sabe qué hace sin pulsarlo.

## 6. Lo que NO pude comprobar

- **Nada en producción**: los cambios de código son locales (sin commit ni deploy); el buscador nuevo
  se verificó con una prueba de vitest temporal (borrada) y `tsc`, no en la app desplegada.
- **Una cuenta realmente nueva**: la de Hany comparte estado con los otros 9 agentes (ya tenía ficha
  «Programa digital de ejercicio…», proyectos recientes, el banner «Lanzando tu versión de Muscle
  Booster», 4 ofertas seguidas y país Colombia). No vi la pantalla de edad/país, la vitrina sin plan
  ni el tour de 1 minuto.
- **La causa del congelamiento** al pulsar «Vender esto»: lo deduzco del `window.confirm` en
  `sellThis.ts` (la ficha ya tenía producto), no lo reproduje por no gastar otros 50 créditos.
- **El duplicado «Guardados (2)»**: no sé si fue mi flujo o el de otro agente.
- **«Tu semana»**: se quedó en «Tu socio está armando tu semana…» más de 20 s; no vi el plan.
- **Teléfono**: todo fue en escritorio (1384 px).
- **Las otras dos preguntas sugeridas** del panel «Pregúntale a la IA» del Inicio (solo probé la
  burbuja con 3 preguntas propias).
