# Las 37 herramientas: qué se queda, qué se fusiona y qué atajos faltan (07-oct-2026)

Prueba con 7 agentes-usuario (arquitecto, médica-nutrióloga, influencer, creadora de suscripción
—solo lo apto para redes—, creador sin cara, infoproductora low ticket, coach high ticket) que
recorrieron las 37 herramientas leyendo el código y la guía del asistente, más una investigación de
la comunidad de Adri Kastel. Todos buscan lo mismo: **contenido → clientes → ventas**.

Corrección a lo que dijeron los agentes: los clientes NO ven "Crear mi producto" ni "Descubrir
dolores" (el Inicio filtra `ADMIN_ONLY_PAGES`); Jean las ve por ser admin. El hueco real: la persona
low ticket no tiene dónde crear su producto mientras siga en piloto.

## 1. Lo que coincidieron casi todos

| # | Hallazgo | Agentes |
|---|----------|---------|
| 1 | Hay 8 tarjetas que abren el mismo Robot de copy (VSL, DM, ascensión, correos, Reels, textos, guion de YouTube, página) | 7 de 7 |
| 2 | "Video con IA", "Anuncio en video" y "Series" son el mismo estudio; no se sabe cuál usar | 7 de 7 |
| 3 | "Creativos", "Fotos estilo UGC" y "Foto de producto" son la misma pantalla con otro estilo | 6 de 7 |
| 4 | "Guion de YouTube" = pestaña Idea de "Videos para YouTube" | 6 de 7 |
| 5 | Cada herramienta empieza de cero ("¿Qué vendes?") en vez de usar el producto/oferta activos | 5 de 7 |
| 6 | Al terminar algo no hay "Siguiente" con todo puesto | 7 de 7 |
| 7 | "Agregar a mi tracker" solo está en Carrusel, YouTube y Anuncio en video | 4 de 7 |
| 8 | Falta un camino para servicio profesional (arquitecto, médica, coach) y para creador sin cara | 4 de 7 |
| 9 | "Mi negocio" (6 etapas), "Tu negocio" (low/high/marca) y "Mi ficha" confunden | 3 de 7 |

## 2. De 37 a 24 tarjetas (nada se borra del código: se fusionan pantallas y el buscador sigue encontrando todo)

| Queda | Absorbe | Cómo |
|-------|---------|------|
| **Imágenes para vender** (`creativos`) | `fotosugc`, `fotoproducto` | Selector de estilo: Anuncio · Persona usándolo · Foto de producto |
| **Video con IA** (`videoia`) | `videoanuncio`, `series`, (`video` admin) | Modo: Escena libre · Anuncio 3 tomas · Serie |
| **Videos para YouTube** (`creadoryt`) | `youtube` | El guion es su pestaña Idea |
| **Robot de copy** (`copy`) en 3 kits | `vsl`, `dm`, `ascension`, `correos`, `reels`, `captions`, `paginas` | Kit Lanzar (página → bump → correos), Kit Llamada (VSL → DM → ascensión → correos), Kit Contenido (Reels → textos). Cada nombre sigue en el buscador |
| **Tus primeros 5 anuncios** (`anuncios`, Mándala) | `resultados` | Pestaña "Medir y escalar" dentro |
| **Ganchos** | generadores hooks-meta / hooks-tiktok | "Escríbelos con IA" dentro |
| **Order bump** / **Recuperar ventas** | generadores order-bump / whatsapp-sequence | El Robot enlaza a sus pantallas |

Se quedan igual: Radar y Ofertas (el catálogo es el producto: se enlazan entre sí, no se fusionan),
Nichos de YouTube, Mini Apps, Carrusel, Miniaturas, Influencer IA, Validar, Precio, Plan, Contenido.

## 3. Atajos (al terminar X → botón a Y con todo puesto)

1. **Oferta → "Modelar esta oferta completa"**: ficha + validación con sus días pagando anuncios + precio en su moneda + bump sugerido, en un toque.
2. **Precio → Página → Bump → 5 anuncios → WhatsApp** con "Siguiente" (hoy Precio manda a Plan).
3. **Ganchos → Creativo / Carrusel / Reel** con el gancho puesto (hoy lleva a Media Studio, que es admin).
4. **Carrusel o Reel con palabra clave → guion de DM** para quien comente esa palabra.
5. **Contenido: pieza con "te escribieron" → DM; "compraron" → Recuperar**.
6. **Resultados: anuncio ganador → "Escalar"**: 3 variantes del creativo + 5 ganchos nuevos.
7. **Video largo de YouTube → "3 Shorts de este video"**.
8. **"Agregar a mi tracker" y "Miniatura"** al final de Creativos, Reels, Textos, Influencer IA, Video con IA y Series.
9. **El Robot usa el producto/oferta activos** y no vuelve a preguntar (regla del manual: la app no pregunta lo que puede deducir).

## 4. Un camino por persona (el modelo elegido ES su checklist de 6 etapas, un solo nombre: "Mi negocio")

| Modelo | Para | Recorrido |
|--------|------|-----------|
| Infoproducto low ticket (actual) | La miembro de la comunidad | Ofertas → Modelar oferta → Precio → Producto* → Página → Bump → 5 anuncios → WhatsApp → Medir y escalar |
| Mentoría high ticket (actual) | Coach | Ofertas → producto de entrada → Kit Llamada → Medir (llamadas agendadas y cerradas) |
| Marca personal (actual) | Influencer | Contenido → Ganchos → Carrusel/Reels → Textos → DM por palabra clave → producto/UGC |
| **Servicio profesional (nuevo)** | Arquitecto, médica, abogado | Portafolio en Carrusel/Creativos con fotos propias → contenido → DM → consulta |
| **Creador sin cara (nuevo)** | Faceless | Nichos YouTube → Videos para YouTube → Miniatura → 3 Shorts → tracker y bono |

\* "Crear producto" sigue en piloto: decisión de Jean abrirlo (aunque sea el índice gratis).

## 5. Seguridad y ética encontradas (EN PAUSA por decisión de Jean, 07-oct-2026)

Jean decidió no poner frenos propios de contenido por ahora ("la persona crea lo que quiera si paga
créditos") y dejar este tema para más adelante. Estado real hoy:
- `ai-chat` (generadores de texto) quedó en producción (v36) con una línea "apto para todo público"
  que se desplegó antes de esa decisión. Quitarla quedó bloqueada por el sistema de permisos y espera
  que Jean lo decida o lo apruebe.
- En el árbol de trabajo quedaron SIN subir: la misma regla en `generate-ad-creative` y la miniatura
  "Antes y después" sin cuerpos. No van en ningún commit hasta que Jean decida.
- Lo que encontraron los agentes queda anotado para cuando se retome: fotos subidas y posts modelados
  sin revisar, promesas de salud en Ganchos y Radar, nicho salud (cédula, sin curas), aviso de
  personaje IA en temas de salud, consentimiento para escribir a pacientes, y los límites legales y
  de proveedores (Whop, OpenAI, Google, fal, APIMart, HeyGen) que no dependen de la app.

## 6. Comunidad (lo que sirve de Adri Kastel y lo que no)

Se toma: rendir cuentas (Tu semana avisa si no avanzas), niveles por progreso REAL en las 6 etapas
(no por "me gusta"), muro de logros solo con ventas y leads anotados, llamadas en vivo (ya en la
Comunidad 10X), reto "Lanza en 7 días" sin urgencia falsa.
No se copia: ingresos de alumnos como gancho, cifras propias sin verificar, escasez por lanzamientos
cerrados, precio oculto.

## 7. Orden de construcción

1. **Fase 0:** en pausa (ver sección 5).
2. **Fase 1 (HECHA 07-oct, OK de Jean):** fusiones de la sección 2 → 24 tarjetas (19 para clientes) y 3 kits en Robot de copy.
3. **Fase 2 (HECHA 07-oct, b2c4fb2):** atajos 1 (Modelar esta oferta completa + lanzamiento guiado), 2 ("Siguiente" en los kits del Robot), 3 (Ganchos → crear) y 8 ("Agregar a mi tracker" en Robot, Creativos y Miniaturas). Pendiente: 9 (el Robot ya usa la ficha de "Mi negocio"; falta usar la oferta activa).
4. **Fase 3:** modelos nuevos + checklist único "Mi negocio" + atajos 4–7.
5. **Fase 4:** comunidad (niveles, logros reales, reto de 7 días) y frenos de salud pendientes.
