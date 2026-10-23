import { describe, it, expect } from "vitest";
import { LEVELS, LEVEL_AUTO, levelById, levelInstruction, levelLabel, levelShort } from "./awareness";
import { ANGLES } from "./angles";
import { generators, generatorMessage } from "./generators";
import { carouselRequest } from "./carousel";
import { improvePrompt } from "./videoTemplates";
import { adCopyRequest } from "./imagePrompts";
import { stepMessage } from "./estratega";
import { EMPTY_PROFILE } from "./businessProfile";

describe("Niveles de consciencia", () => {
  it("5 peldaños en orden; 1-3 son tráfico frío; sus ángulos existen", () => {
    expect(LEVELS.map(l => l.n)).toEqual([1, 2, 3, 4, 5]);
    expect(LEVELS.filter(l => l.cold).map(l => l.n)).toEqual([1, 2, 3]);
    const ids = new Set(ANGLES.map(a => a.id));
    for (const l of LEVELS) for (const a of l.angles) expect(ids.has(a)).toBe(true);
  });

  it("automático: la IA elige UN nivel y nunca 'cómpralo ya' a gente nueva", () => {
    expect(levelById(LEVEL_AUTO)).toBeUndefined();
    expect(levelLabel(LEVEL_AUTO)).toMatch(/La IA decide/);
    expect(levelInstruction(LEVEL_AUTO)).toMatch(/UN solo nivel/);
    expect(levelInstruction(LEVEL_AUTO)).toMatch(/1 a 3/);
    expect(levelInstruction(LEVEL_AUTO, 1, false)).not.toMatch(/Indica en una línea/);
    expect(levelShort(LEVEL_AUTO)).toBe("");
  });

  it("cada nivel dice su jugada; el 5 no inventa ofertas y el 4 no inventa reseñas", () => {
    expect(levelInstruction("solucion")).toMatch(/explica tu mecanismo/);
    expect(levelInstruction("solucion")).toMatch(/nada de "cómpralo ya"/);
    expect(levelInstruction("mas-consciente")).toMatch(/solo si están en los datos/);
    expect(levelInstruction("producto")).toMatch(/Reseñas o cifras solo si están/);
    expect(levelInstruction("producto")).not.toMatch(/cómpralo ya/);
  });

  it("llega a Textos que venden, Carrusel, Creativos, Video y el Estratega", () => {
    const hooks = generators.find(g => g.id === "hooks-meta")!;
    expect(generatorMessage(hooks, EMPTY_PROFILE, "x", "auto", "problema")).toContain("nivel 2, Consciente del problema");
    expect(generatorMessage(hooks, EMPTY_PROFILE, "x")).not.toContain("NIVEL DE CONSCIENCIA");
    expect(carouselRequest({ goal: "vender", brief: { product: "Guía", who: "", promise: "" }, slides: 5, levelId: "inconsciente" })).toContain("Inconsciente");
    expect(adCopyRequest("creativo", { brief: { product: "Guía", who: "", promise: "" }, levelId: "producto" })).toContain("Consciente del producto");
    const { user } = improvePrompt([{ label: "Gancho", line: "hola", seconds: 5 } as never], { product: "Guía", who: "", promise: "" }, "anuncio", undefined, "solucion");
    expect(user).toContain("Consciente de la solución");
    expect(stepMessage("guiones", "1, 4", [], "problema")).toContain("Nivel de consciencia: 2");
  });
});
