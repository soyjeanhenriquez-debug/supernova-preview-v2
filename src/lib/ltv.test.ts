import { describe, expect, it } from "vitest";
import { calcLtv, parsePriceText, type LtvInputs } from "./ltv";

const base: LtvInputs = {
  price: 17, bumpPrice: 12, bumpTakePct: 30, upsellPrice: 47, upsellTakePct: 15,
  downsellPrice: 27, downsellTakePct: 15, subPrice: 0, subTakePct: 0, subMonths: 3,
  feePct: 0, feeFixed: 0, refundPct: 0,
};

describe("calcLtv", () => {
  it("suma cada paso del embudo según su tasa", () => {
    const r = calcLtv(base);
    // 17 + 0,3·12 + 0,15·47 + 0,85·0,15·27 = 17 + 3,6 + 7,05 + 3,4425
    expect(r.parts).toEqual({ main: 17, bump: 3.6, upsell: 7.05, downsell: 3.44, subscription: 0 });
    expect(r.gross).toBe(31.09);
    expect(r.net).toBe(31.09);
    expect(r.netFrontOnly).toBe(17);
  });

  it("descuenta comisión (% + fijo por cobro) y reembolsos", () => {
    const r = calcLtv({ ...base, bumpTakePct: 0, upsellTakePct: 0, downsellTakePct: 0, feePct: 10, feeFixed: 1, refundPct: 5 });
    // 17 − (1,7 + 1) − 0,85
    expect(r.gross).toBe(17);
    expect(r.fees).toBe(2.7);
    expect(r.refunds).toBe(0.85);
    expect(r.net).toBe(13.45);
    expect(r.netFrontOnly).toBe(13.45);
  });

  it("cuenta cada mes de suscripción como un cobro aparte", () => {
    const r = calcLtv({ ...base, bumpTakePct: 0, upsellTakePct: 0, downsellTakePct: 0, subPrice: 10, subTakePct: 20, subMonths: 3, feeFixed: 1 });
    // bruto 17 + 0,2·10·3 = 23; cobros 1 + 0,2·3 = 1,6 → comisión 1,6
    expect(r.parts.subscription).toBe(6);
    expect(r.gross).toBe(23);
    expect(r.fees).toBe(1.6);
  });

  it("ROAS 2 nunca pasa del máximo para no perder", () => {
    const r = calcLtv({ ...base, feePct: 60 });
    expect(r.cpaRoas2).toBeLessThanOrEqual(r.net);
    expect(r.cpaRoas2).toBeGreaterThanOrEqual(0);
  });

  it("ignora entradas inválidas", () => {
    const r = calcLtv({ ...base, price: -5, bumpTakePct: 250, upsellPrice: Number.NaN });
    expect(r.parts.main).toBe(0);
    expect(r.parts.bump).toBe(12);
    expect(r.parts.upsell).toBe(0);
  });
});

describe("parsePriceText", () => {
  it("lee precios en formatos comunes", () => {
    expect(parsePriceText("R$ 47")).toBe(47);
    expect(parsePriceText("$24,99")).toBe(24.99);
    expect(parsePriceText("USD 1.297")).toBe(1297);
    expect(parsePriceText("US$ 1,297.50")).toBe(1297.5);
    expect(parsePriceText("gratis")).toBeNull();
    expect(parsePriceText(null)).toBeNull();
  });
});
