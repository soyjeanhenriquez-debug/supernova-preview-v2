import { describe, it, expect } from "vitest";
import { AD_CONCEPTS, CONCEPT_BY_ID, levelConcepts } from "@/lib/adConcepts";
import { buildSlots, missingRealTexts, type PromptCtx } from "@/lib/imagePrompts";

const base: PromptCtx = { brief: { product: "Guía de ventas", who: "Emprendedoras", promise: "Vender por WhatsApp" }, aspect: "4:5" };

describe("conceptos de creativos", () => {
  it("hay 32 conceptos con id único", () => {
    expect(AD_CONCEPTS).toHaveLength(32);
    expect(new Set(AD_CONCEPTS.map(c => c.id)).size).toBe(32);
  });

  it("sin elegir nada salen los 3 de siempre", () => {
    expect(buildSlots("creativo", base).map(s => s.label)).toEqual(["Problema → solución", "El resultado deseado", "Producto en mockup"]);
  });

  it("nunca 3 versiones del mismo: con 1 concepto se completa con otros 2 distintos de su nivel", () => {
    const slots = buildSlots("creativo", { ...base, concepts: ["iceberg"] });
    expect(slots).toHaveLength(3);
    expect(new Set(slots.map(s => s.label)).size).toBe(3);
    expect(slots[0].label).toBe("Iceberg");
    expect(slots.every(s => CONCEPT_BY_ID[AD_CONCEPTS.find(c => c.name === s.label)!.id].group === "n0")).toBe(true);
  });

  it("con un nivel y sin elegir salen sus 3 recomendados, sin los que piden datos reales", () => {
    expect(buildSlots("creativo", { ...base, level: "n1" }).map(s => s.label)).toEqual(["Pregunta", "Notas", "Señales de alerta"]);
    expect(buildSlots("creativo", { ...base, level: "n0" }).map(s => s.label)).toEqual(["Iceberg", "Descubrimiento", "Publicación normal"]);
  });

  it("cada nivel tiene al menos 3 conceptos que no piden datos reales", () => {
    for (const l of ["n0", "n1", "n2", "n3", "n4"] as const) expect(levelConcepts(l).filter(c => !c.needsReal).length).toBeGreaterThanOrEqual(3);
  });

  it("con otro estilo escrito entran 2 conceptos y tu estilo", () => {
    const slots = buildSlots("creativo", { ...base, concepts: ["pregunta", "notas", "razones"], customStyle: "estilo tuit" });
    expect(slots.map(s => s.label)).toEqual(["Pregunta", "Notas", "Tu estilo"]);
    expect(slots[2].prompt).toContain("estilo tuit");
  });

  it("los conceptos con datos reales no se crean sin el texto del usuario y lo usan exacto", () => {
    expect(CONCEPT_BY_ID.testimonio.needsReal).toBeTruthy();
    expect(missingRealTexts({ concepts: ["testimonio", "pregunta"], realTexts: {} })).toEqual(["testimonio"]);
    const slots = buildSlots("creativo", { ...base, concepts: ["testimonio"], realTexts: { testimonio: "Me encantó — Ana" } });
    expect(slots[0].prompt).toContain("«Me encantó — Ana»");
  });

  it("todo prompt de concepto lleva las reglas del manual y cabe en el límite del servidor", () => {
    for (const c of AD_CONCEPTS) {
      const [s] = buildSlots("creativo", { ...base, concepts: [c.id], realTexts: { [c.id]: "x".repeat(160) } });
      expect(s.prompt).toContain("No muestres dinero");
      expect(s.prompt.length).toBeLessThanOrEqual(2000);
    }
  });
});
