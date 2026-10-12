/**
 * Conceptos de anuncio estático (04-oct-2026, pedido de Jean): los 32 formatos de imagen más usados
 * en anuncios de Meta, en español con su nombre en inglés coloquial, qué recibe el usuario y un
 * ejemplo, ordenados por nivel de conciencia (N0 no sabe que tiene el problema → N4 solo necesita
 * un empujón). Regla: el problema no es el diseño, es el concepto. No se lanzan 3 versiones del
 * mismo estático: se lanzan 3 conceptos distintos del MISMO nivel y los datos dicen cuál conecta.
 *
 * Manual (sección 2, ética): los conceptos que dependen de datos reales (testimonio, estadística,
 * experto, estudios) piden el texto real del usuario y nunca se inventan. Antes/después y
 * transformación muestran el cambio en la vida diaria, nunca cuerpos, salud, dinero ni plazos.
 *
 * Revisión 11-oct-2026 (misión 04, prueba con la probadora Hany): cada escena dice ahora QUÉ texto
 * lleva (titular, lista o ninguno) y cómo se compone, porque sin eso la IA entregaba "Beneficios",
 * "Razones" y "Cuánto tiempo toma" sin una sola palabra, inventaba módulos en "Qué incluye" y hacía
 * un antes/después del cuerpo en "Yo antes, yo ahora". Ver imagePrompts.conceptSlots.
 */
/** Nivel de conciencia del cliente (N0 → N4): qué sabe ya de su problema y de tu producto. */
export type ConceptGroup = "n0" | "n1" | "n2" | "n3" | "n4";

/** Qué texto lleva la imagen: un titular (por defecto), una lista de etiquetas cortas o nada. */
export type ConceptText = "titular" | "lista" | "none";

export type AdConcept = {
  id: string;
  name: string;
  /** Nombre en inglés coloquial, como se conoce en el mundo de los anuncios. */
  en?: string;
  group: ConceptGroup;
  /** Qué imagen recibe, en una frase. */
  get: string;
  /** Ejemplo de texto o escena. */
  example: string;
  /** Escena para el prompt (sin las reglas: esas las pone imagePrompts). */
  scene: string;
  /** Solo con el texto real del usuario: sin él no se puede crear (no se inventan pruebas). */
  needsReal?: string;
  /** Tipo de texto que lleva la imagen (por defecto, un titular grande). */
  text?: ConceptText;
  /** Máximo de palabras del titular (por defecto 6). Menos palabras = menos faltas de ortografía. */
  words?: number;
};

export const CONCEPT_GROUPS: { id: ConceptGroup; code: string; label: string; line: string }[] = [
  { id: "n0", code: "N0", label: "No sabe que tiene el problema", line: "Le abren los ojos con algo que no sabía." },
  { id: "n1", code: "N1", label: "Conoce su problema", line: "Le hablan directo a lo que ya siente." },
  { id: "n2", code: "N2", label: "Busca una solución", line: "Le explican por qué pasa y cómo se arregla." },
  { id: "n3", code: "N3", label: "Conoce tu producto", line: "Le muestran qué trae y el cambio que logra." },
  { id: "n4", code: "N4", label: "Solo necesita un empujón", line: "Le quitan la última duda y lo llevan a comprar." },
];

/** Nivel con el que abre el selector: la mayoría de quien ve un anuncio frío ya siente su problema. */
export const DEFAULT_LEVEL: ConceptGroup = "n1";

/**
 * Cambio seguro (políticas de Meta y manual): la IA tiende a dibujar un cuerpo "antes" más grande y
 * triste y un "después" delgado. Se le exige la misma persona con el mismo cuerpo y la misma ropa:
 * lo que cambia es el entorno, el orden, la postura y la expresión.
 */
const SAFE_CHANGE = "La MISMA persona, mismo cuerpo, misma talla y misma ropa en ambos lados; cambia el entorno (desorden → orden), la postura y la expresión (agobiada → tranquila). Nada de cambios físicos, peso, salud, dinero, cifras ni plazos.";

/** Para los conceptos que muestran el producto: no se inventa lo que trae por dentro. */
const NO_INVENT = "Etiquetas SOLO con lo que diga la descripción del producto; no inventes módulos, bonos, materiales ni precios.";

export const AD_CONCEPTS: AdConcept[] = [
  { id: "pregunta", name: "Pregunta", group: "n1", get: "Una pregunta grande que tu cliente se hace.", example: "«¿Te cuesta empezar aunque sabes qué hacer?»", words: 9,
    scene: "La pregunta que el público objetivo se hace sobre su problema, ESCRITA en grande como protagonista (ocupa el tercio superior, empieza con ¿ y termina con ?). Fondo limpio y de un color, una persona del público objetivo pensativa en la parte baja, mirando la pregunta. Composición simple: pregunta arriba, persona abajo." },
  { id: "native", name: "Publicación normal", en: "Native", group: "n0", get: "Parece un post orgánico, no un anuncio.", example: "Foto casual de celular con texto corto encima.", text: "none",
    scene: "Imagen que parece una publicación orgánica hecha con el celular, sin aspecto de anuncio: encuadre casual, luz natural de casa, un momento real del público objetivo relacionado con el producto (si es digital, se ve en la pantalla del celular o la tableta). Sin diseño gráfico, sin logos de medios ni de redes sociales." },
  { id: "red_flags", name: "Señales de alerta", en: "Red Flags", group: "n1", get: "Lista de señales de que tienes el problema.", example: "«3 señales de que tu negocio necesita esto 🚩»", text: "lista", words: 7,
    scene: "Titular arriba, en grande: '3 señales de que…' (sobre el problema que resuelve el producto). Debajo, 3 tarjetas con bandera roja y una señal de máximo 6 palabras sobre hábitos, tiempo u organización; nunca el cuerpo, el peso ni la salud. Solo iconos y texto sobre fondo liso, sin personas." },
  { id: "dont_ignore", name: "No lo ignores", en: "Don't Ignore", group: "n1", get: "Llamado directo a no pasar de largo.", example: "«No ignores esto si vendes por WhatsApp»", words: 7,
    scene: "Composición de alto contraste con el titular enorme que empieza con 'No ignores esto si…' y termina con una situación del público objetivo. Una sola idea, el texto ocupa la mitad de la imagen; debajo, una persona del público objetivo que mira a cámara." },
  { id: "notas", name: "Notas", en: "Notes", group: "n1", get: "Estilo app de notas o post-it escrito a mano.", example: "Lista en la app de notas: «Lo que nadie me dijo…»", text: "lista", words: 6,
    scene: "Captura de una app de notas genérica (sin marca) o 4 post-its escritos a mano que ocupan casi toda la imagen, con un título corto ('Lo que nadie me dijo sobre…') y 3 o 4 ideas de máximo 5 palabras sobre el problema y la solución. Sin personas o con una persona apenas visible al fondo. Sin columnas de antes/después ni comparaciones del cuerpo." },
  { id: "buscamos", name: "Buscamos personas", en: "Looking For People", group: "n1", get: "Convocatoria a un público concreto.", example: "«Busco 10 mamás que quieran vender desde casa»",
    scene: "Cartel tipo convocatoria con el texto real en grande, dirigido al público objetivo, cálido y cercano: fondo de un color, tipografía gruesa, una persona del público objetivo sonriendo a un lado.", needsReal: "Escribe la convocatoria real (debe ser verdad: cupos, para quién)." },
  { id: "descubrimiento", name: "Descubrimiento", en: "Discovery", group: "n0", get: "«Descubrí esto y cambió cómo hago…»", example: "«Lo descubrí por casualidad y ahora lo uso a diario»", words: 7,
    scene: "Una persona del público objetivo descubre algo con sorpresa genuina mirando el producto en su pantalla (celular o tableta), en un lugar de su día a día. Titular corto en primera persona ('Descubrí esto y…') en la parte superior." },
  { id: "if_you", name: "Si eres…", en: "If You", group: "n1", get: "Le habla directo a un tipo de persona.", example: "«Si eres emprendedora y no tienes tiempo, mira esto»", words: 9,
    scene: "Retrato natural de una persona del público objetivo mirando a cámara y, en grande, un titular que empieza con 'Si eres' y describe a esa persona y su situación. El texto va sobre un fondo liso o una franja de color para que se lea." },
  { id: "causa_raiz", name: "Causa raíz", group: "n2", get: "La verdadera razón del problema.", example: "«El problema no es tu idea, es que no la validas»", words: 10,
    scene: "Metáfora visual simple de la causa oculta del problema (una raíz bajo la tierra, un engranaje escondido, la punta de un ovillo) y un titular en grande con la forma 'El problema no es X, es Y' sobre el problema del público objetivo." },
  { id: "iceberg", name: "Iceberg", group: "n0", get: "Lo que se ve vs. lo que hay debajo.", example: "Arriba: «vender». Abajo: «validar, precio, embudo…»", text: "lista", words: 5,
    scene: "Ilustración limpia de un iceberg: sobre el agua, una etiqueta con lo que todos ven del problema; bajo el agua, 3 o 4 etiquetas cortas (máximo 3 palabras) con lo que realmente pasa. Fondo de un color, sin personas. Etiquetas grandes y legibles." },
  { id: "dato", name: "Dato o estadística", en: "Stat", group: "n0", get: "Un dato real grande que sorprende.", example: "«8 de cada 10 nunca terminan su curso» (con fuente)",
    scene: "El dato real como protagonista: el número enorme en el centro y la frase corta debajo, diseño minimalista sobre fondo de un color, con la fuente en letra pequeña al pie. Sin personas.", needsReal: "Escribe el dato real y su fuente. No se inventan cifras." },
  { id: "experto", name: "Autoridad o experto", en: "Authority", group: "n2", get: "Habla alguien con experiencia real.", example: "Retrato profesional + su consejo en una frase.",
    scene: "Retrato profesional de una persona experta (no famosa, no real identificable) en su entorno de trabajo, y su consejo real escrito en grande entre comillas a un lado, con su nombre en letra pequeña.", needsReal: "Escribe quién es el experto real y su frase (tú o alguien de tu equipo)." },
  { id: "advertencia", name: "Advertencia", en: "Warning", group: "n1", get: "Un aviso de error común.", example: "«⚠️ Deja de hacer esto antes de lanzar tu producto»", words: 8,
    scene: "Diseño tipo aviso: una señal de advertencia triangular grande y un titular que empieza con 'Deja de…' o 'Cuidado con…' sobre un error común del público objetivo. Fondo liso de alto contraste (amarillo y negro o similar). Serio pero no alarmista, sin personas." },
  { id: "problema_solucion", name: "Problema → solución", en: "Problem / Solution", group: "n2", get: "El problema y el alivio de resolverlo.", example: "Persona frustrada → la misma persona aliviada con tu producto.", text: "none",
    scene: "Escena realista en una sola imagen: una persona del público objetivo vive el problema y, en la misma escena, se ve el alivio de encontrar la solución con el producto en su pantalla. Sin diseño gráfico." },
  { id: "old_new", name: "Yo antes, yo ahora", en: "Old Me / New Me", group: "n3", get: "Dos versiones de la misma persona.", example: "Antes: desordenada. Ahora: con su plan claro.", text: "lista", words: 2,
    scene: `Imagen dividida en dos mitades con 'ANTES' y 'AHORA' escritos en grande sobre cada una. La persona NO hace ejercicio ni posa en ninguna mitad: está en su casa con su agenda o su celular. ${SAFE_CHANGE}` },
  { id: "sin_con", name: "Sin vs. con", en: "Without vs With", group: "n2", get: "Tu día sin el producto y con él.", example: "«Sin plan: caos. Con plan: 15 minutos y listo»", text: "lista", words: 4,
    scene: `Comparación lado a lado con 'SIN' y 'CON' (más el nombre corto del producto) escritos en grande sobre cada mitad. ${SAFE_CHANGE}` },
  { id: "ciencia", name: "Respaldado por estudios", en: "Backed by Science", group: "n2", get: "El método con su respaldo real.", example: "«Método basado en repetición espaciada» (con fuente)",
    scene: "Diseño limpio tipo ficha: el principio del método en grande y la referencia real en letra pequeña al pie, sobre fondo claro. Sin personas.", needsReal: "Escribe el estudio o la fuente real. No se inventan estudios." },
  { id: "comparativa", name: "Comparativa", en: "Comparison", group: "n2", get: "Tu producto vs. la forma de siempre.", example: "Tabla: «Hacerlo solo» vs. «Con la guía» ✓✗", text: "lista", words: 4,
    scene: "Tabla comparativa de 2 columnas y 3 o 4 filas: a la izquierda 'Hacerlo solo' con ✗, a la derecha el producto con ✓; cada fila es un criterio de máximo 3 palabras (tiempo, guía, orden, apoyo). Fondo liso, tipografía grande, sin personas. Sin marcas de la competencia." },
  { id: "razones", name: "Razones", en: "Reasons Why", group: "n4", get: "3 a 5 razones para elegirte.", example: "«5 razones para empezar hoy»", text: "lista", words: 6,
    scene: "Titular arriba: '3 razones para empezar hoy' (o parecido, sobre el producto). Debajo, una lista numerada 1, 2, 3, cada razón ESCRITA en máximo 6 palabras junto a un icono simple. Los números y las razones son lo más grande de la imagen; opcionalmente el producto en una pantalla al fondo. Nunca iconos sin su texto." },
  { id: "want_got", name: "Lo que quería vs. lo que obtuve", en: "What I Wanted / What I Got", group: "n3", get: "Meme de expectativa vs. realidad, en positivo.", example: "Quería: un ebook. Obtuve: un plan completo.", text: "lista", words: 5,
    scene: "Formato meme de dos paneles con las etiquetas 'Lo que quería' y 'Lo que obtuve' escritas arriba de cada uno, humor ligero y resultado positivo del producto (en el segundo panel, el producto en su pantalla y una persona contenta)." },
  { id: "calendario", name: "Calendario o plan", en: "Calendar", group: "n4", get: "El plan día a día o semana a semana.", example: "«Tu plan de 7 días» con cada paso marcado.", text: "lista", words: 6,
    scene: `Titular 'Tu plan de N días' (la duración que diga el producto; si no, 'Tu plan semana a semana') y debajo un calendario con los días numerados y, en algunos, un icono o una palabra del paso. Es el contenido del plan, no una promesa de resultado. ${NO_INVENT}` },
  { id: "transformacion", name: "Transformación", en: "Transformation", group: "n3", get: "El cambio que vive tu cliente.", example: "De «no sé por dónde empezar» a «ya tengo mi plan».", words: 10,
    scene: `Una sola escena que cuenta la transformación del público objetivo, con un titular en grande con la forma 'De … a …' (de la duda al plan claro). ${SAFE_CHANGE}` },
  { id: "incluye", name: "Qué incluye", en: "Ingredients", group: "n3", get: "Todo lo que trae tu producto, a la vista.", example: "Módulos, plantillas y bonos dispuestos en la mesa.", text: "lista", words: 6,
    scene: `Flat lay visto desde arriba de lo que incluye el producto (si es digital: su portada en una tableta y un celular, más hojas o tarjetas), titular 'Todo lo que incluye' y una etiqueta corta junto a cada parte. ${NO_INVENT} Sin detalle en los datos, muestra solo el producto en sus pantallas con su nombre.` },
  { id: "beneficios", name: "Beneficios", en: "Benefits", group: "n3", get: "Los beneficios clave alrededor del producto.", example: "Producto al centro y 4 beneficios con flechas.", text: "lista", words: 5,
    scene: "El producto en el centro (si es digital, en una tableta o celular) y 3 o 4 beneficios alrededor, cada uno con un icono Y su texto ESCRITO en máximo 4 palabras, unidos al producto con flechas o líneas. Fondo liso para que los textos se lean. Nunca iconos sin su texto. Beneficios de uso (desde casa, sin equipo, a tu ritmo), nunca resultados prometidos." },
  { id: "tiempo", name: "Cuánto tiempo toma", en: "Time to Result", group: "n4", get: "Lo poco que cuesta usarlo cada día.", example: "«15 minutos al día» con un reloj.", words: 5,
    scene: "Un reloj o temporizador grande como protagonista y, a su lado, el titular en grande con el tiempo de USO diario del producto (por ejemplo, '15 minutos al día'; usa el tiempo que diga el producto o uno realista de uso). Es cuánto toma aplicarlo, nunca en cuánto llega un resultado. Fondo liso, una persona del público objetivo opcional al fondo." },
  { id: "antes_despues", name: "Antes y después", en: "Before / After", group: "n3", get: "Dos fotos: antes y después.", example: "Escritorio caótico → escritorio organizado.", text: "lista", words: 2,
    scene: `Imagen dividida con 'ANTES' y 'DESPUÉS' escritos en grande, de una situación cotidiana (escritorio, agenda, pantalla, rincón de la casa). ${SAFE_CHANGE}` },
  { id: "all_in", name: "Todo incluido", en: "All-In", group: "n4", get: "Toda la oferta apilada en una imagen.", example: "Producto + bonos + garantía, todo junto.", text: "lista", words: 5,
    scene: `Composición tipo 'stack' de la oferta: el producto al frente (si es digital, en pantallas) y los extras detrás, cada uno con su etiqueta corta, y un titular 'Todo esto incluye'. ${NO_INVENT} Sin precio en los datos, ningún precio.` },
  { id: "testimonio", name: "Testimonio", en: "Testimonial", group: "n3", get: "La frase real de un cliente.", example: "«Por fin entendí cómo armar mi oferta» — Ana, CDMX",
    scene: "Tarjeta de testimonio elegante con la frase real entre comillas en grande y el nombre debajo, junto a una foto genérica de una persona (no real identificable). Fondo liso.", needsReal: "Pega la frase real de tu cliente y su nombre. No se inventan testimonios." },
  { id: "pedido", name: "Así llega tu compra", en: "Receipt", group: "n4", get: "Cómo se ve la compra o la entrega.", example: "Mensaje de WhatsApp con tu producto entregado.", text: "lista", words: 6,
    scene: "Mockup de un chat de mensajería genérico (sin logos) en un celular, donde llega el producto: el nombre del producto, un 'Aquí tienes tu acceso' y el archivo o enlace. Si los datos no traen precio, no escribas ningún precio. Sin datos de clientes ni cifras de ventas." },
  { id: "objecion", name: "Objeción", en: "Objection", group: "n4", get: "Responde la duda que frena la compra.", example: "«¿Y si no tengo experiencia? Está hecho para empezar de cero»", words: 12,
    scene: "La duda principal del público objetivo escrita en grande como pregunta ('¿Y si…?') en la parte superior y, debajo, su respuesta corta en una franja de color. Una persona tranquila del público objetivo a un lado. La pregunta y la respuesta son lo más grande de la imagen." },
  { id: "oferta", name: "Oferta", en: "Offer", group: "n4", get: "El precio y lo que llevas, directo.", example: "Producto + precio real + botón «Lo quiero».", text: "lista", words: 5,
    scene: "Anuncio directo de la oferta: el producto grande (si es digital, en una tableta o celular), su nombre, el precio SOLO si viene en los datos (si no, ningún precio) y un botón con 'Lo quiero'. Fondo liso de un color de marca. Sin urgencia falsa ni contadores." },
  { id: "receta", name: "Receta o paso a paso", en: "Recipe", group: "n4", get: "Los pasos del método como una receta.", example: "«Receta para tu primera venta: 1… 2… 3…»", text: "lista", words: 6,
    scene: "Tarjeta de receta limpia con un título 'Receta para…' y los pasos numerados 1, 2, 3 del método del producto, cada paso ESCRITO en máximo 5 palabras. Fondo claro, tipografía legible, sin personas." },
];

export const CONCEPT_BY_ID: Record<string, AdConcept> = Object.fromEntries(AD_CONCEPTS.map(c => [c.id, c]));

export const MAX_CONCEPTS = 3;

/**
 * Los 3 conceptos que se recomiendan para un nivel, en el orden de la lista de Jean (04-oct-2026)
 * con dos ajustes de la prueba del 11-oct: en N3 van primero Beneficios y Qué incluye (los que piden
 * texto claro) y "Yo antes, yo ahora" baja al final porque con productos de cuerpo la IA tiende a
 * dibujar un cambio físico; en N4 abre Objeción (la duda que frena la compra) y luego Razones.
 * Primero los que no piden datos reales: así se puede crear sin escribir nada.
 */
const LEVEL_ORDER = [
  "dato", "iceberg", "descubrimiento", "native",
  "pregunta", "notas", "red_flags", "dont_ignore", "if_you", "advertencia", "buscamos",
  "causa_raiz", "problema_solucion", "experto", "ciencia", "comparativa", "sin_con",
  "beneficios", "incluye", "transformacion", "want_got", "antes_despues", "old_new", "testimonio",
  "objecion", "razones", "calendario", "tiempo", "receta", "oferta", "all_in", "pedido",
];
export function levelConcepts(level: ConceptGroup): AdConcept[] {
  const all = AD_CONCEPTS.filter(c => c.group === level).sort((a, b) => LEVEL_ORDER.indexOf(a.id) - LEVEL_ORDER.indexOf(b.id));
  return [...all.filter(c => !c.needsReal), ...all.filter(c => c.needsReal)];
}
