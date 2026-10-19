// La misma medición para el servidor y lo que la persona lee en el teleprompter.
export const MIRROR_MIN = 90;
export const MIRROR_TARGET = 95;

type Script = {
  guion: { dices: string; original_texto?: string }[];
  ganchos: string[];
  cierre: string;
};

export function splitPhrases(t: string): string[] {
  return (t.match(/[^.!?¡¿]*[¡¿]?[^.!?]*[.!?]+|[^.!?]+$/g) ?? [])
    .map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean);
}

export function spokenLines(v: Script, hook = 0): string[] {
  const lines = v.guion.flatMap(t => splitPhrases(t.dices)).filter(l => /[\p{L}\p{N}]/u.test(l));
  const g = v.ganchos[hook]?.trim();
  if (g) { if (lines.length) lines[0] = g; else lines.push(g); }
  const plain = (t: string) => t.toLowerCase().normalize("NFD").replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
  const cierre = plain(v.cierre);
  if (cierre && !lines.some(l => plain(l).includes(cierre))) lines.push(...splitPhrases(v.cierre));
  return lines;
}

const words = (t: string) => t.toLowerCase().normalize("NFC").match(/[\p{L}\p{N}]+/gu) ?? [];

/** Distancia de edición por palabras: también penaliza añadidos, borrados y cambios de orden. */
export function textFidelity(original: string, candidate: string) {
  const a = words(original), b = words(candidate);
  if (!a.length) return null;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  const total = Math.max(a.length, b.length), changes = row[b.length];
  const kept = total - changes;
  return {
    // No redondear hacia arriba ni usar el número de pantalla para decidir la aceptación.
    percent: Math.floor(kept * 1000 / total) / 10,
    passes: kept * 100 >= MIRROR_MIN * total,
    onTarget: kept * 100 >= MIRROR_TARGET * total,
    changes,
    total,
  };
}

export function scriptFidelity(v: Script, hook = 0) {
  // Una referencia parcial no permite afirmar el parecido de todo el guion.
  if (v.guion.some(t => typeof t.original_texto !== "string")) return null;
  return textFidelity(v.guion.map(t => t.original_texto).join(" "), spokenLines(v, hook).join(" "));
}
