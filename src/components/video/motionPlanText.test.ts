import { describe, expect, it } from "vitest";
import { fitNarration, parseLooseJson, repairJson, wordsFor } from "../../../supabase/functions/motion-graphics/planText";

// Misión R2-05 (12-oct-2026): el motion no devuelve 502 por JSON roto y la voz cabe en el tiempo pedido.
describe("motion-graphics · narración que cabe en su escena", () => {
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

  it("2,5 palabras por segundo", () => {
    expect(wordsFor(4)).toBe(10);
    expect(wordsFor(2)).toBe(5);
    expect(wordsFor(1)).toBe(4); // mínimo
  });

  it("si cabe, no la toca", () => {
    expect(fitNarration("Mira esto antes de seguir.", 4)).toBe("Mira esto antes de seguir.");
  });

  it("la narración de 20 palabras en una escena de 4 s queda en 10 o menos y termina bien", () => {
    const long = "Si te cuesta cocinar entre semana, esta guía te muestra cómo organizar tus comidas en pocos pasos y sin complicarte la vida.";
    const out = fitNarration(long, 4);
    expect(words(out)).toBeLessThanOrEqual(13); // máximo 10, o hasta +25 % si así llega a una coma o un punto
    expect(out).toMatch(/[.?!]$/);
    expect(out).not.toMatch(/\b(en|de|y|a|con|para|tus)\.$/i);
  });

  it("corta en la frase completa cuando se puede", () => {
    expect(fitNarration("Esto casi nadie te lo dice. Por eso existe esta guía tan completa y tan clara.", 4)).toBe("Esto casi nadie te lo dice.");
  });

  it("una pregunta cortada se cierra con signo", () => {
    const out = fitNarration("¿Sabías que la mayoría de la gente empieza sin un plan claro para su semana entera?", 3);
    expect(out.startsWith("¿")).toBe(true);
    expect(out.endsWith("?")).toBe(true);
  });

  it("un plan de 30 s con 7 escenas no pasa de ~80 palabras de voz (≈ 32 s)", () => {
    const beats = Array.from({ length: 7 }, () => ({ seconds: 4, narration: "Una narración larga de unas veinte palabras que la IA escribe sin mirar el tiempo que dura su escena en el video final." }));
    const total = beats.reduce((a, b) => a + words(fitNarration(b.narration, b.seconds)), 0);
    expect(total).toBeLessThanOrEqual(7 * 10);
  });

  it("narraciones reales de prod (12-oct): sin cortes feos", () => {
    expect(fitNarration("Si quieres empezar a moverte pero no sabes por dónde arrancar, esto es exactamente lo que buscas.", 4))
      .toBe("Si quieres empezar a moverte pero no sabes por dónde arrancar.");
    expect(fitNarration("Este es un programa diseñado específicamente para mujeres que están dando su primer paso hoy.", 4))
      .toBe("Este es un programa diseñado específicamente para mujeres.");
    expect(fitNarration("Haz clic en el enlace para conocer el programa y comenzar tus 28 días ahora mismo.", 4))
      .toBe("Haz clic en el enlace para conocer el programa.");
  });
});

describe("motion-graphics · JSON de la IA", () => {
  it("lee JSON correcto y con bloque ```json", () => {
    expect(parseLooseJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseLooseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseLooseJson('Aquí va:\n{"a":1}\nListo.')).toEqual({ a: 1 });
  });

  it("repara comillas sin escapar dentro de un texto", () => {
    const r = parseLooseJson('{"beats":[{"text":"Dile "no" a la improvisación","seconds":3}]}');
    expect((r?.beats as { text: string }[])[0].text).toBe('Dile "no" a la improvisación');
  });

  it("repara saltos de línea crudos y comas sobrantes", () => {
    const r = parseLooseJson('{"title":"Mi\nmotion","beats":[{"text":"Hola","seconds":3,},],}');
    expect(r).toEqual({ title: "Mi\nmotion", beats: [{ text: "Hola", seconds: 3 }] });
  });

  it("cierra un JSON cortado sin inventar contenido", () => {
    const r = parseLooseJson('{"title":"X","beats":[{"text":"Uno","seconds":3},{"text":"Dos","narr');
    expect(r).toEqual({ title: "X", beats: [{ text: "Uno", seconds: 3 }, { text: "Dos" }] });
    const r2 = parseLooseJson('{"title":"X","beats":[{"text":"Uno a medi');
    expect(r2).toEqual({ title: "X", beats: [{ text: "Uno a medi" }] });
    const r3 = parseLooseJson('{"title":"X","beats":[{"layout":');
    expect(r3).toEqual({ title: "X", beats: [{}] });
  });

  it("no rompe un JSON que ya estaba bien", () => {
    const ok = '{"a":"con \\"comillas\\" escapadas","b":[1,2],"c":{"d":"x: y"}}';
    expect(JSON.parse(repairJson(ok))).toEqual(JSON.parse(ok));
  });

  it("sin objeto devuelve null (y el servidor devuelve el cobro)", () => {
    expect(parseLooseJson("no hay json")).toBeNull();
    expect(parseLooseJson("[1,2]")).toBeNull();
  });
});
