import { describe, expect, it } from "vitest";
import { STUDIO_TOOLS, STUDIO_MORE_TOOLS, FIND_TOOLS, TOOLS } from "./tools";
import { SLUG_PAGE } from "./pageSlugs";

describe("herramientas", () => {
  const pages = new Set([...Object.values(SLUG_PAGE), "Generadores"]);
  it("cada herramienta abre una pantalla con dirección", () => {
    for (const t of TOOLS) expect(pages.has(t.key), t.id).toBe(true);
  });
  it("Estudio y Encontrar como en el plan ATLAS", () => {
    expect(STUDIO_TOOLS.map(t => t.id)).toEqual(["creativos", "videoanuncio", "ugc", "creadoryt", "carrusel", "fotosugc", "miniaturas", "series"]);
    expect(FIND_TOOLS.map(t => t.id)).toEqual(["ideas", "radar", "ofertas", "nichosyt", "miniapps"]);
    expect(STUDIO_MORE_TOOLS.every(Boolean)).toBe(true);
  });
  it("cada tarjeta del Estudio y de Encontrar dice su costo en créditos o Gratis, nunca dólares", () => {
    for (const t of [...STUDIO_TOOLS, ...FIND_TOOLS]) {
      expect(t.cost, t.id).toBeTruthy();
      expect(t.cost).not.toMatch(/US\$|\$|dólar/i);
    }
    expect(STUDIO_TOOLS.find(t => t.id === "videoanuncio")!.cost).toBe("165 créditos");
    expect(STUDIO_TOOLS.find(t => t.id === "creativos")!.cost).toBe("18 créditos");
  });
});
