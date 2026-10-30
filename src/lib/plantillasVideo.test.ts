import { describe, expect, it } from "vitest";
import { clavesDe, momentosFinales, PLANTILLAS, type Momento } from "@/lib/plantillasVideo";

const m = (desde: number, tipo: Momento["tipo"], valor = ""): Momento => ({ desde, tipo, titulo: `idea ${desde}`, detalle: "", valor, emoji: "💡" });

describe("plantillas", () => {
  it("hay 7: Reel dinámico, las 3 del reto y 3 de reels analizados", () => {
    expect(PLANTILLAS.map(p => p.id)).toEqual(["dinamico", "explicador", "set", "desfile", "lista", "iconos", "urgencia"]);
    expect(PLANTILLAS.filter(p => p.origen.startsWith("Reel analizado"))).toHaveLength(3);
  });
  it("pasa los momentos al video sin silencios", () => {
    const r = momentosFinales([m(12, "frase")], "explicador", [{ a: 0, b: 5 }, { a: 10, b: 20 }], 15, false);
    expect(r[0].t).toBeCloseTo(7);
    expect(r[0].dur).toBeCloseTo(2.6);
  });
  it("un momento que cae en un silencio quitado entra al empezar el tramo siguiente", () => {
    const r = momentosFinales([m(7, "frase")], "explicador", [{ a: 0, b: 5 }, { a: 10, b: 20 }], 15, false);
    expect(r[0].t).toBeCloseTo(5);
  });
  it("no deja dos momentos pegados ni uno en el cierre", () => {
    const r = momentosFinales([m(2, "frase"), m(2.5, "frase"), m(6, "frase"), m(13, "frase")], "explicador", [], 15, true);
    expect(r.map(x => x.t)).toEqual([2, 6]);
  });
  it("Lista solo usa puntos y Urgencia solo cifras que se dijeron", () => {
    const ms = [m(1, "frase"), m(3, "punto"), m(6, "numero", "2 meses"), m(9, "punto")];
    expect(momentosFinales(ms, "lista", [], 20, false).map(x => x.t)).toEqual([3, 9]);
    expect(momentosFinales(ms, "urgencia", [], 20, false).map(x => x.valor)).toEqual(["2 meses"]);
  });
  it("las palabras clave salen de los subtítulos", () => {
    expect(clavesDe([{ clave: "venta" }, { clave: "" }, {}])).toEqual(["venta"]);
  });
});
