import { describe, it, expect } from "vitest";
import { SIDE_HUSTLES, HUSTLE_BY_ID, startCost, evidenceLabel, pickOfTheDay, dayKey, hash32 } from "@/lib/sideHustles";

describe("SIDE_HUSTLES", () => {
  it("son las 6 categorías, cada una con qué es y hasta 3 pasos", () => {
    expect(SIDE_HUSTLES).toHaveLength(6);
    for (const h of SIDE_HUSTLES) {
      expect(h.what.length).toBeGreaterThan(10);
      expect(h.steps.length).toBeGreaterThan(0);
      expect(h.steps.length).toBeLessThanOrEqual(3);
      expect(HUSTLE_BY_ID[h.id]).toBe(h);
    }
  });
  it("sin promesas de ingresos en los textos", () => {
    const all = SIDE_HUSTLES.map((h) => [h.title, h.what, ...h.steps].join(" ")).join(" ");
    expect(all).not.toMatch(/gana(r|rás)?\s|ingresos|US\$\s?\d|\$\d|pasivo|garantizad/i);
  });
  it("costo de empezar = la primera pieza recomendada", () => {
    expect(startCost("low_ticket").credits).toBe(18);
    expect(startCost("ugc").credits).toBe(110);
    expect(startCost("marca").credits).toBe(30);
    expect(startCost("faceless").label).toBe("guion 30");
  });
});

describe("evidenceLabel", () => {
  it("sin datos no hay cifra", () => {
    expect(evidenceLabel(0)).toBeNull();
    expect(evidenceLabel(NaN)).toBeNull();
  });
  it("si llegaron todas las pedidas dice 'Al menos'", () => {
    expect(evidenceLabel(6)).toBe("Al menos 6 ofertas reales con más de 90 días pagando anuncios");
  });
  it("si llegaron menos, el número exacto y en singular cuando es 1", () => {
    expect(evidenceLabel(4)).toBe("4 ofertas reales con más de 90 días pagando anuncios");
    expect(evidenceLabel(1)).toBe("1 oferta real con más de 90 días pagando anuncios");
  });
});

describe("pickOfTheDay", () => {
  const list = Array.from({ length: 12 }, (_, i) => i);
  it("es estable para el mismo día y usuario", () => {
    expect(pickOfTheDay(list, "2026-10-04", "u1")).toBe(pickOfTheDay(list, "2026-10-04", "u1"));
  });
  it("cambia entre días o usuarios (en algún caso de 10)", () => {
    const days = Array.from({ length: 10 }, (_, i) => pickOfTheDay(list, `2026-10-${10 + i}`, "u1"));
    expect(new Set(days).size).toBeGreaterThan(1);
    const users = Array.from({ length: 10 }, (_, i) => pickOfTheDay(list, "2026-10-04", `u${i}`));
    expect(new Set(users).size).toBeGreaterThan(1);
  });
  it("lista vacía → null; dayKey con formato fijo; hash sin signo", () => {
    expect(pickOfTheDay([], "2026-10-04", "u1")).toBeNull();
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(hash32("x")).toBeGreaterThanOrEqual(0);
  });
});
