import { describe, expect, it } from "vitest";
import { detectarCortes, diferencia, planosDeCortes } from "@/lib/videoCortes";

describe("cortes del video de referencia", () => {
  it("encuentra los saltos grandes y no los movimientos normales", () => {
    // 6 cuadros por segundo: movimiento normal ~4, cortes en el cuadro 9 (1,5 s) y 20 (3,33 s); uno pegado se ignora.
    const difs = Array.from({ length: 30 }, (_, i) => (i === 0 ? 0 : i === 9 ? 60 : i === 10 ? 40 : i === 20 ? 55 : 4));
    const c = detectarCortes(difs, 1 / 6);
    expect(c.map(x => +x.toFixed(2))).toEqual([1.5, 3.33]);
    expect(planosDeCortes(c, 5)).toEqual([{ t0: 0, t1: c[0] }, { t0: c[0], t1: c[1] }, { t0: c[1], t1: 5 }]);
  });

  it("un video sin cortes es un solo plano", () => {
    expect(detectarCortes(Array(20).fill(3), 1 / 6)).toEqual([]);
    expect(diferencia(new Uint8ClampedArray([0, 10]), new Uint8ClampedArray([10, 10]))).toBe(5);
  });
});
