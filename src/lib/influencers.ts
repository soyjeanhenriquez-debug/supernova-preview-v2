import type { Personaje } from "@/lib/personaje";

/**
 * Influencer IA (05-oct-2026, pedido de Jean): 4 avatares de SUPERNOVA listos para elegir y las voces
 * del video que habla. Todo puro (sin red).
 *
 * - Los avatares son fotos de la marca en public/avatares/. Al elegir uno, la foto se copia a la carpeta
 *   del usuario en el bucket "personajes": así el servidor la acepta igual que una foto propia
 *   (video-studio solo usa imágenes de la carpeta del usuario). Elegir uno es gratis.
 * - La voz: el video que habla lo hace Seedance 2.0 Mini (APIMart), que crea la voz y el movimiento de
 *   los labios a la vez. No recibe un audio ni un id de voz: la voz se le DESCRIBE (género, edad
 *   aparente, tono). Por eso aquí hay estilos de voz, no voces exactas, y se dice así al usuario.
 */

export type Genero = "mujer" | "hombre";

export type StockInfluencer = {
  id: string;
  foto: string;          // ruta pública (public/avatares)
  genero: Genero;
  edad: "joven" | "mayor";
  pais: string;          // solo para mostrar variedad; habla en español latino neutro
  vozId: VoiceId;        // voz sugerida al elegirlo
  personaje: Omit<Personaje, "rol"> & { rol: string };
};

const bio = (s: string) => `${s} · Personaje creado con IA`;

export const STOCK_INFLUENCERS: StockInfluencer[] = [
  {
    id: "valentina", foto: "/avatares/valentina.webp", genero: "mujer", edad: "joven", pais: "República Dominicana", vozId: "alegre",
    personaje: {
      nombre: "Valentina", rol: "La amiga que te lo explica fácil",
      historia: "Le encanta encontrar la forma más simple de hacer las cosas y contarla sin rodeos, como se lo diría a una amiga.",
      aspecto: "Mujer afrolatina dominicana de unos 25 años, cabello rizado natural, sonrisa cálida, blusa de punto color crema y aretes pequeños dorados.",
      voz: "Cercana, alegre y con energía; frases cortas.",
      gancho: "Explica en 30 segundos lo que otros enredan en una hora.",
      bio: bio("Te lo explico fácil y en corto"),
    },
  },
  {
    id: "carmen", foto: "/avatares/carmen.webp", genero: "mujer", edad: "mayor", pais: "México", vozId: "calida",
    personaje: {
      nombre: "Doña Carmen", rol: "La voz tranquila que pone orden",
      historia: "Le gusta enseñar con calma y paciencia, paso a paso, para que nadie se sienta perdido.",
      aspecto: "Mujer mexicana mestiza de unos 60 años, cabello corto plateado, expresión amable y segura, blusa color terracota.",
      voz: "Cálida, pausada y de confianza.",
      gancho: "Una señora elegante en un nicho donde todos son jóvenes: se nota y genera confianza.",
      bio: bio("Paso a paso y sin prisa"),
    },
  },
  {
    id: "andres", foto: "/avatares/andres.webp", genero: "hombre", edad: "joven", pais: "Colombia", vozId: "alegre",
    personaje: {
      nombre: "Andrés", rol: "El que lo prueba y te cuenta cómo se usa",
      historia: "Curioso y práctico: le gusta mostrar cómo se usan las cosas, sin exagerar ni prometer de más.",
      aspecto: "Hombre colombiano de unos 28 años, piel trigueña clara, cabello oscuro ondulado corto y barba cuidada, camiseta azul marino.",
      voz: "Relajada, amable y directa.",
      gancho: "Habla como un amigo, no como un vendedor.",
      bio: bio("Te muestro cómo se usa, sin rodeos"),
    },
  },
  {
    id: "julio", foto: "/avatares/julio.webp", genero: "hombre", edad: "mayor", pais: "Perú", vozId: "serena",
    personaje: {
      nombre: "Don Julio", rol: "El consejo sereno de alguien con calma",
      historia: "Habla despacio y con claridad; prefiere un buen consejo a mil palabras.",
      aspecto: "Hombre peruano de unos 60 años con rasgos andinos, piel morena, cabello corto canoso, sonrisa tranquila, camisa verde oliva.",
      voz: "Grave, serena y pausada.",
      gancho: "Transmite calma en un nicho lleno de gritos y prisa.",
      bio: bio("Consejos claros, con calma"),
    },
  },
];

export const stockById = (id: string | null | undefined) => STOCK_INFLUENCERS.find(s => s.id === id) ?? null;

export type VoiceId = "calida" | "alegre" | "serena";

/** 3 estilos de voz; el género sale del influencer. Se describen al modelo de video en el prompt. */
export const VOICES: { id: VoiceId; label: string; desc: string; prompt: Record<Genero, string> }[] = [
  { id: "calida", label: "Cálida y cercana", desc: "Como una conversación de confianza.",
    prompt: { mujer: "voz femenina cálida y cercana, tono de confianza, ritmo natural", hombre: "voz masculina cálida y cercana, tono de confianza, ritmo natural" } },
  { id: "alegre", label: "Alegre y con energía", desc: "Para ganchos rápidos de Reels y TikTok.",
    prompt: { mujer: "voz femenina alegre y con energía, sonrisa en la voz, ritmo ágil", hombre: "voz masculina alegre y con energía, sonrisa en la voz, ritmo ágil" } },
  { id: "serena", label: "Serena y segura", desc: "Más pausada; transmite calma y seguridad.",
    prompt: { mujer: "voz femenina serena y segura, pausada y clara", hombre: "voz masculina grave, serena y segura, pausada y clara" } },
];

export const voiceById = (id: string | null | undefined) => VOICES.find(v => v.id === id) ?? VOICES[0];

/** Género del influencer: el guardado, el del avatar de SUPERNOVA o, si no, deducido de su aspecto. */
export function guessGenero(pj: Pick<Personaje, "aspecto" | "nombre"> & { genero?: Genero | null }): Genero {
  if (pj.genero === "mujer" || pj.genero === "hombre") return pj.genero;
  const t = `${pj.aspecto} ${pj.nombre}`.toLowerCase();
  // (\b de JS no entiende tildes ni ñ: los bordes van con \p{L}, como en videoTemplates.)
  const count = (src: string) => (t.match(new RegExp(`(?<!\\p{L})(?:${src})(?!\\p{L})`, "gu")) ?? []).length;
  const m = count("mujer|señora|chica|muchacha|abuela|ella|doña|femenina");
  const h = count("hombre|señor|chico|muchacho|abuelo|él|don|masculino");
  return h > m ? "hombre" : "mujer";
}

/** Frase de voz que se añade al prompt del video que habla. Siempre español latino neutro. */
export function voicePrompt(genero: Genero, vozId: string | null | undefined): string {
  return `Voz: ${voiceById(vozId).prompt[genero]}, español latinoamericano neutro, audio limpio y claro, sin música de fondo.`;
}

/** Lo que dice el influencer en 10 s: máx. 240 caracteres (~28 palabras). */
export const SPOKEN_MAX = 240;

/** Línea hablada a partir de un guion: el gancho y, si cabe, el cierre. */
export function lineFromGuion(g: { gancho: string; cta: string }): string {
  const a = g.gancho.trim().replace(/\s+/g, " ");
  const b = g.cta.trim().replace(/\s+/g, " ");
  const both = b ? `${a} ${b}` : a;
  return (both.length <= SPOKEN_MAX ? both : a).slice(0, SPOKEN_MAX);
}
