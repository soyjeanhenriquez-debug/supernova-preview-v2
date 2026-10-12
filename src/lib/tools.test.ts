import { describe, expect, it } from "vitest";
import {
  STUDIO_TOOLS, STUDIO_MORE_TOOLS, FIND_TOOLS, TOOLS, TOOL_BY_ID, GRID_TOOLS, MERGED_INTO, HOME_CATEGORIES,
  MENU_FIND_TOOLS, MENU_CREATE_TOOLS, NEXT_STEP_TOOLS, MORE_TOOLS, searchWords, searchTools, offerSearchTerm, rankForSearch,
} from "./tools";
import { SLUG_PAGE } from "./pageSlugs";

describe("herramientas", () => {
  const pages = new Set([...Object.values(SLUG_PAGE), "Generadores"]);
  it("cada herramienta abre una pantalla con dirección", () => {
    for (const t of TOOLS) expect(pages.has(t.key), t.id).toBe(true);
  });
  it("Estudio y Encontrar como en el plan ATLAS", () => {
    // Fase 1 (07-oct-2026): fotos UGC y de producto viven en Creativos; video libre y series en Video con IA.
    expect(STUDIO_TOOLS.map(t => t.id)).toEqual(["creativos", "videoanuncio", "creadoryt", "carrusel", "miniaturas"]);
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
    expect(STUDIO_TOOLS.find(t => t.id === "videoanuncio")!.cost).toBe("desde 75 créditos");
    expect(STUDIO_TOOLS.find(t => t.id === "creativos")!.cost).toBe("21 créditos");
  });
  it("las fusionadas no se pierden: siguen en el buscador, su destino se ve y no salen en las cuadrículas", () => {
    for (const [id, into] of Object.entries(MERGED_INTO)) {
      expect(TOOLS.some(t => t.id === id), id).toBe(true);
      expect(GRID_TOOLS.some(t => t.id === into), into).toBe(true);
      expect(GRID_TOOLS.some(t => t.id === id), id).toBe(false);
      for (const c of HOME_CATEGORIES) expect(c.tools.some(t => t.id === id), `${c.id}:${id}`).toBe(false);
    }
    expect(GRID_TOOLS.length).toBeLessThanOrEqual(22);
  });
  it("Order bump abre su propia pantalla, no Robot de copy", () => {
    expect(TOOL_BY_ID.bump.key).toBe("Order bump");
    expect(TOOL_BY_ID.bump.generator).toBeUndefined();
    expect(SLUG_PAGE["order-bump"]).toBe("Order bump");
  });
  it("menú de una sola puerta: Radar y Ofertas, Crear con 5, y nada se pierde", () => {
    expect(MENU_FIND_TOOLS.map(t => t.id)).toEqual(["radar", "ofertas"]);
    expect(MENU_CREATE_TOOLS.map(t => t.id)).toEqual(["creativos", "carrusel", "videoanuncio", "copy", "personaje"]);
    expect(TOOL_BY_ID.copy.nav).toBe("Textos que venden");
    expect(NEXT_STEP_TOOLS.map(t => t.id)).toEqual(["creativos", "carrusel", "videoanuncio", "copy"]);
    // Cada tarjeta que antes salía en las cuadrículas sigue en el menú principal o en "Más herramientas".
    const inMenu = new Set([...MENU_FIND_TOOLS, ...MENU_CREATE_TOOLS, ...MORE_TOOLS].map(t => t.id));
    for (const t of GRID_TOOLS) expect(inMenu.has(t.id), t.id).toBe(true);
    // Y "Más" no repite lo del menú principal.
    for (const t of MORE_TOOLS) expect([...MENU_FIND_TOOLS, ...MENU_CREATE_TOOLS].includes(t), t.id).toBe(false);
    // "Empieza aquí" lo lleva la puerta: Ofertas.
    expect(TOOLS.filter(t => t.featured).map(t => t.id)).toEqual(["ofertas"]);
  });
});

describe("buscador para principiantes", () => {
  const ids = (q: string) => searchTools(q, rankForSearch(TOOLS)).map(t => t.id);
  it("quita el relleno y busca por raíz", () => {
    expect(searchWords("quiero vender un curso")).toEqual(["vende", "curso"]);
    expect(searchWords("No sé qué vender")).toEqual(["vende"]);
    expect(searchWords("imágenes para Instagram")).toEqual(["image", "insta"]);
  });
  it("frases de quien empieza llevan a la herramienta correcta", () => {
    expect(ids("quiero vender un curso")[0]).toBe("ofertas");
    expect(ids("no sé qué vender")[0]).toBe("ofertas");
    expect(ids("imagen para instagram")[0]).toBe("creativos");
    expect(ids("cuánto cobrar")[0]).toBe("precio");
    expect(ids("pagina web")).toContain("paginas");
    expect(ids("video para tiktok")[0]).toBe("videoanuncio");
    expect(ids("anuncio para mi ebook").length).toBeGreaterThan(0);
    expect(ids("xyzxyz")).toEqual([]);
  });
  it("encuentra también las que viven plegadas en Más herramientas", () => {
    expect(ids("youtube")).toContain("creadoryt");
    expect(ids("ganchos")).toContain("ganchos");
    expect(ids("validar")).toContain("validar");
  });
  it("para ofertas usa la palabra del tema, no el verbo", () => {
    expect(offerSearchTerm("quiero vender un curso")).toBe("curso");
    expect(offerSearchTerm("no sé qué vender")).toBe("");
    expect(offerSearchTerm("keto")).toBe("keto");
  });
});
