// SUPERNOVA — nombres de las voces en español (06-nov-2026, Jean: «ponle los nombres de las voces en español»).
// ElevenLabs las nombra en inglés («Sarah - Mature, Reassuring, Confident»). La persona ve «Sarah · madura y segura».
// Las de la biblioteca (las que ven los clientes) llevan una frase hecha a mano; cualquier otra se traduce palabra por
// palabra con el diccionario y, si no se entiende, queda solo el nombre. Sin dependencias de Deno (lo usan las pruebas).

const BIBLIOTECA: Record<string, string> = {
  roger: "relajado y cercano",
  sarah: "madura y segura",
  laura: "entusiasta y divertida",
  charlie: "grave y con energía",
  george: "cálido, cuenta historias",
  callum: "ronco y pícaro",
  river: "tranquila y neutral",
  harry: "intenso y fuerte",
  liam: "con energía, de redes",
  alice: "clara, de profesora",
  matilda: "experta y profesional",
  will: "relajado y optimista",
  jessica: "alegre y cálida",
  eric: "suave y confiable",
  bella: "profesional y cálida",
  chris: "cercano y con encanto",
  brian: "grave y reconfortante",
  daniel: "de locutor de radio",
  lily: "suave, de actriz",
  adam: "firme y con autoridad",
  bill: "sabio y sereno",
};

const PALABRAS: Record<string, string> = {
  "laid-back": "relajado", relaxed: "relajado", casual: "cercano", resonant: "sonoro", mature: "maduro", reassuring: "tranquilizador",
  confident: "seguro", enthusiast: "entusiasta", quirky: "divertido", deep: "grave", energetic: "con energía", warm: "cálido",
  captivating: "atrapante", storyteller: "cuenta historias", husky: "ronco", neutral: "neutral", informative: "informativo",
  fierce: "intenso", clear: "claro", engaging: "atrapante", educator: "de profesor", knowledgable: "experto", knowledgeable: "experto",
  professional: "profesional", optimist: "optimista", playful: "alegre", bright: "brillante", smooth: "suave", trustworthy: "confiable",
  charming: "con encanto", "down-to-earth": "cercano", comforting: "reconfortante", steady: "estable", broadcaster: "de locutor",
  velvety: "suave", wise: "sabio", balanced: "sereno", firm: "firme", dominant: "con autoridad", fresh: "fresco", rich: "rico",
  natural: "natural", loving: "cariñoso", calm: "tranquilo", friendly: "amable", soft: "suave", strong: "fuerte", young: "joven",
  old: "mayor", narration: "narración", narrator: "narrador", conversational: "conversacional", conversations: "conversación",
  "social media": "de redes", ads: "de anuncios", podcast: "de pódcast", potcast: "de pódcast", faceless: "sin rostro",
};

const limpio = (t: string) => t.toLowerCase().replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim();

/** «Sarah - Mature, Reassuring, Confident» → «Sarah · madura y segura». */
export function nombreVozEs(original: string, deBiblioteca = true): string {
  const raw = String(original ?? "").trim() || "Voz";
  const [nombre, ...resto] = raw.split(/\s+-\s+/);
  const base = nombre.trim().slice(0, 40) || "Voz";
  if (deBiblioteca) {
    const fija = BIBLIOTECA[limpio(base)];
    if (fija) return `${base} · ${fija}`;
  }
  const desc = resto.join(" ");
  if (!desc) return base;
  // Primero las frases de dos palabras («social media»), luego palabra por palabra; lo que no se entiende se omite.
  let t = ` ${limpio(desc.replace(/&|\band\b/gi, " "))} `;
  const encontrados: { i: number; es: string }[] = [];
  for (const [en, es] of Object.entries(PALABRAS).sort((a, b) => b[0].length - a[0].length)) {
    const re = new RegExp(`(^|\\s)${en.replace(/-/g, "\\-")}(?=\\s|$)`);
    const m = re.exec(t);
    if (m) { encontrados.push({ i: m.index, es }); t = t.slice(0, m.index) + " ".repeat(m[0].length) + t.slice(m.index + m[0].length); }
  }
  const hallados = [...new Set(encontrados.sort((a, b) => a.i - b.i).map(x => x.es))];
  if (!hallados.length) return base;
  const ult = hallados.slice(0, 3);
  return `${base} · ${ult.length > 1 ? `${ult.slice(0, -1).join(", ")} y ${ult[ult.length - 1]}` : ult[0]}`;
}
