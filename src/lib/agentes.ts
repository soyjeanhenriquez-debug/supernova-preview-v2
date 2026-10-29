// SUPERNOVA — El equipo de agentes (29-oct-2026, Jean: «ponle nombre de vengadores… que los usuarios conozcan, no
// inventados»). Personajes que todos conocen y que no son de nadie (mitología, leyendas y clásicos de dominio público):
// Marvel, Juego de Tronos o Breaking Bad son marcas con dueño y un producto que cobra se expone a un reclamo.
// Cada nombre va con lo que hace: Hefesto forja, Dédalo construye, Hermes vende, Argos vigila con cien ojos…
// Misión común (Jean, 29-oct-2026): apoyar en todo al usuario para crear y lanzar Mini Apps y productos digitales,
// sin límites de creación, con 2-3 preguntas orientativas, siempre entregar algo usable y cerrar con UNA pregunta
// de avance real hacia su logro. La misión del servidor está en supabase/functions/_shared/misionAgente.ts.

export type AgenteId =
  | "lanzamiento" | "producto" | "miniapps" | "pagina" | "ventas" | "anuncios"
  | "reels" | "carruseles" | "analista" | "editor" | "sincara" | "voz" | "resultados";

export type Agente = {
  id: AgenteId;
  /** Nombre de héroe (lo que ve la persona). */
  nombre: string;
  emoji: string;
  /** Qué hace, en una línea. */
  rol: string;
  /** Dirección de su herramienta en la app (#/...). null = todavía no existe. */
  ruta: string | null;
  /** El paso que sigue en el camino hacia la primera venta. */
  siguiente: AgenteId | null;
  /** Pregunta de avance real con la que este agente cierra (lleva al siguiente). */
  avance: string;
};

export const AGENTES: Record<AgenteId, Agente> = {
  lanzamiento: { id: "lanzamiento", nombre: "Ulises", emoji: "🛡️", rol: "Elige contigo qué lanzar con datos reales y dirige al equipo hasta dejarlo listo.", ruta: null, siguiente: "producto", avance: "¿Creamos ya el producto de esta oferta?" },
  producto: { id: "producto", nombre: "Hefesto", emoji: "⚒️", rol: "Te crea el producto que vendes: guía, recetario, mini curso o plantilla, listo en PDF.", ruta: "crear-producto", siguiente: "pagina", avance: "¿Le hacemos ahora su página de venta?" },
  miniapps: { id: "miniapps", nombre: "Dédalo", emoji: "🏗️", rol: "Construye tu Mini App y te deja el enlace para venderla.", ruta: "mini-apps", siguiente: "pagina", avance: "¿Le hacemos ahora su página de venta?" },
  pagina: { id: "pagina", nombre: "Atenea", emoji: "🏛️", rol: "Tu página de venta con precio por país y botón de pago, publicada en un dominio aparte.", ruta: null, siguiente: "ventas", avance: "¿Preparamos los mensajes de WhatsApp para cerrar las ventas?" },
  ventas: { id: "ventas", nombre: "Hermes", emoji: "🤝", rol: "Arma la oferta, el precio y los mensajes de WhatsApp que cierran la venta.", ruta: "generadores", siguiente: "anuncios", avance: "¿Hacemos los anuncios que traen gente a tu WhatsApp?" },
  anuncios: { id: "anuncios", nombre: "Robin Hood", emoji: "🏹", rol: "Imágenes y videos para tus anuncios, modelados de los que ya funcionan.", ruta: "creativos", siguiente: "reels", avance: "¿Hacemos el reel que acompaña tus anuncios?" },
  reels: { id: "reels", nombre: "Zeus", emoji: "⚡", rol: "Escribe tu reel, le pone voz, imágenes y subtítulos, y te entrega el video.", ruta: "con-tu-cara/reel-ia", siguiente: "carruseles", avance: "¿Convertimos este mensaje en un carrusel para tus redes?" },
  carruseles: { id: "carruseles", nombre: "Merlín", emoji: "🔮", rol: "Modela un carrusel que ya funciona, con tu cara en la portada.", ruta: "carrusel", siguiente: "resultados", avance: "¿Lo publicas hoy y medimos cómo le va?" },
  analista: { id: "analista", nombre: "Sherlock Holmes", emoji: "🔍", rol: "Te dice por qué un reel funciona y te da tu versión para grabarla.", ruta: "con-tu-cara", siguiente: "editor", avance: "¿Lo grabas ahora y te lo dejo editado?" },
  editor: { id: "editor", nombre: "Pegaso", emoji: "💨", rol: "Si grabaste tú, te pone subtítulos, portada y cierre. Sin saber editar.", ruta: "con-tu-cara", siguiente: "resultados", avance: "¿Lo publicas hoy y medimos cómo le va?" },
  sincara: { id: "sincara", nombre: "El Fantasma de la Ópera", emoji: "🎭", rol: "Si no quieres salir, un personaje creado con IA da la cara por ti.", ruta: "personaje", siguiente: "reels", avance: "¿Hacemos el primer reel con tu personaje?" },
  voz: { id: "voz", nombre: "Eco", emoji: "🧬", rol: "Aprende cómo hablas y escribes, para que todo suene a ti.", ruta: "tu-adn", siguiente: "lanzamiento", avance: "¿Elegimos ya qué vas a lanzar?" },
  resultados: { id: "resultados", nombre: "Argos", emoji: "🔭", rol: "Lee cómo van tus anuncios y ventas y te dice qué cambiar hoy.", ruta: "resultados", siguiente: "anuncios", avance: "¿Hacemos la nueva versión del anuncio que mejor va?" },
};

/** El orden del camino, de elegir a medir (para mostrar el equipo). */
export const EQUIPO: AgenteId[] = ["lanzamiento", "producto", "miniapps", "pagina", "ventas", "anuncios", "reels", "carruseles", "analista", "editor", "sincara", "voz", "resultados"];

/** El paso que sigue a un agente (si su herramienta ya existe). */
export function siguientePaso(id: AgenteId): Agente | null {
  const s = AGENTES[id].siguiente;
  return s && AGENTES[s].ruta ? AGENTES[s] : null;
}
