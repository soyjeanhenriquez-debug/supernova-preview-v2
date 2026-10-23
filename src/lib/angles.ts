/**
 * Ángulos que venden (20-oct-2026, pedido de Jean): la biblioteca única de ángulos de venta que usan
 * todas las herramientas que crean algo (anuncios, videos de redes, carruseles, textos, el Estratega).
 * Regla de oro: UNA pieza = UN ángulo. Nunca 2 o 3 ángulos mezclados en el mismo anuncio, video o
 * carrusel; para probar otro ángulo se hace otra pieza. "auto" deja que la IA elija uno (la app no
 * bloquea a nadie por no elegir).
 * Ejemplos propios por nicho (nada copiado de anuncios ni marcas reales) y sin promesas de ingresos,
 * salud, cuerpo ni plazos (manual, sección 2).
 */

export type AngleNiche = "Curso o guía" | "Producto físico" | "Servicio" | "App o plantilla";
export type AngleExample = { niche: AngleNiche; product: string; hook: string };
export type Angle = {
  id: string;
  n: number;
  name: string;
  /** Qué es, en una línea. */
  what: string;
  /** Cuándo conviene (nivel de consciencia, tipo de público). */
  when: string;
  /** Cómo se entra en el anuncio. */
  how: string;
  /** Cuidado propio de este ángulo (honestidad, políticas). */
  care?: string;
  examples: AngleExample[];
  /** Los 12 base (true) o los extra. */
  core: boolean;
};

export const ANGLE_AUTO = "auto";

export const ANGLES: Angle[] = [
  {
    id: "problema", n: 1, core: true, name: "Problema / dolor",
    what: "Entras por lo que le molesta hoy. Es el más usado y el más fuerte.",
    when: "Público frío que ya siente el problema.",
    how: "Nombra una situación concreta del día a día que la persona reconoce al instante.",
    examples: [
      { niche: "Curso o guía", product: "Curso de repostería", hook: "¿Tu bizcocho sube en el horno y se hunde al sacarlo?" },
      { niche: "Producto físico", product: "Aceite para pelo rizado", hook: "¿Se te esponja el rizo antes del mediodía?" },
      { niche: "Servicio", product: "Contadora para emprendedores", hook: "¿Llega abril y no sabes ni dónde están tus facturas?" },
      { niche: "App o plantilla", product: "App de citas para salones", hook: "¿Otra clienta que no llegó y no avisó?" },
    ],
  },
  {
    id: "identidad", n: 2, core: true, name: "Identidad",
    what: "Le hablas a quién ES o quiere ser, no a lo que le pasa.",
    when: "Nichos con grupos claros (mamás, estudiantes, dueños de negocio, principiantes).",
    how: "Llámala por su grupo en la primera frase para que sienta que es para ella.",
    care: "Nunca señales rasgos sensibles (salud, edad, cuerpo, religión) como \"¿eres gordita?\": Meta lo prohíbe.",
    examples: [
      { niche: "Curso o guía", product: "Guía de crochet", hook: "Para la que siempre quiso tejer y nunca supo por dónde empezar." },
      { niche: "Producto físico", product: "Mochila para laptop", hook: "Si trabajas desde cualquier café, esto es para ti." },
      { niche: "Servicio", product: "Clases de inglés en línea", hook: "Para el que entiende inglés pero se congela al hablarlo." },
      { niche: "App o plantilla", product: "Plantilla de presupuesto", hook: "Para la que lleva las cuentas de la casa en la cabeza." },
    ],
  },
  {
    id: "mecanismo", n: 3, core: true, name: "Mecanismo",
    what: "Explicas POR QUÉ pasa el problema y por qué esto lo resuelve.",
    when: "Mercados donde todos prometen lo mismo; gente que ya probó otras cosas.",
    how: "Dale un culpable concreto (un error, un hábito, una creencia) y muestra cómo se rompe.",
    examples: [
      { niche: "Curso o guía", product: "Curso de repostería", hook: "El culpable de que se hunda no es el horno: es abrirlo antes de tiempo." },
      { niche: "Producto físico", product: "Aceite para pelo rizado", hook: "Tu rizo no es rebelde: le falta lo que el champú le quita." },
      { niche: "Servicio", product: "Clases de inglés en línea", hook: "No hablas porque traduces en la cabeza. Así se deja de hacer." },
      { niche: "App o plantilla", product: "App de hábitos", hook: "No te falta disciplina: te sobran metas a la vez." },
    ],
  },
  {
    id: "beneficio", n: 4, core: true, name: "Beneficio / resultado",
    what: "Vas directo al después que la persona quiere.",
    when: "Público que ya sabe qué quiere y busca cómo.",
    how: "Describe el después con detalles de la vida diaria, no con adjetivos.",
    care: "Nada de ingresos, kilos, curas ni plazos. Habla de lo que la persona logra hacer o tener.",
    examples: [
      { niche: "Curso o guía", product: "Curso de Excel", hook: "Tu reporte del lunes listo en el tiempo de un café." },
      { niche: "Producto físico", product: "Organizador de cocina", hook: "Abres el gabinete y encuentras todo a la primera." },
      { niche: "Servicio", product: "Limpieza a domicilio", hook: "Llegas el viernes y la casa ya está lista." },
      { niche: "App o plantilla", product: "App de citas para salones", hook: "Tu agenda se llena sola mientras atiendes." },
    ],
  },
  {
    id: "objeciones", n: 5, core: true, name: "Rompe-objeciones",
    what: "Atacas la duda que frena la compra.",
    when: "Gente que ya te conoce y duda (retargeting) o nichos llenos de desconfianza.",
    how: "Di la objeción en voz alta con sus palabras y respóndela con una prueba o una demostración.",
    examples: [
      { niche: "Curso o guía", product: "Guía de crochet", hook: "\"Yo no tengo paciencia para tejer.\" Mira la primera clase: 15 minutos." },
      { niche: "Producto físico", product: "Sartén antiadherente", hook: "¿Otra sartén que se pega al mes? Mírala con un huevo sin aceite." },
      { niche: "Servicio", product: "Contadora para emprendedores", hook: "\"Un contador es muy caro para mi negocio.\" Te cuento qué incluye." },
      { niche: "App o plantilla", product: "App de presupuesto", hook: "\"Ya probé apps y las dejé.\" Esta se usa con dos toques al día." },
    ],
  },
  {
    id: "emocional", n: 6, core: true, name: "Emocional",
    what: "Conectas con un sentimiento, no con la lógica.",
    when: "Productos ligados a orgullo, alivio, vergüenza o ilusión.",
    how: "Cuenta un momento concreto que se siente, no que se explica.",
    care: "En primera persona solo si lo cuenta el dueño y es su historia real. Un avatar o creador no cuenta experiencias propias.",
    examples: [
      { niche: "Curso o guía", product: "Curso de repostería", hook: "La primera vez que tu hija pide TU pastel para su cumpleaños." },
      { niche: "Producto físico", product: "Álbum de fotos personalizado", hook: "El regalo que hace llorar a mamá en el buen sentido." },
      { niche: "Servicio", product: "Fotógrafa de familias", hook: "Las fotos que vas a querer tener dentro de 20 años." },
      { niche: "App o plantilla", product: "Diario digital", hook: "Lo que escribas hoy lo vas a agradecer el año que viene." },
    ],
  },
  {
    id: "estatus", n: 7, core: true, name: "Estatus / aspiración",
    what: "Lo que dice de la persona tener o usar esto.",
    when: "Productos que se muestran o que ubican a alguien como experto.",
    how: "Muestra cómo la ven los demás después, sin humillar a quien no lo tiene.",
    care: "Nada de \"si no lo tienes eres un fracasado\" ni lujos que el producto no da.",
    examples: [
      { niche: "Curso o guía", product: "Curso de lettering", hook: "Las letras que hacen que te pregunten \"¿quién te hizo eso?\"." },
      { niche: "Producto físico", product: "Termo de acero", hook: "El termo que todos en la oficina te van a preguntar dónde compraste." },
      { niche: "Servicio", product: "Diseño de marca", hook: "Que tu negocio pequeño se vea como uno grande." },
      { niche: "App o plantilla", product: "Plantilla de portafolio", hook: "El portafolio que te hace ver como el más preparado de la entrevista." },
    ],
  },
  {
    id: "miedo", n: 8, core: true, name: "Miedo / pérdida",
    what: "Lo que pierde si sigue igual.",
    when: "Cuando el costo de no actuar es claro y real.",
    how: "Muestra la pérdida pequeña y repetida, no una catástrofe.",
    care: "Sin alarmismo ni amenazas de salud o dinero. La pérdida tiene que ser real y comprobable.",
    examples: [
      { niche: "Curso o guía", product: "Curso de Excel", hook: "Cada semana pierdes una tarde copiando datos a mano." },
      { niche: "Producto físico", product: "Organizador de nevera", hook: "Lo que botas cada semana porque se escondió al fondo." },
      { niche: "Servicio", product: "Contadora para emprendedores", hook: "Cada factura perdida es un gasto que no puedes descontar." },
      { niche: "App o plantilla", product: "App de citas para salones", hook: "Cada cita olvidada es una silla vacía que ya pagaste." },
    ],
  },
  {
    id: "comodidad", n: 9, core: true, name: "Tiempo / comodidad",
    what: "Lo fácil y rápido que es.",
    when: "Gente ocupada; productos que ahorran pasos.",
    how: "Cuenta los pasos o los minutos reales y muéstralos en pantalla.",
    care: "Los minutos o pasos tienen que ser reales.",
    examples: [
      { niche: "Curso o guía", product: "Recetario de comidas para la semana", hook: "Cocinas el domingo una hora y comes bien hasta el viernes." },
      { niche: "Producto físico", product: "Picadora manual", hook: "Tres jalones y la cebolla está lista. Sin llorar." },
      { niche: "Servicio", product: "Lavandería con recogida", hook: "Dejas la bolsa en la puerta. Vuelve doblada." },
      { niche: "App o plantilla", product: "Plantilla de menú semanal", hook: "La lista del súper se arma sola con tu menú." },
    ],
  },
  {
    id: "precio", n: 10, core: true, name: "Precio / valor",
    what: "Cuánto ahorra o cuánto rinde frente a lo que cuesta.",
    when: "Público sensible al precio o productos que reemplazan un gasto mayor.",
    how: "Compara el precio real con un gasto cotidiano o con lo que ya paga.",
    care: "Solo con el precio real. Nada de descuentos o \"antes/ahora\" que no existen.",
    examples: [
      { niche: "Curso o guía", product: "Curso de uñas en casa", hook: "Lo que pagas en dos visitas al salón, para aprender a hacértelas tú." },
      { niche: "Producto físico", product: "Botella con filtro", hook: "Deja de comprar botellitas de agua cada día." },
      { niche: "Servicio", product: "Clases de inglés en grupo", hook: "El precio de una clase particular, por un mes en grupo." },
      { niche: "App o plantilla", product: "App de presupuesto", hook: "Cuesta menos que el café que no sabías que comprabas tanto." },
    ],
  },
  {
    id: "comparacion", n: 11, core: true, name: "Comparación",
    what: "Frente a la alternativa que ya usa.",
    when: "Cuando la persona ya resuelve el problema de otra forma.",
    how: "Pon lado a lado cómo lo hace hoy y cómo sería con esto.",
    care: "Nunca nombres ni muestres marcas de la competencia. Compara con \"lo de siempre\".",
    examples: [
      { niche: "Curso o guía", product: "Curso de fotografía con celular", hook: "No necesitas cámara cara: mira esta foto hecha con tu celular." },
      { niche: "Producto físico", product: "Cepillo desenredante", hook: "Cepillo normal vs. este, en el mismo nudo." },
      { niche: "Servicio", product: "Clases de manejo", hook: "Aprender con tu papá vs. aprender con instructor: mira la diferencia." },
      { niche: "App o plantilla", product: "Plantilla de inventario", hook: "Tu libreta de inventario vs. esta tabla, el mismo día." },
    ],
  },
  {
    id: "mitos", n: 12, core: true, name: "Rompe-mitos",
    what: "Desmontas una creencia que tiene.",
    when: "Nichos con creencias falsas muy repetidas.",
    how: "Di el mito, di \"no\" y explica en una frase lo que de verdad pasa.",
    examples: [
      { niche: "Curso o guía", product: "Curso de inglés", hook: "No: no necesitas vivir afuera para hablar inglés." },
      { niche: "Producto físico", product: "Aceite para pelo rizado", hook: "No: el rizo no se define poniendo más producto." },
      { niche: "Servicio", product: "Entrenadora de voz", hook: "No: cantar afinado no es un don, se practica." },
      { niche: "App o plantilla", product: "App de ahorro", hook: "No: para ahorrar no necesitas un Excel complicado." },
    ],
  },
  // ── Extra ────────────────────────────────────────────────────────────────────────────────────
  {
    id: "curiosidad", n: 13, core: false, name: "Curiosidad / secreto",
    what: "Abres una pregunta que solo se cierra viendo el anuncio entero.",
    when: "Público frío; formatos de video corto.",
    how: "Promete revelar algo concreto y cúmplelo dentro del mismo anuncio.",
    care: "El anuncio tiene que cumplir lo que abre. Nada de \"lo que no quieren que sepas\".",
    examples: [
      { niche: "Curso o guía", product: "Curso de repostería", hook: "El ingrediente más barato de tu cocina que cambia tu merengue." },
      { niche: "Producto físico", product: "Lámpara de lectura", hook: "Por qué te cansas leyendo de noche (y no son tus ojos)." },
      { niche: "Servicio", product: "Peluquería", hook: "Lo que tu estilista nota en tu pelo antes de que te sientes." },
      { niche: "App o plantilla", product: "Plantilla de Notion", hook: "La pestaña que uso para no olvidar nada del negocio." },
    ],
  },
  {
    id: "origen", n: 14, core: false, name: "Historia de origen",
    what: "Cómo y por qué nació el producto.",
    when: "Marcas personales y productos hechos por el dueño.",
    how: "Cuenta el problema que tuvo el dueño y cómo llegó a la solución.",
    care: "Solo con la historia real del dueño y contada por él. Un avatar o actor no puede contarla como suya.",
    examples: [
      { niche: "Curso o guía", product: "Guía de crochet", hook: "Empecé a tejer en la sala de espera de un hospital. Así nació esta guía." },
      { niche: "Producto físico", product: "Jabones artesanales", hook: "Los hice primero para mi hijo, que no aguantaba ningún jabón." },
      { niche: "Servicio", product: "Contadora para emprendedores", hook: "Me cansé de ver negocios cerrar por papeles, no por ventas." },
      { niche: "App o plantilla", product: "App de citas para salones", hook: "La hice porque mi mamá perdía clientas por no contestar el teléfono." },
    ],
  },
  {
    id: "enemigo", n: 15, core: false, name: "Enemigo común",
    what: "Te pones del lado de la persona contra algo que los dos odian.",
    when: "Nichos con frustraciones compartidas (burocracia, modas, letra pequeña).",
    how: "El enemigo es una práctica o una situación, nunca una persona ni una marca.",
    care: "Nunca ataques a personas, grupos ni marcas con nombre.",
    examples: [
      { niche: "Curso o guía", product: "Curso de cocina sencilla", hook: "Basta de recetas con 20 ingredientes que nadie tiene." },
      { niche: "Producto físico", product: "Cargador de viaje", hook: "Adiós a la maraña de cables en la maleta." },
      { niche: "Servicio", product: "Abogada de trámites", hook: "Las filas y los formularios que nadie te explica: yo los hago." },
      { niche: "App o plantilla", product: "App de presupuesto", hook: "Las apps de finanzas llenas de gráficos que nadie entiende." },
    ],
  },
  {
    id: "demostracion", n: 16, core: false, name: "Demostración",
    what: "No explicas: lo muestras funcionando.",
    when: "Productos con un resultado visible en segundos.",
    how: "Desde el primer segundo, el producto en acción. Las palabras acompañan.",
    care: "Sin trucos de edición que exageren el resultado; nada de antes/después del cuerpo.",
    examples: [
      { niche: "Curso o guía", product: "Curso de Excel", hook: "Mira esta tabla de 500 filas ordenarse con una fórmula." },
      { niche: "Producto físico", product: "Removedor de pelusas", hook: "Una pasada en este suéter. Mira." },
      { niche: "Servicio", product: "Lavado de muebles", hook: "El mismo sofá, 40 minutos después." },
      { niche: "App o plantilla", product: "App de citas para salones", hook: "Así reserva una clienta en 10 segundos desde Instagram." },
    ],
  },
  {
    id: "no-es-para", n: 17, core: false, name: "Para quién NO es",
    what: "Descartas a quien no le sirve; quien queda se siente elegido.",
    when: "Productos de nicho o de precio más alto; para filtrar curiosos.",
    how: "Di con honestidad a quién no le sirve y luego para quién sí.",
    examples: [
      { niche: "Curso o guía", product: "Curso de repostería avanzada", hook: "Si nunca has horneado, este curso no es para ti. Empieza por el básico." },
      { niche: "Producto físico", product: "Cuchillo de chef", hook: "No lo compres si cocinas una vez al mes." },
      { niche: "Servicio", product: "Mentoría de diseño", hook: "No es para quien busca un atajo: es para quien quiere practicar cada semana." },
      { niche: "App o plantilla", product: "Plantilla de finanzas para negocio", hook: "Si todavía no vendes, esta plantilla no te hace falta." },
    ],
  },
  {
    id: "errores", n: 18, core: false, name: "Errores comunes",
    what: "Muestras los errores que casi todos cometen y cómo evitarlos.",
    when: "Público que ya lo intentó; contenido que enseña antes de vender.",
    how: "Lista 1 a 3 errores concretos y deja la solución completa en el producto.",
    examples: [
      { niche: "Curso o guía", product: "Curso de fotografía con celular", hook: "3 errores que hacen que tus fotos de producto se vean baratas." },
      { niche: "Producto físico", product: "Sartén de hierro", hook: "El error que hace que todo se te pegue (y no es la sartén)." },
      { niche: "Servicio", product: "Asesoría de imagen", hook: "El error de color que te apaga la cara en cada foto." },
      { niche: "App o plantilla", product: "Plantilla de contenido", hook: "El error de publicar sin plan que te deja sin ideas el jueves." },
    ],
  },
  {
    id: "autodiagnostico", n: 19, core: false, name: "Autodiagnóstico",
    what: "Preguntas o un mini test para que la persona se reconozca.",
    when: "Público que no sabe que tiene el problema (frío total).",
    how: "2 o 3 preguntas de sí o no; si dice sí a dos, el producto es para ella.",
    care: "Nada de diagnósticos de salud ni preguntas que afirmen algo íntimo de quien mira.",
    examples: [
      { niche: "Curso o guía", product: "Curso de organización del tiempo", hook: "¿Terminas el día cansada y sin haber hecho lo importante? ¿Y la lista crece?" },
      { niche: "Producto físico", product: "Almohada de viaje", hook: "¿Llegas de un viaje con el cuello torcido? Sigue viendo." },
      { niche: "Servicio", product: "Contadora para emprendedores", hook: "¿Mezclas el dinero del negocio con el tuyo? ¿No sabes cuánto vendiste el mes pasado?" },
      { niche: "App o plantilla", product: "App de hábitos", hook: "Responde rápido: ¿cuántas veces empezaste el mismo hábito este año?" },
    ],
  },
  {
    id: "detras", n: 20, core: false, name: "Detrás de cámaras",
    what: "Muestras cómo se hace, se empaca o se prepara.",
    when: "Productos hechos a mano, servicios y marcas personales.",
    how: "Enseña el proceso real; la confianza sale de ver el cuidado.",
    care: "Solo procesos reales del negocio.",
    examples: [
      { niche: "Curso o guía", product: "Curso de velas artesanales", hook: "Así preparo cada vela antes de grabar la clase." },
      { niche: "Producto físico", product: "Bisutería hecha a mano", hook: "Empacando tu pedido: mira cada paso." },
      { niche: "Servicio", product: "Pastelería por encargo", hook: "De la harina a la caja: un pastel de bodas en 60 segundos." },
      { niche: "App o plantilla", product: "Plantilla de Notion", hook: "Así organizo mi semana con esta plantilla, sin cortes." },
    ],
  },
];

export const angleById = (id?: string | null): Angle | undefined =>
  id && id !== ANGLE_AUTO ? ANGLES.find(a => a.id === id) : undefined;

/** Etiqueta corta para botones: "05 · Rompe-objeciones" o "La IA elige". */
export function angleLabel(id?: string | null): string {
  const a = angleById(id);
  return a ? `${String(a.n).padStart(2, "0")} · ${a.name}` : "La IA elige el mejor";
}

/**
 * Una línea corta para prompts con tope de largo (imágenes: 2.000 caracteres). "" en automático:
 * la imagen ya trae su propio concepto.
 */
export function angleShort(id?: string | null): string {
  const a = angleById(id);
  return a ? `Ángulo de venta (uno solo, el mensaje y el texto salen de él; la composición es la indicada): ${a.name}. ${a.how}` : "";
}

/**
 * Bloque para el prompt de cualquier herramienta. `pieces` > 1 = varias piezas en una entrega
 * (3 imágenes, 10 anuncios): con un ángulo elegido, todas salen de ese ángulo con ganchos distintos;
 * en automático, cada pieza con UN ángulo propio. Siempre: nunca dos ángulos en la misma pieza.
 * `note` = false para respuestas en JSON o prompts de imagen/video (sin línea extra que rompa el formato).
 */
export function angleInstruction(id?: string | null, pieces = 1, note = true): string {
  const a = angleById(id);
  const names = ANGLES.map(x => x.name).join(", ");
  if (!a) {
    return pieces > 1
      ? `ÁNGULO DE VENTA: cada pieza usa UN solo ángulo, distinto al de las demás, elegido entre: ${names}. Nunca mezcles dos ángulos en la misma pieza.${note ? " Indica en una línea qué ángulo usa cada pieza (fuera del texto publicable)." : ""}`
      : `ÁNGULO DE VENTA: elige UN solo ángulo, el más fuerte para este producto y este público, entre: ${names}. Toda la pieza sale de ese ángulo; nunca mezcles dos o tres.${note ? " Indica en una línea cuál usaste (fuera del texto publicable)." : ""}`;
  }
  const ex = a.examples.map(e => `"${e.hook}" (${e.product})`).join(" · ");
  return [
    `ÁNGULO DE VENTA (elegido por el usuario, obligatorio): ${a.name}. ${a.what} Cómo se entra: ${a.how}`,
    a.care ? `Cuidado con este ángulo: ${a.care}` : "",
    `Ejemplos del tipo de gancho, de otros nichos (NO los copies; solo muestran el ángulo): ${ex}.`,
    pieces > 1
      ? "Todas las piezas salen de este mismo ángulo, cada una con un gancho, una situación y un cierre distintos. No mezcles otros ángulos."
      : "Toda la pieza sale de este ángulo, de principio a fin. No mezcles otros ángulos.",
  ].filter(Boolean).join("\n");
}
