/**
 * Aprende (decisión de Jean, 03-oct-2026): un video corto por herramienta, grabado por Jean y subido a
 * YouTube. Abierto también para quien no pagó (vitrina): es lo que da ganas de activar el plan.
 * Para publicar uno, añade una línea aquí con la clave de la pantalla (src/lib/tools.ts) y el id del
 * video de YouTube (lo que va después de "v=" o de "youtu.be/"). Sin videos no se muestra nada:
 * nada de cursos vacíos ni "Próximamente".
 */
export type Tutorial = {
  /** Clave de la pantalla (la misma de Index.tsx y src/lib/tools.ts). */
  page: string;
  youtubeId: string;
  title: string;
  /** Duración aproximada, en minutos. */
  minutes: number;
};

export const TUTORIALS: Tutorial[] = [
  // { page: "Buscar Ofertas Winner", youtubeId: "XXXXXXXXXXX", title: "Encuentra un anuncio que lleva meses vendiendo", minutes: 3 },
];

export const tutorialFor = (page: string) => TUTORIALS.find(t => t.page === page) ?? null;

/** Acepta el id o un enlace de YouTube (watch?v=, youtu.be/, shorts/) y devuelve el id. */
export function youtubeId(input: string) {
  const m = input.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);
  return m ? m[1] : input.trim();
}

export const embedUrl = (id: string) => `https://www.youtube-nocookie.com/embed/${youtubeId(id)}?rel=0&modestbranding=1`;
