import { describe, expect, it } from "vitest";
import { coreTerms, isRelevant, parseLooseJson, relevantSearches, seedFromProduct } from "./contentText";

describe("seedFromProduct", () => {
  it("saca el tema real, no la envoltura del producto", () => {
    expect(seedFromProduct("Programa digital de ejercicio en casa de 28 días, sin equipo, para mujeres que empiezan de cero")).toBe("ejercicio en casa");
    expect(seedFromProduct("Programa digital de ejercicio en casa de 28 días para ganar músculo, sin equipo")).toBe("ejercicio en casa");
    expect(seedFromProduct("Curso online de repostería para principiantes")).toBe("repostería");
    expect(seedFromProduct("Guía de maquillaje natural")).toBe("maquillaje natural");
  });
  it("si no hay producto usa a quién ayuda", () => {
    expect(seedFromProduct("", "mamás emprendedoras que venden por WhatsApp")).toBe("mamás emprendedoras");
  });
});

describe("relevantSearches", () => {
  const seed = "ejercicio en casa";
  it("deja las del tema y saca apuestas, club hípico y la tele", () => {
    const list = [
      "ejercicio en casa para bajar de peso", "ejercicios en casa sin pesas", "rutina de ejercicio en casa para mujeres",
      "ejercicio en casa para principiantes", "como hacer ejercicio en casa", "ejercicio en casa 20 minutos",
      "programar tv samsung", "apuestas deportivas", "club hípico en casa", "casa de apuestas ejercicio",
    ].map(q => ({ q }));
    const out = relevantSearches(list, seed).map(s => s.q);
    expect(out).toContain("ejercicios en casa sin pesas");
    expect(out).not.toContain("programar tv samsung");
    expect(out).not.toContain("apuestas deportivas");
    expect(out).not.toContain("club hípico en casa");
    expect(out).not.toContain("casa de apuestas ejercicio");
  });
  it("las palabras clave van en raíz", () => {
    expect(coreTerms("ejercicio en casa")).toEqual(["ejercic", "casa"]);
    expect(isRelevant("Ejercicios en casas pequeñas", "ejercicio en casa")).toBe(true);
  });
});

describe("parseLooseJson", () => {
  it("lee JSON con ``` y comas de más", () => {
    const r = parseLooseJson('```json\n{"ideas":[{"title":"a"},{"title":"b"},]}\n```', "ideas");
    expect(r.items.map(i => i.title)).toEqual(["a", "b"]);
  });
  it("rescata los objetos completos si la respuesta viene cortada", () => {
    const r = parseLooseJson('{"items":[{"n":1,"title":"uno {raro}"},{"n":2,"title":"dos \\"x\\""},{"n":3,"title":"tr', "items");
    expect(r.items.map(i => i.n)).toEqual([1, 2]);
  });
  it("devuelve vacío si no hay nada que leer", () => {
    expect(parseLooseJson("lo siento", "ideas").items).toEqual([]);
  });
});
