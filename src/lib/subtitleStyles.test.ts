import { describe, expect, it } from "vitest";
import { screenAt, screensOf, showWord, SUB_STYLE_BY_ID, wordsFromSubs, ZOOM_IN, zoomAt, zoomCuts } from "./subtitleStyles";

const SUBS = [
  { desde: 0, hasta: 1.4, texto: "Yo no le doy explicaciones" },
  { desde: 1.4, hasta: 2.5, texto: "a todo el mundo." },
  { desde: 3.5, hasta: 4.5, texto: "Gracias a Dios" },
];

describe("estilos de subtítulos", () => {
  it("reparte el tiempo de cada subtítulo entre sus palabras, sin huecos ni encimarse", () => {
    const w = wordsFromSubs(SUBS);
    expect(w.map(x => x.w)).toEqual(["Yo", "no", "le", "doy", "explicaciones", "a", "todo", "el", "mundo.", "Gracias", "a", "Dios"]);
    expect(w[0].t0).toBe(0);
    expect(w[4].t1).toBeCloseTo(1.4, 5);
    expect(w[4].t1 - w[4].t0).toBeGreaterThan(w[0].t1 - w[0].t0); // la palabra larga dura más
  });

  it("agrupa en pantallas y corta al terminar la frase o en una pausa", () => {
    const s = screensOf(wordsFromSubs(SUBS), 3);
    expect(s.map(x => x.words.map(w => w.w).join(" "))).toEqual(["Yo no le", "doy explicaciones a", "todo el mundo.", "Gracias a Dios"]);
    expect(screensOf(wordsFromSubs(SUBS), 1)).toHaveLength(12);
  });

  it("encuentra la pantalla del segundo y deja vacío entre frases", () => {
    const s = screensOf(wordsFromSubs(SUBS), 2);
    expect(screenAt(s, 0.1)?.words[0].w).toBe("Yo");
    expect(screenAt(s, 3.0)).toBeNull();
  });

  it("muestra la palabra sin coma final y en mayúsculas si el estilo lo pide", () => {
    expect(showWord("mundo.", false)).toBe("mundo");
    expect(showWord("explicación,", true)).toBe("EXPLICACIÓN");
  });

  it("en Conversación deja las comas y quita el punto final", () => {
    expect(SUB_STYLE_BY_ID.conversacion.comas).toBe(true);
    expect(showWord("primera,", false, true)).toBe("primera,");
    expect(showWord("diseñó.", false, true)).toBe("diseñó");
  });

  it("alterna el encuadre al empezar frases, sin saltar antes de 2,5 s", () => {
    const w = wordsFromSubs([
      { desde: 0, hasta: 1, texto: "Hola." },
      { desde: 1, hasta: 2, texto: "Muy corta." }, // frase nueva, pero a 1 s: no cambia
      { desde: 3, hasta: 5, texto: "Después de una pausa" },
      { desde: 5, hasta: 6, texto: "sigue igual" },
      { desde: 6.5, hasta: 7, texto: "y otra" },
    ]);
    const cuts = zoomCuts(w);
    expect(cuts).toEqual([0, 3, 6.5]);
    expect(zoomAt(cuts, 0.5)).toBe(1);
    expect(zoomAt(cuts, 4)).toBe(ZOOM_IN);
    expect(zoomAt(cuts, 7)).toBe(1);
    expect(zoomCuts([])).toEqual([0]);
  });
});
