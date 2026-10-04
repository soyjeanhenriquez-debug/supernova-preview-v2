/**
 * Plantillas de video IA (KINEMA, 04-oct-2026): anuncio en video de 3 tomas y UGC con presentador IA.
 * Todo es puro (sin red): arma las tomas, los prompts y el costo sin gastar nada. La IA decide la
 * plantilla ("La IA eligió por ti") y el usuario solo elige si quiere cambiarla.
 *
 * Reglas que NO se negocian (manual de SUPERNOVA):
 * - Nunca formato testimonio: la persona presenta o explica, jamás dice que compró, que le funcionó
 *   ni que ganó o bajó algo. `hasForbiddenClaim` lo vigila y `cleanBrief` lo quita de la ficha.
 * - Sin promesas de ingresos ni plazos. Sin marcas, famosos ni personajes con derechos. Nada sexual.
 * - Todo lo que se habla va en español latino. Se avisa que es un personaje creado con IA.
 * - El gancho de la referencia (Radar/Oferta) es solo una idea: nunca se dice literal.
 */

export type VideoMode = "clip" | "serie" | "anuncio" | "ugc";
export type VideoSize = "9:16" | "16:9" | "1:1";
export type VideoTemplateId =
  | "problema_solucion" | "demostracion" | "tres_razones" | "mito_realidad" | "pregunta_frecuente" | "nadie_te_dice";
export type ShotRole = "gancho" | "demo" | "llamada" | "presentador";
export type VideoBrief = { product: string; who: string; promise: string; angle?: string; hook?: string };
export type Shot = { role: ShotRole; label: string; seconds: 5 | 10; scene: string; line: string };

/** Créditos por clip (credit_prices: vid_mini_5 / vid_mini_10). Lo cobra el servidor. */
export const VIDEO_PRICE = { 5: 55, 10: 110 } as const;

export const VIDEO_TEMPLATES: { id: VideoTemplateId; label: string; desc: string }[] = [
  { id: "problema_solucion", label: "Problema y solución", desc: "Muestra el problema y presenta tu producto como la salida." },
  { id: "demostracion", label: "Demostración", desc: "Enseña cómo se usa, paso a paso." },
  { id: "tres_razones", label: "3 razones", desc: "Tres motivos rápidos para verlo." },
  { id: "mito_realidad", label: "Mito o realidad", desc: "Desmonta una creencia común de tu tema." },
  { id: "pregunta_frecuente", label: "Pregunta frecuente", desc: "Responde la duda que más te hacen." },
  { id: "nadie_te_dice", label: "Lo que nadie te dice", desc: "Un dato útil que casi nadie cuenta." },
];

/** Reglas que viajan en TODOS los prompts de video (el servidor añade las suyas también). */
export const VIDEO_RULES =
  "Reglas: no es un testimonio; la persona presenta o explica, nunca dice que compró, que le funcionó ni que obtuvo resultados. " +
  "Todo lo que se habla es en español latino. Personaje creado con IA. Sin texto en pantalla, sin logotipos, marcas, famosos ni personajes con derechos. " +
  "Sin dinero, billetes ni cifras de ingresos. Nada sexual ni violento.";

const UGC_STYLE = "Estilo video UGC vertical grabado con celular, luz natural, cámara en mano estable, ambiente de casa real, gente latina natural.";

// Frases de testimonio o de resultados prometidos: nunca entran en un guion.
// (\b de JS no entiende tildes: "compré" no tendría borde. Por eso los bordes van con \p{L}.)
const w = (src: string) => new RegExp(`(?<![\\p{L}\\d])(?:${src})(?![\\p{L}])`, "iu");
const FORBIDDEN = [
  w("me\\s+(?:funcion[oó]|sirvi[oó]|cambi[oó])"),
  w("compré|lo\\s+compre"),
  w("gané"),
  w("(?:baj[eé]|perd[ií]|sub[ií])\\s+\\d"),
  w("yo\\s+(?:logr[eé]|consegu[ií])"),
  w("cambi[oó]\\s+mi\\s+vida"),
  w("mis?\\s+resultados?"),
  w("testimonios?"),
];
// Promesas de dinero o plazos ("gana US$500", "en 7 días").
const INCOME = [
  /(us\$|\$|usd|€)\s*\d/iu,
  w("\\d[\\d.,]*\\s*(?:d[oó]lares|pesos|usd|euros|soles|mil)"),
  w("gana(?:r|s|rás)?\\s+(?:dinero|plata|\\d)"),
  w("en\\s+\\d+\\s+(?:d[ií]as|semanas|horas)"),
  w("ingresos?\\s+(?:extra|pasivos?|garantizados?)"),
];

export function hasForbiddenClaim(text: string): boolean {
  return FORBIDDEN.some(r => r.test(text)) || INCOME.some(r => r.test(text));
}

const tidy = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "").slice(0, max);
/** Corta en palabra completa y sin punto final, para meterlo dentro de una frase. */
export function shortPhrase(s: string, max: number): string {
  const t = tidy(s, 400).replace(/[.!?¡¿]+$/g, "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const i = cut.lastIndexOf(" ");
  return (i > max * 0.5 ? cut.slice(0, i) : cut).replace(/[,;:]+$/, "").trim();
}
const lower1 = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** Limpia la ficha o la semilla: recorta y quita cualquier frase de testimonio o de ingresos. */
export function cleanBrief(b: Partial<VideoBrief>): VideoBrief {
  const safe = (s: unknown, max: number) => {
    const t = tidy(s, max);
    return t && !hasForbiddenClaim(t) ? t : "";
  };
  return {
    product: safe(b.product, 200) || "tu producto",
    who: safe(b.who, 200),
    promise: safe(b.promise, 200),
    angle: safe(b.angle, 200) || undefined,
    hook: safe(b.hook, 140) || undefined,
  };
}

const DIGITAL = /\b(e-?book|libro digital|curso|gu[ií]a|plantilla|app|aplicaci[oó]n|clase|mentor[ií]a|programa|pdf|digital|taller|masterclass|kit|recetario|planner|agenda|plan)\b/i;
export const isDigital = (product: string) => DIGITAL.test(product);

function parts(b: VideoBrief) {
  const product = shortPhrase(b.product, 36) || "esto";
  const who = shortPhrase(b.who, 40);
  const promise = lower1(shortPhrase(b.promise, 42));
  const digital = isDigital(b.product);
  const showIt = digital
    ? "muestra en la pantalla del celular el contenido del producto (sin texto legible), desliza con el dedo"
    : "sostiene el producto frente a la cámara y lo muestra de cerca, sin etiquetas ni marcas visibles";
  return { product, who, promise, digital, showIt };
}

/** La IA elige la plantilla según la idea. Devuelve el porqué en una frase corta. */
export function recommendTemplate(b: VideoBrief, mode: "anuncio" | "ugc"): { id: VideoTemplateId; reason: string } {
  const text = `${b.hook ?? ""} ${b.angle ?? ""}`.toLowerCase();
  if (/\b(mito|verdad|error|equivoc|crees)\b/.test(text)) return { id: "mito_realidad", reason: "la idea rompe una creencia común: eso detiene el dedo" };
  if (/\?|¿|c[oó]mo|por qu[eé]/.test(text)) return { id: "pregunta_frecuente", reason: "la idea parte de una pregunta: la respondes en segundos" };
  if (/\b(nadie|secreto|casi nadie|no te cuentan)\b/.test(text)) return { id: "nadie_te_dice", reason: "la idea promete un dato poco conocido" };
  if (isDigital(b.product) && mode === "anuncio") return { id: "demostracion", reason: "es un producto digital: verlo por dentro convence más" };
  return { id: "problema_solucion", reason: mode === "ugc" ? "es la plantilla más clara para hablar a cámara" : "es la estructura de anuncio más probada: problema, solución y llamada" };
}

/** Líneas habladas por plantilla. Anuncio: 3 líneas cortas (5 s c/u). UGC: 1 línea (10 s). */
function lines(id: VideoTemplateId, b: VideoBrief): { ad: [string, string, string]; ugc: string } {
  const { product, who, promise } = parts(b);
  const para = who ? `para ${lower1(who)}` : "para ti";
  const logra = promise ? `pensado para ${promise}` : "pensado para hacerlo más fácil";
  switch (id) {
    case "demostracion":
      return {
        ad: ["Te enseño cómo funciona esto.", `Así se ve ${product} por dentro.`, "Mira el enlace y empieza hoy."],
        ugc: `Te enseño ${product} en segundos: lo abres, eliges lo que necesitas y listo. Te dejo el enlace.`,
      };
    case "tres_razones":
      return {
        ad: [`Tres razones para ver ${product}.`, "Uno, es simple. Dos, es para ti.", "Tres, empiezas hoy. Mira el enlace."],
        ugc: `Tres razones para mirar ${product}: es fácil, es ${para} y empiezas hoy.`,
      };
    case "mito_realidad":
      return {
        ad: ["¿Mito o realidad? Te lo explico.", `Con ${product} lo ves claro.`, "Toca el enlace y compruébalo tú."],
        ugc: `Mucha gente cree que esto es difícil. No tiene por qué: mira ${product}, ${logra}.`,
      };
    case "pregunta_frecuente":
      return {
        ad: ["Me preguntan mucho cómo empezar.", `La respuesta corta: ${product}.`, "Escríbenos y te contamos más."],
        ugc: `¿Cómo empezar? Mi respuesta corta: ${product}, ${logra}. Escríbenos y te contamos.`,
      };
    case "nadie_te_dice":
      return {
        ad: ["Esto casi nadie te lo dice.", `Por eso existe ${product}.`, "Mira el enlace antes de seguir."],
        ugc: `Casi nadie te dice esto: hay algo más simple. ${product}, ${logra}. Mira el enlace.`,
      };
    case "problema_solucion":
    default:
      return {
        ad: ["¿Te cuesta empezar? No eres el único.", `Mira esto: ${product}.`, "Toca el enlace y conócelo."],
        ugc: `Si te cuesta empezar, mira esto: ${product}, ${logra}. Te dejo el enlace abajo.`,
      };
  }
}

/** Escenas visuales por plantilla para las 3 tomas del anuncio. */
function adScenes(id: VideoTemplateId, b: VideoBrief): [string, string, string] {
  const { showIt } = parts(b);
  const hook: Record<VideoTemplateId, string> = {
    problema_solucion: "Primer plano: una persona latina en su casa se frustra con un problema cotidiano y suspira mirando a cámara.",
    demostracion: "Primer plano: una persona latina mira a cámara con curiosidad y levanta el celular como quien va a enseñar algo.",
    tres_razones: "Una persona latina mira a cámara y levanta tres dedos con energía, gesto de 'te cuento tres cosas'.",
    mito_realidad: "Una persona latina mira a cámara con cara de duda y luego niega con la cabeza, sonriendo.",
    pregunta_frecuente: "Una persona latina lee algo en su celular, levanta la vista hacia la cámara como quien responde una pregunta.",
    nadie_te_dice: "Una persona latina se acerca a la cámara como quien cuenta un secreto, tono cómplice.",
  };
  return [
    hook[id],
    `La misma persona ${showIt}. Movimiento de cámara suave hacia el producto.`,
    "La misma persona sonríe a cámara y señala hacia abajo, invitando a tocar el enlace. Fondo limpio, luz cálida.",
  ];
}

/**
 * Arma las tomas. Anuncio = 3 tomas de 5 s (gancho, demo, llamada) que se encadenan por el último
 * cuadro. UGC = 1 toma de 10 s con presentador hablando a cámara.
 */
export function buildShots(mode: "anuncio" | "ugc", template: VideoTemplateId, brief: VideoBrief): Shot[] {
  const b = cleanBrief(brief);
  const l = lines(template, b);
  if (mode === "ugc") {
    const { showIt } = parts(b);
    return [{
      role: "presentador", label: "Presentador", seconds: 10,
      scene: `Una persona latina, presentadora, habla a cámara con naturalidad y gestos suaves; a la mitad ${showIt}.`,
      line: l.ugc,
    }];
  }
  const scenes = adScenes(template, b);
  const roles: [ShotRole, string][] = [["gancho", "Gancho"], ["demo", "Demostración"], ["llamada", "Llamada a la acción"]];
  return roles.map(([role, label], i) => ({ role, label, seconds: 5 as const, scene: scenes[i], line: l.ad[i] }));
}

/** Créditos totales del plan: tomas × precio de cada toma. */
export function planCost(shots: Pick<Shot, "seconds">[]): number {
  return shots.reduce((sum, s) => sum + VIDEO_PRICE[s.seconds], 0);
}

/** Prompt final de una toma. `presenter`: la imagen inicial es la foto del presentador. */
export function shotPrompt(shot: Shot, mode: "anuncio" | "ugc", opts: { presenter?: boolean; cast?: string; hook?: string } = {}): string {
  const line = tidy(shot.line, 240).replace(/"/g, "'");
  const who = opts.presenter
    ? "La persona es la de la imagen inicial: misma cara, ropa y lugar."
    : opts.cast ? `Personaje (igual en todas las tomas): ${tidy(opts.cast, 200)}.` : "";
  const speech = mode === "ugc"
    ? `La persona mira a cámara y dice en español latino, con los labios sincronizados y voz natural: "${line}"`
    : `Voz en off en español latino, tono cercano y natural, dice: "${line}"`;
  const ref = opts.hook && !hasForbiddenClaim(opts.hook)
    ? `Idea de referencia (no la digas literal, solo inspira el tono): ${tidy(opts.hook, 140)}.` : "";
  return [shot.scene, who, speech, ref, UGC_STYLE, VIDEO_RULES].filter(Boolean).join("\n");
}

/** El formato de la semilla (imágenes usan 4:5) llevado a uno que el video acepta. */
export function videoSizeFor(aspect: string | undefined, mode: VideoMode): VideoSize {
  if (aspect === "16:9") return "16:9";
  if (aspect === "1:1") return "1:1";
  void mode; // hoy todos los modos arrancan en vertical (Reels, TikTok, Shorts)
  return "9:16";
}

/** Texto sugerido para publicar (siempre avisa que es IA). Sin promesas ni cifras. */
export function publishText(brief: VideoBrief, mode: VideoMode): string {
  const b = cleanBrief(brief);
  const { product, who, promise } = parts(b);
  const first = promise ? `${product}: ${promise}.` : `Te presento ${product}.`;
  const second = who ? `Hecho ${who.toLowerCase().startsWith("para") ? lower1(who) : `para ${lower1(who)}`}.` : "";
  const cta = mode === "ugc" || mode === "anuncio" ? "Escríbenos y te contamos más." : "Síguenos para ver la siguiente parte.";
  return [first, second, cta, "", "Personaje creado con IA."].filter((x, i) => x || i === 3).join("\n").replace(/\n{3,}/g, "\n\n");
}

export const PUBLISH_STEPS: Record<"meta" | "tiktok", string[]> = {
  meta: [
    "Descarga el video y entra a Meta Business Suite (o al Administrador de anuncios).",
    "Crea una publicación o un anuncio, sube el video en formato vertical y pega el texto sugerido.",
    "Activa la etiqueta \"Contenido creado con IA\" y publica.",
  ],
  tiktok: [
    "Descarga el video y abre TikTok → botón +.",
    "Sube el video, pega el texto sugerido y añade 3 a 5 etiquetas de tu tema.",
    "En \"Más opciones\", activa \"Contenido generado por IA\" y publica.",
  ],
};

/** Serie: plantillas de historia encadenada (la del anuncio vive ahora en el modo Anuncio). */
export const SERIE_TEMPLATES: { id: string; label: string; style: string; scenes: string[] }[] = [
  { id: "novela", label: "Novela en 3 escenas", style: "novela", scenes: [
    "Escena 1 (gancho): ella descubre algo inesperado y su cara cambia por completo.",
    "Escena 2 (conflicto): la discusión sube de tono entre los dos, miradas tensas.",
    "Escena 3 (giro): una revelación final que deja a todos en silencio.",
  ] },
  { id: "dibujos", label: "Dibujos animados", style: "dibujos", scenes: [
    "Escena 1: el personaje principal despierta en un lugar mágico y lo explora con curiosidad.",
    "Escena 2: aparece un amigo inesperado que le pide ayuda con un problema.",
    "Escena 3: juntos lo resuelven y celebran.",
  ] },
  { id: "short", label: "Short vertical", style: "real", scenes: [
    "Golpe 1: algo sorprendente en el primer segundo.",
    "Golpe 2: la explicación rápida.",
    "Golpe 3: el remate que invita a seguir la cuenta.",
  ] },
];

export const SERIE_STYLES: { id: string; label: string; hint: string }[] = [
  { id: "real", label: "Realista", hint: "Estilo cinematográfico realista, luz natural, cámara estable, gente latina natural." },
  { id: "novela", label: "Novela", hint: "Estilo telenovela cinematográfica, emociones intensas, primeros planos, luz cálida, gente latina." },
  { id: "dibujos", label: "Dibujos animados", hint: "Animación 3D estilo película familiar, colores vivos, personajes expresivos, original (sin personajes con derechos)." },
  { id: "anime", label: "Anime", hint: "Estilo anime original, trazos limpios, colores intensos, personajes originales." },
];

/** Si alguien habla en un clip o serie, que sea en español latino. */
export const SPEECH_HINT = "Si alguien habla, habla en español latino.";

/** Prompt para "Mejorar el guion con IA" (generador ugc-script de ai-chat). */
export function improvePrompt(shots: Shot[], brief: VideoBrief, mode: "anuncio" | "ugc"): { system: string; user: string } {
  const b = cleanBrief(brief);
  const maxWords = mode === "ugc" ? 28 : 12;
  const system =
    "Eres guionista de anuncios cortos en español neutro latinoamericano, de tú. Reescribes las líneas habladas de un video. " +
    `Cada línea tiene como máximo ${maxWords} palabras. Nunca escribes testimonios (nada de 'lo compré', 'me funcionó', 'gané', 'bajé'), ` +
    "ni promesas de dinero, salud o plazos, ni marcas o famosos. La persona presenta o explica. " +
    `Responde SOLO con un arreglo JSON de ${shots.length} textos, sin nada más.`;
  const user = [
    `Producto: ${b.product}`, b.who ? `Para quién: ${b.who}` : "", b.promise ? `Qué logra: ${b.promise}` : "",
    b.angle ? `Por qué funciona: ${b.angle}` : "",
    b.hook ? `Gancho de referencia (no lo copies, escribe otro con la misma idea): ${b.hook}` : "",
    "Líneas actuales:", ...shots.map((s, i) => `${i + 1}. (${s.label}) ${s.line}`),
  ].filter(Boolean).join("\n");
  return { system, user };
}

/** Lee la respuesta de la IA: N líneas válidas o null (si alguna rompe las reglas, se descarta todo). */
export function parseImprovedLines(text: string, n: number, mode: "anuncio" | "ugc"): string[] | null {
  const m = text.match(/\[[\s\S]*\]/);
  let arr: unknown = null;
  if (m) { try { arr = JSON.parse(m[0]); } catch { arr = null; } }
  if (!Array.isArray(arr)) {
    // Sin JSON: se aceptan N renglones numerados o sueltos (la IA a veces responde así).
    arr = text.split(/\r?\n/).map(l => l.replace(/^\s*(?:\d+[.)-]|[-•*])\s*/, "").replace(/^\([^)]{0,30}\)\s*/, "").replace(/^["'“”]+|["'“”]+$/g, "").trim()).filter(Boolean);
  }
  if (!Array.isArray(arr) || arr.length !== n) return null;
  const maxChars = mode === "ugc" ? 240 : 110;
  const out = arr.map(x => tidy(x, 400));
  if (out.some(l => l.length < 4 || l.length > maxChars || hasForbiddenClaim(l))) return null;
  return out;
}

/** Serie que llega desde una idea: 3 escenas encadenadas con el producto (sin copiar el gancho). */
export function serieFromBrief(brief: VideoBrief): string[] {
  const { product, who } = parts(cleanBrief(brief));
  const quien = who ? lower1(who) : "una persona latina";
  return [
    `Escena 1 (gancho): ${quien} vive un problema cotidiano y se frustra; algo inesperado llama su atención.`,
    `Escena 2: descubre ${product} y lo prueba con curiosidad, cámara cercana.`,
    "Escena 3 (cierre): sonríe aliviada y mira a cámara, invitando a seguir la cuenta.",
  ];
}
