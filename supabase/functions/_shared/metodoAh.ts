// SUPERNOVA — «Video IA Perfecto» (Modelo AH), fase 1: de UNA frase a un storyboard con personaje fijo
// (02-nov-2026, pedido de Jean). Plan: docs/propuestas/2026-11-02-plan-metodo-ah.md.
//
// Aquí vive el método (escrito con nuestras palabras; se aprendió la estructura del curso, no se copió su texto):
//   · Agentes 01–05 (estratega, guionista, arquitecto de personaje, director de storyboard) → UNA llamada a la IA
//     que devuelve JSON. El servidor la valida y la normaliza (duraciones, número de escenas, edad adulta).
//   · Agente 04 (ingeniero 6C) → código determinista: arma el prompt de cada escena con los 6 bloques
//     (personaje, cámara, ropa, contexto, luz, anclas de consistencia). Así «cambiar solo…» toca un campo y
//     nada más, y las reglas de salida (final obligatorio, palabras prohibidas) se cumplen siempre.
//   · Modelos (catálogo AH = src/lib/modelAdvice.ts): imagen realista (modos A/B) → GPT Image 2;
//     animada (modo C) → Nano Banana Pro.
// Funciones puras: se prueban con `deno test -A supabase/functions/_shared/metodoAh_test.ts`.

export type Modo = "A" | "B" | "C";
export type Voz = "ninguna" | "off" | "dialogo";
export type Plantilla = "libre" | "monologo" | "reto";
export type Opciones = { modo?: Modo | "auto"; duracion: 15 | 30 | 45; voz: Voz; plantilla: Plantilla; conCara: boolean };

export type Personaje = {
  nombre: string; edad: number; genero: string; cara: string; ojos: string; pelo: string; piel: string;
  rasgos: string; cuerpo: string; gestos: string; ropa_base: string; anclas: string[];
};
export type Escena = {
  id: string; segundos: number; proposito: string; voz: string;
  lugar: string; ropa: string; accion: string; plano: string; luz: string; movimiento: string; transicion: string;
};
export type Plan = {
  titulo: string; modo: Modo; estilo: string;
  brief: { publico: string; plataforma: string; angulo: string; gancho: string; final: string; novedad: string };
  personaje: Personaje; escenas: Escena[];
};

export const DURACIONES = [15, 30, 45] as const;
export const isDuracion = (v: unknown): v is 15 | 30 | 45 => v === 15 || v === 30 || v === 45;
export const isModo = (v: unknown): v is Modo => v === "A" || v === "B" || v === "C";
export const isVoz = (v: unknown): v is Voz => v === "ninguna" || v === "off" || v === "dialogo";
export const isPlantilla = (v: unknown): v is Plantilla => v === "libre" || v === "monologo" || v === "reto";

/** Cuántas escenas según la duración (3–8 s cada una, como el método: nada de planos eternos). */
export const escenasPara = (d: 15 | 30 | 45): [number, number] => (d === 15 ? [3, 4] : d === 30 ? [5, 7] : [7, 9]);

/** Final obligatorio de todo prompt de imagen. */
export const FINAL = "No text, no watermark, no distortion.";
/** Palabras que nunca van en un prompt final (delatan «hecho con IA» y empeoran el realismo). */
const PROHIBIDAS = /\b(ai[- ]generated|artificial intelligence|cgi|3d render|render(ed|ing)?|hyper-?realistic|photorealistic render|\bai\b)\b/gi;

export const modeloImagen = (m: Modo): "gpt-image-2" | "nano-banana-pro" => (m === "C" ? "nano-banana-pro" : "gpt-image-2");

// ───────────── prompt de la IA planificadora (agentes 01–05) ─────────────

const PLANTILLA_GUIA: Record<Plantilla, string> = {
  libre: "Estructura libre que sirva a la idea: gancho (1–3 s) → situación o curiosidad → desarrollo → remate → final o llamada opcional.",
  monologo: "«Monólogo que vende»: la persona habla a cámara. Gancho que rompe una creencia (\"No necesitas X para Y\"), la creencia y por qué está al revés, autoridad + una prueba visible, quitar el miedo, llamada a la acción clara. El MISMO personaje cambia de sitio o de ángulo cada 4–8 s (selfie con el brazo estirado, cenital, plano medio, plano entero) con la misma ropa.",
  reto: "«Reto: ¿es real o IA?»: abre con un reto al espectador («te apuesto a que no distingues…»), muestra la escena que lo pone a prueba y cierra con la revelación y la llamada («si no lo distinguiste…»). Selfie desde arriba al abrir y al cerrar.",
};

export const PLAN_SYSTEM = `Eres el director de una productora de videos verticales cortos (Reels y TikTok) con personajes creados con IA. Con UNA idea de la persona haces tú solo el trabajo de cuatro especialistas y devuelves SOLO un objeto JSON válido (sin texto alrededor):

1) ESTRATEGA: público, plataforma, el ángulo emocional, qué se ve en el segundo 0–3 para que nadie pase de largo, la novedad visual y un final que deje satisfecho. Sin escenas de relleno. Nunca prometas viralidad.
2) GUIONISTA: reparte el tiempo en escenas que se entiendan aunque el video esté en silencio. Si hay voz, escribe en español latino neutro, de tú, frases cortas y naturales, como habla una persona real.
3) ARQUITECTO DEL PERSONAJE: un personaje ADULTO (18 años o más) ficticio y original, con rasgos concretos y estables (forma de cara, ojos, pelo, piel con textura real, rasgos distintivos, cuerpo, gestos) y la ropa de base. Nunca una persona famosa ni real (salvo que la persona usuaria suba SU foto: entonces el personaje es ella y describes su ropa, gestos y estilo, no su cara).
4) DIRECTOR DE STORYBOARD: decide cada plano (encuadre, ángulo, lente de móvil), qué hace el personaje, la luz y cómo pasa a la siguiente escena. Varía los encuadres cuando la historia lo pide (primer plano, plano medio, plano entero, selfie con el brazo estirado, cenital, por encima del hombro, reflejo), nunca solo por variar. Cuida la continuidad: misma persona, ropa coherente, sitios que encajan.

Reglas visuales (método 6C): realismo de foto de iPhone, ópticas de móvil, grano ligero, piel con poros, pecas si encajan e imperfecciones pequeñas, tela con textura real, posturas y anatomía creíbles. La luz se adapta a la escena: flash directo del iPhone cuando es de noche o interior con estilo «dump» espontáneo; luz natural creíble de día (no fuerces el flash al aire libre con sol). Modo A = estética de influencer de Instagram, nivel modelo, se ve caro pero creíble y espontáneo. Modo B = creador cercano, UGC real, gestos naturales, sitios cotidianos. Modo C = animación (dibujo o 3D) con un estilo fijo para todo el video.

Prohibido: marcas o logos reales, famosos, menores como protagonista, contenido sexual, armas, promesas de dinero, salud o resultados, y testimonios inventados.

Los campos visuales (lugar, ropa, accion, plano, luz, movimiento, y los rasgos del personaje) van EN INGLÉS, muy concretos y dibujables. Los campos para la persona (titulo, brief, proposito, voz, transicion) van en español.

Formato exacto:
{"titulo":"…","modo":"A|B|C","estilo":"(solo modo C: estilo fijo en inglés; si no, \\"\\")",
 "brief":{"publico":"…","plataforma":"Reels/TikTok","angulo":"…","gancho":"qué pasa en 0–3 s","final":"…","novedad":"…"},
 "personaje":{"nombre":"…","edad":24,"genero":"woman|man","cara":"…","ojos":"…","pelo":"…","piel":"…","rasgos":"…","cuerpo":"…","gestos":"…","ropa_base":"…","anclas":["rasgos que NUNCA cambian"]},
 "escenas":[{"id":"S01","segundos":4,"proposito":"…","voz":"lo que se dice en esta escena o \\"\\"","lugar":"…","ropa":"…","accion":"…","plano":"…","luz":"…","movimiento":"subject motion / camera motion / environment motion","transicion":"cómo pasa a la siguiente"}]}`;

export function planPrompt(idea: string, o: Opciones): string {
  const [min, max] = escenasPara(o.duracion);
  const modo = o.modo && o.modo !== "auto" ? `Modo ${o.modo} (lo eligió la persona).` : "Elige tú el modo (A, B o C) que mejor sirva a la idea.";
  const voz = o.voz === "ninguna" ? "Sin voz: el video se entiende solo con imagen y sonido ambiente; deja \"voz\" vacío."
    : o.voz === "off" ? "Con voz en off: escribe en \"voz\" la frase de cada escena (la persona no mueve los labios)."
    : "Con diálogo a cámara: en \"voz\" va lo que el personaje dice mirando a cámara.";
  const cara = o.conCara ? "La persona subió SU foto: el personaje es esa persona. No describas su cara (sale de la foto); describe ropa, gestos y estilo." : "Personaje ficticio y original.";
  return `IDEA DE LA PERSONA: «${idea.trim().slice(0, 600)}»\n\nDuración total: ${o.duracion} s, entre ${min} y ${max} escenas de 3 a 8 s.\n${modo}\n${voz}\n${cara}\nPlantilla: ${PLANTILLA_GUIA[o.plantilla]}`;
}

// ───────────── validación y normalización ─────────────

const txt = (v: unknown, n = 400) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const tryParse = (s: string): unknown => {
  try { return JSON.parse(s); } catch { /* sigue */ }
  try { return JSON.parse(s.replace(/^```(?:json)?\s*|\s*```$/g, "").replace(/,\s*([}\]])/g, "$1")); } catch { return undefined; }
};

/** Reparte `total` segundos entre las escenas: 3–8 s cada una (si no caben, lo más cerca posible) y suma exacta. */
export function repartir(segs: number[], total: number): number[] {
  if (!segs.length) return [];
  const n = segs.length, lo = Math.min(3, Math.floor(total / n)), hi = Math.max(8, Math.ceil(total / n));
  const base = segs.map((s) => (Number.isFinite(s) && s > 0 ? s : 4));
  const k = total / base.reduce((a, b) => a + b, 0);
  const out = base.map((s) => Math.min(hi, Math.max(lo, Math.round(s * k))));
  let diff = total - out.reduce((a, b) => a + b, 0);
  for (let i = 0; diff !== 0 && i < 400; i++) {
    const j = i % n;
    if (diff > 0 && out[j] < hi) { out[j]++; diff--; } else if (diff < 0 && out[j] > lo) { out[j]--; diff++; }
  }
  return out;
}

/** Lee y valida la respuesta de la IA. Devuelve el plan limpio o un error en español. */
export function parsePlan(raw: string, o: Opciones): Plan | { error: string } {
  const j = tryParse(raw) as Record<string, unknown> | undefined;
  if (!j || typeof j !== "object") return { error: "La IA no devolvió un plan válido." };
  const p = (j.personaje ?? {}) as Record<string, unknown>;
  const lista = Array.isArray(j.escenas) ? (j.escenas as Record<string, unknown>[]) : [];
  const [min, max] = escenasPara(o.duracion);
  if (lista.length < min - 1) return { error: "El plan llegó con muy pocas escenas." };
  const usadas = lista.slice(0, max);
  const segs = repartir(usadas.map((e) => Number(e?.segundos)), o.duracion);
  const escenas: Escena[] = usadas.map((e, i) => ({
    id: `S${String(i + 1).padStart(2, "0")}`, segundos: segs[i],
    proposito: txt(e.proposito, 200), voz: o.voz === "ninguna" ? "" : txt(e.voz, 260),
    lugar: txt(e.lugar), ropa: txt(e.ropa) || txt(p.ropa_base), accion: txt(e.accion), plano: txt(e.plano),
    luz: txt(e.luz), movimiento: txt(e.movimiento), transicion: txt(e.transicion, 200),
  }));
  if (escenas.some((e) => !e.lugar || !e.accion || !e.plano)) return { error: "Faltan datos visuales en alguna escena." };
  const modo: Modo = o.modo && o.modo !== "auto" ? o.modo : isModo(j.modo) ? j.modo : "B";
  const b = (j.brief ?? {}) as Record<string, unknown>;
  const edad = Math.max(18, Math.min(80, Math.round(Number(p.edad) || 25)));
  return {
    titulo: txt(j.titulo, 90) || "Mi video", modo, estilo: modo === "C" ? txt(j.estilo, 300) || "classic hand-drawn cartoon look, thick ink outlines, painted backgrounds" : "",
    brief: { publico: txt(b.publico, 200), plataforma: txt(b.plataforma, 60) || "Reels/TikTok", angulo: txt(b.angulo, 200), gancho: txt(b.gancho, 200), final: txt(b.final, 200), novedad: txt(b.novedad, 200) },
    personaje: {
      nombre: txt(p.nombre, 40) || "Protagonista", edad, genero: txt(p.genero, 20) || "person",
      cara: txt(p.cara), ojos: txt(p.ojos, 120), pelo: txt(p.pelo, 160), piel: txt(p.piel, 160), rasgos: txt(p.rasgos, 200),
      cuerpo: txt(p.cuerpo, 160), gestos: txt(p.gestos, 160), ropa_base: txt(p.ropa_base, 200),
      anclas: (Array.isArray(p.anclas) ? p.anclas : []).map((a) => txt(a, 80)).filter(Boolean).slice(0, 6),
    },
    escenas,
  };
}

// ───────────── ingeniero 6C (determinista) ─────────────

/** Quita las palabras prohibidas y garantiza el final obligatorio. */
export function limpiarPrompt(s: string): string {
  const base = s.replace(PROHIBIDAS, "").replace(/\s+([,.])/g, "$1").replace(/\s{2,}/g, " ").trim().replace(/[.\s]*No text, no watermark, no distortion\.?\s*$/i, "");
  return `${base.replace(/[.\s]+$/, "")}. ${FINAL}`;
}

const quien = (p: Personaje, conCara: boolean) => conCara
  ? `the exact same person as the reference photo (keep the face, hairstyle and body identical), adult ${p.genero}`
  : `${p.nombre}, a ${p.edad}-year-old ${p.genero}: ${[p.cara, p.ojos, p.pelo, p.piel, p.rasgos, p.cuerpo].filter(Boolean).join(", ")}`;

const VIBE: Record<Modo, string> = {
  A: "Instagram influencer / model-level aesthetic, looks expensive but believable and candid",
  B: "relatable creator / real UGC vibe, natural everyday look, approachable",
  C: "",
};

/** Imagen canónica del personaje (agente 06): de frente, fondo liso, base de toda la continuidad. */
export function promptPersonaje(plan: Plan, conCara: boolean): string {
  const p = plan.personaje;
  if (plan.modo === "C") {
    return limpiarPrompt(`${plan.estilo}. Character model sheet of ${quien(p, conCara)}, wearing ${p.ropa_base}. Full body, front view, neutral relaxed pose, friendly expression. The whole background is a plain seamless light studio wall: do not copy any background, frame or other person from the reference photo. One single character, nothing else`);
  }
  return limpiarPrompt(`iPhone photo, full-body front view at eye level, natural smartphone lens. Soft even daylight from a window, slight grain. ${quien(p, conCara)}, ${p.gestos || "relaxed natural posture"}, looking at the camera with a calm natural expression. Wearing ${p.ropa_base}. Plain light-grey seamless wall behind, nothing else in frame: do not copy any background or other person from the reference photo. Realistic skin with visible pores, natural freckles where they fit and small imperfections, natural fabric texture, realistic proportions, correct hands with five fingers. ${VIBE[plan.modo]}`);
}

/** Prompt de una escena con los 6 bloques del método. */
export function prompt6C(plan: Plan, e: Escena, conCara: boolean): string {
  const p = plan.personaje;
  const anclas = p.anclas.length ? ` Keep these traits identical: ${p.anclas.join("; ")}.` : "";
  if (plan.modo === "C") {
    return limpiarPrompt(`${plan.estilo}. ${e.plano}. ${e.luz}. ${quien(p, conCara)}, ${e.accion}. Wearing ${e.ropa}. ${e.lugar}. Same character as the reference image: identical face, proportions, colors and outfit.${anclas} Correct anatomy, stable hands, clean composition, vertical 9:16`);
  }
  return limpiarPrompt([
    `iPhone photo, ${e.plano}`,                                  // C2 cámara
    e.luz,                                                        // C5 luz cinematográfica
    `${quien(p, conCara)}, ${e.accion}`,                          // C1 personaje
    `Wearing ${e.ropa}`,                                          // C3 ropa
    e.lugar,                                                      // C4 contexto
    `${VIBE[plan.modo]}, candid dump vibe, slight grain, natural smartphone optics`,
    `Same person as the reference image: identical face, hairstyle and body.${anclas} Realistic skin with visible pores and small natural imperfections, natural fabric texture, correct hands with five fingers, stable anatomy, physically plausible reflections, vertical 9:16`, // C6 anclas
  ].filter(Boolean).join(". "));
}

// ───────────── «cambiar solo…» ─────────────

export type Campo = "ropa" | "lugar" | "pose" | "luz" | "camara";
export const CAMPOS: Record<Campo, { clave: keyof Escena; etiqueta: string }> = {
  ropa: { clave: "ropa", etiqueta: "la ropa" },
  lugar: { clave: "lugar", etiqueta: "el sitio" },
  pose: { clave: "accion", etiqueta: "la pose" },
  luz: { clave: "luz", etiqueta: "la luz" },
  camara: { clave: "plano", etiqueta: "la cámara" },
};
export const isCampo = (v: unknown): v is Campo => typeof v === "string" && Object.prototype.hasOwnProperty.call(CAMPOS, v);

export const CAMBIO_SYSTEM = `Eres el director de fotografía de una productora. Te dan UNA escena (JSON) y el único aspecto que hay que cambiar. Devuelve SOLO {"valor":"…"}: la nueva descripción de ese aspecto, en inglés, concreta y dibujable, coherente con el resto de la escena y con el realismo de foto de iPhone (o con el estilo animado si la escena lo es). Si la persona no dice cómo, propón una alternativa claramente distinta y mejor. Prohibido: marcas o logos reales, famosos, contenido sexual, menores.`;

export function cambioPrompt(e: Escena, campo: Campo, deseo: string): string {
  const c = CAMPOS[campo];
  return `ESCENA: ${JSON.stringify(e)}\nCambiar SOLO ${c.etiqueta} (campo "${c.clave}", ahora: «${e[c.clave]}»).\nLo que pide la persona: «${deseo.trim().slice(0, 300) || "sorpréndeme"}»`;
}

/** Aplica el cambio congelando todo lo demás (devuelve una escena nueva). */
export function aplicarCambio(e: Escena, campo: Campo, raw: string): Escena | { error: string } {
  const j = tryParse(raw) as { valor?: unknown } | undefined;
  const valor = txt(j?.valor);
  if (!valor) return { error: "La IA no devolvió el cambio." };
  return { ...e, [CAMPOS[campo].clave]: valor };
}

/** Instrucción extra para rehacer la imagen con la anterior como referencia: solo cambia ese aspecto. */
export const soloCambia = (campo: Campo) =>
  ` Use the second reference image as the previous version of this exact scene: keep everything identical (person, face, composition, everything else) and change ONLY ${({ ropa: "the outfit", lugar: "the location and background", pose: "the pose and action", luz: "the lighting", camara: "the camera angle and framing" } as Record<Campo, string>)[campo]}.`;

// ───────────── dinero ─────────────
/** Acciones de credit_prices (precios aprobados por Jean el 02-nov-2026). */
export const ACCION_STORYBOARD = "ah_storyboard";
export const ACCION_CAMBIO = "ah_cambio";
/** Costo de la IA de texto (Gemini 3 Flash) a partir de los tokens: mismo cálculo que yt-reference. */
export const geminiUsd = (u: Record<string, unknown>) =>
  (Number(u.promptTokenCount ?? 0) * 1 + Number(u.candidatesTokenCount ?? 0) * 3.75 + Number(u.thoughtsTokenCount ?? 0) * 3.75) / 1e6;
/** Costo publicado por imagen en APIMart (real_cost medido en credit_prices). */
export const IMAGEN_USD: Record<"gpt-image-2" | "nano-banana-pro", number> = { "gpt-image-2": 0.0115, "nano-banana-pro": 0.0285 };
/** Reintentos gratis por escena dentro del storyboard ya cobrado (bounded retries del método). */
export const MAX_INTENTOS = 2;
