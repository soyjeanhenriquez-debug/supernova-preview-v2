import { describe, expect, it } from "vitest";
import { AGENTES, EQUIPO, siguientePaso } from "@/lib/agentes";

describe("equipo de agentes", () => {
  it("13 agentes con nombres conocidos y libres, ninguno de marcas con dueño", () => {
    expect(EQUIPO).toHaveLength(13);
    for (const id of EQUIPO) expect(AGENTES[id].nombre).not.toMatch(/iron man|thor|hulk|capit[aá]n am[eé]rica|viuda negra|hawkeye|wanda|spider|marvel|vengador|heisenberg|walter white|stark|lannister|targaryen|jon snow/i);
  });
  it("cada agente cierra con una pregunta de avance y su siguiente existe en el equipo", () => {
    for (const id of EQUIPO) {
      const a = AGENTES[id];
      expect(a.avance.trim().endsWith("?")).toBe(true);
      if (a.siguiente) expect(EQUIPO).toContain(a.siguiente);
    }
  });
  it("siguientePaso solo lleva a herramientas que ya existen", () => {
    expect(siguientePaso("producto")).toBeNull(); // La Fortaleza (página) todavía no existe
    expect(siguientePaso("ventas")?.nombre).toBe("Robin Hood");
    expect(siguientePaso("reels")?.ruta).toBe("carrusel");
  });
});
