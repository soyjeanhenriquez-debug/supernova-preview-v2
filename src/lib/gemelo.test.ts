import { describe, expect, it } from "vitest";
import { originalPrice, toLocal } from "./gemelo";
import type { Offer } from "./offers";
import type { OfferIntel } from "./offerIntel";

const offer = (price_hint: string | null) => ({ price_hint } as Offer);
const intel = (price: number | null, currency: string | null, price_text: string | null = null) =>
  ({ price_text, checkout_data: price == null ? null : { price, currency } } as unknown as OfferIntel);

describe("originalPrice", () => {
  it("usa primero el checkout leído, con su moneda", () => {
    expect(originalPrice(offer("$7"), intel(47, "BRL"))).toEqual({ text: "BRL 47", usd: 47 * 0.18 });
  });
  it("no convierte un $ sin moneda clara (podría ser pesos)", () => {
    expect(originalPrice(offer("$29"), null)).toEqual({ text: "$29", usd: null });
  });
  it("lee US$ y R$ del texto", () => {
    expect(originalPrice(offer("US$ 27"), null)?.usd).toBe(27);
    expect(originalPrice(offer(null), intel(null, null, "R$47,90"))?.usd).toBeCloseTo(47.9 * 0.18);
  });
  it("un descuento o nada no es un precio: no se inventa", () => {
    expect(originalPrice(offer("50% de descuento"), null)).toBeNull();
    expect(originalPrice(offer(null), null)).toBeNull();
  });
});

describe("toLocal", () => {
  it("redondea como se pone un precio y usa punto de miles", () => {
    expect(toLocal(17, "RD")).toBe("RD$1.020");
    expect(toLocal(17, "CO")).toBe("COL$68.000");
    expect(toLocal(17, "MX")).toBe("MX$310");
  });
});
