-- Primera enseñanza de la comunidad (Jean, 05-oct-2026). Entra "pendiente": Jean la revisa en
-- Admin → Enseñanzas y la publica él. Es una adaptación CON NUESTRAS PALABRAS (no traducción literal)
-- de un tutorial de Victoria Morais (Outlier Hub), con crédito, llevada a las herramientas de SUPERNOVA.
-- Correr DESPUÉS de la migración 20261005120000_community_guides.sql, como service_role (el trigger
-- no fuerza el estado cuando no hay usuario: auth.uid() es NULL y has_role da false, así que se
-- inserta explícitamente como 'pendiente').
insert into public.community_guides (user_id, author_name, title, summary, body, tools, source_credit, source_url, status)
select r.user_id, 'Jean', 'Videos de GTA 6 sin tener el juego: de la atención a una audiencia propia',
  'Arma una página de noticias y curiosidades de GTA 6, publica un video corto al día durante 30 días y descubre qué temas te traen seguidores.',
$md$
> GTA 6 es solo el tema. Lo que construyes es una **audiencia**, y eso te sigue sirviendo cuando pase la emoción del juego.

## Antes de empezar: lo que esto es y lo que no
No es "abro un TikTok y me hago rico cuando salga el juego". Nadie te puede garantizar ingresos. Lo que sí puedes construir en 30 días es **un perfil con público** y **una habilidad que se vende** (editar videos cortos). Las dos cosas valen aunque el juego tarde.

## Paso 1 — Elige UNA plataforma
No abras cinco cuentas. Empieza por una:
- **TikTok, Reels o Shorts**: para llegar a mucha gente con videos cortos.
- **YouTube**: para videos más largos y una audiencia más fiel (después).

Ponle un nombre de fan, por ejemplo "Central GTA LATAM". **Nunca te hagas pasar por la cuenta oficial de Rockstar.**

En SUPERNOVA, abre **Nichos de YouTube** y busca "GTA" o "videojuegos" para ver qué canales del tema están creciendo y con qué tipo de video.

## Paso 2 — Ten solo 3 tipos de video
Así no te bloqueas pensando "¿qué publico hoy?":
1. **Noticia**: "Lo nuevo de GTA 6 que quizás no viste esta semana". Cuéntala con tus palabras y da tu opinión.
2. **Curiosidad**: "Detalles del tráiler que casi nadie notó". Despierta curiosidad.
3. **Debate**: "¿GTA 6 va a superar a GTA 5?". Das tus argumentos y pides que comenten. Comentarios = comunidad.

## Paso 3 — No necesitas el juego
Puedes hablar de los tráileres, los anuncios oficiales, los personajes, el mapa, las teorías, la comparación con GTA 5 y la historia de la saga.

**Cuidado con los derechos de autor**: no descargues y vuelvas a subir videos, música o clips de otros. Lo tuyo es **comentario propio**: tu narración, tu análisis, tu edición. Revisa las reglas de cada plataforma.

## Paso 4 — La estructura de cada video
**Gancho → dato → tu opinión → pregunta final**

- Gancho: "Este detalle de GTA 6 puede cambiar todo el juego…"
- Dato: explicas el detalle.
- Opinión: qué crees tú.
- Final: "¿Crees que va a estar en el juego? Comenta."

Nunca empieces con "Hola a todos, en el video de hoy…": pierdes a la gente en los primeros segundos.

En SUPERNOVA:
- **Ganchos (hooks)**: saca 10 aperturas para tu tema y elige la mejor.
- **Guiones de Reels**: pide el guion de 100–150 palabras con esa estructura.
- **Video con IA** o **Series de video**: crea escenas de apoyo originales (no copias del juego) para tapar la narración.
- **Miniaturas**: la portada de tus videos de YouTube.

## Paso 5 — Un video al día durante 30 días
No hace falta calidad de cine. Cada video es:
1. Guion corto.
2. Tu narración (o la voz del **Influencer IA** si no quieres mostrarte).
3. Escenas o imágenes que tengas permiso de usar.
4. Subtítulos.
5. Edición rápida y publicar.

Organízalo en **Calendario de contenido** para no improvisar cada día.

- **Semana 1**: creas el perfil y publicas 7 videos.
- **Semana 2**: pruebas los 3 tipos: noticia, curiosidad, debate.
- **Semana 3**: miras cuáles retienen más y reciben más comentarios.
- **Semana 4**: haces más de los que funcionan y abres YouTube como segundo canal.

## Paso 6 — Cómo saber si funciona
A los 30 días, mira tus propios números:
- ¿Qué video te trajo más seguidores?
- ¿Qué tema tuvo más comentarios?
- ¿Qué gancho hizo que la gente se quedara viendo?

Repite el **formato** que funcionó, no el mismo video.

## De dónde puede salir dinero (sin promesas)
Cuando ya tienes público, hay varios caminos. Ninguno es seguro ni inmediato:
- **Monetización de la plataforma**: cada una tiene requisitos (seguidores, vistas, edad). Revisa las reglas oficiales y no intentes saltártelas.
- **Afiliados**: recomendar productos de gaming de verdad (audífonos, controles, sillas) con tu enlace. Di siempre que es un enlace de afiliado.
- **Patrocinios**: marcas de gaming pagan por mención cuando tu público es claro y participa.
- **Vender tu habilidad**: lo que aprendes (editar, ganchos, miniaturas, guiones) se lo puedes ofrecer a otros creadores. Tu canal es tu portafolio.

## Errores que conviene evitar
- Querer estar en todas las plataformas el primer día.
- Subir clips de otros sin permiso.
- Prometer filtraciones o "fechas secretas" que no puedes comprobar.
- Rendirte en la semana 2 porque los números son pequeños: así empiezan todos.

**El resumen:** GTA 6 → atención → contenido → audiencia → confianza → ingresos posibles. El juego es el tema; la audiencia es tu activo.
$md$,
  array['nichosyt', 'ganchos', 'reels', 'videoia', 'series', 'miniaturas', 'personaje', 'contenido'],
  'Victoria Morais (Outlier Hub), "Como ganhar dinheiro com o GTA 6"',
  'https://outlierhub.circle.so/c/tutoriais-e9900b/como-ganhar-dinheiro-com-o-gta-6',
  'pendiente'
from public.user_roles r
where r.role = 'admin'
limit 1;
