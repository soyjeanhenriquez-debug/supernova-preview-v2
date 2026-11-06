import { describe, it, expect } from "vitest";
import { cleanMontaje, duracionMontaje, montajeSimple } from "@/lib/montaje";

const tomas = [{ n: 1, dur: 5, nombre: "Gancho" }, { n: 2, dur: 3.2, nombre: "Congelador" }];

describe("Plan de «Edita tus tomas»", () => {
  it("deja solo tomas que existen y tiempos dentro de cada toma", () => {
    const p = cleanMontaje({
      resumen: "Cortes rápidos con el precio arriba.", rotulo: "Por solo $15.000 pesos",
      segmentos: [
        { toma: 1, desde: 0, hasta: 2, transicion: "zoom", texto: "Antes vivía pidiendo domicilios" },
        { toma: 9, desde: 0, hasta: 2 }, // no existe
        { toma: 2, desde: 2.9, hasta: 99, transicion: "giro" }, // se recorta al largo y la transición rara pasa a corte
      ],
      faltan: ["Una toma del congelador abierto", "", "otra", "y otra", "y una quinta"],
    }, tomas)!;
    expect(p.rotulo).toBe("Por solo $15.000 pesos");
    expect(p.segmentos).toHaveLength(2);
    expect(p.segmentos[0]).toEqual({ toma: 1, desde: 0, hasta: 2, transicion: "zoom", texto: "Antes vivía pidiendo domicilios" });
    expect(p.segmentos[1]).toMatchObject({ toma: 2, desde: 2.4, hasta: 3.2 });
    expect(p.segmentos[1].desde).toBeLessThan(p.segmentos[1].hasta);
    expect(p.segmentos[1].transicion).toBe("corte");
    expect(p.faltan).toHaveLength(4);
  });

  it("sin trozos válidos no hay plan (el servidor devuelve el cobro)", () => {
    expect(cleanMontaje({ segmentos: [{ toma: 7, desde: 0, hasta: 1 }] }, tomas)).toBeNull();
    expect(cleanMontaje("hola", tomas)).toBeNull();
  });

  it("«tal cual»: cada toma entera, en orden, gratis", () => {
    const p = montajeSimple(tomas);
    expect(p.segmentos.map(s => [s.toma, s.desde, s.hasta])).toEqual([[1, 0, 5], [2, 0, 3.2]]);
    expect(duracionMontaje(p)).toBeCloseTo(8.2);
  });
});
