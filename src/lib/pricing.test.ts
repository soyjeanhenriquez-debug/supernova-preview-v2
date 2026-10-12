import { describe, expect, it } from "vitest";
import {
  calcScenario, currencyForCountry, currentScenario, fmtMoney, fmtNum, fromUsd, maxAdCostPerSale, parseAmount, productPrice,
} from "./pricing";
import { EMPTY_PROFILE, priceLabel, profileText, type PriceScenario } from "./businessProfile";

const sc = (o: Partial<PriceScenario> = {}): PriceScenario => ({
  id: "a", price: 27, salesPerDay: 3, adCostPerSale: 12, feePct: 5.2, feeFixed: 0.4, refundPct: 5, taxPct: 0, unitCost: 0, fixedMonthly: 50, ...o,
});

describe("parseAmount: números como los escribe la gente en LATAM", () => {
  it.each([
    ["1.500", 1500], ["1,500", 1500], ["50.000", 50000], ["1.234.567", 1234567],
    ["27,50", 27.5], ["27.50", 27.5], ["0,8", 0.8], ["0,800", 0.8], ["1.234,56", 1234.56], ["1,234.56", 1234.56],
    ["RD$ 1.500", 1500], ["COL$108.000", 108000], ["US$27", 27], ["-5", -5], ["12.", 12],
  ])("%s → %s", (raw, n) => expect(parseAmount(raw)).toBe(n));
  it("sin número → null", () => { expect(parseAmount("")).toBeNull(); expect(parseAmount("gratis")).toBeNull(); });
});

describe("formato español", () => {
  it("agrupa miles desde 4 cifras y usa coma decimal", () => {
    expect(fmtNum(2000)).toBe("2.000");
    expect(fmtNum(0.8, 1)).toBe("0,8");
    expect(fmtMoney(9841.5, "US$")).toBe("US$9.841,50");
    expect(fmtMoney(-1.8, "US$")).toBe("−US$1,80");
    expect(fmtMoney(108000, "COL$")).toBe("COL$108.000");
    expect(fmtMoney(27, "RD$", { short: true })).toBe("RD$27");
    expect(fmtMoney(-0.001, "US$")).toBe("US$0,00");
  });
});

describe("moneda por país", () => {
  it("RD, Colombia y México en su moneda; los países con dólar en US$", () => {
    expect(currencyForCountry("DO")).toBe("RD$");
    expect(currencyForCountry("CO")).toBe("COL$");
    expect(currencyForCountry("MX")).toBe("MX$");
    expect(currencyForCountry("EC")).toBe("US$");
    expect(currencyForCountry(null)).toBe("US$");
  });
  it("los ejemplos en dólares se pasan redondeados (aprox.)", () => {
    expect(fromUsd(27, "RD$")).toBe(1620);
    expect(fromUsd(27, "COL$")).toBe(108000);
    expect(fromUsd(27, "S/")).toBe(27); // sin cambio conocido: no se inventa
  });
});

describe("calculadora", () => {
  it("la cuenta de siempre", () => {
    const r = calcScenario(sc());
    expect(r.beforeAds).toBeCloseTo(27 - 1.804 - 1.35, 2);
    expect(r.perSale).toBeCloseTo(r.beforeAds - 12, 5);
  });
  it("precio 0, negativos, NaN y % de más de 100 no rompen nada", () => {
    const r0 = calcScenario(sc({ price: 0 }));
    expect(r0.fee).toBe(0);
    expect(r0.margin).toBe(0);
    expect(Number.isFinite(r0.minRoas)).toBe(false);
    const bad = calcScenario(sc({ price: -10, adCostPerSale: Number.NaN, refundPct: 500 }));
    for (const v of Object.values(bad)) expect(Number.isNaN(v)).toBe(false);
    expect(bad.refunds).toBe(0);
  });
  it("precios altos en pesos", () => {
    const r = calcScenario(sc({ price: 108000, adCostPerSale: 40000, feeFixed: 1600, fixedMonthly: 200000 }));
    expect(r.perSale).toBeGreaterThan(0);
    expect(fmtMoney(r.revenueMonth, "COL$")).toBe("COL$9.720.000");
  });
});

describe("el precio de la calculadora llega al producto", () => {
  const pricing = { currency: "RD$", scenarios: [sc({ id: "a", price: 1500 }), sc({ id: "b", price: 1950 })], chosen: null };
  it("sin elegir vale el primero; elegido vale el elegido", () => {
    expect(currentScenario(pricing)?.scenario.id).toBe("a");
    expect(currentScenario({ ...pricing, chosen: "b" })?.scenario.id).toBe("b");
  });
  it("el máximo por venta existe aunque no haya tocado «Usar este precio»", () => {
    const m = maxAdCostPerSale({ ...EMPTY_PROFILE, pricing });
    expect(m?.currency).toBe("RD$");
    expect(m?.chosen).toBe(false);
    expect(m!.max).toBeGreaterThan(1000);
  });
  it("la ficha vacía toma el precio de la calculadora, con su moneda (página de ventas con precio)", () => {
    const p = { ...EMPTY_PROFILE, product: "Curso", who: "Mamás", promise: "Vender postres", pricing };
    expect(priceLabel(p)).toBe("RD$1.500");
    expect(profileText(p)).toContain("Precio: RD$1.500");
    expect(productPrice(p)).toBe(1500);
  });
  it("la ficha con precio usa la moneda de la calculadora; el texto libre se respeta", () => {
    expect(priceLabel({ ...EMPTY_PROFILE, price: "1500", pricing })).toBe("RD$1.500");
    expect(priceLabel({ ...EMPTY_PROFILE, price: "US$9/mes · reto US$5" })).toBe("US$9/mes · reto US$5");
    expect(priceLabel({ ...EMPTY_PROFILE, price: "27" })).toBe("US$27");
    expect(priceLabel(EMPTY_PROFILE)).toBe("");
  });
});
