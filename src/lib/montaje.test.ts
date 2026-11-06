import { describe, it, expect } from "vitest";
import { ajustarAVoz, cleanMontaje, duracionMontaje, montajeSimple, segundosDe, sinPendientes } from "@/lib/montaje";

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

  it("planos que no tiene: solo si están en «nuevas», se renumeran y duran 5 s o menos", () => {
    const p = cleanMontaje({
      segmentos: [
        { toma: 0, nueva: 2, desde: 0, hasta: 9, transicion: "corte" }, // la 2 pasa a ser la 1 y se recorta a 5 s
        { toma: 1, desde: 0, hasta: 2 },
        { toma: 0, nueva: 7, desde: 0, hasta: 2 }, // no existe
      ],
      nuevas: [{ desc: "Sin usar", prompt: "unused shot of a kitchen" }, { desc: "Congelador abierto", prompt: "slow push-in on an open freezer full of labeled containers" }],
    }, tomas)!;
    expect(p.segmentos).toHaveLength(2);
    expect(p.segmentos[0]).toMatchObject({ toma: 0, nueva: 1, desde: 0, hasta: 5 });
    expect(p.nuevas).toEqual([{ desc: "Congelador abierto", prompt: "slow push-in on an open freezer full of labeled containers" }]);
  });

  it("con su texto manda lo que escribió la persona, aunque la IA lo cambie", () => {
    const suyo = "¿Cansada de cocinar todos los días? Deja la comida de la semana lista en una tarde.";
    const p = cleanMontaje({ guion: "Otro texto inventado por la IA con cifras", segmentos: [{ toma: 1, desde: 0, hasta: 2, frase: "¿Cansada de cocinar todos los días?" }] }, tomas, "propio", suyo)!;
    expect(p.guion).toBe(suyo);
    expect(p.segmentos[0].frase).toBe("¿Cansada de cocinar todos los días?");
    // Con voz nueva y sin guion no hay plan.
    expect(cleanMontaje({ segmentos: [{ toma: 1, desde: 0, hasta: 2 }] }, tomas, "ia")).toBeNull();
  });

  it("con voz: cada trozo dura lo que su frase y el video dura lo que la voz", () => {
    const plan = {
      resumen: "", rotulo: "", faltan: [], guion: "uno dos tres cuatro cinco seis",
      segmentos: [
        { toma: 1, desde: 1, hasta: 2, transicion: "corte" as const, texto: "", frase: "uno dos" },
        { toma: 2, desde: 0, hasta: 1, transicion: "corte" as const, texto: "", frase: "tres cuatro cinco seis" },
      ],
    };
    // 6 palabras de 1 s cada una: 0–6 s.
    const voz = Array.from({ length: 6 }, (_, i) => ({ t0: i, t1: i + 0.9 }));
    const out = ajustarAVoz(plan, voz, s => (s.toma === 1 ? 5 : 3.2));
    expect(segundosDe(out.segmentos[0])).toBeCloseTo(1.95, 1); // hasta la mitad entre «dos» y «tres»
    expect(duracionMontaje(out)).toBeCloseTo(6.3, 1); // fin de la voz + 0,4 s
    // La toma 2 (3,2 s) es más corta que su frase (≈4,35 s): va más lenta, nunca por debajo de la mitad.
    expect(out.segmentos[1].vel).toBeGreaterThanOrEqual(0.5);
    expect(out.segmentos[1].vel).toBeLessThan(1);
    expect(out.segmentos[1].hasta).toBeLessThanOrEqual(3.2);
  });

  it("al armar, un plano con IA que no se creó se cambia por la toma de al lado", () => {
    const plan = {
      resumen: "", rotulo: "", faltan: [], nuevas: [{ desc: "Detalle", prompt: "close-up of food" }],
      segmentos: [
        { toma: 1, desde: 0, hasta: 2, transicion: "corte" as const, texto: "" },
        { toma: 0, nueva: 1, desde: 0, hasta: 3, transicion: "zoom" as const, texto: "Hola" },
      ],
    };
    const out = sinPendientes(plan, [null]);
    expect(out.segmentos[1]).toMatchObject({ toma: 1, desde: 0, hasta: 2, transicion: "zoom", texto: "Hola" });
    expect(out.segmentos[1].nueva).toBeUndefined();
    expect(sinPendientes(plan, ["blob:x"]).segmentos[1].toma).toBe(0);
  });
});
