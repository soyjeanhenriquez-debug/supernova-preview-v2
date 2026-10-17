// SUPERNOVA — Reel → Carrusel (17-oct-2026, plan aprobado por Jean). "Capa C" del Analizador de Reels:
// convierte el análisis base de un Reel (capa A, ya guardado en reel_extractions.base) en un carrusel,
// sin volver a mirar el video. Responde con la MISMA forma que carousel-clone, para que el estudio de
// Carrusel lo abra igual (parseClone): analisis + adn + mantener + mejoras + necesitas + carrusel.
//  · El "analisis" no lo escribe la IA: sale del análisis base (cada tramo del Reel = una lámina de
//    referencia), así no se paga dos veces lo mismo.
//  · Modo "tema": el espejo del Reel en láminas (mismo gancho, mismas ideas, mismo orden y remate).
//    Modo "producto": su ADN (3 partes) con el producto de la persona.
//  · Si el Reel no se presta (sketch, POV, emoción sin algo que enseñar), igual se hace, en formato de
//    historia o frase, y se avisa con convertible = "bajo".
// Sin cliente de Supabase: solo texto y funciones puras (se prueban con reelCarousel_test.ts).
import { SIRVE_RULE, SYSTEM, TIPOS, TIPOS_LAMINA } from "./carouselRules.ts";
import { type Base, palabraClave, tramoTexts } from "./reelLayers.ts";

export type CarouselMode = "tema" | "producto";
export const asCarouselMode = (v: unknown): CarouselMode => (v === "producto" ? "producto" : "tema");
export type Convertible = "alto" | "medio" | "bajo";

export interface BriefC {
  product: string; who: string; promise: string; price: string;
  goal: "vender" | "ensenar"; handle: string; world: string; line: string;
}

const s = (v: unknown, n: number) => (typeof v === "string" ? v : "").replace(/\s+/g, " ").trim().slice(0, n);
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});

/** Cuántas láminas después de la portada: una por idea del Reel, entre 4 y 9. */
export function slidesFor(b: Base): number {
  const ideas = b.estructura.filter(t => t.funcion !== "gancho").length;
  return Math.min(9, Math.max(4, ideas));
}

export function promptC(b: Base, mode: CarouselMode, brief: BriefC): string {
  const n = slidesFor(b);
  const dice = tramoTexts(b);
  const tramos = b.estructura.map((t, i) => `${i + 1}. ${t.inicio}–${t.fin} s · ${t.funcion}${t.etiqueta ? ` (${t.etiqueta})` : ""}: ${t.que_pasa}${t.se_ve ? ` | Se ve: ${t.se_ve}` : ""}${dice[i] ? ` | Dice: «${dice[i]}»` : ""}`).join("\n");
  const palabra = b.cta.palabra || "GUIA";
  return [
    SYSTEM,
    "",
    "Hoy no tienes un carrusel: tienes el ANÁLISIS de un Reel de Instagram que ya funciona (no tienes el video). Vas a convertir ese Reel en un carrusel de Instagram que funcione igual de bien en láminas.",
    "",
    "ANÁLISIS DEL REEL:",
    `Idioma: ${b.idioma}. Duración: ${b.duracion_s ?? "?"} s.`,
    `Resumen: ${b.resumen}`,
    `Gancho (0–3 s): dice «${b.gancho.se_dice}»; texto en pantalla «${b.gancho.texto_pantalla}»; se ve: ${b.gancho.se_ve}. Por qué detiene: ${b.gancho.por_que}`,
    `Fórmula del gancho: ${b.formula_gancho}`,
    `Mecanismo: ${b.mecanismo}`,
    `Por qué funciona: ${b.claves.join(" · ")}`,
    `CTA: ${b.cta.tipo}${b.cta.palabra ? ` (palabra ${b.cta.palabra})` : ""}`,
    "Tramos (cada número es una lámina de referencia):", tramos,
    `Lo que debe mejorar: ${b.debilidades.join(" · ")}`,
    "",
    "CÓMO SE PASA DE REEL A CARRUSEL:",
    "- El gancho del Reel es la portada. Cada idea, paso, ejemplo o punto de la lista del Reel es una lámina, en el mismo orden. Si el Reel es una lista ('7 números', '5 proyectos'), cada punto va en su lámina o en tarjetas, sin saltar ninguno. Si compara dos cosas, usa comparacion. Si enseña pasos, usa pasos.",
    "- Lo que en el video se ve (una pantalla, un gesto, un antes/después) se vuelve la 'escena' de la lámina, recreada con personas latinas comunes y sin marcas (nunca su cara ni sus fotos).",
    "- El llamado del Reel (comentar una palabra, guardar, seguir) es el remate del carrusel, con la misma mecánica.",
    "- 'convertible': alto si el Reel es lista, pasos, comparación o tutorial; medio si es una historia con una lección clara; bajo si es un sketch, un POV o pura emoción sin algo que enseñar. Si es bajo, igual hazlo en formato de historia o de frase que conserve el mecanismo, y explica en 'por_que' por qué se presta poco.",
    "",
    mode === "tema"
      ? [
        `TU VERSIÓN · ESPEJO EN LÁMINAS. ${n + 1} láminas que son el espejo del Reel: el MISMO tema, el MISMO gancho, las MISMAS ideas en el MISMO orden y el MISMO remate. No reinventes nada.`,
        "PORTADAS: la portada 1 es el gancho del Reel. Si está en otro idioma, transcréalo fiel al español latino (misma promesa, mismo remate). Si ya está en español, conserva su estructura y casi sus mismas palabras con un toque propio, nunca idéntico. Las portadas 2 y 3 son variantes del MISMO gancho. 'recomendada' = 0. El producto de la persona NUNCA va en la portada.",
        "TEXTO: si el Reel está en español, en cada lámina conserva unas 9 de cada 10 palabras de lo que dice ese tramo, con un toque propio (un sinónimo, un orden mejor), adaptado a frases cortas de lámina. Si está en otro idioma, transcrea cada idea con el mismo remate. Nunca copies y pegues ni traduzcas palabra por palabra.",
        "El producto de la persona NO cambia el tema: como mucho aparece en una línea del remate si encaja.",
      ].join("\n")
      : [
        `TU VERSIÓN · SU ADN EN TU PRODUCTO. Primero descompón el Reel en 9 partes (id a1 a a9) y marca con importa=true las 3 que más explican por qué funcionó (van en 'mantener'). Después escribe un carrusel NUEVO de ${n + 1} láminas para el producto de la persona que mantiene esas 3 partes y cambia todo lo demás. Debe ser mejor que el original.`,
        "PORTADAS: 3 distintas (titulo 3 a 5 palabras, subtitulo ≤12, pastilla en MAYÚSCULAS, por_que = qué desea quien la lee). 'escena' de portada = metáfora visual del deseo.",
        brief.goal === "ensenar" ? "Objetivo: enseñar algo útil del tema del producto para que lo guarden y lo compartan." : "Objetivo: que quieran el producto; el remate conecta la creencia nueva con escribir una palabra clave.",
      ].join("\n"),
    "ADN: en los dos modos, 'adn' trae las 9 partes del Reel (solo patrones, nunca contenido literal) y 'mantener' EXACTAMENTE las 3 más importantes.",
    "MEJORAS: 3 cosas concretas que hiciste mejor al pasarlo a láminas (legibilidad, orden, una lámina que engancha la siguiente).",
    "NECESITAS: en frases cortas, lo que la persona debe tener: 1) una foto suya si las escenas la usan; 2) capturas propias si el Reel muestra una pantalla; 3) si el remate promete un regalo, 'Prepara <ese regalo> para mandarlo por mensaje a quien comente <PALABRA>'.",
    SIRVE_RULE,
    "",
    TIPOS_LAMINA,
    "'objeto' = un objeto de la historia que invade el primer plano de la portada en perspectiva 3D (mano, teléfono, libreta…). 'plantilla' = hero (agresiva, frases fuertes), editorial (crema y negro, marca personal premium) o cinematica (historias, con aire).",
    "'revelar' = lista oculta de 3 a 6 elementos solo si la respuesta es una lista; si no, vacío.",
    "",
    "LA PERSONA:",
    brief.product ? `PRODUCTO: ${brief.product}.` : "Sin producto: el remate invita a guardar o a comentar la palabra.",
    brief.who ? `PÚBLICO: ${brief.who}.` : "",
    brief.promise ? `LO QUE LOGRA: ${brief.promise}.` : "",
    brief.price ? `PRECIO REAL: ${brief.price}.` : "",
    brief.handle ? `CUENTA: @${brief.handle}.` : "",
    brief.line ? `FRASE DE LA MARCA (úsala tal cual en el remate): «${brief.line}».` : "",
    brief.world ? `MUNDO DE LA MARCA (todas las escenas ocurren aquí): ${brief.world}.` : "",
    `Palabra clave del remate: ${palabra} (o una equivalente del tema, en MAYÚSCULAS).`,
    "Nunca uses el nombre, la cara, la marca ni los números del Reel original como si fueran de la persona. No inventes resultados ni testimonios.",
    "",
    "RESPONDE SOLO con JSON válido con esta forma:",
    `{"convertible":{"nivel":"alto","por_que":""},"adn":[{"id":"a1","parte":"","que_es":"","importa":false,"por_que":""}],"mantener":["a1","a2","a3"],"mejoras":["","",""],"necesitas":[],"carrusel":{"idea":"","portadas":[{"titulo":"","subtitulo":"","pastilla":"","por_que":""}],"recomendada":0,"revelar":[],"etiquetas":["","",""],"escena":"","objeto":"","plantilla":"editorial","laminas":[{"tipo":"respuesta","peso":"","etiqueta":"","titulo":"","texto":"","items":[],"veredicto":"","puente":"","palabra":"","pastilla":"","escena":"","original":2}],"pie":""}}`,
    `"carrusel.laminas" trae ${n} elementos (la portada va aparte); la última es de tipo llamada. 'original' = el número del tramo del Reel que esa lámina convierte (1 a ${b.estructura.length}), o 0 si ninguno.`,
  ].filter(Boolean).join("\n");
}

/** Las láminas de referencia del Reel (lo que el estudio muestra como "el original"). */
export function reelAnalisis(b: Base) {
  return {
    resumen: b.resumen.slice(0, 240),
    gancho_original: (b.gancho.texto_pantalla || b.gancho.se_dice).slice(0, 160),
    por_que_funciona: [b.mecanismo, ...b.claves].filter(Boolean).join(" ").slice(0, 500),
    laminas: b.estructura.slice(0, 10).map((t, i) => ({
      n: i + 1, posicion: t.funcion.slice(0, 30), composicion: t.se_ve.slice(0, 200), artefacto: t.etiqueta.slice(0, 120), idea: t.que_pasa.slice(0, 200),
    })),
    estilo: { colores: [] as string[], letra: "", estilo_cercano: "poster", empieza: "oscuro", fotos: "" },
  };
}

/**
 * Deja la respuesta de la IA con la forma de carousel-clone (lo que diga la IA no se confía).
 * null si no trae un carrusel usable (al menos 1 portada y 3 láminas).
 */
export function cleanReelCarousel(v: unknown, b: Base) {
  const o = obj(v);
  const car = obj(o.carrusel);
  const portadas = arr(car.portadas).map(obj).filter(p => s(p.titulo, 120)).slice(0, 3);
  const tramos = b.estructura.length;
  const laminas = arr(car.laminas).map(obj).filter(l => s(l.titulo, 200) || s(l.texto, 400) || arr(l.items).length).slice(0, 9).map(l => {
    const k = Math.round(Number(l.original));
    const tipo = s(l.tipo, 20);
    const out: Record<string, unknown> = { ...l, tipo: TIPOS.includes(tipo) ? tipo : "tarjetas", original: Number.isFinite(k) && k >= 1 && k <= tramos ? k : 0 };
    return out;
  });
  if (!portadas.length || laminas.length < 3) return null;
  const last = laminas[laminas.length - 1];
  last.tipo = "llamada";
  const palabra = palabraClave(last.palabra) || b.cta.palabra || "GUIA";
  last.palabra = palabra;
  const adn = arr(o.adn).map(obj).filter(d => s(d.parte, 80)).slice(0, 12);
  const ids = new Set(adn.map(d => s(d.id, 8)));
  const conv = obj(o.convertible);
  const nivel = s(conv.nivel, 10).toLowerCase();
  return {
    convertible: { nivel: (["alto", "medio", "bajo"].includes(nivel) ? nivel : "medio") as Convertible, por_que: s(conv.por_que, 300) },
    analisis: reelAnalisis(b),
    adn,
    mantener: arr(o.mantener).map(x => s(x, 8)).filter(id => ids.has(id)).slice(0, 3),
    mejoras: arr(o.mejoras).map(x => s(x, 200)).filter(Boolean).slice(0, 5),
    necesitas: arr(o.necesitas).map(x => s(x, 220)).filter(Boolean).slice(0, 4),
    carrusel: { ...car, portadas, laminas, recomendada: Number(car.recomendada) >= 0 && Number(car.recomendada) < portadas.length ? Number(car.recomendada) : 0 },
  };
}
