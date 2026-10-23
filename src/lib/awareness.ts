/**
 * Niveles de consciencia (22-oct-2026, pedido de Jean): cada pieza (anuncio, video, Reel, carrusel,
 * texto) le habla a UN nivel. El mismo mensaje no sirve para todos: "cómpralo ya" a quien ni sabe que
 * tiene el problema no funciona. Se elige en una escalera de 5 peldaños junto al ángulo de venta.
 * Textos propios (la idea de los 5 niveles es de dominio público en respuesta directa).
 */
import { ANGLES } from "@/lib/angles";

export const LEVEL_AUTO = "auto";

export type AwarenessLevel = {
  id: string;
  n: 1 | 2 | 3 | 4 | 5;
  name: string;
  /** Cómo está la persona, en una frase. */
  state: string;
  /** Temperatura del público. */
  temp: string;
  /** La jugada: qué hace la pieza en este nivel. */
  play: string;
  tactics: string[];
  /** El error típico en este nivel. */
  avoid: string;
  /** Mismo producto, gancho distinto por nivel (curso de repostería). */
  example: string;
  /** Ángulos que mejor funcionan aquí (ids de src/lib/angles.ts). */
  angles: string[];
  /** Tráfico frío (gente que no te conoce) o caliente (ya te vio). */
  cold: boolean;
};

export const LEVELS: AwarenessLevel[] = [
  {
    id: "inconsciente", n: 1, cold: true, name: "Inconsciente", temp: "Frío total",
    state: "No sabe que tiene el problema.",
    play: "Ábrele los ojos",
    tactics: ["Una historia", "Un dato curioso", "Enseñar algo"],
    avoid: "Venderle de entrada. Primero tiene que reconocerse en el problema.",
    example: "Lo que nadie te cuenta de hornear con el horno de tu casa.",
    angles: ["curiosidad", "autodiagnostico", "emocional", "mitos", "origen"],
  },
  {
    id: "problema", n: 2, cold: true, name: "Consciente del problema", temp: "Frío",
    state: "Siente el dolor, no sabe que hay salida.",
    play: "Agita el dolor y muestra que hay salida",
    tactics: ["Nombrar el dolor", "Ponerle palabras", "Hay solución"],
    avoid: "Hablar de tu producto antes de que sienta que lo entiendes.",
    example: "¿Tu bizcocho sube en el horno y se hunde al sacarlo?",
    angles: ["problema", "miedo", "identidad", "enemigo", "errores", "autodiagnostico"],
  },
  {
    id: "solucion", n: 3, cold: true, name: "Consciente de la solución", temp: "Templado",
    state: "Conoce soluciones, pero no la tuya.",
    play: "Explica tu mecanismo",
    tactics: ["Por qué el tuyo sí", "Por qué lo de siempre no", "Un culpable"],
    avoid: "Prometer lo mismo que todos. Sin un porqué, suenas igual a los demás.",
    example: "No es tu receta: es la temperatura de la mantequilla. Así se arregla.",
    angles: ["mecanismo", "comparacion", "mitos", "demostracion", "errores"],
  },
  {
    id: "producto", n: 4, cold: false, name: "Consciente del producto", temp: "Caliente",
    state: "Ya te conoce, pero duda.",
    play: "Dale pruebas",
    tactics: ["Demostración", "Reseñas reales", "Comparativa"],
    avoid: "Repetirle lo que ya sabe. Quítale las dudas una por una.",
    example: "¿Dudas si es para ti? Mira la primera clase completa, sin cortes.",
    angles: ["objeciones", "demostracion", "comparacion", "detras", "no-es-para", "precio"],
  },
  {
    id: "mas-consciente", n: 5, cold: false, name: "El más consciente", temp: "Al rojo",
    state: "Ya te quiere comprar, le falta el empujón.",
    play: "Dale el empujón",
    tactics: ["La oferta", "Fecha real", "Garantía real"],
    avoid: "Inventar urgencia o garantías. Solo lo que existe de verdad.",
    example: "Ya viste las clases. Esto incluye el curso y así te escribo por WhatsApp para inscribirte.",
    angles: ["precio", "beneficio", "comodidad", "objeciones", "estatus"],
  },
];

export const levelById = (id?: string | null): AwarenessLevel | undefined =>
  id && id !== LEVEL_AUTO ? LEVELS.find(l => l.id === id) : undefined;

export function levelLabel(id?: string | null): string {
  const l = levelById(id);
  return l ? `Nivel ${l.n} · ${l.name}` : "La IA decide (gente nueva: 1 a 3)";
}

const angleNames = (ids: string[]) => ids.map(id => ANGLES.find(a => a.id === id)?.name).filter(Boolean).join(", ");

/**
 * Bloque para el prompt. `note` = false para respuestas en JSON. Siempre UN nivel por pieza;
 * con varias piezas en automático, cada una puede ir a un nivel distinto (de 1 a 3 si es tráfico frío).
 */
export function levelInstruction(id?: string | null, pieces = 1, note = true): string {
  const l = levelById(id);
  if (!l) {
    return pieces > 1
      ? `NIVEL DE CONSCIENCIA: cada pieza le habla a UN solo nivel (1 no sabe que tiene el problema · 2 siente el dolor · 3 conoce soluciones, no la tuya · 4 te conoce y duda · 5 quiere comprar). Para anuncios a gente que no conoce la marca, usa los niveles 1 a 3, nunca "cómpralo ya".${note ? " Indica en una línea el nivel de cada pieza (fuera del texto publicable)." : ""}`
      : `NIVEL DE CONSCIENCIA: elige UN solo nivel y escribe toda la pieza para él (1 no sabe que tiene el problema · 2 siente el dolor · 3 conoce soluciones, no la tuya · 4 te conoce y duda · 5 quiere comprar). Si es para gente que no conoce la marca, usa 1 a 3: nunca entres con "cómpralo ya".${note ? " Indica en una línea qué nivel usaste (fuera del texto publicable)." : ""}`;
  }
  return [
    `NIVEL DE CONSCIENCIA (elegido por el usuario, obligatorio): nivel ${l.n}, ${l.name}. La persona: ${l.state} La jugada: ${l.play.toLowerCase()} (${l.tactics.join(", ").toLowerCase()}).`,
    `Error que hay que evitar: ${l.avoid}`,
    l.n === 5 ? "Oferta, fechas y garantías solo si están en los datos del usuario; si no hay, cierra con una llamada a la acción directa sin inventarlas." : "",
    l.n === 4 ? "Reseñas o cifras solo si están en los datos del usuario; si no hay, usa una demostración." : "",
    l.cold ? "Es gente que no conoce la marca: nada de \"cómpralo ya\" ni de oferta agresiva." : "",
    `Ángulos que mejor funcionan en este nivel: ${angleNames(l.angles)}.`,
    pieces > 1 ? "Todas las piezas le hablan a este mismo nivel." : "Toda la pieza le habla a este nivel, de principio a fin.",
  ].filter(Boolean).join("\n");
}

/** Línea corta para prompts de imagen (tope de 2.000 caracteres). "" en automático. */
export function levelShort(id?: string | null): string {
  const l = levelById(id);
  return l ? `Nivel de consciencia del público: ${l.n} (${l.name}): ${l.play.toLowerCase()}.` : "";
}
