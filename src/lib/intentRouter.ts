import { normText, TOOL_BY_ID, type Tool, type Via } from "@/lib/tools";
import { setSeed, TARGET_SLUG, type SeedAspect, type SeedTarget } from "@/lib/creativeSeed";
import { DEFAULT_ASPECT } from "@/lib/recommendTarget";
import { IG_POST_RE, IG_REEL_RE, REEL_URL_KEY, TO_CAROUSEL_KEY } from "@/lib/intentHandoff";

export * from "@/lib/intentHandoff";

/**
 * "¿Qué quieres crear hoy?" (26-oct-2026). Primer paso del orquestador creativo: la persona escribe lo
 * que quiere con sus palabras ("un carrusel sobre 5 errores al invertir", "quiero un reel como este
 * https://instagram.com/reel/…") y SUPERNOVA decide a qué herramienta que YA existe llevarla, con su
 * idea puesta. Reglas fijas: sin IA, sin costo, instantáneo y predecible.
 *
 * Nunca gasta nada: la semilla viaja SIN `autostart` y la herramienta muestra su costo antes de
 * generar (quien cobra es el servidor). La idea es texto de la persona: viaja como referencia, igual
 * que en "Crear con esta idea" (src/components/create/CreateFromIdeaSheet.tsx).
 */

export type IntentRule = {
  id: string;
  /** Herramienta de TOOL_BY_ID a la que lleva. */
  tool: string;
  /** Si la herramienta lee semillas (creativeSeed), cuál. */
  target?: SeedTarget;
  /** Dirección dentro de la herramienta (#/con-tu-cara/reel). */
  hash?: string;
  /** Qué entendió SUPERNOVA, en una frase. */
  entendi: string;
  /** Qué necesita para empezar (o "nada más"). */
  necesita: string;
  /** Otras herramientas que también sirven, en orden. */
  alts: string[];
  test: (t: string, raw: string) => boolean;
};

const has = (re: RegExp) => (t: string) => re.test(t);
const LINK_RE = /https?:\/\/\S+/i;

/**
 * En orden: gana la primera que encaja. Lo más concreto va primero (un enlace, "subtítulos",
 * "miniatura") y lo más general al final ("video", "imagen").
 */
export const INTENT_RULES: IntentRule[] = [
  { id: "carrusel_enlace", tool: "carrusel", hash: "carrusel", alts: ["creativos", "captions"],
    entendi: "Quieres tu versión de un carrusel que ya funciona.",
    necesita: "Nada más: ya tenemos el enlace. Allí eliges cómo modelarlo con tu estilo.",
    test: (_t, raw) => IG_POST_RE.test(raw) },
  { id: "reel_enlace", tool: "concara", hash: "con-tu-cara/reel", alts: ["videoanuncio", "reels"],
    entendi: "Quieres tu versión de un reel que ya funciona.",
    necesita: "Nada más: ya tenemos el enlace. Allí ves por qué funciona y armas tu versión.",
    test: (_t, raw) => IG_REEL_RE.test(raw) },
  { id: "otro_enlace", tool: "concara", hash: "con-tu-cara/reel", alts: ["reels", "videoanuncio"],
    entendi: "Quieres tu versión de un video que viste.",
    necesita: "Por ahora se leen reels de Instagram. Si es de TikTok o YouTube, describe aquí la idea y te llevamos a escribir tu guion.",
    test: (_t, raw) => LINK_RE.test(raw) },
  { id: "recrear_reel", tool: "concara", hash: "con-tu-cara/reel", alts: ["videoanuncio", "reels"],
    entendi: "Quieres tu versión de un reel que ya funciona.",
    necesita: "El enlace del reel de Instagram (lo pegas en el siguiente paso).",
    test: has(/\b(recrea|modela|copia|clona|version de)\w*.*\b(reel|video|tiktok|short)|\b(reel|video|tiktok|short)s?\b.*\b(como este|como ese|igual a|parecido a|que vi|de otro|de referencia)/) },
  { id: "mi_video", tool: "concara", hash: "con-tu-cara/video", alts: ["captions", "reels"],
    entendi: "Ya tienes tu video y quieres dejarlo listo para publicar.",
    necesita: "Tu video grabado (lo subes en el siguiente paso). Los subtítulos y la edición se ven en vivo.",
    test: has(/subtitul|\b(mi|un) video (grabado|que grabe|ya grabado)|\bya grabe|editar (mi|el) video|\bmi video\b/) },
  { id: "miniatura", tool: "miniaturas", target: "miniaturas", alts: ["creadoryt", "creativos"],
    entendi: "Quieres portadas para YouTube.",
    necesita: "Nada más: usamos tu idea y tu ficha.",
    test: has(/miniatura|thumbnail|portada (de|para) (youtube|yt)/) },
  { id: "carrusel", tool: "carrusel", target: "carrusel", alts: ["creativos", "captions"],
    entendi: "Quieres un carrusel para Instagram.",
    necesita: "Nada más: usamos tu idea y tu ficha.",
    test: has(/carrusel|carousel|carrousel|laminas|diapositiva|slides?\b/) },
  { id: "youtube", tool: "creadoryt", target: "youtube", alts: ["miniaturas", "youtube"],
    entendi: "Quieres un video para YouTube.",
    necesita: "Nada más: empezamos por el guion por escenas.",
    test: has(/youtube|\byt\b|video largo|canal (sin cara|faceless|de youtube)/) },
  { id: "motion", tool: "motion", alts: ["videoanuncio", "reels"],
    entendi: "Quieres un video de texto animado.",
    necesita: "Tu guion o la idea. Se anima en tu navegador.",
    test: has(/motion|texto animado|letras animadas|tipografia animada|kinetic/) },
  { id: "sin_cara", tool: "personaje", alts: ["videoanuncio", "estudioavatar"],
    entendi: "Quieres vender con una persona creada con IA, sin mostrar tu cara.",
    necesita: "Nada más: eliges o creas tu influencer allí.",
    test: has(/sin (mostrar|salir|ensenar) (mi |la )?cara|sin cara|faceless|influencer ia|avatar|presentador|ugc con ia|persona (ia|virtual)/) },
  { id: "foto_producto", tool: "fotoproducto", target: "foto_producto", alts: ["creativos", "fotosugc"],
    entendi: "Quieres fotos de tu producto.",
    necesita: "Si tienes foto de tu producto, súbela allí; si no, se crea desde tu idea.",
    test: has(/foto(s)? (de|del) (mi )?producto|packshot|mockup|foto de estudio/) },
  { id: "foto_ugc", tool: "fotosugc", target: "foto_ugc", alts: ["creativos", "personaje"],
    entendi: "Quieres fotos que parezcan hechas con el celular.",
    necesita: "Nada más: usamos tu idea y tu ficha.",
    test: has(/foto(s)? ugc|selfie|como (hecha|tomada) con (el )?celular|foto(s)? casual/) },
  { id: "pagina", tool: "paginas", alts: ["vsl", "copy"],
    entendi: "Quieres el texto de tu página de ventas.",
    necesita: "Nada más: usamos tu idea y tu ficha.",
    test: has(/pagina de ventas|landing|sales page|pagina de venta/) },
  { id: "correos", tool: "correos", alts: ["recuperar", "copy"],
    entendi: "Quieres una secuencia de correos.",
    necesita: "Nada más: usamos tu idea y tu ficha.",
    test: has(/correo|email|e-mail|mail\b|newsletter/) },
  { id: "vsl", tool: "vsl", alts: ["paginas", "reels"],
    entendi: "Quieres el guion de tu video de ventas (VSL).",
    necesita: "Nada más: usamos tu idea y tu ficha.",
    test: has(/\bvsl\b|video de ventas/) },
  { id: "historia", tool: "reels", alts: ["concara", "carrusel"],
    entendi: "Quieres contar tu historia en un reel.",
    necesita: "Tu idea o lo que quieres contar. Primero va el guion; después lo grabas o lo armas con IA.",
    test: has(/mi historia|contar (mi|la) historia|storytelling|mi experiencia|como empece/) },
  { id: "textos_post", tool: "captions", alts: ["carrusel", "reels"],
    entendi: "Quieres el texto para tus publicaciones.",
    necesita: "Nada más: usamos tu idea y tu ficha.",
    test: has(/caption|texto (para|de) (la |mis |una )?(publicacion|post)|descripcion del post|hashtag/) },
  { id: "ganchos", tool: "ganchos", alts: ["reels", "carrusel"],
    entendi: "Quieres ganchos que atrapen en los primeros segundos.",
    necesita: "Nada: mirar ganchos es gratis.",
    test: has(/gancho|hook/) },
  { id: "guion", tool: "reels", alts: ["vsl", "creadoryt"],
    entendi: "Quieres un guion.",
    necesita: "Nada más: usamos tu idea y tu ficha.",
    test: has(/guion|script|libreto/) },
  { id: "video", tool: "videoanuncio", target: "video_anuncio", alts: ["reels", "personaje"],
    entendi: "Quieres un video corto vertical.",
    necesita: "Nada más: usamos tu idea y tu ficha. Antes de crear ves cuántos créditos usa.",
    test: has(/video|reel|tiktok|short|clip|cinematic|cinematografic/) },
  { id: "imagen", tool: "creativos", target: "creativos", alts: ["carrusel", "fotosugc"],
    entendi: "Quieres imágenes para anunciar.",
    necesita: "Nada más: usamos tu idea y tu ficha.",
    test: has(/imagen|creativo|anuncio|banner|post\b|publicacion|flyer|foto/) },
  // Encontrar y vender: también se piden con palabras.
  { id: "que_vender", tool: "ofertas", alts: ["radar", "miniapps"],
    entendi: "Quieres encontrar algo que ya se vende.",
    necesita: "Nada: mirar ofertas es gratis.",
    test: has(/que vender|ideas? de negocio|que (producto|negocio)|ofertas?|lo que (ya )?vende|ganador/) },
  { id: "precio", tool: "precio", alts: ["validar", "bump"],
    entendi: "Quieres saber a qué precio vender y cuánto puedes pagar por venta.",
    necesita: "Nada más: usamos tu ficha.",
    test: has(/precio|cuanto cobrar|cpa|ganancia|margen/) },
];

export type IntentPlan = {
  rule: string;
  tool: Tool;
  target?: SeedTarget;
  aspect?: SeedAspect;
  hash?: string;
  entendi: string;
  necesita: string;
  alternatives: Tool[];
  /** La frase de la persona, limpia (sin el enlace). */
  idea: string;
  /** Enlace de reel de Instagram, si lo pegó. */
  reelUrl?: string;
  /** Enlace de una publicación (carrusel) de Instagram, si lo pegó. */
  postUrl?: string;
};

/** Lo que por defecto conviene a cada vía cuando la frase no dice qué pieza quiere. */
const FALLBACK: Record<Via, string> = { creador: "reels", marketer: "creativos" };

const clean = (s: string) => s.replace(LINK_RE, " ").replace(/\s+/g, " ").trim().slice(0, 200).trim();

/**
 * Plan para una frase. `canSee` deja fuera lo que esa cuenta no ve (pantallas solo admin); si la
 * herramienta elegida no se ve, pasa a la primera alternativa que sí. null si no hay frase.
 */
export function routeIntent(raw: string, opts: { via: Via; canSee: (page: string) => boolean }): IntentPlan | null {
  const text = raw.trim();
  if (text.length < 3) return null;
  const t = normText(text);
  const rule = INTENT_RULES.find(r => r.test(t, text));
  const visible = (id: string) => { const tl = TOOL_BY_ID[id]; return tl && opts.canSee(tl.key) ? tl : null; };

  const base = rule ?? {
    id: "general", tool: FALLBACK[opts.via], target: opts.via === "marketer" ? "creativos" as SeedTarget : undefined,
    alts: opts.via === "creador" ? ["carrusel", "concara", "videoanuncio"] : ["videoanuncio", "carrusel", "copy"],
    entendi: "Quieres crear contenido con esta idea.",
    necesita: "Nada más: usamos tu idea y tu ficha. Si no es esto, elige otra opción abajo.",
  };
  const chain = [base.tool, ...base.alts];
  const main = chain.map(visible).find(Boolean) as Tool | undefined;
  if (!main) return null;
  // Si la principal no se ve, la semilla/dirección ya no aplican (son de esa herramienta).
  const same = main.id === base.tool;
  const alternatives = chain.filter(id => id !== main.id).map(visible).filter((x): x is Tool => !!x).slice(0, 3);
  const reel = text.match(IG_REEL_RE)?.[0];
  const post = text.match(IG_POST_RE)?.[0];
  return {
    rule: base.id,
    tool: main,
    target: same ? base.target : undefined,
    aspect: same && base.target ? DEFAULT_ASPECT[base.target] : undefined,
    hash: same ? (base as IntentRule).hash : undefined,
    entendi: same ? base.entendi : `${base.entendi} Te llevamos a ${main.title.toLowerCase()}.`,
    necesita: same ? base.necesita : "Nada más: usamos tu idea y tu ficha.",
    alternatives,
    idea: clean(text),
    reelUrl: reel,
    postUrl: post,
  };
}

/** Plan para ir directo a una alternativa (misma idea, otra herramienta). */
export function planFor(toolId: string, from: IntentPlan): IntentPlan {
  const rule = INTENT_RULES.find(r => r.tool === toolId);
  const tool = TOOL_BY_ID[toolId];
  return {
    ...from,
    rule: rule?.id ?? "alternativa",
    tool,
    target: rule?.target,
    aspect: rule?.target ? DEFAULT_ASPECT[rule.target] : undefined,
    hash: rule?.hash,
    entendi: rule?.entendi ?? from.entendi,
    necesita: rule?.necesita ?? "Nada más: usamos tu idea y tu ficha.",
    alternatives: [],
  };
}

type ProfileLike = { product: string; who: string; promise: string; price?: string };

/**
 * Lleva a la herramienta con la idea puesta. Nunca genera: la semilla va sin `autostart`.
 * `profile` es la ficha del producto activo (la idea no la pisa: viaja como gancho de referencia).
 */
export function startIntent(plan: IntentPlan, profile: ProfileLike, onNavigate: (page: string) => void): void {
  const idea = plan.idea;
  if (plan.target) {
    const product = profile.product.trim();
    setSeed({
      source: "manual",
      target: plan.target,
      title: idea.slice(0, 80) || product.slice(0, 80),
      product: product || idea,
      who: profile.who.trim(),
      promise: profile.promise.trim(),
      price: profile.price?.trim() || undefined,
      hook: idea.slice(0, 140) || undefined,
      aspect: plan.aspect,
    });
    window.location.hash = `#/${TARGET_SLUG[plan.target]}`;
  } else if (plan.hash) {
    if (plan.reelUrl) { try { sessionStorage.setItem(REEL_URL_KEY, plan.reelUrl); } catch { /* sin almacenamiento */ } }
    if (plan.postUrl) { try { localStorage.setItem(TO_CAROUSEL_KEY, JSON.stringify({ url: plan.postUrl, at: Date.now() })); } catch { /* sin almacenamiento */ } }
    window.location.hash = `#/${plan.hash}`;
  } else {
    if (plan.tool.generator) {
      try { localStorage.setItem("supernova_generator_prefill", JSON.stringify({ generator: plan.tool.generator, text: idea })); } catch { /* sin almacenamiento */ }
    }
    onNavigate(plan.tool.key);
  }
  window.scrollTo({ top: 0 });
}
