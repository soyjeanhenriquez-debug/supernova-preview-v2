// SUPERNOVA — Estudio de avatar (20-oct-2026, pedido de Jean): plantillas de imagen y de video para
// crear con un avatar (sin tu cara) o con tu propia foto (con tu cara). Código PURO (sin Deno ni DOM):
// lo usan la app (src/lib/avatarStudio.ts) y el servidor (functions/avatar-studio), así el prompt que
// ve la persona y el que se manda a la IA salen de la MISMA definición.
//
// Los prompts van en inglés (los modelos de imagen y video responden mejor), lo que se DICE va en
// español latino. El servidor arma el prompt final con estas funciones: el navegador solo manda ids
// y los huecos a rellenar, nunca el prompt entero.
//
// Reglas del manual que se aplican aquí:
//  - Nunca testimonio: la persona presenta o explica, nunca "lo compré / me funcionó" (TESTIMONIAL).
//  - Sin antes/después de piel o cuerpo (promesa de resultado físico): esas plantillas no existen.
//  - "Sustituir persona" solo con una cara creada con IA (avatares de SUPERNOVA o imágenes del
//    estudio): el servidor lo exige (slot `aiFace`), para no hacer deepfakes de gente real.
//  - Sin logos, marcas, famosos, dinero ni contenido sexual (RULES_EN, va al final de cada prompt).
//
// Precios: costo mínimo del proveedor × 6 (decisión de Jean, 20-oct-2026), crédito a US$0,008.
// La persona elige el modelo de imagen y de video y ve los créditos de cada uno antes de crear.
// Los cobra el servidor con credit_prices (acciones av_*), nunca el navegador.

// ───────────────────────── Reglas ─────────────────────────

export const RULES_EN =
  "No sexual or violent content. No third-party logos or brand names (a product's own label stays exactly as in the reference). No copyrighted characters or real celebrities. No money, banknotes or income figures. No added text, no watermark.";

export const PRESENTER_RULE_EN =
  "The person only presents or explains: they never say they bought, used or got results from anything. AI-generated character.";

const w = (src: string) => new RegExp(`(?<![\\p{L}\\d])(?:${src})(?![\\p{L}])`, "iu");
/** Guion que suena a testimonio o promete dinero/resultados: se rechaza ANTES de cobrar. */
export const TESTIMONIAL = [
  w("me\\s+(?:funcion[oó]|sirvi[oó]|cambi[oó])"), w("compr[eé]|lo\\s+compre"), w("gan[eé]"),
  w("(?:baj[eé]|perd[ií])\\s+\\d"), w("cambi[oó]\\s+mi\\s+vida"), w("(?:yo\\s+)?lo\\s+(?:uso|us[eé]|prob[eé])"),
  w("lo\\s+encontr[eé]"), w("garantizad[oa]s?"), w("\\d+\\s*(?:d[oó]lares|usd|mil\\s+al\\s+mes)"),
];
export const isTestimonial = (text: string) => TESTIMONIAL.some(r => r.test(text));

// ───────────────────────── Imagen (bloque A) ─────────────────────────

/** Huecos de imagen que la persona sube o elige. `aiFace`: solo caras creadas con IA. */
export type RefSlot = "persona" | "prenda" | "lugar" | "producto" | "captura" | "aiFace";
export const REF_LABEL: Record<RefSlot, string> = {
  persona: "Tu avatar o tu foto", prenda: "Foto de la ropa", lugar: "Foto del lugar",
  producto: "Foto del producto", captura: "Captura de tu app o web", aiFace: "Cara creada con IA",
};

export type ImageGroup = "crear" | "ropa" | "aspecto" | "angulos" | "producto" | "pantalla";
export const IMAGE_GROUPS: { id: ImageGroup; label: string; line: string }[] = [
  { id: "crear", label: "Crear avatar", line: "Una persona nueva desde cero con el método 6C: describes cómo es y la IA escribe el prompt." },
  { id: "ropa", label: "Ropa y fondo", line: "La misma persona con otra ropa o en otro lugar." },
  { id: "aspecto", label: "Cambiar el aspecto", line: "La misma cara en otra situación, o una persona nueva." },
  { id: "angulos", label: "Ángulos", line: "La misma persona desde otro ángulo: más variedad, más valor percibido." },
  { id: "producto", label: "Tu producto", line: "Tu producto en la mano del avatar." },
  { id: "pantalla", label: "Tu app o web", line: "2 pasos: primero la pantalla en negro, después metes tu captura." },
];

export type ImageModelTier = "gpt" | "pro" | "std";
export type ImageTemplate = {
  id: string; group: ImageGroup; label: string; desc: string;
  refs: RefSlot[];                        // en orden: imagen 1, imagen 2…
  fill?: { label: string; placeholder: string; max: number };
  tier: ImageModelTier;                   // el predeterminado: gpt = GPT Image 2 · pro = Nano Banana Pro · std = Nano Banana 2
  example?: string;                       // /estudio-avatar/<id>.webp
  /** Se hace en el navegador, gratis (no usa IA). */
  local?: "flip";
  prompt: (fill: string) => string;
};

export const AVATAR_PROMPT_MAX = 2000;

const SAME = "Using this image as reference, keep the SAME person (same face and identity), the same outfit and the same setting.";
const REAL = "Photorealistic, natural skin texture and lighting.";
const angle = (id: string, label: string, desc: string, render: string): ImageTemplate => ({
  id, group: "angulos", label, desc, refs: ["persona"], tier: "gpt", example: `/estudio-avatar/${id}.webp`,
  prompt: () => `${SAME} ${render} ${REAL}`,
});

export const IMAGE_TEMPLATES: ImageTemplate[] = [
  // Crear avatar (24-oct-2026, "UGC sin producto"): sin foto de referencia; el prompt 6C lo escribe la IA
  // (generador avatar-6c) o la persona. Nunca parecido a alguien real: la cara es siempre nueva.
  { id: "avatar-base", group: "crear", label: "Avatar desde cero", desc: "Una persona nueva, como foto de iPhone.", refs: [], tier: "gpt",
    fill: { label: "Prompt del avatar (método 6C, en inglés)", placeholder: "A candid iPhone photo of a female content creator in her early 20s…", max: AVATAR_PROMPT_MAX },
    prompt: f => `${f} The person is a new, AI-generated character: do not resemble any real or famous person.` },

  // Ropa y fondo
  { id: "ropa", group: "ropa", label: "Cambiar la ropa", desc: "Misma persona, mismo lugar, otra ropa.", refs: ["persona"], tier: "gpt",
    fill: { label: "¿Qué ropa?", placeholder: "Ej.: blusa blanca de lino y jeans claros", max: 160 },
    prompt: f => `Using this image as reference, keep the SAME person — same face, hair, body, pose, background and lighting. Change ONLY their clothing to ${f}. Keep everything else exactly the same. Photorealistic, natural fabric, realistic fit and lighting.` },
  { id: "fondo", group: "ropa", label: "Cambiar el fondo", desc: "La misma toma en otro lugar.", refs: ["persona"], tier: "gpt", example: "/estudio-avatar/fondo.webp",
    fill: { label: "¿Dónde?", placeholder: "Ej.: una cocina acogedora con luz de mañana", max: 160 },
    prompt: f => `Replace the background behind the person with ${f}, keeping the person, their pose, lighting and framing exactly the same. Natural, realistic integration.` },
  { id: "outfit-ref", group: "ropa", label: "Ropa de otra foto", desc: "Le pones exactamente la ropa de una foto.", refs: ["persona", "prenda"], tier: "gpt", example: "/estudio-avatar/outfit-ref.webp",
    prompt: () => "Using the two reference images (image 1: the person; image 2: the outfit / clothing), keep the SAME person from image 1 — same face, hair, skin, body and identity — and dress them in the EXACT outfit shown in image 2, matching its garments, colors, patterns, textures and details as closely as possible. Change ONLY their clothing; keep their pose, framing, background and lighting exactly the same. The outfit fits their body realistically, with natural fabric folds and realistic lighting. The person is image 1, the clothes are image 2 — do NOT copy the face or body from image 2. Photorealistic. Single image." },
  { id: "fondo-ref", group: "ropa", label: "Lugar de otra foto", desc: "La pones en el lugar exacto de una foto.", refs: ["persona", "lugar"], tier: "gpt", example: "/estudio-avatar/fondo-ref.webp",
    prompt: () => "Using the two reference images (image 1: the person; image 2: the background / setting), keep the SAME person from image 1 — same face, hair, skin, body, outfit and pose — and place them into the EXACT background shown in image 2, matching its location, colors, depth and atmosphere. Keep the person's pose, scale and framing exactly the same; replace ONLY what is behind them. Blend naturally: consistent lighting and shadows, matching color temperature and perspective, realistic edges with no cut-out look. The person is image 1, the background is image 2 — do NOT take any person or object from image 2. Photorealistic. Single image." },

  // Aspecto
  { id: "misma-persona", group: "aspecto", label: "Misma cara, otra escena", desc: "Describe la escena; la cara no cambia.", refs: ["persona"], tier: "gpt", example: "/estudio-avatar/misma-persona.webp",
    fill: { label: "¿Qué quieres ver?", placeholder: "Ej.: un primer plano de su cara, con sudadera, en el baño", max: 220 },
    prompt: f => `Using this image as reference, keep the SAME person — same face and identity — and make ${f}. ${REAL}` },
  { id: "cambiar-avatar", group: "aspecto", label: "Otra persona, misma toma", desc: "Cambia a la persona por una nueva creada con IA.", refs: ["persona"], tier: "gpt", example: "/estudio-avatar/cambiar-avatar.webp",
    fill: { label: "¿Cómo es la nueva persona?", placeholder: "Ej.: mujer rubia de unos 25 años, gorro azul", max: 200 },
    prompt: f => `Keep the same scene, pose, framing, background and lighting, but make the person a completely different, AI-generated person: ${f}. Do not resemble any real or famous person. ${REAL}` },
  { id: "sustituir", group: "aspecto", label: "Poner tu avatar en esta toma", desc: "Cambia a la persona de una foto por un avatar creado con IA.", refs: ["persona", "aiFace"], tier: "gpt",
    prompt: () => "Replace the person from image 1 with the person from image 2, wearing the same outfit as in image 2. Keep the pose, framing, background and lighting of image 1. The new face must be exactly the person from image 2. Photorealistic. Single image." },

  // Ángulos
  angle("frente", "De frente", "Mirando a cámara.", "Render a clean front-facing view, the person looking directly at the camera."),
  angle("tres-cuartos", "Tres cuartos", "Cara y cuerpo girados unos 45°.", "Render a three-quarter view, the face and body turned about 45 degrees."),
  angle("perfil", "Perfil", "De lado.", "Render a side profile view of the person."),
  angle("picado", "Desde arriba", "La cámara mira hacia abajo.", "Render a slightly high-angle view, the camera looking down at the person."),
  angle("contrapicado", "Desde abajo", "Transmite seguridad.", "Render a slightly low-angle view, the camera looking up at the person for a confident, hero feel."),
  angle("cuerpo-entero", "Cuerpo entero", "De la cabeza a los pies.", "Render a full-body shot from head to toe, the person standing naturally."),
  angle("cenital", "Cenital (dron)", "Desde arriba del todo.", "Render an extreme top-down bird's-eye shot, camera directly overhead looking straight down at the person, who looks up into the lens, dramatic graphic composition."),
  angle("contrapicado-extremo", "Desde el suelo", "Imponente, muy desde abajo.", "Render an extreme low-angle shot from ground level looking straight up at the person, heroic and imposing perspective."),
  angle("contraluz", "Silueta a contraluz", "Ambiente de cine.", "Render the person backlit against a bright light source, mostly a soft silhouette with a subtle rim light outlining their shape, moody cinematic mood."),
  angle("holandes", "Ángulo inclinado", "Cámara ladeada, energía editorial.", "Render the shot with a slightly tilted dutch angle, camera rotated a few degrees off the horizon for editorial energy, confident pose."),
  angle("tumbada", "Acostada", "Pose relajada.", "Render the person lying down, seen from a natural side or three-quarter angle, relaxed pose."),
  angle("gran-angular", "Gran angular", "La persona pequeña dentro del lugar.", "Render a wide establishing shot with a wide-angle lens, the person small within the frame surrounded by the environment, cinematic sense of scale."),
  angle("mas-cerca", "Plano más cercano", "Más cerca, hablando a cámara.", "Render a closer view of this same image with tighter framing on the person, talking to the camera, teeth naturally visible."),
  { id: "voltear", group: "angulos", label: "Voltear (espejo)", desc: "Gratis: se hace en tu navegador. Útil para el podcast de 2.", refs: ["persona"], tier: "gpt", example: "/estudio-avatar/voltear.webp",
    local: "flip", prompt: () => "Flip the image horizontally" },
  { id: "hoja-personaje", group: "angulos", label: "Hoja de personaje 3×3", desc: "9 retratos de la misma cara. Úsala como referencia maestra para que la cara no cambie.", refs: ["persona"], tier: "pro", example: "/estudio-avatar/hoja-personaje.webp",
    prompt: () => [
      "Using the reference image as the ONLY source of identity, generate a professional 3×3 character sheet showing the exact same person from multiple angles and expressions.",
      "The identity must remain absolutely identical to the reference: same facial structure, same eye shape and spacing, same nose, same lips, same jawline, same hairstyle and hairline, same skin tone, same proportions, same age, same ethnicity, same facial asymmetries and unique identifying features.",
      "Do NOT beautify, stylize, or reinterpret the person in any way.",
      "Create a clean character sheet with nine evenly spaced portraits on a neutral light gray background. Include: front view (neutral), left profile (90°), right profile (90°), left three-quarter view, right three-quarter view, slight downward gaze, slight upward gaze, serious expression, neutral expression.",
      "Lighting should be soft and perfectly consistent across every frame, similar to a professional modeling digitization session. Hair, clothing, makeup and accessories must remain identical in every portrait. The camera distance, focal length and framing should stay consistent throughout.",
      "Ultra high realism. Extremely accurate identity preservation. No artistic interpretation. No beauty filters. No skin smoothing. No extra accessories. No background variation.",
    ].join("\n") },

  // Producto
  { id: "sosteniendo", group: "producto", label: "Lo sostiene", desc: "Tu producto en su mano, mostrándolo a cámara.", refs: ["persona", "producto"], tier: "gpt",
    prompt: () => "Using the two reference images (image 1: the person; image 2: the product), place the product in the person's hand so they are holding it up and showing it to the camera while talking about it. Keep the person's face and look unchanged, and keep the product's label and packaging exactly the same. Realistic hands and lighting. Single image." },
  { id: "senalando", group: "producto", label: "Lo señala", desc: "Señala tu producto mirando a cámara.", refs: ["persona", "producto"], tier: "gpt",
    prompt: () => "Using the two reference images (image 1: the person; image 2: the product), show the person pointing at the product (held in the other hand or placed next to them) while looking at the camera. Keep the person's face and look unchanged, and keep the product's label and packaging exactly the same. Realistic hands and lighting. Single image." },

  // App / web en pantalla
  { id: "movil-negro", group: "pantalla", label: "1 · Celular en negro", desc: "Sostiene un celular con la pantalla apagada.", refs: ["persona"], tier: "gpt", example: "/estudio-avatar/movil-negro.webp",
    prompt: () => "Using the reference image, keep the SAME person — same face, hair, skin, body and identity — the SAME outfit, background and lighting.\nChange ONLY this: they are now holding up a modern smartphone toward the camera, showing its screen to the viewer, the screen completely OFF and solid black (a blank black rectangle, no reflections, no UI, no icons, no text, no brand logos). They hold it naturally with one hand, the display side facing the camera, at chest height.\nKeep both hands realistic and natural, correct number of fingers, natural grip on the phone. Photorealistic, natural skin texture and lighting. Single image." },
  { id: "movil-captura", group: "pantalla", label: "2 · Meter tu captura (celular)", desc: "Pon la imagen del paso 1 y la captura de tu app.", refs: ["persona", "captura"], tier: "pro", example: "/estudio-avatar/movil-captura.webp",
    prompt: () => "Using the two reference images (image 1: the person holding a smartphone with a black screen; image 2: an app screenshot), keep image 1 EXACTLY the same — same person, face, hair, hands, phone, pose, background and lighting, all unchanged.\nChange ONLY this: place the screenshot from image 2 onto the phone's black screen, so it fills the display naturally. Fit it to the exact shape of the screen, matching the perspective and slight tilt of the phone, with realistic screen brightness, subtle glare and rounded screen corners. Do NOT crop or stretch the screenshot, keep its aspect ratio. The screenshot must look like it is really displayed on the phone.\nKeep everything else identical to image 1. Photorealistic. Single image." },
  { id: "portatil-negro", group: "pantalla", label: "1 · Portátil en negro", desc: "Gira un portátil con la pantalla apagada hacia la cámara.", refs: ["persona"], tier: "gpt", example: "/estudio-avatar/portatil-negro.webp",
    prompt: () => "Using the reference image, keep the SAME person — same face, hair, skin, body and identity — the SAME outfit, background and lighting.\nChange ONLY this: they are now sitting with an open laptop, turning it and holding the screen toward the camera so the viewer sees the display. The laptop screen is completely OFF and solid black (a blank black rectangle, no reflections, no UI, no icons, no text, no brand logos). Natural, realistic pose tilting the laptop so the screen clearly faces the camera.\nKeep both hands realistic and natural, correct number of fingers. Photorealistic, natural skin texture and lighting. Single image." },
  { id: "portatil-captura", group: "pantalla", label: "2 · Meter tu captura (portátil)", desc: "Pon la imagen del paso 1 y la captura de tu web.", refs: ["persona", "captura"], tier: "pro", example: "/estudio-avatar/portatil-captura.webp",
    prompt: () => "Using the two reference images (image 1: the person holding a laptop with a black screen; image 2: an app or website screenshot), keep image 1 EXACTLY the same — same person, face, hair, hands, laptop, pose, background and lighting, all unchanged.\nChange ONLY this: place the screenshot from image 2 onto the laptop's black screen, so it fills the display naturally. Fit it to the exact shape of the screen, matching the perspective and tilt of the laptop, with realistic screen brightness, subtle glare and correct proportions. Do NOT crop or stretch the screenshot, keep its aspect ratio. The screenshot must look like it is really displayed on the laptop.\nKeep everything else identical to image 1. Photorealistic. Single image." },
];

export const imageTemplate = (id: unknown) => IMAGE_TEMPLATES.find(t => t.id === id) ?? null;

// ───────────────────────── Avatar 6C (24-oct-2026) ─────────────────────────
// La persona describe su avatar en español con pocos datos; el generador avatar-6c (ai-chat, ligero) escribe el
// prompt en inglés con el método 6C: Character, Camera, Clothing, Context, Cinematic light, Consistency anchors.

export const AVATAR_6C_GENERATOR = "avatar-6c";
export type Avatar6C = {
  estilo: "influencer" | "creador";
  persona: string;  // edad, género, piel, pelo, rasgos
  ropa: string;
  lugar: string;
  luz: string;
  accion: string;   // qué hace: habla a cámara con micrófono, selfie, camina…
};
export const AVATAR_6C_EMPTY: Avatar6C = { estilo: "creador", persona: "", ropa: "", lugar: "", luz: "", accion: "habla a cámara sosteniendo un micrófono inalámbrico pequeño" };

export const AVATAR_6C_SYSTEM = [
  "Eres un experto en prompts de imagen hiperrealistas estilo foto de iPhone para avatares de creadores de contenido (UGC).",
  "Escribes SIEMPRE un único prompt en inglés con el Método 6C, en este orden, en párrafos cortos:",
  "C1 Character: edad, vibe, rasgos de la cara, piel realista (visible pores, subtle freckles, natural imperfections).",
  "C2 Camera: iPhone photo, shot vertically, eye-level, medium portrait, natural smartphone lens look, authentic social media reel aesthetic.",
  "C3 Clothing: outfit, styling y accesorios.",
  "C4 Context: lugar y fondo concreto, despejado, que deje toda la atención en la persona.",
  "C5 Cinematic light: luz natural y/o direct iPhone flash, sombras, slight grain, candid dump vibe.",
  "C6 Consistency anchors: 'Maintain the same pose, hairstyle, outfit, framing, expression, background and overall composition. Preserve realistic proportions, accurate hands and facial features, natural skin texture, true-to-life colors, sharp focus.'",
  "Reglas: nunca menciones AI, CGI, render ni 'hyperrealistic'. Nada sexual ni insinuante. Nunca nombres ni describas a una persona famosa o real: la persona es nueva.",
  "Estilo 'influencer' = Instagram influencer, model-level aesthetic. Estilo 'creador' = relatable creator, real UGC vibe.",
  "Termina SIEMPRE con: No text, no watermark, no distortion.",
  "Responde SOLO con el prompt, sin títulos, sin comillas, sin bloque de código y sin texto antes ni después.",
].join("\n");

/** Pedido al generador con lo que escribió la persona (son datos, no instrucciones). */
export function avatar6cRequest(d: Avatar6C): string {
  const f = (v: string, max = 240) => cleanFill(v, max) || "(elige tú algo natural y coherente)";
  return [
    `Escribe el prompt 6C de este avatar. Estilo: ${d.estilo === "influencer" ? "influencer (opción A)" : "creador real UGC (opción B)"}.`,
    `Persona: ${f(d.persona)}`,
    `Ropa: ${f(d.ropa)}`,
    `Lugar: ${f(d.lugar)}`,
    `Luz: ${f(d.luz)}`,
    `Qué hace: ${f(d.accion)}`,
  ].join("\n");
}

/** Limpia la respuesta del generador: sin bloques de código ni comillas, con el cierre obligatorio. */
export function parse6c(text: string): string | null {
  const t = text.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim().replace(/^["“]|["”]$/g, "").trim();
  if (t.length < 80) return null;
  const end = "No text, no watermark, no distortion.";
  const body = t.includes(end) ? t.slice(0, t.lastIndexOf(end) + end.length) : `${t}\n\n${end}`;
  return body.slice(0, AVATAR_PROMPT_MAX);
}

/** Limpia el hueco que escribe la persona (sin comillas ni saltos que rompan el prompt). */
export function cleanFill(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\r\n\t"]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Prompt final de imagen (lo arma el servidor). Devuelve error legible si falta el hueco. */
export function buildImagePrompt(id: unknown, fill: unknown): { prompt: string; template: ImageTemplate } | { error: string } {
  const t = imageTemplate(id);
  if (!t || t.local) return { error: "Esa plantilla no existe." };
  const f = t.fill ? cleanFill(fill, t.fill.max) : "";
  if (t.fill && f.length < 3) return { error: `Escribe: ${t.fill.label.toLowerCase()}` };
  return { prompt: `${t.prompt(f)}\n\n${RULES_EN}`, template: t };
}

// ───────────────────────── Video (bloques B y C) ─────────────────────────

export const NO_CUTS = "Single continuous take, no cuts or scene changes.";

export const CAMERAS: { id: string; label: string; hint: string; prompt: string; level: "basico" | "variar" | "avanzado" }[] = [
  { id: "quieta-gestos", label: "Cámara quieta + gestos", hint: "La más usada.", level: "basico", prompt: `(static camera, no movement) realistic arm movements and subtle micro-movements. ${NO_CUTS}` },
  { id: "fijo", label: "Plano fijo", hint: "Trípode, nada se mueve.", level: "basico", prompt: `Locked-off static shot, camera completely still on a tripod, no movement at all. ${NO_CUTS}` },
  { id: "zoom-lento", label: "Zoom lento a la cara", hint: "Se acerca poco a poco.", level: "basico", prompt: `Slow, continuous zoom-in toward the subject's face, starting from the very first frame and moving steadily closer, then holding steady on the close-up for the rest of the clip. ${NO_CUTS}` },
  { id: "zoom-rapido", label: "Zoom rápido al hablar", hint: "Engancha en el primer segundo.", level: "basico", prompt: `Fast zoom-in to the subject's face at the very start, settling into a close-up exactly as they begin to speak, then holding steady. ${NO_CUTS}` },
  { id: "en-mano", label: "En mano, sutil", hint: "Se siente grabado con el celular.", level: "basico", prompt: `Subtle handheld movement, very slight and natural, for a real human feel without distraction. ${NO_CUTS}` },
  { id: "podcast", label: "Acercamiento de podcast", hint: "Casi no se nota.", level: "variar", prompt: `Very gentle, almost imperceptible slow push-in on the speaker, from a medium shot to a medium close-up over the whole clip. ${NO_CUTS}` },
  { id: "retroceso", label: "Se aleja y revela", hint: "Muestra el lugar.", level: "variar", prompt: `Slow pull-back from a close-up, revealing the surrounding environment as the subject starts talking, then holding on the wider shot. ${NO_CUTS}` },
  { id: "orbita", label: "Órbita lenta", hint: "Gira alrededor.", level: "variar", prompt: `Slow arc shot, the camera orbiting around the subject in a smooth half-circle, subject stays centered. ${NO_CUTS}` },
  { id: "caminando", label: "Siguiéndola al caminar", hint: "Camina y habla.", level: "variar", prompt: `Tracking shot following alongside the subject as they walk and talk, smooth and steady. ${NO_CUTS}` },
  { id: "ojos", label: "Hasta los ojos", hint: "Para la frase clave.", level: "avanzado", prompt: `Slow creeping push-in that tightens into an extreme close-up on the eyes right as the key line is delivered, then holds. ${NO_CUTS}` },
  { id: "heroico", label: "Desde abajo, heroico", hint: "Autoridad.", level: "avanzado", prompt: `Low-angle hero shot looking up at the subject, slow push-in for authority and impact, then holding. ${NO_CUTS}` },
  { id: "bokeh", label: "Fondo desenfocado", hint: "Look de cine.", level: "avanzado", prompt: `Shallow depth of field with a creamy bokeh background, slow push-in on the in-focus subject, then holding. ${NO_CUTS}` },
  { id: "lenta", label: "Cámara lenta", hint: "Suave y cinematográfica.", level: "avanzado", prompt: `Slow-motion delivery, smooth and cinematic, with a subtle camera drift. ${NO_CUTS}` },
];

export const GESTURES: { id: string; label: string; en: string }[] = [
  { id: "gorra", label: "Se ajusta la gorra", en: "adjusts their cap" },
  { id: "cafe", label: "Da un sorbo de café", en: "takes a sip of coffee and sets the cup down" },
  { id: "pelo", label: "Se arregla el pelo", en: "fixes their hair" },
  { id: "saluda", label: "Saluda con la mano", en: "waves hello" },
  { id: "rie", label: "Se ríe", en: "laughs" },
  { id: "sorpresa", label: "Cara de sorpresa", en: "with a surprised look on their face" },
  { id: "asiente", label: "Asiente sonriendo", en: "nods slowly, smiling" },
  { id: "arriba", label: "Señala hacia arriba", en: "points up" },
  { id: "izquierda", label: "Señala a la izquierda", en: "points up to the left" },
  { id: "derecha", label: "Señala a la derecha", en: "points to the right" },
  { id: "brazos", label: "Cruza los brazos", en: "crosses their arms" },
  { id: "hombros", label: "Se encoge de hombros", en: "shrugs" },
  { id: "pulgar", label: "Pulgar arriba", en: "gives a thumbs up" },
  { id: "palmada", label: "Da una palmada", en: "claps once" },
  { id: "cabeza", label: "Inclina la cabeza", en: "tilts their head curiously" },
  { id: "gafas", label: "Se ajusta las gafas", en: "adjusts their glasses" },
  { id: "oreja", label: "Pelo detrás de la oreja", en: "tucks hair behind their ear" },
  { id: "barbilla", label: "Se toca la barbilla", en: "taps their chin thoughtfully" },
  { id: "dedos", label: "Chasquea los dedos", en: "snaps their fingers" },
  { id: "ojos-blanco", label: "Ojos en blanco, en broma", en: "rolls their eyes playfully" },
];

export type Genero = "mujer" | "hombre";
export const VOICES: { id: string; label: string; genero: Genero; prompt: string }[] = [
  { id: "h50", label: "Hombre ~50, grave y cálido", genero: "hombre", prompt: "Voice: a deep, warm male voice — a man in his early-to-mid 50s, low and resonant with a slight gravelly texture, calm and unhurried, confident and grounded." },
  { id: "h35", label: "Hombre ~35, seguro", genero: "hombre", prompt: "Voice: a male voice in his mid-30s, medium pitch, a bit fuller and more settled than a twenty-something, calm and confident, friendly but grounded." },
  { id: "h28", label: "Hombre ~28, con energía", genero: "hombre", prompt: "Voice: a bright, energetic male voice — a guy in his mid-to-late 20s, medium-high pitch, clear and relaxed, friendly and upbeat, casual conversational pace." },
  { id: "h25", label: "Hombre ~25, juvenil", genero: "hombre", prompt: "Voice: a youthful male voice — a guy in his mid-20s, bright and fairly high-pitched, light and energetic, casual relaxed pace." },
  { id: "m50", label: "Mujer ~50, cálida y madura", genero: "mujer", prompt: "Voice: a warm, mature female voice — a woman in her early 50s, rich and slightly smoky lower-mid tone, calm and measured pacing, confident and reassuring." },
  { id: "m35", label: "Mujer ~35, segura", genero: "mujer", prompt: "Voice: a female voice in her mid-30s, medium pitch, a bit fuller and more settled than a twenty-something, calm and confident, warm but grounded." },
  { id: "m28", label: "Mujer ~28, alegre", genero: "mujer", prompt: "Voice: a light, lively female voice — a woman in her mid-20s, bright and clear with a higher pitch, warm and friendly, natural conversational pace." },
  { id: "m25", label: "Mujer ~25, juvenil", genero: "mujer", prompt: "Voice: a youthful female voice — a woman in her mid-20s, bright and fairly high-pitched, light and breezy, casual relaxed pace." },
];

/** Acentos para el público de SUPERNOVA (LATAM). España se quitó a propósito. */
export const ACCENTS: { id: string; label: string; prompt: string }[] = [
  { id: "latam", label: "Latino neutro", prompt: "Spanish with a neutral Latin American accent." },
  { id: "rd", label: "Dominicano", prompt: "Spanish with a warm Dominican Republic (Santo Domingo) Caribbean accent, clear and conversational." },
  { id: "mx", label: "Mexicano", prompt: "Spanish with a Mexican (central, Mexico City) accent." },
  { id: "co", label: "Colombiano", prompt: "Spanish with a clear, neutral Colombian (Bogotá) accent." },
  { id: "ar", label: "Argentino", prompt: "Spanish with an Argentine Rioplatense (Buenos Aires) accent, including the typical \"sh\" sound for \"ll\" and \"y\"." },
];

/** Banco de "voz en off" (b-roll sin hablar): acción + lugar. */
export const BROLL_ACTIONS: { id: string; label: string; en: string; group: string }[] = [
  { id: "cafe", label: "Tomando café en la ventana", en: "holds a mug of coffee with both hands, relaxed, looking out the window", group: "Casa" },
  { id: "desayuno", label: "Desayunando", en: "sits at a kitchen table having breakfast, casual candid moment", group: "Casa" },
  { id: "espejo", label: "Arreglándose al espejo", en: "gets ready in front of the mirror, morning routine", group: "Casa" },
  { id: "sofa", label: "Relajada en el sofá", en: "is curled up on the sofa, cozy, wrapped in a blanket", group: "Casa" },
  { id: "cocina", label: "Cocinando", en: "cooks at the kitchen counter, chopping ingredients", group: "Casa" },
  { id: "lee", label: "Leyendo", en: "reads a book on the couch, calm afternoon light", group: "Casa" },
  { id: "laptop", label: "Trabajando en el portátil", en: "works on a laptop at a desk, focused", group: "Casa" },
  { id: "calle", label: "Caminando por la calle", en: "walks down a city street, natural stride, looking ahead", group: "Calle" },
  { id: "movil", label: "Mirando el celular", en: "walks while looking at their phone, candid", group: "Calle" },
  { id: "terraza", label: "En una terraza", en: "sits at an outdoor café terrace with a drink", group: "Calle" },
  { id: "compras", label: "Con bolsas de compras", en: "walks with shopping bags, happy", group: "Calle" },
  { id: "foto", label: "Haciendo una foto", en: "takes a photo with their phone", group: "Calle" },
  { id: "riendo", label: "Riéndose", en: "laughs at something off-camera, candid", group: "Calle" },
  { id: "sostiene", label: "Sosteniendo el producto", en: "holds the product up, showing it to camera", group: "Producto" },
  { id: "unboxing", label: "Abriendo un paquete", en: "unboxes a package, excited", group: "Producto" },
  { id: "etiqueta", label: "Leyendo la etiqueta", en: "reads the label of the product closely", group: "Producto" },
  { id: "estira", label: "Estirando antes de entrenar", en: "stretches before a workout, sporty outfit", group: "Bienestar" },
  { id: "agua", label: "Bebiendo agua", en: "drinks water from a bottle after exercise", group: "Bienestar" },
  { id: "yoga", label: "Haciendo yoga", en: "holds a yoga pose on a mat, calm", group: "Bienestar" },
  { id: "pensativa", label: "Pensativa", en: "has a thoughtful expression, hand on chin", group: "Emociones" },
  { id: "feliz", label: "Feliz y natural", en: "smiles genuinely, warm and relaxed", group: "Emociones" },
  { id: "decidida", label: "Seria y decidida", en: "has a serious confident expression, looking straight at camera", group: "Emociones" },
];

export const PLACES: { id: string; label: string; en: string }[] = [
  { id: "bano", label: "Baño de mañana", en: "In a bright bathroom, soft morning light through the window." },
  { id: "dormitorio", label: "Dormitorio acogedor", en: "In a cozy bedroom, warm lamp light." },
  { id: "ventana", label: "Junto a la ventana", en: "By a window, natural overcast daylight." },
  { id: "cocina", label: "Cocina luminosa", en: "In a bright modern kitchen, natural daylight." },
  { id: "calle", label: "Calle de ciudad", en: "On a city street, natural daylight, urban background." },
  { id: "terraza", label: "Terraza", en: "On an outdoor terrace, warm afternoon sun." },
  { id: "salon", label: "Sala por la tarde", en: "In a living room, soft warm afternoon light." },
  { id: "parque", label: "Parque", en: "In a park, green background, soft natural light." },
  { id: "noche", label: "Noche con flash", en: "At night, direct harsh phone flash, high contrast." },
];

export type VideoFormat = "camara" | "sostiene" | "senala" | "broll-producto" | "sin-hablar";
export const VIDEO_FORMATS: { id: VideoFormat; label: string; desc: string; talks: boolean; needsProduct?: boolean }[] = [
  { id: "camara", label: "Habla a cámara (UGC)", desc: "Tu avatar dice tu guion mirando a cámara.", talks: true },
  { id: "sostiene", label: "Habla y muestra el producto", desc: "Lo sostiene y lo enseña mientras habla.", talks: true, needsProduct: true },
  { id: "senala", label: "Habla y señala el producto", desc: "Lo señala y lo mira mientras habla.", talks: true, needsProduct: true },
  { id: "sin-hablar", label: "Sin hablar (para tu voz en off)", desc: "Una escena muda para narrar encima.", talks: false },
  { id: "broll-producto", label: "Solo el producto", desc: "Toma bonita del producto, sin personas.", talks: false, needsProduct: true },
];

/** Palabras que caben: ~2,4 palabras por segundo hablando natural. */
export const maxWords = (seconds: number) => Math.floor(seconds * 2.4);
export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export type VideoParts = {
  format: VideoFormat; camera?: string; before?: string; after?: string; script?: string;
  voice?: string; accent?: string; action?: string; place?: string; surface?: string; seconds: number;
  /** "Cómo se ve" (22-oct-2026, pedido de Jean): la persona describe la escena con sus palabras, como el prompt de
   *  Higgsfield. Va ANTES de las reglas: si choca con ellas, mandan las reglas. */
  look?: string;
};

export const LOOK_MAX = 300;
/** Texto libre de la escena: sin testimonios ni promesas. "" = no escribió nada. */
export function cleanLook(v: unknown): { look: string } | { error: string } {
  const look = cleanFill(v, LOOK_MAX);
  if (look && isTestimonial(look)) return { error: "La descripción de la escena suena a testimonio o promesa. Describe solo cómo se ve: lugar, luz, cámara, ropa, ambiente." };
  return { look };
}
const lookLine = (look: string) => (look ? `Scene direction from the creator (follow it unless it breaks the rules at the end): ${look}` : "");

const byId = <T extends { id: string }>(list: T[], id: unknown) => list.find(x => x.id === id) ?? null;

/** Partes del prompt de un clip, con la etiqueta de color que se ve en la app (como en el curso de UGC). */
export type PromptTag = "camara" | "escena" | "guion" | "voz" | "acento" | "reglas";
export const PROMPT_TAGS: Record<PromptTag, string> = {
  camara: "Cámara", escena: "Cómo se ve", guion: "Guion y micro-acción", voz: "Voz", acento: "Acento", reglas: "Reglas",
};

/** El prompt de video separado por partes. buildVideoPrompt une estas mismas partes: lo que se ve es lo que se manda. */
export function videoPromptParts(p: VideoParts): { parts: { tag: PromptTag; text: string }[]; talks: boolean } | { error: string } {
  const r = buildVideoPromptInternal(p);
  return "error" in r ? r : { parts: r.parts, talks: r.talks };
}

/** Prompt final de video (lo arma el servidor). */
export function buildVideoPrompt(p: VideoParts): { prompt: string; talks: boolean } | { error: string } {
  const r = buildVideoPromptInternal(p);
  return "error" in r ? r : { prompt: r.prompt, talks: r.talks };
}

function buildVideoPromptInternal(p: VideoParts): { prompt: string; parts: { tag: PromptTag; text: string }[]; talks: boolean } | { error: string } {
  const f = byId(VIDEO_FORMATS, p.format);
  if (!f) return { error: "Elige un formato." };
  const cam = byId(CAMERAS, p.camera) ?? CAMERAS[0];
  const l = cleanLook(p.look);
  if ("error" in l) return l;
  const direction = lookLine(l.look);
  if (!f.talks) {
    if (f.id === "broll-producto") {
      const surface = cleanFill(p.surface, 80) || "a neutral backdrop";
      return muted([
        { tag: "camara", text: `Slow gentle camera move, cinematic, no talking. Using the product from the reference image, a clean beauty shot of the product on ${surface}, soft natural lighting, the product in sharp focus with its label clearly visible and unchanged. No people. ${NO_CUTS}` },
        { tag: "escena", text: direction }, { tag: "reglas", text: RULES_EN },
      ]);
    }
    const act = byId(BROLL_ACTIONS, p.action);
    const place = byId(PLACES, p.place);
    // Con su propia descripción, la acción de la lista es opcional.
    if (!act && !l.look) return { error: "Elige qué hace tu avatar o describe la escena." };
    return muted([
      { tag: "camara", text: `${cam.prompt.replace(` ${NO_CUTS}`, "")}, cinematic, no talking, mouth closed. Keep the SAME person from the reference.${act ? ` They ${act.en}.` : ""}${place ? ` ${place.en}` : ""} ${NO_CUTS}` },
      { tag: "escena", text: direction }, { tag: "reglas", text: RULES_EN },
    ]);
  }
  const script = cleanFill(p.script, 400);
  if (wordCount(script) < 3) return { error: "Escribe lo que va a decir (mínimo 3 palabras)." };
  if (wordCount(script) > maxWords(p.seconds)) return { error: `Para ${p.seconds} s caben unas ${maxWords(p.seconds)} palabras. Acorta el guion o elige más segundos.` };
  if (isTestimonial(script)) return { error: "El guion suena a testimonio o promesa (\"lo compré\", \"me funcionó\", cifras de dinero). Tu avatar solo presenta o explica." };
  const voice = byId(VOICES, p.voice) ?? VOICES[6];
  const accent = byId(ACCENTS, p.accent) ?? ACCENTS[0];
  const before = byId(GESTURES, p.before);
  const after = byId(GESTURES, p.after);
  const product = f.id === "sostiene"
    ? " Using the product from the reference image, the person holds the product in one hand and shows it to the camera while talking, with natural, realistic gestures. Keep the product's label and packaging clearly visible and unchanged."
    : f.id === "senala"
      ? " Using the product from the reference image, while talking to the camera the person naturally points at the product and glances down at it a couple of times, then back to the camera, with relaxed, realistic gestures. Keep the product's label and packaging clearly visible and unchanged."
      : "";
  const say = before
    ? `The person ${before.en}, then looks at the camera and says: "${script}"`
    : `The person looks directly at the camera with natural gestures and a clear, friendly influencer tone, and says: "${script}"`;
  const parts: { tag: PromptTag; text: string }[] = [
    { tag: "camara", text: `${cam.prompt}${product}` },
    ...(direction ? [{ tag: "escena" as const, text: direction }] : []),
    { tag: "guion", text: `${say}${after ? ` ${after.en}.` : ""}` },
    { tag: "voz", text: voice.prompt },
    { tag: "acento", text: `${accent.prompt} Single speaker: only the person from the reference image talks. Clean audio, no background music.` },
    { tag: "reglas", text: `${PRESENTER_RULE_EN} ${RULES_EN}` },
  ];
  return { talks: true, parts, prompt: parts.map(x => x.text).join("\n") };
}

/** Escena muda: une las partes con línea en blanco (igual que antes de separarlas). */
function muted(raw: { tag: PromptTag; text: string }[]) {
  const parts = raw.filter(x => x.text);
  return { talks: false, parts, prompt: parts.map(x => x.text).join("\n\n") };
}

// ───────────────────────── Modelos y precios ─────────────────────────

export type Provider = "apimart" | "higgsfield";
/** Duraciones que se ofrecen (22-oct-2026: + 15 s donde el proveedor lo acepta, docs leídas ese día). */
export type VideoLen = 5 | 10 | 15;
export const isVideoLen = (x: unknown): x is VideoLen => x === 5 || x === 10 || x === 15;
export type VideoModel = {
  id: string; label: string; provider: Provider; note: string;
  /** Costo mínimo publicado por segundo (US$) del proveedor, 720p. */
  usdPerSec: number;
  /** Si el proveedor cobra por video y no por segundo: US$ por duración (manda sobre usdPerSec). */
  usdFixed?: Partial<Record<VideoLen, number>>;
  /** Duración que entrega de verdad cuando no existe la de la lista (ej.: Omni y Grok no hacen 5 s → 6 s). */
  realSeconds?: Partial<Record<VideoLen, number>>;
  seconds: VideoLen[];
  talks: boolean;            // ¿puede hablar con voz y labios?
  productRef: boolean;       // ¿acepta persona + producto como referencias?
  action: (s: VideoLen) => string;
};

export const CREDIT_USD = 0.008;
export const MARKUP = 6;
/** Créditos = costo × 6 / US$0,008, redondeado hacia arriba. Igual que la migración de precios. */
export const creditsFor = (usd: number) => Math.ceil((usd * MARKUP) / CREDIT_USD - 1e-9);

// Omni y Grok (decisión de Jean, 20-oct-2026, opción A): Omni = gemini-omni-1.1-flash-ext (cobra por video:
// 720p 6 s US$0,30 · 10 s US$0,40; solo 4/6/8/10 s) y Grok = grok-imagine-1.5-video-ext (720p US$0,01912/s,
// 6–15 s). Precios "after_discount" de GET api.apimart.ai/api/pricing/models/all, leídos el 20-oct-2026.
// 15 s (22-oct-2026, docs del proveedor leídas ese día): Seedance Mini 4–15 (APIMart), Grok 6–15, Wan 3.0 2–30,
// Kling 3.0 3–15, Seedance 2.0 4–15 (Higgsfield). Omni solo 4/6/8/10 y Kling 2.5 solo 5|10: sin 15 s.
export const VIDEO_MODELS: VideoModel[] = [
  { id: "omni", label: "Omni", provider: "apimart", note: "La que mejor mueve los labios al hablar a cámara.", usdPerSec: 0.04, usdFixed: { 5: 0.30, 10: 0.40 }, realSeconds: { 5: 6 }, seconds: [5, 10], talks: true, productRef: false, action: s => `av_vid_omni_${s}` },
  { id: "grok", label: "Grok", provider: "apimart", note: "Escenas sin hablar: voz en off, B-roll y producto.", usdPerSec: 0.01912, realSeconds: { 5: 6 }, seconds: [5, 10, 15], talks: false, productRef: false, action: s => `av_vid_grok_${s}` },
  { id: "seedance-mini", label: "Seedance 2.0 Mini", provider: "apimart", note: "El más barato. Habla con voz y labios.", usdPerSec: 0.0236 /* 0,118 por 5 s (real_cost de vid_mini_5) */, seconds: [5, 10, 15], talks: true, productRef: false, action: s => `av_vid_smini_${s}` },
  { id: "wan30", label: "Wan 3.0", provider: "higgsfield", note: "Muy buena relación calidad-precio. Habla.", usdPerSec: 0.05, seconds: [5, 10, 15], talks: true, productRef: false, action: s => `av_vid_wan30_${s}` },
  { id: "kling25", label: "Kling 2.5 Turbo", provider: "higgsfield", note: "Movimiento muy natural. Sin voz: para escenas mudas.", usdPerSec: 0.042, seconds: [5, 10], talks: false, productRef: false, action: s => `av_vid_kling25_${s}` },
  { id: "kling30", label: "Kling 3.0", provider: "higgsfield", note: "Calidad de cine. Sin voz por ahora.", usdPerSec: 0.084, seconds: [5, 10, 15], talks: false, productRef: false, action: s => `av_vid_kling30_${s}` },
  { id: "seedance20", label: "Seedance 2.0", provider: "higgsfield", note: "Premium: la cara y tu producto en el mismo video, con voz.", usdPerSec: 0.141, seconds: [5, 10, 15], talks: true, productRef: true, action: s => `av_vid_seed20_${s}` },
];
export const videoModel = (id: unknown) => VIDEO_MODELS.find(m => m.id === id) ?? null;
/** La duración más cercana (sin pasarse) que ofrece ese modelo: al cambiar de modelo no queda una que no existe. */
export const fitLen = (m: VideoModel, s: VideoLen): VideoLen => [...m.seconds].reverse().find(x => x <= s) ?? m.seconds[0];
/** Segundos que entrega de verdad ese modelo para la opción elegida (Omni y Grok no hacen 5 s → 6 s). */
export const videoSeconds = (m: VideoModel, s: VideoLen) => m.realSeconds?.[s] ?? s;
/** Costo real del proveedor (US$) de un video: precio por video si lo hay, si no por segundo entregado. */
export const videoUsd = (m: VideoModel, s: VideoLen) => m.usdFixed?.[s] ?? m.usdPerSec * videoSeconds(m, s);
export const videoCredits = (m: VideoModel, s: VideoLen) => creditsFor(videoUsd(m, s));

/**
 * Imagen: la persona elige el modelo; cada plantilla trae su predeterminado (`tier`), el mejor del momento
 * según src/lib/modelAdvice.ts (realista → GPT Image 2; editar o componer → Nano Banana Pro).
 * Costo por imagen 1K: GPT Image 2 = real_cost medido de gen_ad_image; Nano Banana = costo publicado.
 * En este orden se muestran.
 */
export const IMAGE_TIERS: Record<ImageModelTier, { label: string; note: string; apimart: "gpt-image-2" | "nano-banana-2" | "nano-banana-pro"; usd: number; action: string }> = {
  gpt: { label: "GPT Image 2", note: "Parece una foto de verdad: avatares y anuncios.", apimart: "gpt-image-2", usd: 0.0115, action: "av_img_gpt" },
  pro: { label: "Nano Banana Pro", note: "Para componer y editar con detalle.", apimart: "nano-banana-pro", usd: 0.0285, action: "av_img_pro" },
  std: { label: "Nano Banana 2", note: "Rápido y económico.", apimart: "nano-banana-2", usd: 0.0143, action: "av_img" },
};
export const IMAGE_TIER_IDS = Object.keys(IMAGE_TIERS) as ImageModelTier[];
export const isImageTier = (x: unknown): x is ImageModelTier => typeof x === "string" && (IMAGE_TIER_IDS as string[]).includes(x);
export const imageCredits = (t: ImageModelTier) => creditsFor(IMAGE_TIERS[t].usd);
