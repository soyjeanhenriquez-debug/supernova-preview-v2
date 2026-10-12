import { describe, expect, it } from "vitest";
import { daysAgoLabel, formatKitPrice, kitPriceFor, plainSpanish, pricingModelLabel } from "./kits";

describe("plainSpanish", () => {
  it("cambia la jerga de las notas reales de los kits", () => {
    expect(plainSpanish("Precio de impulso (front-end) con upsell inmediato a certificación avanzada"))
      .toBe("Precio de impulso de entrada con venta adicional inmediato a certificación avanzada");
    expect(plainSpanish("Precio front-end impulsivo accesible con un bump de $27 USD y un backend de consultoría/mentoring a $497 USD."))
      .toBe("Precio de entrada impulsivo accesible con un extra en el pago de $27 USD y una venta posterior de consultoría/mentoría a $497 USD.");
    expect(plainSpanish("Ticket de impulso directo (low-ticket) ideal para monetizar tráfico frío"))
      .toBe("Precio de impulso directo (precio bajo) ideal para monetizar gente que aún no te conoce");
    expect(plainSpanish("Precio de impulso (impulse buy) optimizado para conversión fría sin llamada telefónica."))
      .toBe("Precio de impulso optimizado para venta a gente que aún no te conoce sin llamada telefónica.");
  });
  it("no toca un texto que ya está en español", () => {
    expect(plainSpanish("Precio accesible para entrada directa.")).toBe("Precio accesible para entrada directa.");
    expect(plainSpanish(null)).toBe("");
  });
});

describe("formatKitPrice", () => {
  it("pone puntos de miles y coma decimal", () => {
    expect(formatKitPrice("97000 COP")).toBe("97.000 COP");
    expect(formatKitPrice("1490 DOP")).toBe("1.490 DOP");
    expect(formatKitPrice("19.99 USD")).toBe("19,99 USD");
  });
  it("respeta lo que ya viene bien escrito", () => {
    expect(formatKitPrice("$119.000 COP")).toBe("$119.000 COP");
    expect(formatKitPrice("1.790 DOP")).toBe("1.790 DOP");
    expect(formatKitPrice("COP 197.000")).toBe("COP 197.000");
    expect(formatKitPrice("$99 BRL / mes")).toBe("$99 BRL / mes");
    expect(formatKitPrice(undefined)).toBe("");
  });
});

describe("kitPriceFor", () => {
  const pricing = { CO: "97000 COP", MX: "497 MXN", DO: "1.490 DOP", US: "27 USD", BR: "147 BRL", modelo: "pago_unico", nota: "x" };
  it("usa el precio del país de la persona", () => {
    expect(kitPriceFor(pricing, "do")).toEqual({ market: "DO", price: "1.490 DOP", local: true });
    expect(kitPriceFor(pricing, "CO")).toEqual({ market: "CO", price: "97.000 COP", local: true });
  });
  it("cae a dólares si su país no está, y a nada si no hay precios", () => {
    expect(kitPriceFor(pricing, "PE")).toEqual({ market: "US", price: "27 USD", local: false });
    expect(kitPriceFor(pricing, null)).toEqual({ market: "US", price: "27 USD", local: false });
    expect(kitPriceFor({ MX: "497 MXN" }, "PE")).toEqual({ market: "MX", price: "497 MXN", local: false });
    expect(kitPriceFor({}, "CO")).toBeNull();
    expect(kitPriceFor(undefined, "CO")).toBeNull();
  });
});

describe("pricingModelLabel y daysAgoLabel", () => {
  it("explica el modelo de cobro", () => {
    expect(pricingModelLabel("pago_unico")).toBe("Pago único");
    expect(pricingModelLabel("suscripcion")).toBe("Suscripción (cobro cada mes)");
    expect(pricingModelLabel(undefined)).toBe("—");
  });
  it("dice hace cuántos días, sin prometer el próximo", () => {
    const now = Date.parse("2026-10-12T12:00:00Z");
    expect(daysAgoLabel("2026-10-12T10:00:00Z", now)).toBe("hoy");
    expect(daysAgoLabel("2026-10-11T10:00:00Z", now)).toBe("ayer");
    expect(daysAgoLabel("2026-10-08T10:00:00Z", now)).toBe("hace 4 días");
    expect(daysAgoLabel(null, now)).toBe("");
  });
});
