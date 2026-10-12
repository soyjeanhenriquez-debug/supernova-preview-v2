import { describe, expect, it } from "vitest";
import { daysSinceMonthStart, fmtInt, fmtUsd, packFromLabel, summarizePulse, type Tx } from "./pulseMath";

const tx = (p: Partial<Tx>): Tx => ({ user_id: "u1", action: "gen_light", cost: 15, label: null, meta: null, created_at: "2026-10-05T00:00:00Z", ...p });

describe("packFromLabel", () => {
  it("reconoce los packs que acredita whop-webhook", () => {
    expect(packFromLabel("Recarga Power 2,000 (Whop)")?.usd).toBe(20);
    expect(packFromLabel("Recarga Pack 250 · 30,000 (Whop)")?.credits).toBe(30000);
    expect(packFromLabel("Recarga Media Pro 150 (Whop)")?.media).toBe(true);
  });
  it("no cuenta como venta la recarga interna de prueba", () => {
    expect(packFromLabel("Recarga · cuenta de prueba interna (no es venta)")).toBeNull();
    expect(packFromLabel(null)).toBeNull();
  });
});

describe("summarizePulse", () => {
  const base = { adminIds: new Set(["admin"]), subsUsd: 29.99, payingSubs: 1, otherSales: [], aiTotalUsd: 6, aiBackgroundUsd: 2 };

  it("suma ventas: suscripciones + packs + otras ventas de Whop (sin reembolsos)", () => {
    const p = summarizePulse({
      ...base,
      txs: [
        tx({ action: "recharge", cost: 0, label: "Recarga Nuclear 4,500 (Whop)", meta: { granted: 4500 } }),
        tx({ action: "recharge", cost: 0, label: "Recarga · cuenta de prueba interna (no es venta)", meta: { granted: 20000 } }),
      ],
      otherSales: [{ amount: 47, event: "payment.succeeded", status: "paid" }, { amount: 47, event: "refund.created", status: "refunded" }],
    });
    expect(p.sales.packsUsd).toBe(39);
    expect(p.sales.otherUsd).toBe(47);
    expect(p.sales.totalUsd).toBeCloseTo(29.99 + 39 + 47);
    expect(p.credits.sold).toBe(2000 + 4500);
  });

  it("separa el gasto de clientes, del admin, lo devuelto y lo regalado a probadores", () => {
    const p = summarizePulse({
      ...base,
      txs: [
        tx({ cost: 15 }),
        tx({ cost: 30, meta: { refunded: true } }),
        tx({ user_id: "admin", cost: 50 }),
        tx({ cost: 0, meta: { tester_free: true, list_cost: 75 } }),
        tx({ action: "refund", cost: -30 }),
      ],
    });
    expect(p.credits.spentClients).toBe(15);
    expect(p.credits.spentAdmin).toBe(50);
    expect(p.credits.testerFree).toBe(75);
    expect(p.credits.testerUses).toBe(1);
    expect(p.credits.usedPct).toBe(1); // 15 de 2.000
  });

  it("margen = ventas − costo total de IA; sin ventas no hay porcentaje", () => {
    const p = summarizePulse({ ...base, txs: [] });
    expect(p.margin.usd).toBeCloseTo(23.99);
    expect(p.ai.usersUsd).toBe(4);
    const z = summarizePulse({ ...base, subsUsd: 0, payingSubs: 0, txs: [] });
    expect(z.margin.pct).toBeNull();
    expect(z.credits.usedPct).toBeNull();
  });
});

describe("formatos", () => {
  it("miles con punto y decimales con coma, también en 4 cifras", () => {
    expect(fmtInt(2000)).toBe("2.000");
    expect(fmtInt(30022)).toBe("30.022");
    expect(fmtUsd(29.99)).toBe("US$29,99");
    expect(fmtUsd(1234.5)).toBe("US$1.234,50");
    expect(fmtUsd(-3.2)).toBe("-US$3,20");
  });
  it("cubre desde el día 1 del mes", () => {
    expect(daysSinceMonthStart(new Date(2026, 9, 12, 15))).toBe(12);
    expect(daysSinceMonthStart(new Date(2026, 9, 1, 8))).toBe(1);
  });
});
