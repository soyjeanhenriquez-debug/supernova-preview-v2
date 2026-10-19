import { describe, expect, it } from "vitest";
import { notionGuion, notionPorQue, parecido, publishText, REEL_URL_RE, speakSeconds, splitPhrases, teleprompterLines, type PorQue, type Version } from "./reel";

const V: Version = {
  nivel: "adaptacion", que_se_mantuvo: [], que_cambio: [], formula_explicada: "", ideas: [],
  ganchos: ["¿Otra vez a esperar enero?", "Dejar el ejercicio para enero es el error.", "No esperes a enero."],
  guion: [
    { inicio: 0, fin: 5, dices: "Faltan pocas semanas. ¿Y vas a esperar a enero?", se_ve: "Plano medio", texto_pantalla: "¿Otra vez enero?", original: 0 },
    { inicio: 5, fin: 14, dices: "Llevas tres diciembres diciendo lo mismo.", se_ve: "Zoom digital", texto_pantalla: "El mismo ciclo", original: 1 },
  ],
  cierre: "Comenta GRUPO y te mando la rutina.",
  publicar: { copy: "Esperar a enero es la excusa.", palabra_clave: "GRUPO", hashtags: ["#fuerza", "#rutina"], comentario_fijado: "Comenta GRUPO" },
};
const P: PorQue = {
  resumen: "Confronta a quien deja todo para enero.",
  gancho: { se_ve: "Sentado", se_dice: "Faltan dos meses", texto_pantalla: "¡Faltan 2 meses!", por_que: "Urgencia de fin de año" },
  claves: ["Ancla de fin de año", "Tono directo", "Una sola idea", "extra"], mejorar: ["Más corto", "Más cortes", "extra"],
  timeline: [], formula_gancho: "", mecanismo: "",
};

describe("teleprompter", () => {
  it("solo trae lo que se dice, sin 'Dices:' ni segundos, y el gancho elegido reemplaza la primera frase", () => {
    const lines = teleprompterLines(V, 1);
    expect(lines[0]).toBe("Dejar el ejercicio para enero es el error.");
    expect(lines).toContain("¿Y vas a esperar a enero?");
    expect(lines.join(" ")).not.toMatch(/Dices:|\d+\s*s\b|Se ve/);
    expect(lines.at(-1)).toBe("Comenta GRUPO y te mando la rutina.");
  });

  it("no deja renglones de solo '...' ni repite el cierre si el guion ya lo dice", () => {
    const v: Version = { ...V, guion: [
      { inicio: 0, fin: 5, dices: "Sigues poniéndote excusas... ... está bien, no te juzgo.", se_ve: "", texto_pantalla: "", original: 0 },
      { inicio: 5, fin: 9, dices: "Si de verdad quieres empezar, comenta NOVA y te envío los primeros pasos.", se_ve: "", texto_pantalla: "", original: 1 },
    ], ganchos: [], cierre: "Comenta NOVA y te envío los primeros pasos." };
    const lines = teleprompterLines(v, 0);
    expect(lines.some(l => /^[.…\s]+$/.test(l))).toBe(false);
    expect(lines.filter(l => /comenta nova/i.test(l)).length).toBe(1);
  });

  it("corta en frases y estima palabras / 2,5", () => {
    expect(splitPhrases("Hola. ¿Cómo estás? Bien")).toEqual(["Hola.", "¿Cómo estás?", "Bien"]);
    expect(speakSeconds(["uno dos tres cuatro cinco"])).toBe(2);
  });
});

describe("formato Notion", () => {
  it("botón A: RESUMEN, GANCHO, 3 CLAVES y 2 MEJORAR", () => {
    expect(notionPorQue(P)).toBe([
      "RESUMEN: Confronta a quien deja todo para enero.",
      "GANCHO: «Faltan dos meses» — Urgencia de fin de año",
      "CLAVES:", "- Ancla de fin de año", "- Tono directo", "- Una sola idea",
      "MEJORAR:", "- Más corto", "- Más cortes",
    ].join("\n"));
  });

  it("botón B: cada tramo empieza con su rango en una línea sola y cada línea hablada con 'Dices:'", () => {
    expect(notionGuion(V, 0)).toBe([
      "GANCHO: ¿Otra vez a esperar enero?", "",
      "0–5 s", "Dices: Faltan pocas semanas. ¿Y vas a esperar a enero?", "Se ve: Plano medio", "Texto en pantalla: ¿Otra vez enero?",
      "5–14 s", "Dices: Llevas tres diciembres diciendo lo mismo.", "Se ve: Zoom digital", "Texto en pantalla: El mismo ciclo",
      "", "CIERRE: Comenta GRUPO y te mando la rutina.",
    ].join("\n"));
  });

  it("publicar lleva la palabra clave en mayúsculas y los hashtags", () => {
    expect(publishText(V)).toContain("Comenta GRUPO");
    expect(publishText(V)).toContain("#fuerza #rutina");
  });
});

describe("enlace de Reel", () => {
  it("acepta reel, reels y p, con o sin usuario y parámetros", () => {
    expect(REEL_URL_RE.test("https://www.instagram.com/reel/DeiVQHivScw/")).toBe(true);
    expect(REEL_URL_RE.test("https://instagram.com/rodrigo.alfaro.s/reel/DeiVQHivScw/?igsh=abc")).toBe(true);
    expect(REEL_URL_RE.test("https://www.tiktok.com/@x/video/1")).toBe(false);
  });
});

describe("parecido al original (Espejo)", () => {
  it("cuenta qué parte de las palabras del original sigue en tu guion", () => {
    const v: Version = { ...V, ganchos: [], cierre: "", guion: [
      { inicio: 0, fin: 5, dices: "Yo te enseño a emprender, pero no me pidas que trabaje por ti.", se_ve: "", texto_pantalla: "", original: 0, original_texto: "Yo te enseño a cocinar, pero no me pidas que cocine por ti." },
    ] };
    expect(parecido(v)).toBe(84.6);
    expect(parecido(V)).toBeNull();
  });
});

describe("regla 30/70 en el formato Notion", () => {
  it("agrega el tipo y lo que no se puede comprobar cuando vienen", () => {
    const P2: PorQue = { resumen: "R", gancho: { se_ve: "", se_dice: "Hola", texto_pantalla: "", por_que: "Frena" }, claves: ["a"], mejorar: ["b"], timeline: [], formula_gancho: "", mecanismo: "",
      tipo: "descubrimiento", tipo_por_que: "Comparte una herramienta útil", no_comprobable: ["De 3 a 3.000 comentarios"] };
    const t = notionPorQue(P2);
    expect(t).toContain("TIPO: Descubrimiento — Comparte una herramienta útil");
    expect(t).toContain("NO SE PUEDE COMPROBAR (no lo repitas):\n- De 3 a 3.000 comentarios");
  });
});
