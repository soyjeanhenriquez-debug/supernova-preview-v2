import { describe, expect, it } from "vitest";
import { GUARDIAN_PASOS, groupChecks, ordenHallazgos, type Check, type Finding } from "./guardian";

const f = (id: string, severity: Finding["severity"], occurrences: number, last_seen: string) =>
  ({ id, severity, occurrences, last_seen } as Finding);
const c = (id: number, area: string, ok: boolean | null) => ({ id, area, name: String(id), ok, method: "datos", detail: null } as Check);

describe("Guardián del Creador · panel", () => {
  it("ordena primero lo crítico, luego lo que más se repite", () => {
    const out = ordenHallazgos([f("m", "mejora", 9, "2026-10-24"), f("i1", "importante", 1, "2026-10-24"), f("c", "critico", 1, "2026-10-01"), f("i2", "importante", 5, "2026-10-02")]);
    expect(out.map(x => x.id)).toEqual(["c", "i2", "i1", "m"]);
  });
  it("agrupa pruebas por área con las fallidas arriba", () => {
    const g = groupChecks([c(1, "Cobros", true), c(2, "Calidad", null), c(3, "Calidad", false), c(4, "Cobros", true)]);
    expect(g[0][0]).toBe("Calidad");
    expect(g[0][1].map(x => x.id)).toEqual([3, 2]);
    expect(g[1][0]).toBe("Cobros");
  });
  it("tiene una etiqueta en español por cada paso de la auditoría completa", () => {
    expect(GUARDIAN_PASOS).toHaveLength(13);
    expect(new Set(GUARDIAN_PASOS.map(p => p.id)).size).toBe(13);
  });
});
