// SUPERNOVA — Ayudas puras de motion-graphics (sin Deno ni red): se prueban con vitest desde
// src/components/video/motionPlanText.test.ts.
//
// Misión R2-05 (12-oct-2026):
// 1) La IA devolvía JSON roto con finish_reason=stop (logs del 11-oct: 2.847, 2.864 y 4.696 caracteres)
//    y la persona veía un 502. Causas típicas: comillas sin escapar dentro de un texto ("dice "hola""),
//    saltos de línea crudos dentro de un texto, comas sobrantes antes de } o ], o el JSON cortado.
//    parseLooseJson lo intenta tal cual y, si falla, lo repara.
// 2) La narración que escribe la IA dura el doble que su escena (18–22 palabras para 4 s), así que con
//    voz el video de 30 s salía de ~55 s. fitNarration la recorta en el servidor a ~2,5 palabras por
//    segundo, cortando en la última frase o coma que cabe y sin dejar una preposición colgando.

/** Palabras que caben en una escena de `seconds` segundos (voz natural en español ≈ 2,5 por segundo). */
export function wordsFor(seconds: number): number {
  return Math.max(4, Math.floor(seconds * 2.5));
}

// Palabras que no pueden cerrar una frase ("…aprende a", "…programa de").
const DANGLING = new Set([
  "a", "al", "de", "del", "en", "y", "e", "o", "u", "con", "para", "por", "sin", "que", "el", "la", "los", "las",
  "un", "una", "unos", "unas", "tu", "tus", "su", "sus", "mi", "mis", "lo", "le", "se", "como", "más", "muy", "pero", "si",
]);

/** Recorta la narración para que dure lo que su escena. Si ya cabe, la deja igual. */
export function fitNarration(text: string, seconds: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return t;
  const max = wordsFor(seconds);
  const words = t.split(" ");
  if (words.length <= max) return t;
  // 1) Corte natural (fin de frase o coma) entre la mitad y +25 % del máximo: se prefiere el más largo.
  //    Prueba real del 12-oct: cortar justo en el máximo dejaba "…no sabes por dónde." o "…de 28.".
  const hi = Math.min(words.length, Math.round(max * 1.25)), lo = Math.ceil(max / 2);
  for (let n = hi; n >= lo; n--) {
    const w = words[n - 1];
    if (/[.!?…]$/.test(w)) return words.slice(0, n).join(" ");
    if (/[,;:]$/.test(w)) return closeUp(words.slice(0, n).join(" ").replace(/[,;:]$/, ""));
  }
  let out = words.slice(0, max).join(" ");
  // 2) "…para mujeres que están." → "…para mujeres.": una subordinada a medias no se dice.
  const tail = out.split(" ");
  const q = tail.slice(-3).findIndex(x => x.toLowerCase() === "que");
  if (q >= 0 && tail.length - 3 + q >= lo) out = tail.slice(0, tail.length - 3 + q).join(" ");
  // 3) Sin preposiciones ni artículos colgando al final.
  return closeUp(out);
}

function closeUp(text: string): string {
  const ws = text.split(" ");
  while (ws.length > 2 && (DANGLING.has(ws[ws.length - 1].toLowerCase().replace(/[^\p{L}]/gu, ""))
    || (/^\d+$/.test(ws[ws.length - 1]) && DANGLING.has(ws[ws.length - 2].toLowerCase())))) ws.pop();
  const out = ws.join(" ").replace(/[,;:¿¡]+$/, "");
  // Si abrió una pregunta, se cierra.
  const q = out.lastIndexOf("¿") > out.lastIndexOf("?");
  return `${out}${q ? "?" : "."}`;
}

/**
 * Repara un JSON "casi bien" escrito por una IA: comillas sin escapar dentro de textos, saltos de línea
 * crudos, comas sobrantes y cierre faltante si llegó cortado. No inventa contenido: si un texto quedó
 * a medias, se cierra ahí.
 */
export function repairJson(src: string): string {
  const s = src;
  let out = "";
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  const nextSignificant = (from: number) => {
    for (let j = from; j < s.length; j++) if (!/\s/.test(s[j])) return s[j];
    return "";
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) { out += c; esc = false; continue; }
      if (c === "\\") { out += c; esc = true; continue; }
      if (c === "\n") { out += "\\n"; continue; }
      if (c === "\r" || c === "\t") { out += " "; continue; }
      if (c === '"') {
        // ¿Cierra el texto o es una comilla suelta dentro de él? Cierra si lo que sigue es , } ] : o el fin.
        const n = nextSignificant(i + 1);
        if (n === "" || n === "," || n === "}" || n === "]" || n === ":") { out += c; inStr = false; }
        else out += '\\"';
        continue;
      }
      out += c;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "{" || c === "[") { stack.push(c === "{" ? "}" : "]"); out += c; continue; }
    if (c === "}" || c === "]") {
      out = out.replace(/,\s*$/, ""); // coma sobrante antes de cerrar
      if (stack.length) stack.pop();
      out += c;
      continue;
    }
    out += c;
  }
  if (inStr) { if (esc) out = out.slice(0, -1); out += '"'; }
  // Cortado a medias: se quita lo que no terminó (una clave sin valor, una coma o dos puntos al final).
  out = out.replace(/([{,])\s*"(?:[^"\\]|\\.)*"\s*:\s*$/, "$1"); // clave con dos puntos y sin valor
  if (stack[stack.length - 1] === "}") out = out.replace(/([{,])\s*"(?:[^"\\]|\\.)*"\s*$/, "$1"); // en un objeto: clave sola
  out = out.replace(/[,:]\s*$/, "");
  while (stack.length) { out = out.replace(/,\s*$/, ""); out += stack.pop(); }
  return out;
}

/** Intenta leer el JSON de la IA: tal cual, luego el objeto entre la primera { y la última }, luego reparado. */
export function parseLooseJson(raw: string): Record<string, unknown> | null {
  const text = raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "").trim();
  const asObject = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null);
  const tryParse = (t: string) => { try { return asObject(JSON.parse(t)); } catch { return null; } };
  const a = text.indexOf("{");
  if (a < 0) return null;
  const z = text.lastIndexOf("}");
  return tryParse(text)
    ?? (z > a ? tryParse(text.slice(a, z + 1)) : null)
    ?? tryParse(repairJson(text.slice(a))) // cortado: se cierra todo lo que quedó abierto
    ?? (z > a ? tryParse(repairJson(text.slice(a, z + 1))) : null); // con texto suelto después del JSON
}
