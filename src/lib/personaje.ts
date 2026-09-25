import type { BusinessProfile } from "@/lib/businessProfile";

/**
 * "Vende sin mostrar tu cara" (etapa 5): un PERSONAJE creado con IA que cuenta la oferta gemela
 * en contenido orgánico (Reels, TikTok, Shorts). Reglas que no se negocian (manual de SUPERNOVA):
 * - Es un narrador o una marca, NUNCA un falso experto: sin edades, títulos, curas, testimonios ni
 *   resultados inventados.
 * - La bio dice que es un personaje creado con IA (Instagram y TikTok piden etiquetar la IA realista).
 * - Promete lo que el producto enseña o ayuda a lograr, nunca ingresos ni resultados de salud seguros.
 * Lo que se genera se guarda en products.journey.personaje (como el gemelo).
 */

export type Personaje = {
  nombre: string;
  rol: string;        // "Narradora del método", "La vecina que organiza su dinero"…
  historia: string;   // 2-3 frases, sin credenciales inventadas
  aspecto: string;    // descripción visual para generar la foto
  voz: string;        // cómo habla
  gancho: string;     // lo que lo hace distinto en su nicho
  bio: string;        // ≤150 caracteres, incluye "Personaje creado con IA"
};

export type Guion = { titulo: string; gancho: string; guion: string; pantalla: string; cta: string };

export type PersonajeState = {
  opciones?: Personaje[];
  elegido?: Personaje | null;
  foto?: string | null;      // URL de la foto guardada (Storage) o data URL mientras se sube
  guiones?: Guion[];
  avisame?: boolean;         // pidió aviso cuando abran los videos
  actualizado?: string;
};

export const HONESTY_RULES = `REGLAS DE HONESTIDAD (obligatorias, no se negocian):
- El personaje es un NARRADOR o una MARCA creada con IA, no un experto real. Nunca le inventes edad extrema, títulos, profesión regulada (médico, nutriólogo, abogado, asesor financiero), años de experiencia, curas, testimonios, clientes, cifras de ventas ni resultados.
- Puede tener personalidad, estilo y una historia de ficción ligera, pero nada que se presente como un hecho verificable para vender.
- Nunca prometas ingresos, resultados de salud, físicos ni plazos ("gana X en 7 días", "baja 10 kilos"). Habla de lo que el producto enseña o ayuda a hacer.
- Nada de productos milagro, detox ni curas. Salud = hábitos y organización.
- La bio SIEMPRE incluye "Personaje creado con IA".`;

const fichaTexto = (p: Pick<BusinessProfile, "product" | "who" | "promise" | "price">) =>
  `Producto: ${p.product}\nPara quién: ${p.who}\nQué logra: ${p.promise}${p.price ? `\nPrecio: US$${p.price}` : ""}`;

/** Instrucción para proponer 3 personajes a partir de la ficha (generador personaje-ideas). */
export function promptIdeas(p: Pick<BusinessProfile, "product" | "who" | "promise" | "price">, pais: string) {
  const system = `Eres el estratega de contenido de SUPERNOVA. Creas personajes con IA para que emprendedores hispanos vendan productos digitales con contenido orgánico SIN mostrar su cara. Escribes en español latinoamericano neutro, cálido y directo.\n\n${HONESTY_RULES}\n\nResponde SOLO con un arreglo JSON válido, sin texto antes ni después.`;
  const user = `Crea 3 personajes MUY distintos entre sí (edad aparente, estilo y tono) para vender este producto en ${pais}:\n\n${fichaTexto(p)}\n\nBusca el hueco del nicho: si todos los que venden esto son parecidos, propón lo contrario (como una abuela elegante en el nicho del dinero, donde todos son jóvenes con carros).\n\nFormato exacto, 3 elementos:\n[{"nombre":"","rol":"","historia":"","aspecto":"","voz":"","gancho":"","bio":""}]\n\n- rol: en pocas palabras qué es (p. ej. "Narradora del método"), nunca un título profesional.\n- aspecto: descripción física y de ropa para una foto realista, en español, 1-2 frases.\n- bio: máximo 150 caracteres, termina con "· Personaje creado con IA".`;
  return { system, user };
}

/** Instrucción para 10 guiones cortos del personaje elegido (generador personaje-guiones). */
export function promptGuiones(p: Pick<BusinessProfile, "product" | "who" | "promise" | "price">, pj: Personaje, ganchos: string[], pais: string) {
  const system = `Eres el guionista de SUPERNOVA. Escribes guiones de video corto vertical (Reels, TikTok, Shorts) de 20 a 40 segundos para un personaje creado con IA que vende un producto digital en ${pais}. Español latinoamericano neutro, frases cortas, como se habla.\n\n${HONESTY_RULES}\n\nResponde SOLO con un arreglo JSON válido, sin texto antes ni después.`;
  const base = ganchos.length
    ? `\n\nGanchos que llevan meses funcionando en anuncios reales (úsalos como PLANTILLA de estructura, adaptados; nunca copies marcas ni nombres):\n${ganchos.map((g, i) => `${i + 1}. ${g}`).join("\n")}`
    : "";
  const user = `Personaje:\nNombre: ${pj.nombre}\nRol: ${pj.rol}\nHistoria: ${pj.historia}\nVoz: ${pj.voz}\nGancho: ${pj.gancho}\n\nProducto que vende:\n${fichaTexto(p)}${base}\n\nEscribe 10 guiones distintos: 4 de consejo útil, 3 de historia o situación con la que el público se identifica, 2 de "error común" y 1 que presente el producto directo. Solo 1 de cada 3 menciona el producto; los demás dan valor y cierran invitando a seguir la cuenta.\n\nFormato exacto:\n[{"titulo":"","gancho":"primera frase, máximo 12 palabras","guion":"lo que dice el personaje, 50-90 palabras","pantalla":"texto corto para poner encima del video","cta":"cierre"}]`;
  return { system, user };
}

/** Prompt de la foto del personaje (generate-ad-creative, formato 9:16). */
export function promptFoto(pj: Personaje) {
  return `Retrato fotográfico realista, vertical, de ${pj.nombre}: ${pj.aspecto}. Luz natural suave, piel con textura real (no retocada), fondo de un lugar cotidiano acorde a su estilo, mirada a cámara, encuadre de medio cuerpo. Sin texto, sin logos, sin marcas de ropa visibles.`;
}

/** Extrae el primer arreglo JSON de la respuesta de la IA (a veces viene con ```json). */
export function parseArray<T>(raw: string): T[] {
  const s = raw.indexOf("["), e = raw.lastIndexOf("]");
  if (s === -1 || e <= s) return [];
  try {
    const v = JSON.parse(raw.slice(s, e + 1));
    return Array.isArray(v) ? v as T[] : [];
  } catch { return []; }
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Limpia lo que vino de la IA y garantiza la etiqueta de IA en la bio. */
export function cleanPersonaje(x: Partial<Personaje>): Personaje | null {
  const p: Personaje = {
    nombre: str(x.nombre, 40), rol: str(x.rol, 80), historia: str(x.historia, 400), aspecto: str(x.aspecto, 400),
    voz: str(x.voz, 200), gancho: str(x.gancho, 200), bio: str(x.bio, 160),
  };
  if (!p.nombre || !p.aspecto) return null;
  if (!/creado con ia/i.test(p.bio)) p.bio = `${p.bio.replace(/[\s·]+$/, "").slice(0, 125)} · Personaje creado con IA`;
  return p;
}

export function cleanGuion(x: Partial<Guion>): Guion | null {
  const g: Guion = { titulo: str(x.titulo, 80), gancho: str(x.gancho, 140), guion: str(x.guion, 900), pantalla: str(x.pantalla, 120), cta: str(x.cta, 160) };
  return g.guion ? g : null;
}
