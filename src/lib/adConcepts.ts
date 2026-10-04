/**
 * Conceptos de anuncio estático (04-oct-2026, pedido de Jean): los 32 formatos de imagen más usados
 * en anuncios de Meta, en español con su nombre en inglés coloquial, qué recibe el usuario y un
 * ejemplo. Son recomendaciones: el usuario elige hasta 3 o describe otro estilo y la IA lo adapta.
 *
 * Manual (sección 2, ética): los conceptos que dependen de datos reales (testimonio, estadística,
 * experto, estudios) piden el texto real del usuario y nunca se inventan. Antes/después y
 * transformación muestran el cambio en la vida diaria, nunca cuerpos, salud, dinero ni plazos.
 */
export type ConceptGroup = "frio" | "tibio" | "caliente";

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
};

export const CONCEPT_GROUPS: { id: ConceptGroup; label: string; line: string }[] = [
  { id: "frio", label: "Para quien no te conoce", line: "Detienen el scroll y despiertan el problema." },
  { id: "tibio", label: "Para quien busca solución", line: "Muestran el cambio y por qué tu producto." },
  { id: "caliente", label: "Para quien está por comprar", line: "Quitan dudas y empujan a la compra." },
];

const SAFE_CHANGE = "Muestra el cambio en el día a día y en la emoción; nada de cuerpos, salud, dinero, cifras ni plazos.";

export const AD_CONCEPTS: AdConcept[] = [
  // Frío: no te conocen todavía.
  { id: "pregunta", name: "Pregunta", group: "frio", get: "Una pregunta grande que tu cliente se hace.", example: "«¿Te cuesta empezar aunque sabes qué hacer?»",
    scene: "Fondo limpio y una pregunta grande que el público objetivo se hace sobre su problema, como protagonista. Una persona pensativa a un lado." },
  { id: "native", name: "Publicación normal", en: "Native", group: "frio", get: "Parece un post orgánico, no un anuncio.", example: "Foto casual de celular con texto corto encima.",
    scene: "Imagen que parece una publicación orgánica hecha con el celular, sin aspecto de anuncio: encuadre casual, luz natural. Sin logos de medios ni de redes sociales." },
  { id: "red_flags", name: "Señales de alerta", en: "Red Flags", group: "frio", get: "Lista de señales de que tienes el problema.", example: "«3 señales de que tu negocio necesita esto 🚩»",
    scene: "Lista visual de 3 señales de alerta con iconos de bandera roja, sobre el problema que resuelve el producto. Diseño limpio y legible." },
  { id: "dont_ignore", name: "No lo ignores", en: "Don't Ignore", group: "frio", get: "Llamado directo a no pasar de largo.", example: "«No ignores esto si vendes por WhatsApp»",
    scene: "Composición de alto contraste que pide no ignorar el mensaje, dirigido al público objetivo. Una sola idea, texto grande." },
  { id: "notas", name: "Notas", en: "Notes", group: "frio", get: "Estilo app de notas o post-it escrito a mano.", example: "Lista en la app de notas: «Lo que nadie me dijo…»",
    scene: "Imagen estilo captura de una app de notas genérica (sin marca) o post-its escritos a mano, con ideas cortas sobre el problema y la solución." },
  { id: "buscamos", name: "Buscamos personas", en: "Looking For People", group: "frio", get: "Convocatoria a un público concreto.", example: "«Busco 10 mamás que quieran vender desde casa»",
    scene: "Cartel tipo convocatoria dirigido al público objetivo, cálido y cercano.", needsReal: "Escribe la convocatoria real (debe ser verdad: cupos, para quién)." },
  { id: "descubrimiento", name: "Descubrimiento", en: "Discovery", group: "frio", get: "«Descubrí esto y cambió cómo hago…»", example: "«Lo descubrí por casualidad y ahora lo uso a diario»",
    scene: "Escena de una persona del público objetivo que descubre algo con sorpresa genuina mirando el producto o su pantalla." },
  { id: "if_you", name: "Si eres…", en: "If You", group: "frio", get: "Le habla directo a un tipo de persona.", example: "«Si eres emprendedora y no tienes tiempo, mira esto»",
    scene: "Imagen que se dirige directo a un tipo de persona del público objetivo, retrato natural y texto que empieza con 'Si eres'." },
  { id: "causa_raiz", name: "Causa raíz", group: "frio", get: "La verdadera razón del problema.", example: "«El problema no es tu idea, es que no la validas»",
    scene: "Visual que revela la causa oculta del problema (por ejemplo, una raíz o un engranaje escondido), metáfora clara y simple." },
  { id: "iceberg", name: "Iceberg", group: "frio", get: "Lo que se ve vs. lo que hay debajo.", example: "Arriba: «vender». Abajo: «validar, precio, embudo…»",
    scene: "Ilustración de un iceberg: arriba lo que todos ven del problema, abajo bajo el agua lo que realmente pasa. Etiquetas cortas." },
  { id: "dato", name: "Dato o estadística", en: "Stat", group: "frio", get: "Un dato real grande que sorprende.", example: "«8 de cada 10 nunca terminan su curso» (con fuente)",
    scene: "Un número o dato grande como protagonista, diseño minimalista, con la fuente en letra pequeña.", needsReal: "Escribe el dato real y su fuente. No se inventan cifras." },
  { id: "experto", name: "Autoridad o experto", en: "Authority", group: "frio", get: "Habla alguien con experiencia real.", example: "Retrato profesional + su consejo en una frase.",
    scene: "Retrato profesional de una persona experta (no famosa, no real identificable) en su entorno de trabajo, con su consejo en una frase.", needsReal: "Escribe quién es el experto real y su frase (tú o alguien de tu equipo)." },
  { id: "advertencia", name: "Advertencia", en: "Warning", group: "frio", get: "Un aviso de error común.", example: "«⚠️ Deja de hacer esto antes de lanzar tu producto»",
    scene: "Diseño tipo aviso con señal de advertencia, sobre un error común del público objetivo. Serio pero no alarmista." },
  // Tibio: saben que tienen el problema y buscan solución.
  { id: "problema_solucion", name: "Problema → solución", en: "Problem / Solution", group: "tibio", get: "El problema y el alivio de resolverlo.", example: "Persona frustrada → la misma persona aliviada con tu producto.",
    scene: "Escena realista: una persona del público objetivo vive el problema y se ve el alivio de encontrar la solución con el producto." },
  { id: "old_new", name: "Yo antes, yo ahora", en: "Old Me / New Me", group: "tibio", get: "Dos versiones de la misma persona.", example: "Antes: desordenada. Ahora: con su plan claro.",
    scene: `Imagen dividida: la misma persona antes (con el problema) y ahora (con la solución). ${SAFE_CHANGE}` },
  { id: "sin_con", name: "Sin vs. con", en: "Without vs With", group: "tibio", get: "Tu día sin el producto y con él.", example: "«Sin plan: caos. Con plan: 15 minutos y listo»",
    scene: `Comparación lado a lado: la situación sin el producto y con el producto, etiquetas 'Sin' y 'Con'. ${SAFE_CHANGE}` },
  // Caliente: conocen la solución, hay que convencerlos de la tuya.
  { id: "ciencia", name: "Respaldado por estudios", en: "Backed by Science", group: "caliente", get: "El método con su respaldo real.", example: "«Método basado en repetición espaciada» (con fuente)",
    scene: "Diseño limpio tipo ficha que explica en qué se basa el método, con la referencia en letra pequeña.", needsReal: "Escribe el estudio o la fuente real. No se inventan estudios." },
  { id: "comparativa", name: "Comparativa", en: "Comparison", group: "caliente", get: "Tu producto vs. la forma de siempre.", example: "Tabla: «Hacerlo solo» vs. «Con la guía» ✓✗",
    scene: "Tabla comparativa clara con marcas ✓ y ✗: el producto frente a la alternativa genérica de siempre. Sin marcas de la competencia." },
  { id: "razones", name: "Razones", en: "Reasons Why", group: "caliente", get: "3 a 5 razones para elegirte.", example: "«5 razones para empezar hoy»",
    scene: "Lista numerada de 3 razones para elegir el producto, iconos simples, muy legible." },
  { id: "want_got", name: "Lo que quería vs. lo que obtuve", en: "What I Wanted / What I Got", group: "caliente", get: "Meme de expectativa vs. realidad, en positivo.", example: "Quería: un ebook. Obtuve: un plan completo.",
    scene: "Formato meme de dos paneles: 'Lo que quería' y 'Lo que obtuve', con humor ligero y resultado positivo del producto." },
  { id: "calendario", name: "Calendario o plan", en: "Calendar", group: "caliente", get: "El plan día a día o semana a semana.", example: "«Tu plan de 7 días» con cada paso marcado.",
    scene: "Calendario o plan visual con los pasos del producto marcados día a día. Es el contenido del plan, no una promesa de resultado." },
  { id: "transformacion", name: "Transformación", en: "Transformation", group: "caliente", get: "El cambio que vive tu cliente.", example: "De «no sé por dónde empezar» a «ya tengo mi plan».",
    scene: `Escena que cuenta la transformación del público objetivo en una sola imagen, del problema a la solución. ${SAFE_CHANGE}` },
  { id: "incluye", name: "Qué incluye", en: "Ingredients", group: "caliente", get: "Todo lo que trae tu producto, a la vista.", example: "Módulos, plantillas y bonos dispuestos en la mesa.",
    scene: "Flat lay ordenado de todo lo que incluye el producto (módulos, plantillas, bonos; si es digital, pantallas y portadas), cada parte con una etiqueta corta." },
  { id: "beneficios", name: "Beneficios", en: "Benefits", group: "caliente", get: "Los beneficios clave alrededor del producto.", example: "Producto al centro y 4 beneficios con flechas.",
    scene: "El producto en el centro y 3 o 4 beneficios cortos alrededor con flechas o iconos." },
  { id: "tiempo", name: "Cuánto tiempo toma", en: "Time to Result", group: "caliente", get: "Lo poco que cuesta usarlo cada día.", example: "«15 minutos al día» con un reloj.",
    scene: "Visual con un reloj o temporizador que muestra el tiempo de USO del producto (cuánto toma aplicarlo), nunca en cuánto llega un resultado." },
  { id: "antes_despues", name: "Antes y después", en: "Before / After", group: "caliente", get: "Dos fotos: antes y después.", example: "Escritorio caótico → escritorio organizado.",
    scene: `Imagen dividida en 'Antes' y 'Después' de una situación cotidiana (escritorio, agenda, pantalla). ${SAFE_CHANGE}` },
  { id: "all_in", name: "Todo incluido", en: "All-In", group: "caliente", get: "Toda la oferta apilada en una imagen.", example: "Producto + bonos + garantía, todo junto.",
    scene: "Composición tipo 'stack' de la oferta completa: producto principal y extras apilados, con su precio real si se indica." },
  { id: "testimonio", name: "Testimonio", en: "Testimonial", group: "caliente", get: "La frase real de un cliente.", example: "«Por fin entendí cómo armar mi oferta» — Ana, CDMX",
    scene: "Tarjeta de testimonio elegante con la frase entre comillas y el nombre, junto a una foto genérica de una persona (no real identificable).", needsReal: "Pega la frase real de tu cliente y su nombre. No se inventan testimonios." },
  { id: "pedido", name: "Así llega tu compra", en: "Receipt", group: "caliente", get: "Cómo se ve la compra o la entrega.", example: "Mensaje de WhatsApp con tu producto entregado.",
    scene: "Mockup de la confirmación de compra o de la entrega del producto por WhatsApp o correo, con el nombre del producto y su precio real; sin datos de clientes ni cifras de ventas." },
  { id: "objecion", name: "Objeción", en: "Objection", group: "caliente", get: "Responde la duda que frena la compra.", example: "«¿Y si no tengo experiencia? Está hecho para empezar de cero»",
    scene: "La duda principal del público objetivo escrita como pregunta y su respuesta clara al lado, con una persona tranquila." },
  { id: "oferta", name: "Oferta", en: "Offer", group: "caliente", get: "El precio y lo que llevas, directo.", example: "Producto + precio real + botón «Lo quiero».",
    scene: "Anuncio directo de la oferta: producto, su precio real y una llamada a la acción clara. Sin urgencia falsa ni contadores." },
  { id: "receta", name: "Receta o paso a paso", en: "Recipe", group: "caliente", get: "Los pasos del método como una receta.", example: "«Receta para tu primera venta: 1… 2… 3…»",
    scene: "Formato de receta con los pasos numerados del método del producto, estilo tarjeta de cocina limpia." },
];

export const CONCEPT_BY_ID: Record<string, AdConcept> = Object.fromEntries(AD_CONCEPTS.map(c => [c.id, c]));

export const MAX_CONCEPTS = 3;
