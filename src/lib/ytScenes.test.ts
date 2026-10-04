import { describe, expect, it } from "vitest";
import {
  buildDescription, chapters, checkLimits, estimateCost, MAX_NARRATION, parseScenes, pickAnimated, scriptMeta,
  splitText, subtitleChunks, suggestVoice, tagsFrom, timecode,
} from "./ytScenes";

const scene = (n: number, narr = `Esta es la narración de la escena ${n}. Tiene una idea clara y corta.`) =>
  `ESCENA ${n} — [Plano medio de una persona caminando por un mercado, escena ${n}]\nNarración: ${narr}\n`;

const script12 = Array.from({ length: 12 }, (_, i) => scene(i + 1)).join("\n") + "\nTÍTULO: 12 cosas que nadie te dijo\nMINIATURA: Nadie te lo dijo";

describe("parseScenes", () => {
  it("lee 12 escenas con su narración y visual", () => {
    const s = parseScenes(script12);
    expect(s).toHaveLength(12);
    s.forEach((x, i) => {
      expect(x.n).toBe(String(i + 1));
      expect(x.narration.length).toBeGreaterThan(10);
      expect(x.visual).toContain("Plano medio");
      expect(x.visual.startsWith("[")).toBe(false);
    });
  });

  it("no mete el TÍTULO ni la MINIATURA en la última escena", () => {
    const s = parseScenes(script12);
    expect(s[11].narration).not.toMatch(/TÍTULO|MINIATURA/);
  });

  it("divide una narración de 1.500 caracteres en 3 o más sub-escenas", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Esta es la frase número ${i + 1} de la escena larga.`).join(" ");
    expect(long.length).toBeGreaterThanOrEqual(1500);
    const s = parseScenes(scene(1, long.slice(0, 1500)) + scene(2));
    const parts = s.filter(x => x.n.startsWith("1."));
    expect(parts.length).toBeGreaterThanOrEqual(3);
    parts.forEach(p => expect(p.narration.length).toBeLessThanOrEqual(MAX_NARRATION));
    expect(parts.map(p => p.narration).join(" ").replace(/\s+/g, " ")).toBe(long.slice(0, 1500).trim());
    expect(s[s.length - 1].n).toBe("2");
  });

  it("acepta negritas, guion corto, narración en la línea siguiente y traducciones", () => {
    const s = parseScenes(`**ESCENA 1 – [Un faro de noche]**\n**Narración:**\nEl faro llevaba cien años apagado.\nNadie sabía por qué.\n\nSCENE 2: [A lighthouse at dawn]\nNarration: Then one night, it lit up.\n\nCENA 3 — [Um farol]\nNarração: E todos viram.`);
    expect(s).toHaveLength(3);
    expect(s[0].visual).toBe("Un faro de noche");
    expect(s[0].narration).toBe("El faro llevaba cien años apagado. Nadie sabía por qué.");
    expect(s[1].narration).toBe("Then one night, it lit up.");
    expect(s[2].narration).toBe("E todos viram.");
  });

  it("acepta narración en la misma línea que la escena", () => {
    const s = parseScenes("ESCENA 1 — [Un bosque] Narración: Hola mundo.\nESCENA 2 — [Un río]\nNarración: Adiós.");
    expect(s[0]).toEqual({ n: "1", visual: "Un bosque", narration: "Hola mundo." });
  });

  it("descarta escenas sin narración y textos sin escenas", () => {
    expect(parseScenes("Hola, esto no es un guion.")).toEqual([]);
    expect(parseScenes("ESCENA 1 — [Algo]\n\nESCENA 2 — [Otra]\nNarración: Sí.")).toHaveLength(1);
  });
});

describe("splitText", () => {
  it("no corta textos cortos y corta frases enormes sin puntos", () => {
    expect(splitText("Hola.")).toEqual(["Hola."]);
    const giant = "palabra ".repeat(300).trim();
    const parts = splitText(giant, 700);
    expect(parts.length).toBeGreaterThanOrEqual(3);
    parts.forEach(p => expect(p.length).toBeLessThanOrEqual(700));
    expect(parts.join(" ")).toBe(giant);
  });
});

describe("estimateCost y pickAnimated", () => {
  const sixteen = Array.from({ length: 16 }, () => ({}));
  it("16 escenas al 20 % = 80 + 96 + 165 = 341", () => {
    const c = estimateCost(sixteen, 20);
    expect(c).toEqual({ voice: 80, images: 96, clips: 165, total: 341, animated: 3 });
  });
  it("sin animación cuesta 176", () => {
    expect(estimateCost(sixteen, 0).total).toBe(176);
  });
  it("anima primero el gancho, el cierre y el clímax", () => {
    expect(pickAnimated(sixteen, 20)).toEqual([0, 11, 15]);
  });
  it("no repite escenas y respeta el total", () => {
    const p = pickAnimated(sixteen, 50);
    expect(p).toHaveLength(8);
    expect(new Set(p).size).toBe(8);
    expect(pickAnimated(sixteen, 100)).toHaveLength(16);
    expect(pickAnimated([], 20)).toEqual([]);
  });
});

describe("subtitleChunks", () => {
  const text = "Durante siglos, los marineros contaron historias sobre un faro que se encendía solo en las noches de tormenta, y nadie supo nunca quién lo hacía.";
  it("cubre todo el texto, sin bloques de más de 2 × 42 caracteres", () => {
    const c = subtitleChunks(text, 9);
    expect(c.map(x => x.text).join(" ")).toBe(text);
    c.forEach(x => {
      expect(x.lines.length).toBeLessThanOrEqual(2);
      x.lines.forEach(l => expect(l.length).toBeLessThanOrEqual(42));
      expect(x.text.length).toBeLessThanOrEqual(42 * 2 + 1);
    });
  });
  it("sus tiempos son seguidos y suman la duración", () => {
    const c = subtitleChunks(text, 9);
    expect(c[0].start).toBe(0);
    expect(c[c.length - 1].end).toBe(9);
    for (let i = 1; i < c.length; i++) expect(c[i].start).toBeCloseTo(c[i - 1].end);
    expect(c.reduce((a, x) => a + (x.end - x.start), 0)).toBeCloseTo(9);
  });
  it("texto vacío no da subtítulos", () => {
    expect(subtitleChunks("", 5)).toEqual([]);
  });
});

describe("chapters", () => {
  it("empieza en 00:00 y cada capítulo dura 10 s o más", () => {
    const s = parseScenes(script12);
    const d = s.map(() => 30);
    const ch = chapters(s, d);
    expect(ch[0].startsWith("00:00 ")).toBe(true);
    expect(ch.length).toBeGreaterThanOrEqual(3);
    const secs = ch.map(c => { const [m, sec] = c.split(" ")[0].split(":").map(Number); return m * 60 + sec; });
    for (let i = 1; i < secs.length; i++) expect(secs[i] - secs[i - 1]).toBeGreaterThanOrEqual(10);
  });
  it("timecode con horas", () => {
    expect(timecode(75)).toBe("01:15");
    expect(timecode(3725)).toBe("1:02:05");
  });
});

describe("límites, voz, título y etiquetas", () => {
  it("pide al menos 2 escenas y máximo 40", () => {
    expect(checkLimits(parseScenes(scene(1)))).toMatch(/al menos 2/);
    expect(checkLimits(parseScenes(script12))).toBeNull();
    const many = parseScenes(Array.from({ length: 41 }, (_, i) => scene(i + 1)).join("\n"));
    expect(checkLimits(many)).toMatch(/máximo es 40/);
  });
  it("sugiere voz por estilo", () => {
    expect(suggestVoice("Documental")).toBe("onyx");
    expect(suggestVoice("Animación 2D")).toBe("nova");
    expect(suggestVoice("Pintura")).toBe("shimmer");
  });
  it("lee título y miniatura del guion", () => {
    expect(scriptMeta(script12)).toEqual({ title: "12 cosas que nadie te dijo", thumbnail: "Nadie te lo dijo" });
  });
  it("etiquetas sin repetir ni palabras vacías", () => {
    const t = tagsFrom("Señales de que tu perro te ama", "perros y familia");
    expect(t).toContain("perro");
    expect(t).not.toContain("que");
    expect(new Set(t).size).toBe(t.length);
    expect(t.length).toBeLessThanOrEqual(12);
  });
  it("la descripción lleva capítulos y el aviso de IA", () => {
    const d = buildDescription({ title: "T", chapters: ["00:00 Inicio", "01:00 Medio", "02:00 Final"], tags: ["perro feliz"] });
    expect(d).toContain("00:00 Inicio");
    expect(d).toContain("IA");
    expect(d).toContain("#perrofeliz");
  });
});
