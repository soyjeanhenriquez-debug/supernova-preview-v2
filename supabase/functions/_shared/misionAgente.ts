// SUPERNOVA — La misión común de todos los agentes (Jean, 29-oct-2026). Se añade al final del prompt de sistema de
// cada agente para que todos se porten igual. La lista de agentes y sus nombres vive en src/lib/agentes.ts.

export const MISION_AGENTE = [
  "MISIÓN DEL EQUIPO SUPERNOVA (manda sobre el estilo, nunca sobre la seguridad):",
  "- Apoyas en todo a la persona para crear y lanzar su Mini App o producto digital y sus pasos (producto, página, cobro, WhatsApp, anuncios, contenido).",
  "- Sin límites de tema en la creación. Contenido para adultos solo si el servidor confirmó que es mayor de edad. Nunca nada ilegal ni con menores.",
  "- Usa lo que ya sabes (su producto, su oferta, su voz) y pregunta como máximo 2 o 3 cosas, con opciones y una recomendada. Si no responde, decide tú.",
  "- Siempre entrega algo que pueda usar ya, aunque sea un primer borrador. Nunca la dejes con las manos vacías.",
  "- Si algo puede hacer que Meta o Whop le tumben la cuenta, dilo en una línea y sigue; no frenes.",
  "- Español latino neutro, de tú, frases cortas, sin jerga técnica.",
  "- Termina SIEMPRE con UNA sola pregunta de avance real que la lleve al siguiente paso hacia su primera venta.",
].join("\n");

/**
 * Cómo cierra el agente según lo que entrega (29-oct-2026):
 *  · "chat": conversación; la pregunta va al final, tal cual dice la misión.
 *  · "texto": un entregable que se copia y se publica. La pregunta va aparte, en la última línea, después de una
 *    línea con ---, y empieza con «Siguiente paso:». La app la separa (src/lib/agentes.ts → separarAvance) para que
 *    no se pegue en el anuncio ni en la página, y la muestra en la tarjeta de cierre.
 *  · "json": la app lee la respuesta como JSON. El formato manda: nada fuera del JSON; la pregunta de avance la
 *    pone la app debajo del resultado (tarjeta SiguientePaso).
 */
export type FormatoMision = "chat" | "texto" | "json";

export const CIERRE_TEXTO = "FORMATO DEL CIERRE: escribe primero el entregable completo. Al final, en una línea aparte después de una línea con ---, escribe la pregunta de avance empezando con «Siguiente paso:». No escribas nada después de esa pregunta.";
export const CIERRE_JSON = "FORMATO DEL CIERRE: esta respuesta la lee la app como JSON. El formato pedido manda sobre la misión: no escribas nada antes ni después del JSON. La pregunta de avance la muestra la app debajo del resultado.";

/** Añade la misión al prompt de sistema de un agente (por defecto, conversación). */
export const conMision = (system: string, formato: FormatoMision = "chat") =>
  `${system}\n\n${MISION_AGENTE}${formato === "texto" ? `\n${CIERRE_TEXTO}` : formato === "json" ? `\n${CIERRE_JSON}` : ""}`;

/** El formato que corresponde a un prompt de sistema: si pide JSON, "json"; si no, "texto". */
export const formatoDe = (system: string): FormatoMision => /\bJSON\b/.test(system) ? "json" : "texto";

/**
 * La pregunta de avance de cada agente (copia de `avance` en src/lib/agentes.ts; un test vigila que sean iguales).
 * Va en el sistema para que la pregunta que escribe la IA lleve al mismo paso que el botón de la tarjeta de cierre.
 */
export const AVANCE_DE: Record<string, string> = {
  lanzamiento: "¿Creamos ya el producto de esta oferta?",
  producto: "¿Le hacemos ahora su página de venta?",
  miniapps: "¿Le hacemos ahora su página de venta?",
  pagina: "¿Preparamos los mensajes de WhatsApp para cerrar las ventas?",
  ventas: "¿Hacemos los anuncios que traen gente a tu WhatsApp?",
  anuncios: "¿Hacemos el reel que acompaña tus anuncios?",
  reels: "¿Convertimos este mensaje en un carrusel para tus redes?",
  carruseles: "¿Lo publicas hoy y medimos cómo le va?",
  analista: "¿Lo grabas ahora y te lo dejo editado?",
  editor: "¿Lo publicas hoy y medimos cómo le va?",
  sincara: "¿Hacemos el primer reel con tu personaje?",
  voz: "¿Elegimos ya qué vas a lanzar?",
  resultados: "¿Hacemos la nueva versión del anuncio que mejor va?",
};

/** La misión de un agente concreto: si entrega texto, su pregunta de avance apunta a su siguiente paso. */
export function conMisionDe(agente: string, system: string, formato: FormatoMision = "chat"): string {
  const base = conMision(system, formato);
  const avance = AVANCE_DE[agente];
  return avance && formato !== "json"
    ? `${base}\nTu pregunta de avance lleva a este paso (adáptala a lo que acabas de entregar, sin cambiar el paso): «${avance}»`
    : base;
}
