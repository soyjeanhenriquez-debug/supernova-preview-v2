# Tu mes de contenido + Publicar desde la app

**Fecha:** 07-oct-2026 · **Estado:** Jean decidió el 07-oct: **50 créditos** por mes armado y **publicar incluido en PRO**. Fase A escrita en local; Fase B espera contratar Upload-Post.
**Origen:** ficha 10 de `docs/investigacion/competencia.md` (Máquina IA de Nino Director promete
"tu contenido de 30 días en automático"). Jean eligió los puntos 1 y 2, pensados para **marcas
personales y venta orgánica en Instagram y TikTok**.

**La diferencia con él:** él vende skills que la persona instala en su propio Claude. Nosotros lo
damos hecho dentro de la app, para quien empieza de cero, y atado a una oferta que ya vende o a su
marca personal, con leads y ventas medidos.

---

## 1. Tu mes de contenido

### Qué ve la persona
En **Contenido**, arriba del calendario, una tarjeta: **"Arma tu mes"**.

1. Toca el botón. No responde nada: usamos lo que ya sabemos (producto activo, para quién, promesa,
   precio, oferta elegida). Si no tiene producto, usamos su país y lo que contó al entrar.
2. **Personalizar (opcional):**
   - ¿Para qué es tu contenido? **Vender mi producto** · **Crecer mi marca personal** · Las dos (por defecto: lo deducimos; sin producto = marca personal).
   - Redes: Instagram, TikTok (por defecto las dos).
   - Cuántas piezas por semana: 3 · 5 · 7 (por defecto 5).
   - ¿Muestras tu cara? Sí · No (si no, los videos salen para personaje IA o voz en off).
3. En unos segundos aparecen **30 días** en el calendario (o 12–28 piezas según la frecuencia).

### Cada día trae
- **Tema** (sale de búsquedas reales: el autocompletado que ya usa `content-ideas`, y de los ganchos del banco `hook_vault`).
- **Formato y red:** carrusel, reel/TikTok, historia, video largo.
- **Gancho** (primera frase o primera lámina).
- **Etapa:** Atraer / Conectar / Convertir (la misma Mándala).
- **Llamado a la acción** y, en los de Convertir, una **palabra clave** ("comenta GUÍA") que queda guardada en el tracker para contar leads.
- Botón **"Hacer esta pieza"** que abre la herramienta que ya existe con todo cargado: Carrusel que vende, Generadores (guion de Reels, captions), Influencer IA si no muestra la cara.

### La mezcla del mes
| Objetivo | Atraer | Conectar | Convertir |
|---|---|---|---|
| Crecer mi marca personal | 60 % | 30 % | 10 % |
| Vender mi producto | 40 % | 30 % | 30 % |
| Las dos | 50 % | 30 % | 20 % |

Para **marca personal** los temas Conectar usan su historia, opiniones y "detrás de cámaras";
nunca inventamos testimonios, cifras ni resultados (manual, sección Ética).

### Cómo se construye
- **Función nueva `content-month`** (o un modo nuevo de `content-ideas`): una sola llamada a
  Gemini Flash con el perfil + búsquedas reales + 20 ganchos del banco, devuelve JSON con 30 días.
  Compuerta: usuario real + `edge_guard_charge` (cobra antes, `refund_charge` si la IA falla).
- **Guarda en `content_items`** (tabla que ya existe, con RLS y tope de 500 filas): columnas nuevas
  `hook`, `cta`, `plan_id` (para rehacer o borrar un mes de golpe). `stage`, `kind`, `keyword`,
  `due` ya existen.
- Precio en `credit_prices` con id `content_month`.
- `ToolFeedback` ("¿Te sirvió?") en la tarjeta.
- Actualizar la guía de Contenido en `SYSTEM_PROMPT` de `HelpAssistant.tsx`.

### Precio (decisión de Jean)
- Costo real estimado: ~10.000 tokens de entrada + ~8.000 de salida en Gemini Flash ≈ US$0,02.
- Con la regla × 5 y el crédito a US$0,008 → mínimo **13 créditos**.
- **Propuesta: 20 créditos por mes armado** (rehacer una semana: 5). Cada pieza se cobra como hoy
  (carrusel 15, guion 15–30, etc.). Descubrir es barato; construir cuesta créditos.

### Esfuerzo
2 a 3 días de trabajo. **Sin costo externo.** Se puede hacer ya.

---

## 2. Publicar y programar desde la app

### Qué ve la persona
1. En Contenido → **"Conecta tus redes"**: botón que abre la pantalla de conexión con el logo de
   SUPERNOVA. Conecta Instagram y TikTok (y, si quiere, YouTube y Facebook).
   - Aviso claro: Instagram tiene que ser cuenta **Profesional (Creador o Empresa)**; incluimos el
     paso a paso de 3 toques para cambiarla.
2. En cada pieza terminada (carrusel, video) aparece **"Publicar"** con dos opciones:
   **Ahora** o **Programar** (día y hora; sugerimos la hora del día del calendario).
3. El tracker se marca solo: check en la red, enlace del post y, más adelante, vistas y comentarios
   reales en vez de anotarlos a mano.
4. En TikTok sale como **borrador** por defecto (la persona le pone el sonido en tendencia y lo
   publica desde su celular); opción de publicarlo directo.

### Proveedor recomendado: Upload-Post (comparación del 07-oct-2026)
| Clientes con redes conectadas | Upload-Post | Zernio (antes Late) | Ayrshare |
|---|---|---|---|
| 10 | US$50/mes (plan Professional) → US$5,00 por cliente | US$7,80 | US$29,90 |
| 50 | US$105 → **US$2,10** | US$6,36 | ~US$15,60 |
| 200 | US$438 → **US$2,19** (US$1,75 pagando el año) | US$3,09 | ~US$7,90 |

- Un "perfil" = un cliente nuestro con 1 Instagram + 1 TikTok + 1 YouTube + 1 Facebook.
- Marca blanca incluida desde Professional (el cliente no ve Upload-Post).
- Ya tiene aprobadas las APIs de Meta y TikTok. Hacerlo directo nos costaría 2 a 6 semanas de
  revisiones de Meta y TikTok, y mientras tanto TikTok solo publica en privado.
- El plan gratis no sirve: sin TikTok y 10 subidas al mes.
- **Pendiente de verificar:** qué pasa por encima de 225 perfiles y qué tan estable es (existe desde
  enero de 2025). Zernio queda de respaldo.

### Cómo se construye (seguridad primero)
- **Secreto `UPLOADPOST_API_KEY`** solo en el servidor. Nunca en el navegador ni en logs.
- **Tabla `social_accounts`** (RLS, cada quien lee la suya; solo el servidor escribe):
  `user_id`, `provider_profile` (= id interno del usuario, nunca un dato del cliente), redes
  conectadas, fecha.
- **Edge function `social-connect`:** usuario real + `edge_guard` → crea su perfil si no existe →
  devuelve el enlace de conexión con `redirect_url` a la app.
- **Edge function `social-publish`:** usuario real + `edge_guard_charge` → verifica que la pieza es
  suya → sube el archivo desde nuestro Storage → publica o programa → guarda `request_id` en la
  pieza.
- **Edge function `social-webhook`:** firma HMAC-SHA256 verificada → marca publicado, guarda el
  enlace y avisa si falló.
- **Archivos:** hoy los carruseles se dibujan en el navegador y los videos caducan a las 24 h.
  Hay que subirlos a un bucket privado `publish-media` (por usuario, RLS) y borrarlos a los 7 días
  de publicados. Son archivos del usuario, no catálogo; no toca el límite de 500 MB de la base
  (Storage va aparte, 1 GB en Free).
- Tope por usuario: 15 publicaciones al día por red (límite de TikTok) y lo que Jean decida al mes.
- Chequeo con la skill `chequeo-seguridad` antes de desplegar.

### Precio (decisión de Jean): tres caminos
Es un **costo fijo por cliente conectado** (US$2–5 al mes), no un gasto de IA por uso.

| Opción | Cómo | A favor | En contra |
|---|---|---|---|
| **A. Incluido en PRO** (recomendada) | Publicar no cuesta créditos; tope de 60 publicaciones al mes | Es la razón para pagar cada mes ("la app publica por ti"). Con US$29,99 contra US$2–5 de costo, el plan queda 6–15 veces arriba del costo. | Si 10 clientes conectan, pagamos US$50 fijos desde el primer día |
| B. Créditos por publicación | 10 créditos por publicación | Paga quien usa | 30 publicaciones = 300 créditos: se siente caro y frena el hábito |
| C. Solo en el plan Círculo/Comunidad | Publicar como ventaja del plan alto | Cubre el costo de sobra | Deja fuera a la mayoría; el competidor lo vende a US$47 |

### Esfuerzo y costo
- 4 a 6 días de trabajo.
- **Upload-Post Professional: US$50 al mes** (lo contrata Jean). Para la prueba con Jean y 3–4
  usuarios alcanza el plan Basic de US$24 (5 perfiles, con TikTok, sin marca blanca).

---

## 3. Después (no entra ahora)
- **"Comenta PALABRA → DM automático"** en Instagram con la misma API (`autodms`, solo Instagram,
  revisa comentarios cada 15 min, máximo 200 DM por hora). Cierra el círculo de venta orgánica.
- **Métricas reales por post** (vistas, comentarios) en el tracker, en vez de anotarlas a mano.
- Publicar los carruseles y videos de Jean en sus redes con la misma conexión.

---

## Orden propuesto
1. **Fase A — Tu mes de contenido** (sin costo externo). Se construye y se prueba en local; se
   publica cuando Jean lo vea.
2. **Fase B — Publicar.** Jean contrata Upload-Post (Basic para la prueba) y crea la llave; probamos
   con sus cuentas; luego 3–5 usuarios; luego todos.
3. **Fase C — DM automático y métricas.**

## Lo que decide Jean
1. Precio del mes armado: **20 créditos** (propuesto).
2. Publicar: **opción A (incluido en PRO con tope de 60/mes)**, B o C.
3. Contratar Upload-Post: Basic US$24 para la prueba, luego Professional US$50.
4. TikTok como borrador por defecto (recomendado) o directo.

## Lista de control del manual
1. ¿Quita o esconde anuncios? No.
2. ¿Encaja con el recorrido? Sí: etapa 5 Vender (Contenido) y "Roba como un artista" (temas y
   ganchos que ya funcionan).
3. ¿Toca dinero? Cobro en servidor antes de gastar, reembolso si falla, ≥ 5× costo.
4. ¿Datos de otros? Perfil de redes atado al id del servidor; RLS; webhook firmado.
5. ¿Promete algo? Sin promesas de vistas, seguidores ni ventas.
6. ¿Irreversible o producción? Contratar Upload-Post y desplegar, solo con OK de Jean.
7. ¿Cómo se verifica? Mes armado: llamar la función y leer `content_items`. Publicar: post real en
   las cuentas de Jean (con su sí) y leer el estado del webhook.
8. ¿Nos acerca a ganar? Sí: igualamos su promesa principal, sin instalar nada, y medimos ventas.
