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
    // 11-oct-2026: N3 abre con los que piden texto claro; N4 con la objeción que frena la compra.
    expect(buildSlots("creativo", { ...base, level: "n3" }).map(s => s.label)).toEqual(["Beneficios", "Qué incluye", "Transformación"]);
    expect(buildSlots("creativo", { ...base, level: "n4" }).map(s => s.label)).toEqual(["Objeción", "Razones", "Calendario o plan"]);
  });

  it("sin texto del usuario, la IA escribe el titular o las etiquetas; los conceptos de foto van sin texto", () => {
    const [razones] = buildSlots("creativo", { ...base, concepts: ["razones"] });
    expect(razones.prompt).toMatch(/Escribe tú el titular \(máximo 6 palabras\) y las etiquetas/);
    expect(razones.prompt).not.toMatch(/Sin texto en la imagen/);
    const [pregunta] = buildSlots("creativo", { ...base, concepts: ["pregunta"] });
    expect(pregunta.prompt).toMatch(/Escribe tú el titular: máximo 9 palabras/);
    const [native] = buildSlots("creativo", { ...base, concepts: ["native"] });
    expect(native.prompt).toMatch(/Sin texto en la imagen/);
    // Con texto escrito por el usuario, va exacto en todos.
    const [conTexto] = buildSlots("creativo", { ...base, concepts: ["razones"], headline: "Empieza hoy" });
    expect(conTexto.prompt).toContain("exactamente: «Empieza hoy»");
  });

  it("cada imagen de la serie lleva una dirección de arte distinta y el precio solo si existe", () => {
    const slots = buildSlots("creativo", { ...base, level: "n1" });
    const art = slots.map(s => s.prompt.match(/Dirección de arte: ([^.]+)/)?.[1]);
    expect(new Set(art).size).toBe(3);
    expect(slots[0].prompt).not.toMatch(/Precio:/);
    const [conPrecio] = buildSlots("creativo", { ...base, brief: { ...base.brief, price: "US$27" }, concepts: ["oferta"] });
    expect(conPrecio.prompt).toContain("Precio: US$27");
  });

  it("sin kit, cada imagen lleva su propia paleta; con kit manda la paleta de la marca (12-oct)", () => {
    const sin = buildSlots("creativo", { ...base, level: "n3" });
    expect(sin[1].prompt).toMatch(/nada de rosa/);
    const con = buildSlots("creativo", { ...base, level: "n3", kit: { colors: ["#ff8800"], style: "" } });
    for (const s of con) expect(s.prompt).not.toMatch(/paleta terracota|nada de rosa|paleta neutra/);
  });

  it("el texto de la imagen es solo el pedido: la ficha es contexto, sin cierres ni carteles extra", () => {
    const [s] = buildSlots("creativo", { ...base, concepts: ["red_flags"] });
    expect(s.prompt).toMatch(/sin frases de cierre/);
    expect(s.prompt).toMatch(/no texto para copiar/);
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
    // Caso cargado: ángulo, kit de marca con 5 colores y estilo, fotos de referencia y texto real largo.
    const full: PromptCtx = {
      ...base, brief: { product: "p".repeat(200), who: "w".repeat(200), promise: "x".repeat(200), price: "US$27" },
      angle: "a".repeat(200), hasRefs: true,
      kit: { colors: ["#111111", "#222222", "#333333", "#444444", "#555555"], style: "minimalista, cálido, con mucho aire y tipografía gruesa" },
    };
    for (const c of AD_CONCEPTS) {
      const [s] = buildSlots("creativo", { ...full, concepts: [c.id], realTexts: { [c.id]: "x".repeat(160) } });
      expect(s.prompt).toContain("No muestres dinero");
      expect(s.prompt.length).toBeLessThanOrEqual(2000);
      // Y si el servidor corta, las reglas van antes que la ficha.
      expect(s.prompt.indexOf("No muestres dinero")).toBeLessThan(s.prompt.indexOf("Producto:"));
    }
  });
});
