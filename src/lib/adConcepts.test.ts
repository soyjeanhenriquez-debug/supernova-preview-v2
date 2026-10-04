import { describe, it, expect } from "vitest";
import { AD_CONCEPTS, CONCEPT_BY_ID } from "@/lib/adConcepts";
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

  it("con 1 concepto salen 3 versiones de ese concepto", () => {
    const slots = buildSlots("creativo", { ...base, concepts: ["iceberg"] });
    expect(slots).toHaveLength(3);
    expect(slots.map(s => s.label)).toEqual(["Iceberg", "Iceberg · versión 2", "Iceberg · versión 3"]);
    expect(slots[0].prompt).toContain("iceberg");
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
