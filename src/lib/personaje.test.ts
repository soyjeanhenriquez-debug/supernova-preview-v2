import { describe, expect, it } from "vitest";
import { cleanGuion, cleanPersonaje, parseArray } from "./personaje";

describe("personaje: honestidad y formato", () => {
  it("la bio siempre dice que es un personaje creado con IA", () => {
    const p = cleanPersonaje({ nombre: "Vivian", aspecto: "Abuela elegante con gafas de sol", bio: "Te enseño a organizar tu dinero" });
    expect(p?.bio).toMatch(/Personaje creado con IA$/);
  });
  it("no duplica la etiqueta si ya viene", () => {
    const p = cleanPersonaje({ nombre: "Amos", aspecto: "Hombre mayor, barba larga", bio: "Hábitos simples · Personaje creado con IA" });
    expect(p?.bio.match(/creado con IA/gi)?.length).toBe(1);
  });
  it("sin nombre o sin aspecto no hay personaje", () => {
    expect(cleanPersonaje({ nombre: "", aspecto: "x" })).toBeNull();
    expect(cleanPersonaje({ nombre: "Sienna", aspecto: "" })).toBeNull();
  });
  it("lee el JSON aunque venga envuelto en ```json y texto", () => {
    expect(parseArray<{ a: number }>('Aquí va:\n```json\n[{"a":1},{"a":2}]\n```')).toEqual([{ a: 1 }, { a: 2 }]);
    expect(parseArray("sin json")).toEqual([]);
    expect(parseArray("[roto")).toEqual([]);
  });
  it("un guion sin texto se descarta", () => {
    expect(cleanGuion({ titulo: "x", guion: "" })).toBeNull();
    expect(cleanGuion({ titulo: "x", guion: "Hola" })?.guion).toBe("Hola");
  });
});
