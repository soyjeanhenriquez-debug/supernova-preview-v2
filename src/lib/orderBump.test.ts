import { describe, expect, it } from "vitest";
import { bumpIdeas, bumpPrice, parsePrice } from "./orderBump";

describe("ideas de order bump (sin IA)", () => {
  it("lee el precio de la ficha", () => {
    expect(parsePrice("27")).toBe(27);
    expect(parsePrice("US$9/mes · reto US$5")).toBe(9);
    expect(parsePrice("19,90")).toBe(19.9);
    expect(parsePrice("")).toBeNull();
  });
  it("el precio del bump queda entre el 20 % y el 40 % del producto", () => {
    for (const p of [7, 17, 27, 47, 97, 197]) {
      for (const pct of [0.2, 0.25, 0.3, 0.4]) {
        const b = bumpPrice(p, pct);
        expect(b, `${p}×${pct}`).toBeGreaterThanOrEqual(Math.floor(p * 0.2));
        expect(b, `${p}×${pct}`).toBeLessThanOrEqual(Math.ceil(p * 0.4));
      }
    }
  });
  it("da 3 o 4 ideas según el tipo de negocio", () => {
    const info = bumpIdeas("infoproducto", "27");
    expect(info.length).toBeGreaterThanOrEqual(3);
    expect(info.length).toBeLessThanOrEqual(4);
    expect(info.every(i => i.price !== null)).toBe(true);
    expect(bumpIdeas("ecommerce", "29").map(i => i.id)).toContain("segunda");
    expect(bumpIdeas(null, "").every(i => i.price === null)).toBe(true);
  });
});
