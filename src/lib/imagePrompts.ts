/**
 * Constructores de prompts del Estudio de imágenes (plan ATLAS, LUMEN, 04-oct-2026). Funciones puras:
 * de la ficha (o de la semilla de una idea) a N espacios con su formato, sin que el usuario escriba
 * prompts. Las reglas del manual van en TODOS: personas latinas, sin marcas ni famosos, sin dinero ni
 * promesas de resultados, nada sexual, texto en español corto y exacto. El gancho de un anuncio ajeno
 * entra solo como REFERENCIA ("escribe otro con la misma idea"), nunca literal.
 */
import type { SeedTarget } from "@/lib/creativeSeed";

export type StudioMode = "creativo" | "carrusel" | "miniatura" | "foto_ugc" | "foto_producto" | "variar";
export type Aspect = "1:1" | "4:5" | "9:16" | "16:9";
export type Brief = { product: string; who: string; promise: string; price?: string };
export type KitStyle = { colors: string[]; style: string } | null | undefined;
export type SlotSpec = { id: string; label: string; prompt: string; aspect: Aspect };

export type PromptCtx = {
  brief: Brief;
  aspect: Aspect;
  /** Texto exacto que el usuario quiere en la imagen (opcional). */
  headline?: string;
  /** Gancho de referencia (de un anuncio o video ajeno): nunca se copia. */
  hook?: string;
  /** Por qué funciona la idea. */
  angle?: string;
  /** Textos de las 5 láminas del carrusel. */
  texts?: string[];
  kit?: KitStyle;
  /** Se mandan fotos del producto o logo como referencia. */
  hasRefs?: boolean;
};

export const RULES = "Personas latinas, naturales y creíbles. Sin logotipos, marcas ni personas famosas reales, ni personajes con derechos de autor. No muestres dinero, billetes, cifras de ingresos ni promesas de resultados. Nada sexual ni sugerente. Si hay texto, que sea en español, corto, grande, legible y escrito exactamente como se indica, sin otras palabras.";

export const MODE_COUNT: Record<StudioMode, number> = {
  creativo: 3, carrusel: 5, miniatura: 2, foto_ugc: 3, foto_producto: 3, variar: 3,
};

export const MODE_INFO: Record<StudioMode, { title: string; line: string; unit: string }> = {
  creativo: { title: "Creativos para anuncios", line: "3 imágenes listas para Meta, cada una con un ángulo distinto.", unit: "imágenes" },
  carrusel: { title: "Carrusel que vende", line: "5 láminas: gancho, problema, solución, lo que logra y llamada a la acción.", unit: "láminas" },
  miniatura: { title: "Miniaturas", line: "Portadas para YouTube o Reels que se leen en pequeño.", unit: "miniaturas" },
  foto_ugc: { title: "Fotos estilo UGC", line: "3 fotos como hechas con el celular: una persona real usando tu producto.", unit: "fotos" },
  foto_producto: { title: "Foto de producto", line: "3 fotos de tu producto: de estudio, en mockup y en uso.", unit: "fotos" },
  variar: { title: "Variar una imagen", line: "3 versiones nuevas de una de tus imágenes: otro fondo, otro encuadre, otra luz.", unit: "variaciones" },
};

export const ASPECT_LABEL: Record<Aspect, string> = {
  "1:1": "Feed cuadrado 1:1", "4:5": "Feed vertical 4:5", "9:16": "Historias y Reels 9:16", "16:9": "YouTube horizontal 16:9",
};

/** Formatos que tienen sentido en cada modo (el primero no es la recomendación: esa la da aiAspect). */
export function aspectOptions(mode: StudioMode): Aspect[] {
  if (mode === "miniatura") return ["16:9", "9:16"];
  if (mode === "carrusel") return ["4:5", "1:1"];
  return ["4:5", "1:1", "9:16"];
}

/** "La IA eligió por ti": formato recomendado y por qué, en una frase. */
export function aiAspect(mode: StudioMode, seedAspect?: Aspect): { aspect: Aspect; reason: string } {
  const ok = seedAspect && aspectOptions(mode).includes(seedAspect) ? seedAspect : undefined;
  if (mode === "miniatura") {
    return ok === "9:16"
      ? { aspect: "9:16", reason: "Es para un Short o Reel: la portada va vertical." }
      : { aspect: "16:9", reason: "YouTube muestra las portadas en horizontal." };
  }
  if (mode === "carrusel") return { aspect: ok ?? "4:5", reason: "4:5 ocupa más pantalla en el feed y el carrusel se lee mejor." };
  if (ok === "9:16") return { aspect: "9:16", reason: "La idea viene de historias o Reels: pantalla completa vertical." };
  if (ok === "1:1") return { aspect: "1:1", reason: "La idea original es cuadrada: se respeta su formato." };
  if (mode === "foto_producto") return { aspect: ok ?? "4:5", reason: "4:5 sirve para el feed y para tu catálogo de WhatsApp." };
  return { aspect: ok ?? "4:5", reason: "4:5 ocupa más pantalla en el feed de Instagram y Facebook." };
}

const clean = (s: string | undefined, n: number) => (s ?? "").replace(/[«»"]/g, "'").replace(/\s+/g, " ").trim().slice(0, n);
export const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);

export function describe(b: Brief): string {
  const parts = [`Producto: ${clean(b.product, 200)}.`];
  if (clean(b.who, 200)) parts.push(`Para: ${clean(b.who, 200)}.`);
  if (clean(b.promise, 200)) parts.push(`Lo que logra: ${clean(b.promise, 200)}.`);
  return parts.join(" ");
}

/** Paleta y estilo del kit de marca, si existe. */
export function kitLine(kit: KitStyle): string {
  if (!kit) return "";
  const colors = (kit.colors ?? []).filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 5);
  const style = clean(kit.style, 200);
  if (!colors.length && !style) return "";
  const p = colors.length ? `paleta de marca ${colors.join(", ")}` : "";
  const s = style ? `estilo de marca: ${style}` : "";
  return `Identidad visual (mantenla igual en toda la serie): ${[p, s].filter(Boolean).join("; ")}.`;
}

const REFS_LINE = "Usa las imágenes de referencia adjuntas: el producto o el logo que aparece en ellas debe verse igual (misma forma, colores y etiqueta), sin inventar otra marca.";

/** Cómo entra el texto: exacto si lo pidió el usuario; si hay gancho de referencia, uno nuevo con la misma idea. */
export function textLine(headline?: string, hook?: string, maxWords = 6): string {
  const h = clean(headline, 60);
  if (h) return `Texto grande en la imagen, exactamente: «${h}».`;
  const ref = clean(hook, 140);
  if (ref) return `Texto grande en la imagen: un titular NUEVO de máximo ${maxWords} palabras en español, con la misma idea que esta referencia pero sin copiar sus palabras (referencia: «${ref}»).`;
  return "Sin texto en la imagen.";
}

function tail(ctx: PromptCtx): string {
  return [
    describe(ctx.brief),
    clean(ctx.angle, 200) ? `Por qué funciona la idea: ${clean(ctx.angle, 200)}.` : "",
    kitLine(ctx.kit),
    ctx.hasRefs ? REFS_LINE : "",
    RULES,
  ].filter(Boolean).join(" ");
}

export function carruselTexts(b: Brief, hook?: string): string[] {
  const first = clean(hook, 70);
  return [
    first ? short(first, 60) : `¿${short(clean(b.who, 80) || "Te pasa esto", 50)}?`,
    "Esto es lo que te frena",
    short(clean(b.product, 80), 60),
    short(clean(b.promise, 90) || "Lo que vas a lograr", 70),
    "Escríbenos y empieza hoy",
  ];
}

export function buildSlots(mode: StudioMode, ctx: PromptCtx): SlotSpec[] {
  const t = tail(ctx);
  const a = ctx.aspect;
  const text = textLine(ctx.headline, ctx.hook);
  switch (mode) {
    case "creativo":
      return [
        { id: "a", label: "Problema → solución", aspect: a,
          prompt: `Anuncio de Facebook e Instagram. Escena realista: una persona del público objetivo vive el problema que resuelve el producto y se ve el alivio de encontrar la solución. ${text} ${t}` },
        { id: "b", label: "El resultado deseado", aspect: a,
          prompt: `Anuncio de Facebook e Instagram. Escena aspiracional y realista: una persona del público objetivo disfrutando lo que logra el producto, luz natural, emoción genuina. ${text} ${t}` },
        { id: "c", label: "Producto en mockup", aspect: a,
          prompt: `Anuncio de Facebook e Instagram. Mockup profesional del producto (si es digital: portada de ebook o curso en tableta y celular) sobre un fondo limpio con buen contraste. ${text} ${t}` },
      ];
    case "carrusel": {
      const roles = ["Gancho que detiene el scroll", "El problema", "La solución", "Lo que logra", "Llamada a la acción"];
      const texts = (ctx.texts && ctx.texts.length === 5 ? ctx.texts : carruselTexts(ctx.brief, ctx.hook)).map(x => clean(x, 80));
      return texts.map((tx, i) => ({
        id: `s${i}`, label: `${i + 1}. ${roles[i]}`, aspect: a,
        prompt: `Lámina ${i + 1} de 5 de un carrusel de Instagram, mismo estilo visual en todas (${ctx.kit && kitLine(ctx.kit) ? "con la identidad visual indicada" : "fondo oscuro elegante, acento cálido"}). Rol de esta lámina: ${roles[i]}. Texto grande en la imagen, exactamente: «${tx || roles[i]}». ${t}`,
      }));
    }
    case "miniatura": {
      const h = clean(ctx.headline, 60);
      const words = h ? `Texto grande, exactamente: «${h}».` : textLine("", ctx.hook || short(clean(ctx.brief.promise, 60), 40), 5);
      return [
        { id: "m1", label: "Cara con emoción", aspect: a,
          prompt: `Miniatura de video. Primer plano de una persona latina con expresión de sorpresa genuina, mirando a cámara, fondo con contraste fuerte. ${words} ${t}` },
        { id: "m2", label: "Antes y después", aspect: a,
          prompt: `Miniatura de video dividida en dos: a la izquierda el problema, a la derecha el resultado, flecha clara entre ambos. ${words} ${t}` },
      ];
    }
    case "foto_ugc": {
      const ugc = "Foto estilo UGC hecha con un celular: encuadre casual, luz natural de casa, nada de estudio, se ve espontánea y real. No es un testimonio: sin texto, sin cifras, sin reseñas.";
      return [
        { id: "u1", label: "Selfie con el producto", aspect: a,
          prompt: `${ugc} Una persona latina del público objetivo se toma una selfie mostrando el producto (si es digital: en la pantalla de su celular o tableta), sonrisa natural. ${t}` },
        { id: "u2", label: "Usándolo en casa", aspect: a,
          prompt: `${ugc} Una persona latina del público objetivo usando el producto en su día a día, en su casa, vista desde el celular de un amigo. ${t}` },
        { id: "u3", label: "Reacción genuina", aspect: a,
          prompt: `${ugc} Primer plano de una persona latina del público objetivo con una reacción genuina de sorpresa o alivio mientras mira el producto. ${t}` },
      ];
    }
    case "foto_producto":
      return [
        { id: "p1", label: "De estudio", aspect: a,
          prompt: `Fotografía de producto de estudio: el producto solo, centrado, fondo limpio de un color, luz suave y sombras naturales, aspecto premium. Si es digital, muéstralo como portada en una tableta. Sin texto. ${t}` },
        { id: "p2", label: "En mockup", aspect: a,
          prompt: `Mockup realista del producto en una escena cuidada (escritorio, mesa de madera o encimera), con objetos que cuentan para quién es. Si es digital: en celular, tableta y laptop a la vez. Sin texto. ${t}` },
        { id: "p3", label: "En uso", aspect: a,
          prompt: `Foto realista del producto en uso: manos de una persona latina usándolo, enfoque en el producto, luz natural. Sin texto. ${t}` },
      ];
    case "variar":
      return [0, 1, 2].map(i => variationSpec(i, a, ctx));
  }
}

const VARIATIONS = [
  { label: "Otro fondo", how: "cambia el fondo y el entorno por uno distinto que combine" },
  { label: "Otro encuadre", how: "cambia el encuadre y la composición (más cerca o desde otro ángulo)" },
  { label: "Otra luz y color", how: "cambia la iluminación y el tratamiento de color para que destaque más en el feed" },
];

/** Una variación de imagen a imagen (la imagen fuente va como referencia en el servidor). */
export function variationSpec(i: number, aspect: Aspect, ctx: PromptCtx, label?: string): SlotSpec {
  const v = VARIATIONS[((i % VARIATIONS.length) + VARIATIONS.length) % VARIATIONS.length];
  const text = clean(ctx.headline, 60) ? `Si hay texto, que diga exactamente: «${clean(ctx.headline, 60)}».` : "Conserva el texto de la imagen si lo tiene, con las mismas palabras.";
  return {
    id: `v${i}`, label: label ?? v.label, aspect,
    prompt: `Crea una variación de la imagen de referencia adjunta: misma idea, mismo producto y mismo mensaje, pero ${v.how}. ${text} ${describe(ctx.brief)} ${kitLine(ctx.kit)} ${RULES}`.replace(/\s+/g, " ").trim(),
  };
}

/** Destino de la semilla → modo del estudio. */
export const TARGET_MODE: Partial<Record<SeedTarget, StudioMode>> = {
  creativos: "creativo", carrusel: "carrusel", miniaturas: "miniatura", foto_ugc: "foto_ugc", foto_producto: "foto_producto",
};
export const IMAGE_TARGETS: SeedTarget[] = ["creativos", "carrusel", "miniaturas", "foto_ugc", "foto_producto"];

/** Pasos para publicar, según lo que se hizo. */
export function publishSteps(mode: StudioMode): { where: string; steps: string[] } {
  if (mode === "miniatura") return {
    where: "YouTube",
    steps: [
      "Abre YouTube Studio y entra a tu video (o súbelo).",
      "En Detalles, busca Miniatura y toca Subir miniatura.",
      "Elige la que más se lea en pequeño. Si a los 2 días casi nadie hace clic, prueba la otra.",
    ],
  };
  if (mode === "foto_producto") return {
    where: "tu tienda o WhatsApp",
    steps: [
      "Úsalas en tu página de venta: la de estudio arriba, la de uso cerca del botón de compra.",
      "Súbelas al catálogo de WhatsApp Business o a tu tienda.",
      "Si haces anuncios, la foto en uso suele servir de creativo: pruébala en Meta.",
    ],
  };
  const fmt = mode === "carrusel" ? "elige el formato Carrusel y sube las 5 láminas en orden" : "elige Imagen única y sube una imagen por anuncio";
  return {
    where: "Meta (Facebook e Instagram)",
    steps: [
      "Abre el Administrador de anuncios de Meta y toca Crear. Elige el objetivo Ventas o Tráfico.",
      `En el anuncio, ${fmt}. Pega el texto del anuncio y el enlace a tu página.`,
      "Empieza con poco presupuesto por día. A los 3 días anota tus números en Resultados: CTR (% que hace clic) menor a 0,8 % = cambia la imagen.",
    ],
  };
}

/** Pedido para escribir el texto del anuncio (generador mandala-ad de ai-chat). */
export function adCopyRequest(mode: StudioMode, ctx: Pick<PromptCtx, "brief" | "hook" | "angle">): string {
  const fmt = mode === "carrusel" ? "un carrusel de 5 láminas" : mode === "miniatura" ? "un video de YouTube (título y descripción)" : "un anuncio de imagen en Facebook e Instagram";
  return [
    `Escribe el texto para ${fmt}, en español neutro latinoamericano, de tú, frases cortas.`,
    "Entrega exactamente:",
    "## Texto principal (máximo 125 palabras, con una llamada a la acción clara)",
    "## 3 titulares (máximo 40 caracteres cada uno)",
    "## Descripción (máximo 30 caracteres)",
    "## Revisión de políticas (frases que Meta podría rechazar y cómo quedaron; si no hay, dilo)",
    "Reglas: sin promesas de ingresos, sin resultados garantizados, sin plazos ('en 7 días'), sin testimonios inventados, sin urgencia falsa, sin marcas ajenas.",
    describe(ctx.brief),
    ctx.brief.price ? `Precio: ${clean(ctx.brief.price, 30)}.` : "",
    clean(ctx.hook, 140) ? `Idea de referencia (NO copies estas palabras, escribe otras con la misma idea): «${clean(ctx.hook, 140)}».` : "",
    clean(ctx.angle, 200) ? `Por qué funciona: ${clean(ctx.angle, 200)}.` : "",
  ].filter(Boolean).join("\n");
}

/** Números en formato español: 2.000, 1.840 (también con 4 cifras, como pide el manual). */
export function formatNumber(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
