// SUPERNOVA — Reglas comunes para modelar carruseles (06-oct-2026).
// Las usan carousel-clone (el carrusel completo) y carousel-slide-model (una sola lámina), para que
// las dos escriban igual: misma voz, mismos tipos de lámina, mismo "diseño" (JSON visual de cada
// lámina del original, pensado para que una IA de imagen la recree casi idéntica).
// Sin imports: solo texto y utilidades puras.

export const SYSTEM = `Eres el director creativo de SUPERNOVA. Analizas carruseles de Instagram que ya funcionan y creas versiones nuevas para emprendedores latinos que empiezan de cero, con el método "Roba como un artista" y el "ADN ganador":
- Todo carrusel se descompone en unas 9 partes. Si se mantienen todas, es una copia. Según el modo que se te pida: en "mismo tema" se conservan el tema, las ideas y la estructura (reescritos con tus palabras); en "producto" se mantienen SOLO las 3 partes que explican por qué funcionó y se cambia todo lo demás.
- Clonar lo que funciona es la base (no se reinventa la rueda). Lo único que no se hace es copiar y pegar en el mismo idioma, traducir palabra por palabra, ni usar sus fotos, su cara, su nombre, su marca, sus números ni sus recursos.
- La versión nueva debe ser MEJOR que el original: aplica la fórmula de 6 posiciones (apertura que crea un deseo, agarre en la lámina 2 que responde solo la portada, columna donde cada lámina abre la siguiente, ritmo corta/densa, giro "Para que puedas…", remate con creencia nueva + UNA acción) y que cada lámina lleve algo real (ejemplo, comparación, regla con veredicto).
Español neutro latinoamericano, de tú, frases cortas, sin jerga. Sin emojis en las láminas; en el pie, solo si el original los usa (los mismos en el mismo lugar). Prohibido: promesas de ingresos o de resultados, plazos, testimonios, cifras o estudios inventados, urgencia falsa, marcas ajenas, personas famosas.
En todo lo que lee la persona (mejoras, necesitas, por qué funciona) di "modelar" y "tu versión", nunca "clonar" ni "clon".
Respondes SOLO con el JSON pedido.`;

/** Lámina por lámina en modo "tema" (espejo del original). */
export const TEMA_LAMINAS_RULE = "LÁMINAS: lámina por lámina, la misma idea y el mismo tipo de contenido que la lámina del original en esa posición. Si el original muestra una cuadrícula de fotos o ejemplos con etiquetas, usa el tipo 'galeria' (ver GALERÍAS). No fuerces los tipos respuesta o giro si el original no los tiene.";

/** Jean, 06-oct-2026: el modelado perdía comandos de las cuadrículas. */
export const GALERIA_RULE = "GALERÍAS (OBLIGATORIO): una lámina tipo 'galeria' conserva TODAS las celdas de la cuadrícula del original (máximo 9 por lámina), en el MISMO orden (de izquierda a derecha y de arriba abajo), sin juntar, saltar ni inventar celdas: si el original tiene 9, tu versión tiene 9. Las etiquetas se copian EXACTAS, carácter por carácter, cuando son comandos, atajos, prompts cortos, nombres de herramientas o términos técnicos que funcionan tal cual (ej. '/droneview', 'Ctrl + K'), porque son la utilidad; solo si la etiqueta es una frase en otro idioma se transcrea con la misma idea y casi la misma longitud. Antes de responder, cuenta las celdas del original y las tuyas: deben coincidir.";

export const SIRVE_RULE = "SIRVE PARA CUALQUIER CARRUSEL: mira cómo está construido y repite esa construcción. Si cada lámina es una escena (de una película, una serie, un viaje, una historia), cada lámina lleva su 'escena' para que la IA de imagen la cree con la persona o con personajes propios (nunca actores, personajes ni fotogramas reales: se recrea la idea). Si son capturas de una app, frases sobre fondo, antes/después o un producto, usa el tipo de lámina que más se parezca.";

/** Los tipos de lámina que el diseño de la app sabe pintar. */
export const TIPOS_LAMINA = [
  "TIPOS DE LÁMINA (el diseño ya existe; tú solo llenas el texto):",
  "- respuesta: la lámina 2, responde SOLO la portada. titulo + texto.",
  "- problema: 3 items (titulo 2-5 palabras + texto ≤12 palabras) + veredicto.",
  "- comparacion: 2 items: el primero lo que NO funciona, el segundo lo que SÍ (titulo = etiqueta como NO/SÍ, DÉBIL/FUERTE, ANTES/DESPUÉS; texto ≤18 palabras) + veredicto.",
  "- solucion: titulo + texto ≤30 palabras + veredicto.",
  "- tarjetas: 4 items (titulo 1-4 palabras + texto ≤10 palabras) + veredicto.",
  "- pasos: 3 items en orden + veredicto.",
  "- regla: para carruseles de 'reglas', 'claves' o 'estilos': pastilla ('Regla 1', 'Clave 2'…), titulo = 1 o 2 palabras GIGANTES, texto = una frase ≤10 palabras, veredicto ≤14 palabras (o una acción corta, como 'Busca \"…\"'), escena = foto de ejemplo para esa regla. Opcional: items = 3 líneas muy cortas (qué hace, cuándo usarlo, cuándo no), si el original las tiene.",
  "- galeria: una cuadrícula de 2 a 9 fotos o ejemplos con etiqueta, con EXACTAMENTE las mismas celdas que el original. titulo = el encabezado de la lámina (puede ir vacío si el original no tiene), items = cada celda en orden: titulo = la etiqueta tal como se ve (≤32 caracteres), texto = qué muestra esa foto, para que la IA de imagen la cree (≤18 palabras). escena = qué tienen en común todas las fotos (la misma persona, el mismo lugar, la misma ropa).",
  "- giro: la penúltima, 'Para que puedas…', ≤14 palabras.",
  "- llamada: la última. titulo = la creencia nueva; palabra = UNA palabra clave en MAYÚSCULAS conectada con esa creencia; texto = qué recibe al comentarla; items = 1 recordatorio.",
  "Cada lámina (menos llamada y giro) lleva 'puente' (≤7 palabras, abre la siguiente) y 'peso' (corta o densa; nunca dos iguales seguidas). Marca 1 o 2 palabras de cada titular entre *asteriscos*. 'escena' (opcional en todas, obligatoria en regla) = una foto cinematográfica SIN texto que muestre la idea: personas latinas comunes, sin famosos, sin marcas, sin dinero.",
].join("\n");

/** Forma del JSON visual de UNA lámina del original. */
export const DISENO_SHAPE = `{"formato":"4:5","fondo":"","composicion":"","camara":"","sujeto":"","tipografia":[{"texto_rol":"titular","estilo":"","color":"#000000","posicion":"","tamano":"grande","efectos":""}],"elementos":[],"cuadricula":{"columnas":0,"filas":0,"celdas":[{"etiqueta":"","toma":""}]},"paleta":["#000000"],"luz":"","textura":""}`;

export const DISENO_RULE = [
  `DISEÑO (JSON visual de la lámina del original, para que una IA de imagen la recree casi idéntica): ${DISENO_SHAPE}.`,
  "formato = 4:5 o 1:1. fondo = color, degradado o foto de fondo. composicion = dónde va cada bloque (tercios, centro, arriba/abajo, márgenes). camara = plano y ángulo si hay foto (primer plano, cenital, 3/4…), vacío si no. sujeto = qué persona u objeto aparece, pose, ropa y gesto, descrito de forma genérica (nunca quién es).",
  "tipografia = un objeto por cada bloque de texto visible, de arriba abajo: texto_rol (titular, subtitulo, etiqueta, lista o cta), estilo (familia aproximada como 'sans geométrica negra', 'serifa de revista', 'condensada', 'trazo a mano'; peso; si va en MAYÚSCULAS o cursiva), color en hex, posicion, tamano (enorme, grande, mediano o pequeno) y efectos (sombra, contorno, resaltado, subrayado…).",
  "elementos = los adornos que dan el estilo (pastillas, flechas, iconos, subrayados, stickers, marcos, numeración…). cuadricula SOLO si la lámina es una cuadrícula: columnas, filas y TODAS las celdas en orden con su etiqueta EXACTA y la toma (qué muestra la foto); si no es cuadrícula, cuadricula = null. paleta = 2 a 5 colores en hex. luz y textura en pocas palabras.",
  "En el diseño NUNCA van nombres de personas, cuentas, marcas ni logos ajenos (si hay un logo, escribe 'logo pequeño arriba a la derecha', sin decir de quién).",
].join("\n");

// ---------- utilidades ----------

const s = (v: unknown, n: number) => (typeof v === "string" ? v : "").replace(/\s+/g, " ").trim().slice(0, n);
const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v.trim()) ? v.trim() : "");
const int = (v: unknown, max: number) => { const x = Math.round(Number(v)); return Number.isFinite(x) && x > 0 ? Math.min(x, max) : 0; };
const ROLES = ["titular", "subtitulo", "etiqueta", "lista", "cta"];
const SIZES = ["enorme", "grande", "mediano", "pequeno"];

export interface Diseno {
  formato: "4:5" | "1:1"; fondo: string; composicion: string; camara: string; sujeto: string;
  tipografia: { texto_rol: string; estilo: string; color: string; posicion: string; tamano: string; efectos: string }[];
  elementos: string[];
  cuadricula: { columnas: number; filas: number; celdas: { etiqueta: string; toma: string }[] } | null;
  paleta: string[]; luz: string; textura: string;
}

/** Deja el diseño con la forma pactada y con topes de tamaño (lo que diga la IA no se confía). */
export function cleanDiseno(v: unknown): Diseno | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  const typo = Array.isArray(d.tipografia) ? d.tipografia : [];
  const q = d.cuadricula && typeof d.cuadricula === "object" ? d.cuadricula as Record<string, unknown> : null;
  const celdas = q && Array.isArray(q.celdas)
    ? (q.celdas as unknown[]).slice(0, 9).map(c => {
      const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      return { etiqueta: s(o.etiqueta, 60), toma: s(o.toma, 160) };
    }).filter(c => c.etiqueta || c.toma)
    : [];
  return {
    formato: d.formato === "1:1" ? "1:1" : "4:5",
    fondo: s(d.fondo, 240), composicion: s(d.composicion, 400), camara: s(d.camara, 160), sujeto: s(d.sujeto, 300),
    tipografia: typo.slice(0, 8).map(t => {
      const o = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
      return {
        texto_rol: ROLES.includes(String(o.texto_rol)) ? String(o.texto_rol) : "etiqueta",
        estilo: s(o.estilo, 160), color: hex(o.color), posicion: s(o.posicion, 120),
        tamano: SIZES.includes(String(o.tamano)) ? String(o.tamano) : "mediano", efectos: s(o.efectos, 120),
      };
    }),
    elementos: (Array.isArray(d.elementos) ? d.elementos : []).slice(0, 12).map(e => s(e, 120)).filter(Boolean),
    cuadricula: celdas.length ? { columnas: int(q?.columnas, 9), filas: int(q?.filas, 9), celdas } : null,
    paleta: (Array.isArray(d.paleta) ? d.paleta : []).map(hex).filter(Boolean).slice(0, 6),
    luz: s(d.luz, 160), textura: s(d.textura, 160),
  };
}

const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

/**
 * Hace que el análisis guardado quepa (carousel_clones.analysis ≤ 32 KB): si pasa de `limit` bytes,
 * va recortando a la mitad el texto más largo dentro de los `diseno` de las láminas, y si aun así no
 * cabe, quita los diseños desde la última lámina. Nunca lanza: así el insert no falla por tamaño.
 */
export function fitAnalysis<T extends { laminas?: unknown[] }>(analysis: T, limit = 28_000): T {
  if (bytes(analysis) <= limit) return analysis;
  const a = JSON.parse(JSON.stringify(analysis)) as T;
  const laminas = (Array.isArray(a.laminas) ? a.laminas : []) as Record<string, unknown>[];
  // Todos los textos de los diseños, como [objeto, clave].
  const slots: [Record<string, unknown>, string][] = [];
  const walk = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === "string") { if (k !== "etiqueta") slots.push([o as Record<string, unknown>, k]); }
      else walk(v);
    }
  };
  for (const l of laminas) walk(l?.diseno);
  for (let i = 0; i < 400 && bytes(a) > limit; i++) {
    let best: [Record<string, unknown>, string] | null = null;
    let len = 40; // por debajo de esto no vale la pena recortar
    for (const [o, k] of slots) { const n = String(o[k]).length; if (n > len) { len = n; best = [o, k]; } }
    if (!best) break;
    best[0][best[1]] = String(best[0][best[1]]).slice(0, Math.floor(len / 2));
  }
  for (let i = laminas.length - 1; i >= 0 && bytes(a) > limit; i--) if (laminas[i]) delete laminas[i].diseno;
  return a;
}

/** Tipos de lámina válidos (los que el diseño de la app sabe pintar). */
export const TIPOS = ["respuesta", "problema", "comparacion", "solucion", "tarjetas", "pasos", "regla", "galeria", "giro", "llamada"];

/**
 * Red de seguridad para las galerías (Jean, 06-oct-2026: se perdían comandos): si la lámina nueva es
 * 'galeria' y trae menos celdas que la cuadrícula del original, se completan las que faltan, en orden,
 * con la etiqueta exacta y la toma del original. Nunca pasa de 9.
 */
export function fillGaleria(lamina: Record<string, unknown>, diseno: Diseno | null): Record<string, unknown> {
  const celdas = diseno?.cuadricula?.celdas ?? [];
  if (lamina.tipo !== "galeria" || !celdas.length) return lamina;
  const items = (Array.isArray(lamina.items) ? lamina.items : []).slice(0, 9);
  for (let i = items.length; i < Math.min(9, celdas.length); i++) items.push({ titulo: celdas[i].etiqueta, texto: celdas[i].toma });
  return { ...lamina, items };
}
