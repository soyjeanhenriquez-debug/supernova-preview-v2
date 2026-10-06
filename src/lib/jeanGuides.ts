/**
 * Guías de Jean (06-oct-2026): viven en su web (jeanhenriquez.com/recursos-gratuitos) y aquí
 * solo se enlazan. Una sola fuente del texto: si una guía cambia, se cambia allá.
 * Para agregar una: copia un objeto con el slug de la página en la web y las herramientas
 * de SUPERNOVA que usa (ids de src/lib/tools.ts).
 */
export const JEAN_SITE_URL = "https://jeanhenriquez.com";

export type JeanGuide = {
  slug: string;
  title: string;
  summary: string;
  minutes: number;
  tools: string[];
};

export const JEAN_GUIDES: JeanGuide[] = [
  {
    slug: "videos-gta-6-sin-el-juego",
    title: "Videos de GTA 6 sin tener el juego",
    summary: "Una página de noticias y curiosidades, un video corto al día durante 30 días y cómo descubrir qué temas te traen seguidores.",
    minutes: 8,
    tools: ["ganchos", "reels", "videoia", "contenido"],
  },
  {
    slug: "app-store-sin-rechazos",
    title: "Tu app en el App Store a la primera",
    summary: "Las 6 cosas que revisa Apple antes de aprobar una primera app y cómo dejarlas listas antes de enviarla.",
    minutes: 7,
    tools: ["miniapps", "precio"],
  },
  {
    slug: "producto-digital-correcto",
    title: "Cómo elegir el producto digital correcto para empezar",
    summary: "Ebook, curso, plantilla o membresía: cómo decidir según tu público y tu tiempo.",
    minutes: 6,
    tools: ["ofertas", "validar"],
  },
  {
    slug: "crea-contenido-en-bucle",
    title: "El sistema en bucle para crear contenido sin quemarte",
    summary: "Idea, producción, publicación, métricas y aprendizaje, en un círculo que mejora cada semana.",
    minutes: 6,
    tools: ["ganchos", "contenido"],
  },
  {
    slug: "ia-para-crear-contenido-sin-perder-tu-voz",
    title: "IA para crear contenido sin perder tu voz",
    summary: "Usa la IA para producir más rápido sin sonar genérico.",
    minutes: 5,
    tools: ["carrusel", "reels"],
  },
];

/** Enlace a la guía con la marca de que vino desde SUPERNOVA. */
export function jeanGuideUrl(slug: string) {
  return `${JEAN_SITE_URL}/recursos-gratuitos/${slug}?utm_source=supernova&utm_medium=aprende`;
}
