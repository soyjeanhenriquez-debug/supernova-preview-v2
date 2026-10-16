# Organizar SUPERNOVA para que nadie se pierda (16-oct-2026)

Pedido de Jean: "el usuario ni siquiera sabe qué producto está trabajando, no sabe cómo modelar un Reel
después de analizarlo, todo está sin organizar". Meta: una app tan clara como Higgsfield o HeyGen,
donde siempre sabes dónde estás, qué sigue y cómo volver.

Base: 3 auditorías hechas hoy (navegación, flujo de 13 herramientas, y cómo lo resuelven Higgsfield y
HeyGen). Nada de esto está construido todavía: es la propuesta para decidir.

---

## 1. Lo que encontramos (lo más grave)

1. **No se ve para qué producto trabajas.** Sube tu video, Analiza un Reel, Video con IA, Motion,
   Ganchos, Mándala y Precio usan el producto activo sin decirlo. El mismo producto aparece con 3
   nombres (ficha, nombre que le pusiste, nombre de la oferta).
2. **"Hacer mi versión" reemplaza tu producto sin que lo notes.** No crea uno nuevo: pisa la ficha
   del producto activo ("Sí, cambiarla" / "Cancelar"). Por eso "Mis versiones" casi siempre tiene uno.
3. **Las herramientas terminan en un callejón.** Analiza un Reel da el guion y dice "súbelo en Sube tu
   video", sin botón. Cambiar de pestaña borra el análisis que ya pagaste. Lo mismo pasa al cambiar de
   modo en Creativos, Video y Generadores: se pierde el trabajo sin aviso.
4. **Cada herramienta está armada distinto.** Solo 5 de 13 tienen pasos visibles y cada una a su
   manera. Hay 7 sistemas de "pasos" que no se hablan (Tu camino, NextStepCard, barra de lanzamiento,
   Mándala, kits, Influencer, Gemelo).
5. **El botón Atrás no funciona dentro de una herramienta.** Cada pantalla tiene dirección, pero los
   pasos internos viven en memoria: Atrás te saca de la herramienta y recargar te devuelve al inicio.
   No hay migas de pan ("Crear › Con tu cara › Analiza un Reel") en ninguna pantalla.
6. **Cuatro nombres para "lo mío":** Mis versiones, Mis productos, Lo que creaste, Tus creaciones.
   Y Mi ficha (lo que define el producto) está escondida en "Más herramientas".
7. **El título no coincide con el menú.** "Tus primeros 5 anuncios" abre "Mándala Creativa · Mi negocio
   · Etapa 5". La barra de arriba muestra claves internas ("Creativos", "Con tu cara").
8. **Cambiar de producto te manda a Hoy** y pierdes dónde estabas.
9. **Hay 6 formas distintas de pasar algo de una herramienta a otra** (notas sueltas en el navegador),
   y varias fallan: Ganchos → "Escribir textos" abre la lista de generadores sin elegir ninguno.
10. **Dos herramientas se bloquean por ficha incompleta** (Generadores, Motion, Influencer IA), aunque el
    manual dice que ninguna herramienta se bloquea.

Lo bueno que ya existe y se reutiliza: PageHeader, el selector de producto, el paso a paso de la Mándala
(tiene listo/activo/volver), el panel "Siguiente paso" de Ofertas, las direcciones por pantalla
(`pageSlugs`) y el catálogo único de herramientas (`lib/tools.ts`).

## 2. Lo que hacen Higgsfield y HeyGen que nos sirve

- Menú por **resultado** (Imagen, Video, Avatar), no por tecnología. Higgsfield tiene una tabla
  "Si quieres… → usa esto". Su crítica más repetida: demasiadas funciones y navegación partida.
- **Contexto visible como chips** dentro de cada herramienta (marca, avatar, voz) que se cambian ahí
  mismo, sin salir. HeyGen aplica el "Brand Kit" solo, en todas las herramientas.
- **Mismo patrón en todo:** elegir → configurar en un panel → "Generar" con el costo en el botón →
  resultado con acciones para seguir ("Convertir en video", "Usar como referencia", "Rehacer",
  "Publicar").
- **Plan gratis antes de gastar:** HeyGen arma el guion, tú lo ajustas, y apruebas viendo los créditos.
- **Una sola biblioteca** (Assets / Projects) que hace de historial.
- **Inicio con lista de avance** ("3/4 de tu cuenta lista") y plantillas para empezar.

## 3. La propuesta: 5 reglas para toda la app

1. **Siempre sabes para quién trabajas.** Una barra de contexto arriba de cada herramienta:
   `Para: Muscle Booster ▾` · `Vía: Con marca ▾` · créditos. Se cambia ahí mismo, sin salir de la
   pantalla. Un solo nombre para el producto en toda la app (la ficha).
2. **Todas las herramientas tienen el mismo esqueleto** (estilo Higgsfield):
   - Arriba: migas ("Crear › Con tu cara › Analiza un Reel"), botón **Volver** y pasos `1 · 2 · 3`.
   - En la computadora: opciones a la izquierda y resultado a la derecha. En el teléfono, uno debajo
     del otro.
   - Botón principal con el precio: **"Generar · 25 créditos"** y "si falla, no se cobra".
   - Resultado con **un botón principal de siguiente paso** + acciones para seguir en otra
     herramienta, y "Empezar de nuevo".
   - Antes de borrar trabajo, pregunta.
3. **Cada paso tiene su dirección.** Atrás vuelve un paso, recargar no pierde nada y se puede
   compartir el enlace (`#/con-tu-cara/reel/ABC123/version`).
4. **Una sola biblioteca: "Mis creaciones"**, por producto, con todo lo generado (Reels analizados,
   carruseles, anuncios, videos, textos), filtros por tipo y "abrir de nuevo". Reemplaza a Mis
   versiones / Lo que creaste / Tus creaciones. "Mi producto" (la ficha) sube al menú principal.
5. **Nada cambia tu producto a escondidas.** "Hacer mi versión" pregunta:
   **"Crear como producto nuevo"** (por defecto) o "Reemplazar Muscle Booster". Si ya tienes el
   máximo de productos del plan, ofrece reemplazar o archivar uno.

### Cómo se vería Analiza un Reel (la herramienta piloto)

1. **Pega el Reel** → muestra portada, cuenta y cifras ("@cuenta · 3.043 reproducciones").
2. **Elige cómo modelarlo:** Espejo (~90 %) · Adaptación (~75 %, recomendado) · Inspiración (~50 %),
   cada uno con una línea que dice qué se conserva. Debajo, `Para: Muscle Booster ▾` y "Personalizar
   (opcional)": nicho, palabra clave, oferta que empuja.
3. **Tu versión**, en pestañas: Por qué funciona · Teleprompter · Edición · Publicar. "Probar otro
   nivel · 5 créditos" sin volver a leer el video.
4. **Siguiente paso:** "Grabar con el teleprompter" (principal) · "Subir mi video para subtítulos" ·
   "Hacerlo carrusel" · "Agregar al calendario". Queda guardado en Mis creaciones.

## 4. En qué orden construirlo

| Fase | Qué entra | Por qué primero |
|---|---|---|
| **1. Base + piloto** | Barra de contexto, esqueleto de herramienta, direcciones por paso, y Analiza un Reel completo (niveles, pestañas, teleprompter, historial = bloques 3 y 5 del Analizador v2). | Arregla lo que más duele y deja el molde para todo lo demás. |
| **2. Pasar las herramientas al molde** | Carrusel, Sube tu video, Creativos, Video, Motion, Ganchos, Generadores, Mándala, Contenido. Un solo mecanismo para pasar cosas de una herramienta a otra. Quitar los bloqueos por ficha. | Con el molde listo, cada herramienta es trabajo parecido y se puede hacer en paralelo. |
| **3. Lo mío y los nombres** | "Mis creaciones" única, "Mi producto" en el menú, "Hacer mi versión" con nuevo/reemplazar, títulos iguales al menú, sin "Etapa N" ni claves internas. Menú del teléfono con acceso directo a Encontrar y Vender. | Necesita que las herramientas ya guarden igual (fase 2). |
| **4. Inicio inteligente** | Hoy con lista de avance ("2 de 4: elige qué modelar → crea tu primera pieza → publícala → mide") y "Si quieres… → usa esto". La vía se guarda por producto. | Es la cara de la app; se arma sobre lo anterior. |

Cada fase va en sus commits, con prueba en el navegador antes de subir.

## 5. Lo que decide Jean

1. ¿Va el esqueleto estilo Higgsfield (opciones a la izquierda, resultado a la derecha en computadora)?
2. Nombres: **"Mis creaciones"** para la biblioteca y **"Mi producto"** para la ficha.
3. "Hacer mi versión": **producto nuevo por defecto** (con el límite del plan) en vez de reemplazar.
4. Empezar por la **Fase 1 con Analiza un Reel** como piloto.
5. El manual habla de 4 secciones (Encontrar / Crear / Vender / **Ganar**), pero "Ganar" no existe en el
   menú. ¿Se crea (Recompensas, Mis créditos, Resultados) o se quita del manual?

### Decidido por Jean (16-oct-2026)

1. Esqueleto **estilo Higgsfield**: opciones a la izquierda y resultado a la derecha en computadora; en
   el teléfono, uno debajo del otro.
2. Nombres: **"Mis creaciones"** (todo lo generado) y **"Mi producto"** (la ficha, en el menú principal).
3. "Hacer mi versión" **crea un producto nuevo por defecto**; si ya está el máximo del plan, ofrece
   reemplazar o archivar uno.
4. Se crea la sección **"Ganar"** (Resultados, Recompensas, Mis créditos).
5. Se empieza por la **Fase 1** con Analiza un Reel como piloto.
