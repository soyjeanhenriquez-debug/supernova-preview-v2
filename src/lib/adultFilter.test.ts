import { describe, expect, it } from "vitest";
import { isAdultAd } from "./adultFilter";

describe("filtro +18 del Radar", () => {
  it("oculta lo que es para adultos", () => {
    for (const t of ["🔞 sleep with me for a month", "Contenido erótico exclusivo", "Video XXX", "chicas calientes cerca"]) expect(isAdultAd(t), t).toBe(true);
  });
  it("no oculta anuncios normales", () => {
    for (const t of ["Curso de repostería", "Guía de nutrición para ganar músculo", "Sexta edición del curso", null]) expect(isAdultAd(t as string), String(t)).toBe(false);
  });
});
