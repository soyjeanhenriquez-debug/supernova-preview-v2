import { describe, expect, it } from "vitest";
import { entender } from "@/lib/agenteEditor";

const tipos = (s: string) => entender(s).acciones.map(a => a.tipo);

describe("agente editor", () => {
  it("quita silencios, subtítulos estilo Impacto y B-roll en una frase", () => {
    const r = entender("Quítale los silencios y ponle subtítulos estilo impacto con b-roll");
    expect(r.acciones).toContainEqual({ tipo: "silencios", on: true });
    expect(r.acciones).toContainEqual({ tipo: "estilo", v: "impacto" });
    expect(tipos("Quítale los silencios y ponle subtítulos estilo impacto con b-roll")).toEqual(expect.arrayContaining(["subtitulos", "broll", "modo"]));
    expect(r.acciones[0]).toEqual({ tipo: "seccion", v: "editar" });
    expect(r.respuesta).toMatch(/^Hecho:/);
  });
  it("«no quites los silencios» los deja", () => {
    expect(entender("no quites los silencios").acciones).toContainEqual({ tipo: "silencios", on: false });
  });
  it("entiende la plantilla y la edición simple", () => {
    expect(entender("hazlo con la plantilla de reel dinámico").acciones).toContainEqual({ tipo: "plantilla", v: "dinamico" });
    expect(entender("usa la lista numerada").acciones).toContainEqual({ tipo: "plantilla", v: "lista" });
    expect(entender("ponle la plantilla explicador").acciones).toContainEqual({ tipo: "modo", v: "plantilla" });
    expect(entender("con íconos al lado").acciones).toContainEqual({ tipo: "plantilla", v: "iconos" });
    expect(entender("solo una edición simple").acciones).toContainEqual({ tipo: "modo", v: "simple" });
  });
  it("portada, cierre y título con su texto", () => {
    const r = entender("Pon portada que diga «Mi primera venta», cierre comenta GUIA y título arriba: 3 errores que *frenan*");
    expect(r.acciones).toContainEqual({ tipo: "portada", titulo: "MI PRIMERA VENTA", acento: "" });
    expect(r.acciones).toContainEqual({ tipo: "cierre", palabra: "GUIA" });
    expect(r.acciones).toContainEqual({ tipo: "titulo", texto: "3 errores que *frenan*" });
  });
  it("voz grave, sin acercamientos, guardar", () => {
    const r = entender("voz grave, sin zoom y guárdalo");
    expect(r.acciones).toContainEqual({ tipo: "voz", on: true });
    expect(r.acciones).toContainEqual({ tipo: "zoom", on: false });
    expect(r.acciones).toContainEqual({ tipo: "guardar" });
  });
  it("estilo por su nombre en pantalla", () => {
    expect(entender("cambia a palabra en color").acciones).toContainEqual({ tipo: "estilo", v: "resaltado" });
    expect(entender("estilo conversación").acciones).toContainEqual({ tipo: "estilo", v: "conversacion" });
  });
  it("si no entiende, dice lo que puede hacer", () => {
    const r = entender("hazme un café");
    expect(r.acciones).toEqual([]);
    expect(r.respuesta).toMatch(/Puedo quitar silencios/);
  });
});
