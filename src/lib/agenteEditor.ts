// El agente editor (30-oct-2026, Jean: «la persona puede hablar con el agente editor y en texto pedirle lo que quiere
// y la app lo debe entender y, dentro de las posibilidades, hacerlo»). Entiende el pedido en español sin IA (gratis y
// al instante) y lo convierte en acciones que «Sube tu video» sabe hacer. Lo que no puede, lo dice y ofrece lo que sí.
import type { StyleId } from "@/lib/subtitleStyles";

export type ModoEditar = "simple" | "broll" | "plantilla";
export type Accion =
  | { tipo: "seccion"; v: "subtitulos" | "editar" }
  | { tipo: "modo"; v: ModoEditar }
  | { tipo: "silencios"; on: boolean }
  | { tipo: "subtitulos" }
  | { tipo: "estilo"; v: StyleId }
  | { tipo: "broll" }
  | { tipo: "portada"; titulo: string; acento: string }
  | { tipo: "portadaOff" }
  | { tipo: "cierre"; palabra: string }
  | { tipo: "titulo"; texto: string }
  | { tipo: "voz"; on: boolean }
  | { tipo: "zoom"; on: boolean }
  | { tipo: "guardar" };

export const PUEDO = "Puedo quitar silencios, poner subtítulos (Impacto, Conversación, Minimal, Una palabra, Palabra en color, Clásico o En caja), "
  + "poner B-roll con IA, usar la plantilla Reel dinámico, poner portada, título arriba, cierre «Comenta PALABRA», acercamientos y voz grave, y guardarlo.";

const norm = (s: string) => s.toLocaleLowerCase("es").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

const ESTILOS: [RegExp, StyleId, string][] = [
  [/\bimpacto\b/, "impacto", "Impacto"],
  [/conversacion/, "conversacion", "Conversación"],
  [/\bminimal/, "minimal", "Minimal"],
  [/una palabra|\bbrillo/, "brillo", "Una palabra"],
  [/palabra en color|resaltad|en color/, "resaltado", "Palabra en color"],
  [/clasico/, "clasico", "Clásico"],
  [/\bcaja\b/, "caja", "En caja"],
];

/** Lo que va entre comillas o después de «que diga» / «:» en el texto original (con sus tildes y mayúsculas). */
function textoTras(orig: string, clave: RegExp): string {
  const m = new RegExp(`${clave.source}\\s*(?:que diga|con el texto|con|:)?\\s*[«"“']([^»"”']{1,70})[»"”']`, "iu").exec(orig)
    ?? new RegExp(`${clave.source}\\s*(?:que diga|:)\\s*([^.,;\\n]{1,70})`, "iu").exec(orig);
  return m ? m[1].trim() : "";
}

/** Entiende el pedido. Devuelve las acciones en orden y lo que el editor contesta. */
export function entender(texto: string): { acciones: Accion[]; respuesta: string } {
  const t = norm(texto);
  const a: Accion[] = [];
  const dice: string[] = [];
  const no = (x: string) => new RegExp(`(\\bsin|\\bno (?:le )?(?:pongas|quiero|metas)|quita(?:r|le)? (?:el |la |los |las )?|apaga(?:r)? (?:el |la |los |las )?)\\s*${x}`).test(t);

  if (/silencio|pausa/.test(t)) {
    const dejar = /(no (?:le )?quites|deja(?:r)?|manten(?:er)?|con) (?:los |las )?(silencio|pausa)/.test(t);
    a.push({ tipo: "silencios", on: !dejar });
    dice.push(dejar ? "dejo las pausas como están" : "quito los silencios");
  }
  if (/plantilla|reel dinamico|\bdinamico/.test(t)) { a.push({ tipo: "modo", v: "plantilla" }); dice.push("uso la plantilla Reel dinámico"); }
  else if (/b-?roll|imagenes de apoyo|imagenes con ia|tomas de apoyo/.test(t) && !no("b-?roll")) { a.push({ tipo: "modo", v: "broll" }, { tipo: "broll" }); dice.push("pongo B-roll con IA"); }
  else if (/edicion simple|\bsimple\b/.test(t)) { a.push({ tipo: "modo", v: "simple" }); dice.push("hago una edición simple"); }

  const estilo = ESTILOS.find(([re]) => re.test(t));
  if (/subtitul|letras|texto en pantalla/.test(t) && !no("(?:los )?subtitul")) { a.push({ tipo: "subtitulos" }); dice.push("hago los subtítulos"); }
  if (estilo) { a.push({ tipo: "estilo", v: estilo[1] }); dice.push(`estilo ${estilo[2]}`); }

  if (/portada/.test(t)) {
    if (no("(?:la )?portada")) { a.push({ tipo: "portadaOff" }); dice.push("sin portada"); }
    else {
      const titulo = textoTras(texto, /portada/);
      a.push({ tipo: "portada", titulo: titulo.toLocaleUpperCase("es").slice(0, 28), acento: "" });
      dice.push(titulo ? `portada «${titulo}»` : "pongo portada");
    }
  }
  const cierre = /coment[ae]n?\s+(?:la palabra\s+)?[«"“']?([\p{L}\p{N}]{2,20})/iu.exec(texto);
  if (cierre) { const p = norm(cierre[1]).toUpperCase(); a.push({ tipo: "cierre", palabra: p }); dice.push(`cierre «Comenta ${p}»`); }
  if (/titulo/.test(t)) {
    const tit = textoTras(texto, /t[ií]tulo(?: arriba)?/);
    if (tit) { a.push({ tipo: "titulo", texto: tit.slice(0, 70) }); dice.push(`título arriba «${tit}»`); }
  }
  if (/voz (?:mas )?grave|voz de locutor/.test(t)) {
    const off = no("(?:la )?voz") || /voz normal/.test(t);
    a.push({ tipo: "voz", on: !off }); dice.push(off ? "voz normal" : "voz grave");
  } else if (/voz normal/.test(t)) { a.push({ tipo: "voz", on: false }); dice.push("voz normal"); }
  if (/zoom|acercamiento/.test(t)) {
    const off = no("(?:los |el )?(?:zoom|acercamiento)");
    a.push({ tipo: "zoom", on: !off }); dice.push(off ? "sin acercamientos" : "con acercamientos");
  }
  if (/\b(guardalo|guarda|descargalo|descarga|exporta|terminalo|listo)\b/.test(t)) { a.push({ tipo: "guardar" }); dice.push("lo guardo"); }

  if (!a.length) {
    return { acciones: [], respuesta: `No entendí qué cambiar. ${PUEDO} Por ejemplo: «quita los silencios y pon subtítulos estilo Impacto con B-roll».` };
  }
  const sec = a.some(x => x.tipo === "modo" || x.tipo === "silencios" || x.tipo === "zoom" || x.tipo === "broll") ? "editar" : "subtitulos";
  return { acciones: [{ tipo: "seccion", v: sec }, ...a], respuesta: `Hecho: ${dice.join(", ")}.` };
}
