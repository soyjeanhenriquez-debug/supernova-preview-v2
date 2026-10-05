import { describe, expect, it } from "vitest";
import { STUDIO_TOOLS, STUDIO_MORE_TOOLS, FIND_TOOLS, TOOLS, TOOL_BY_ID } from "./tools";
import { SLUG_PAGE } from "./pageSlugs";

describe("herramientas", () => {
  const pages = new Set([...Object.values(SLUG_PAGE), "Generadores"]);
  it("cada herramienta abre una pantalla con dirección", () => {
    for (const t of TOOLS) expect(pages.has(t.key), t.id).toBe(true);
  });
  it("Estudio y Encontrar como en el plan ATLAS", () => {
    expect(STUDIO_TOOLS.map(t => t.id)).toEqual(["creativos", "videoanuncio", "videoia", "creadoryt", "carrusel", "fotosugc", "miniaturas", "series"]);
    // UGC con IA vive dentro de Influencer IA (personaje): no hay tarjeta aparte.
    expect(STUDIO_TOOLS.some(t => t.id === "ugc")).toBe(false);
    expect(TOOLS.some(t => t.id === "ugc")).toBe(false);
    // "Ideas de side hustle" quedó oculta el 05-oct-2026 (HIDDEN_TOOL_IDS).
    expect(FIND_TOOLS.map(t => t.id)).toEqual(["radar", "ofertas", "nichosyt", "miniapps"]);
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
  it("Order bump abre su propia pantalla, no Robot de copy", () => {
    expect(TOOL_BY_ID.bump.key).toBe("Order bump");
    expect(TOOL_BY_ID.bump.generator).toBeUndefined();
    expect(SLUG_PAGE["order-bump"]).toBe("Order bump");
  });
});
