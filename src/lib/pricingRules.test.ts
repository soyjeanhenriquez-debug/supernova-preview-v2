import { describe, expect, it } from "vitest";
import { adVerdict, MEASURE, measureRules } from "./pricingRules";
import { STAGES } from "./funnelDoctor";

const ad = (spend: number | null, ctr: number | null, sales: number | null) => ({ spend, ctr, sales });

describe("reglas de medición: las mismas en toda la app", () => {
  it("CTR 0,8 %, apagar a 2 veces, +20 % cada 2 días", () => {
    expect(MEASURE).toMatchObject({ ctrMin: 0.8, killMultiple: 2, scalePct: 20, scaleEveryDays: 2 });
    expect(STAGES.find(s => s.id === "ctr")!.healthy).toBe(0.8);
    const t = measureRules().join(" ");
    expect(t).toContain("0,8 %");
    expect(t).toContain("20 % cada 2 días");
  });
  it("sin gasto no hay veredicto", () => expect(adVerdict(ad(null, null, null), 27, null)).toBeNull());
  it("ganador con el máximo de la calculadora, en la moneda de la persona", () => {
    const v = adVerdict(ad(2000, 1.2, 2), 1500, { max: 1300, currency: "RD$" })!;
    expect(v.tone).toBe("good");
    expect(v.text).toContain("RD$1.000,00");
    expect(v.text).toContain("20 % cada 2 días");
  });
  it("vende pero cuesta más que el máximo", () => expect(adVerdict(ad(3000, 1, 2), 1500, { max: 1300, currency: "RD$" })!.tone).toBe("fix"));
  it("gastó 2 veces el máximo sin vender → apagar", () => expect(adVerdict(ad(2600, 1.5, 0), 1500, { max: 1300, currency: "RD$" })!.tone).toBe("bad"));
  it("CTR bajo antes de llegar al límite", () => expect(adVerdict(ad(10, 0.5, 0), 27, null)!.text).toContain("0,8 %"));
  it("sin margen en la calculadora → nunca ganador", () => expect(adVerdict(ad(10, 2, 5), 5, { max: -1, currency: "US$" })!.tone).toBe("bad"));
  it("sin precio ni calculadora: espera, sin cuentas raras", () => {
    const v = adVerdict(ad(10, null, 0), null, null)!;
    expect(v.tone).toBe("wait");
    expect(v.text).not.toMatch(/NaN|undefined/);
  });
});
