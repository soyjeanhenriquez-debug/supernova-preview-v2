import { describe, expect, it } from "vitest";
import { productLabel } from "./productLabel";

describe("productLabel", () => {
  it("muestra la ficha arriba y el nombre abajo cuando son distintos", () => {
    expect(productLabel({ name: "JEAN HENRIQUEZ", product: "Muscle Booster" }))
      .toEqual({ main: "Muscle Booster", sub: "JEAN HENRIQUEZ", full: "Muscle Booster", hasFicha: true });
  });

  it("no repite el nombre si es igual a la ficha", () => {
    expect(productLabel({ name: "calistenia desde casa para hombres", product: "calistenia desde casa para hombres" }).sub).toBeNull();
  });

  it("acorta una ficha larga en los dos puntos y guarda el texto completo", () => {
    const l = productLabel({ name: "Edúcate con IA", product: "Reto IA Sin Miedo: reto de 28 días para aprender IA práctica." });
    expect(l.main).toBe("Reto IA Sin Miedo");
    expect(l.full).toBe("Reto IA Sin Miedo: reto de 28 días para aprender IA práctica.");
  });

  it("nunca usa un enlace como etiqueta", () => {
    const url = "https://www.instagram.com/p/DeNYcWQGGAC/?img_index=1";
    expect(productLabel({ name: url, product: url })).toEqual({ main: "Producto sin nombre", sub: "Ficha sin llenar", full: "Producto sin nombre", hasFicha: false });
  });

  it("sin ficha usa el nombre y avisa que falta la ficha", () => {
    expect(productLabel({ name: "prod 2", product: null })).toMatchObject({ main: "prod 2", sub: "Ficha sin llenar", hasFicha: false });
  });
});
