import { describe, expect, it } from "vitest";
import { diagnose, STAGES, LEVERS } from "./funnelDoctor";

describe("¿Dónde se me escapan las ventas?", () => {
  it("el caso de Brez: solo contacta al 22 % → el freno está abajo y más tráfico no ayuda", () => {
    const d = diagnose({ views: 100_000, clicks: 2_000, leads: 400, contacted: 88, sales: 9 });
    expect(d.enough).toBe(true);
    expect(d.bottleneck?.def.id).toBe("contact");
    expect(d.stages.find(s => s.def.id === "contact")!.rate).toBe(22);
    expect(d.moreTrafficWontHelp).toBe(true);
    // Llevar el contacto del 22 % al 80 %, con la misma conversión: 9 × (80/22 − 1) ≈ 23,7 ventas más.
    expect(d.bottleneck!.extraSales).toBeCloseTo(23.7, 1);
  });

  it("si el freno está arriba (gancho), sí conviene mover anuncios y contenido", () => {
    const d = diagnose({ views: 50_000, clicks: 150, leads: 30, contacted: 28, sales: 4 });
    expect(d.bottleneck?.def.id).toBe("ctr");
    expect(d.moreTrafficWontHelp).toBe(false);
  });

  it("como mucho 3 cambios, ordenados por ventas extra", () => {
    const d = diagnose({ views: 10_000, clicks: 50, leads: 2, contacted: 1, sales: 0, repeat: 0 });
    expect(d.top.length).toBeLessThanOrEqual(3);
    for (let k = 1; k < d.top.length; k++) expect(d.top[k - 1].extraSales).toBeGreaterThanOrEqual(d.top[k].extraSales);
  });

  it("los campos vacíos no se miden; el 0 sí cuenta", () => {
    const empty = diagnose({ leads: 20, sales: 2 });
    expect(empty.stages.every(s => s.rate === null)).toBe(true);
    expect(empty.enough).toBe(false);
    expect(empty.alerts.some(a => a.id === "data")).toBe(true);

    const zeroRepeat = diagnose({ leads: 20, contacted: 18, sales: 4, repeat: 0 });
    const rep = zeroRepeat.stages.find(s => s.def.id === "repeat")!;
    expect(rep.rate).toBe(0);
    expect(rep.status).toBe("muy-bajo");
    // 10 % de 4 clientes = 0,4 ventas más.
    expect(rep.extraSales).toBeCloseTo(0.4, 1);
  });

  it("una tasa de 0 no rompe la cuenta (sin división por cero)", () => {
    const d = diagnose({ views: 1000, clicks: 20, leads: 10, contacted: 0, sales: 0 });
    for (const s of d.stages) expect(Number.isFinite(s.extraSales)).toBe(true);
    expect(d.bottleneck?.def.id).toBe("contact");
  });

  it("nunca pasa del 100 % aunque anote más abajo que arriba", () => {
    const d = diagnose({ leads: 10, contacted: 15, sales: 2 });
    expect(d.stages.find(s => s.def.id === "contact")!.rate).toBe(100);
  });

  it("avisa de reembolsos altos (persona equivocada) y de CPA por encima de lo que aguanta el precio", () => {
    const d = diagnose({ leads: 100, contacted: 90, sales: 20, refunds: 5, spend: 400, maxCpa: 12 });
    expect(d.cpa).toBe(20);
    expect(d.alerts.map(a => a.id)).toEqual(expect.arrayContaining(["refunds", "cpa"]));
  });

  it("todo sano → sin cambios urgentes", () => {
    const d = diagnose({ views: 10_000, clicks: 200, leads: 40, contacted: 38, sales: 6, repeat: 1 });
    expect(d.top).toHaveLength(0);
    expect(d.bottleneck).toBeNull();
  });

  it("el mínimo sano se puede cambiar", () => {
    const base = { views: 10_000, clicks: 150, leads: 30, contacted: 28, sales: 4 };
    expect(diagnose(base).stages[0].status).toBe("bien");
    expect(diagnose(base, { ctr: 2 }).stages[0].status).toBe("bajo");
  });

  it("textos para el cliente: sin dólares ni promesas de ingresos", () => {
    const all = [...STAGES.flatMap(s => [s.meaning, s.diagnosis, ...s.actions, s.fix.label]), ...LEVERS.map(l => l.q)].join(" ");
    expect(all).not.toMatch(/US\$|dólar|garantizad|ganarás|vas a ganar/i);
  });
});
