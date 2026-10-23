import { describe, it, expect } from "vitest";
import { ANGLES, ANGLE_AUTO, angleById, angleInstruction, angleLabel, angleShort } from "./angles";
import { generators, generatorMessage, usesAngle } from "./generators";
import { carouselRequest } from "./carousel";
import { improvePrompt } from "./videoTemplates";
import { EMPTY_PROFILE } from "./businessProfile";

describe("Ángulos que venden", () => {
  it("20 ángulos (12 base + 8 extra), ids únicos, 4 ejemplos de 4 nichos distintos", () => {
    expect(ANGLES).toHaveLength(20);
    expect(ANGLES.filter(a => a.core)).toHaveLength(12);
    expect(new Set(ANGLES.map(a => a.id)).size).toBe(20);
    expect(ANGLES.map(a => a.n)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    for (const a of ANGLES) {
      expect(a.examples).toHaveLength(4);
      expect(new Set(a.examples.map(e => e.niche)).size).toBe(4);
    }
  });

  it("los ejemplos no prometen dinero, cuerpo, salud ni plazos, y no van en voseo ni en español de España", () => {
    const text = ANGLES.flatMap(a => [a.what, a.how, a.when, ...a.examples.map(e => e.hook)]).join(" ");
    expect(text).not.toMatch(/\b(gana[rs]?|ganancias|ingresos|kilos|adelgaza|cura|garantizad[oa]|en \d+ días|vídeo|móvil|querés|tenés|probá)\b/i);
  });

  it("automático = UN ángulo elegido por la IA; elegido = ese ángulo, sin mezclar", () => {
    expect(angleById(ANGLE_AUTO)).toBeUndefined();
    expect(angleLabel(ANGLE_AUTO)).toBe("La IA elige el mejor");
    expect(angleLabel("mitos")).toBe("12 · Rompe-mitos");
    expect(angleInstruction(ANGLE_AUTO)).toMatch(/UN solo ángulo/);
    const one = angleInstruction("comparacion");
    expect(one).toContain("Comparación");
    expect(one).toContain("No mezcles otros ángulos");
    expect(angleInstruction("comparacion", 3)).toMatch(/Todas las piezas salen de este mismo ángulo/);
    expect(angleInstruction(ANGLE_AUTO, 3)).toMatch(/cada pieza usa UN solo ángulo, distinto/);
  });

  it("sin nota extra para JSON y corto para imágenes", () => {
    expect(angleInstruction(ANGLE_AUTO, 1, false)).not.toMatch(/Indica en una línea/);
    expect(angleShort(ANGLE_AUTO)).toBe("");
    expect(angleShort("demostracion").length).toBeLessThan(260);
  });

  it("llega a Textos que venden, Carrusel y Video", () => {
    const hooks = generators.find(g => g.id === "hooks-meta")!;
    const brief = generators.find(g => g.id === "creative-brief")!;
    expect(generatorMessage(hooks, EMPTY_PROFILE, "x", "mitos")).toContain("Rompe-mitos");
    expect(generatorMessage(hooks, EMPTY_PROFILE, "x")).not.toContain("ÁNGULO DE VENTA");
    expect(usesAngle("creative-brief")).toBe(false); // ya prueba 10 ángulos distintos
    expect(generatorMessage(brief, EMPTY_PROFILE, "x", "mitos")).not.toContain("ÁNGULO DE VENTA");
    const car = carouselRequest({ goal: "vender", brief: { product: "Guía", who: "mamás", promise: "x" }, slides: 5, angleId: "errores" });
    expect(car).toContain("Errores comunes");
    expect(car).not.toMatch(/Indica en una línea/);
    const { user } = improvePrompt([{ label: "Gancho", line: "hola", seconds: 5 } as never], { product: "Guía", who: "", promise: "" }, "anuncio", "curiosidad");
    expect(user).toContain("Curiosidad / secreto");
  });
});
