/**
 * Recompensas por contenido (07-oct-2026, decisión de Jean): quien hace clips sobre SUPERNOVA o
 * sobre Jean cobra en dólares por visualización, con la campaña de Content Rewards de Whop. Los
 * pagos empiezan como la campaña de Adri Kastel: US$0,20 por cada 1.000 vistas, tope de US$20 por
 * clip. Whop cuenta las vistas y paga; la app solo explica, da el kit y lleva a la campaña.
 * Los montos y el presupuesto los decide Jean: cambiarlos solo con su OK.
 */
export const REWARDS = {
  /** Enlace de la campaña en Whop. null = todavía no existe: el botón dice "Pronto". */
  whopUrl: null as string | null,
  perThousand: 0.2,
  /** Lo mínimo que tiene que ganar un clip para cobrarse (0,20 = 1.000 vistas). */
  minPayout: 0.2,
  maxPerClip: 20,
  platforms: ["Instagram", "YouTube", "TikTok"] as const,
};

/** US$ con formato español: 0,20 · 20,00. */
export const usd = (n: number) => `US$${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Kit para hacer los clips. url null = se muestra "Pronto" hasta que Jean suba el material. */
export const REWARD_MATERIALS: { title: string; desc: string; url: string | null }[] = [
  { title: "Videos crudos de Jean", desc: "Charlas y directos completos para cortar tus clips.", url: null },
  { title: "Clips cortados por tema", desc: "Ya separados por idea: anuncios que llevan meses, modelar ofertas, precio.", url: null },
  { title: "Grabaciones de la app", desc: "Pantallas de Radar, Ofertas y Crear para mostrar cómo funciona.", url: null },
  { title: "Logo, subtítulos y portadas", desc: "Negro y ámbar, letra Sora: para que tu clip se vea de la marca.", url: null },
];

/** Ganchos para abrir el clip. Sin promesas de ingresos: hablan de cómo se hace, no de cuánto ganas. */
export const REWARD_HOOKS = [
  "Este anuncio lleva 300 días pagándose. Nadie paga 300 días por algo que no vende.",
  "Deja de inventar productos: modela lo que ya se está vendiendo.",
  "Cómo saber si un producto digital se vende antes de crearlo.",
  "Busqué en la Biblioteca de anuncios de Meta qué se vende en español. Mira lo que salió.",
  "No necesitas mostrar tu cara para vender un producto digital.",
  "Antes de lanzar tu ebook, haz esta cuenta: cuánto puedes pagar por cada venta.",
  "Roba como un artista: así se modela una oferta que ya funciona.",
  "La pregunta que tienes que hacerte antes de apagar un anuncio.",
];

export const REWARD_RULES_YES = [
  "Clips de los videos de Jean o grabaciones de la app, con tu edición, tus subtítulos y tu gancho.",
  "Aviso de publicidad en cada clip: #publicidad o la etiqueta de colaboración pagada de la red.",
  "Contar lo que hace la app y cómo se usa, tal como es.",
  "Vistas reales, en cuentas tuyas.",
];

export const REWARD_RULES_NO = [
  "Prometer ingresos, ventas o plazos (\"gana X en 7 días\", \"factura desde el primer mes\").",
  "Testimonios inventados o capturas de ventas que no son tuyas.",
  "Cambiar lo que dice Jean o sacarlo de contexto.",
  "Comprar vistas, usar bots o subir el mismo clip a muchas cuentas.",
  "Contenido sexual, de odio o engañoso.",
];
